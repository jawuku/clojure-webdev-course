(ns parens.api
  "Ring handler for the local app server.

  Security model: the server is loopback-only and every /api call except
  /api/health needs the per-launch token. The token is generated at startup and
  handed to the browser in the URL fragment, so it never reaches the server in
  a request line or a referrer. Host/Origin/Sec-Fetch-Site checks block DNS
  rebinding and cross-origin calls from other pages."
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [parens.preview :as preview]
            [parens.runtime :as runtime]
            [parens.state :as state])
  (:import [java.lang ProcessHandle]
           [java.nio.charset StandardCharsets]
           [java.security MessageDigest SecureRandom]
           [java.util Base64]))

(def ^:private max-body-bytes (* 1024 1024))

(def ^:private content-security-policy
  (str "default-src 'self'; "
       "script-src 'self'; "
       ;; CodeMirror 6 injects its theme and highlight styles into a <style>
       ;; element at runtime; without 'unsafe-inline' the editor renders
       ;; unstyled and the browser logs a CSP violation. Scripts stay strict.
       "style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data:; "
       "font-src 'self'; "
       "connect-src 'self'; "
       ;; Course 2 embeds the live Ring app (same origin) in an iframe.
       "frame-src 'self'; "
       "base-uri 'none'; "
       "form-action 'none'; "
       "frame-ancestors 'none'"))

(def ^:private mime-types
  {"html" "text/html; charset=utf-8"
   "js" "text/javascript; charset=utf-8"
   "css" "text/css; charset=utf-8"
   "svg" "image/svg+xml"
   "png" "image/png"
   "ico" "image/x-icon"
   "woff2" "font/woff2"
   "woff" "font/woff"
   "ttf" "font/ttf"
   "json" "application/json; charset=utf-8"
   "txt" "text/plain; charset=utf-8"})

(defn new-token []
  (let [bytes (byte-array 32)]
    (.nextBytes (SecureRandom.) bytes)
    (.encodeToString (Base64/getUrlEncoder) bytes)))

(defn- secure= [expected provided]
  (and (string? expected)
       (string? provided)
       (MessageDigest/isEqual (.getBytes ^String expected StandardCharsets/UTF_8)
                              (.getBytes ^String provided StandardCharsets/UTF_8))))

(defn- allowed-host? [host]
  (boolean (and host (re-matches #"(?i)(127\.0\.0\.1|localhost)(:\d+)?" host))))

(defn- allowed-origin? [origin]
  (boolean (and origin (re-matches #"(?i)http://(127\.0\.0\.1|localhost)(:\d+)?" origin))))

(defn- allowed-fetch-site? [site]
  (or (nil? site) (#{"same-origin" "none"} site)))

(defn- json-response [status body]
  {:status status
   :headers {"content-type" "application/json; charset=utf-8"
             "cache-control" "no-store"
             "x-content-type-options" "nosniff"}
   :body (json/generate-string body)})

(defn- text-response [status body]
  {:status status
   :headers {"content-type" "text/plain; charset=utf-8"
             "cache-control" "no-store"
             "x-content-type-options" "nosniff"}
   :body body})

(defn- resource-bytes [resource]
  (with-open [in (io/input-stream resource)]
    (.readAllBytes ^java.io.InputStream in)))

(defn- static-response [uri]
  (let [path (cond
               (= uri "/") "index.html"
               (= uri "/index.html") "index.html"
               :else (subs uri 1))]
    (when (and (not (str/includes? path ".."))
               (not (str/includes? path "\\")))
      (when-let [resource (io/resource (str "public/" path))]
        {:status 200
         :headers {"content-type" (or (some-> (re-find #"\.([a-z0-9]+)$" path)
                                              second
                                              mime-types)
                                      "application/octet-stream")
                   "cache-control" "no-store"
                   "x-content-type-options" "nosniff"
                   "content-security-policy" content-security-policy}
         ;; Read bytes, not text: the bundle ships woff2 fonts and PNG/ICO
         ;; icons, and slurp would corrupt them.
         :body (resource-bytes resource)}))))

(defn- read-body [request]
  (let [declared (get-in request [:headers "content-length"])
        too-large? (and declared
                        (try (> (Long/parseLong declared) max-body-bytes)
                             (catch Throwable _ false)))]
    (cond
      too-large? {:error :too-large}
      :else
      (let [raw (try (slurp (:body request) :encoding "UTF-8")
                     (catch Throwable _ ""))]
        (if (str/blank? raw)
          {:error :empty}
          (try {:data (json/parse-string raw true)}
               (catch Throwable _ {:error :invalid})))))))

(defn- body-error [error]
  (case error
    :too-large (json-response 413 {:ok false :error "Request body is too large."})
    :empty (json-response 400 {:ok false :error "Request body is empty."})
    (json-response 400 {:ok false :error "Request body is not valid JSON."})))

(defn- valid-ns? [ns]
  (boolean (and (string? ns)
                (re-matches #"[A-Za-z_][A-Za-z0-9_.-]*" ns))))

(defn- runtime-info []
  (merge {:server-pid (.pid (ProcessHandle/current))
          :active-ns (runtime/active-ns)
          :timeout-ms (runtime/timeout-ms)
          :clojure (clojure-version)
          :java (System/getProperty "java.version")}
         (runtime/info)))

(defn- set-ns-handler [request]
  (let [{:keys [data error]} (read-body request)]
    (if error
      (body-error error)
      (let [{:keys [ns]} data]
        (if (valid-ns? ns)
          (do (runtime/set-active-ns! ns)
              (json-response 200 {:ok true :ns ns}))
          (json-response 400 {:ok false :error "Invalid namespace."}))))))

(defn- eval-handler [request]
  (let [{:keys [data error]} (read-body request)]
    (if error
      (body-error error)
      (let [{:keys [code ns]} data]
        (cond
          (not (string? code))
          (json-response 400 {:ok false :error "code must be a string."})

          (> (count code) 200000)
          (json-response 413 {:ok false :error "Code is too long."})

          (and ns (not (valid-ns? ns)))
          (json-response 400 {:ok false :error "Invalid namespace."})

          :else
          (json-response 200 (runtime/eval-code (or ns (runtime/active-ns)) code)))))))

(defn- hiccup-handler [request]
  (let [{:keys [data error]} (read-body request)]
    (if error
      (body-error error)
      (let [{:keys [code ns]} data]
        (cond
          (not (string? code))
          (json-response 400 {:ok false :error "code must be a string."})

          (> (count code) 200000)
          (json-response 413 {:ok false :error "Code is too long."})

          (and ns (not (valid-ns? ns)))
          (json-response 400 {:ok false :error "Invalid namespace."})

          :else
          (json-response 200 (runtime/render-hiccup (or ns (runtime/active-ns)) code)))))))

(defn- preview-session-handler [_request]
  (let [id (preview/start-session!)]
    (assoc-in (json-response 200 {:ok true})
              [:headers "set-cookie"]
              (preview/session-cookie id))))

(defn- exercise-handler [request]
  (let [{:keys [data error]} (read-body request)]
    (if error
      (body-error error)
      (let [{:keys [code tests]} data
            tests (->> tests (filter string?) vec)]
        (cond
          (not (string? code))
          (json-response 400 {:ok false :error "code must be a string."})

          (empty? tests)
          (json-response 400 {:ok false :error "tests must be a non-empty array of strings."})

          (> (count code) 200000)
          (json-response 413 {:ok false :error "Code is too long."})

          :else
          (json-response 200 (runtime/run-exercise "exercise" code tests)))))))

(defn- state-read-handler [_request]
  (try
    (json-response 200 {:ok true :state (state/read-buckets)})
    (catch Throwable e
      (json-response 500 {:ok false
                          :error (str "Could not read state: " (.getMessage e))}))))

(defn- state-write-handler [request]
  (let [{:keys [data error]} (read-body request)]
    (if error
      (body-error error)
      (let [key (:key data)]
        (cond
          (not (state/valid-key? key))
          (json-response 400 {:ok false
                              :error "key must match [A-Za-z0-9_.-]{1,80}."})

          (not (contains? data :value))
          (json-response 400 {:ok false
                              :error "value is required (use null to delete a key)."})

          (not (state/editable-value? (:value data)))
          (json-response 400 {:ok false :error "value must be JSON data."})

          :else
          (try
            (json-response 200 (state/write-bucket! key (:value data)))
            (catch Throwable e
              (json-response 500 {:ok false
                                  :error (str "Could not save state: "
                                              (.getMessage e))}))))))))

(defn- api-handler [request]
  (let [{:keys [request-method uri]} request]
    (cond
      (and (= request-method :get) (= uri "/api/health"))
      (json-response 200 {:ok true :status "ok" :server-pid (.pid (ProcessHandle/current))})

      (and (= request-method :get) (= uri "/api/runtime"))
      (json-response 200 (runtime-info))

      (and (= request-method :post) (= uri "/api/set-ns"))
      (set-ns-handler request)

      (and (= request-method :post) (= uri "/api/eval"))
      (eval-handler request)

      (and (= request-method :post) (= uri "/api/hiccup"))
      (hiccup-handler request)

      (and (= request-method :post) (= uri "/api/preview/session"))
      (preview-session-handler request)

      (and (= request-method :post) (= uri "/api/exercise"))
      (exercise-handler request)

      (and (= request-method :post) (= uri "/api/reset"))
      (json-response 200 (merge (runtime/restart!) {:runtime (runtime-info)}))

      (and (= request-method :get) (= uri "/api/state"))
      (state-read-handler request)

      (and (= request-method :put) (= uri "/api/state"))
      (state-write-handler request)

      :else
      (text-response 404 "Not found."))))

(defn- wrap-security [handler token]
  (fn [request]
    (let [api? (str/starts-with? (:uri request) "/api/")
          ;; The live preview carries a SameSite=Strict session cookie instead
          ;; of the launch token: the iframe navigates without custom headers,
          ;; and its HTMX requests are same-origin. Cross-site access is still
          ;; blocked here, and preview/handler verifies the cookie itself.
          preview? (str/starts-with? (:uri request) "/preview/")
          health? (= (:uri request) "/api/health")
          host (get-in request [:headers "host"])
          origin (get-in request [:headers "origin"])
          fetch-site (get-in request [:headers "sec-fetch-site"])
          provided (get-in request [:headers "x-parens-token"])]
      (cond
        (not (allowed-host? host))
        (text-response 403 "Forbidden host.")

        (and preview? origin (not (allowed-origin? origin)))
        (text-response 403 "Forbidden origin.")

        (and preview? (not (allowed-fetch-site? fetch-site)))
        (text-response 403 "Forbidden fetch site.")

        (and api? origin (not (allowed-origin? origin)))
        (text-response 403 "Forbidden origin.")

        (and api? (not (allowed-fetch-site? fetch-site)))
        (text-response 403 "Forbidden fetch site.")

        (and api? (not health?) (not (secure= token provided)))
        (json-response 401 {:ok false :error "Missing or invalid token."})

        :else
        (handler request)))))

(defn app
  "Build the secured handler. `token` must be the per-launch secret."
  [token]
  (let [handler (fn [request]
                  (or (when (str/starts-with? (:uri request) "/preview/")
                        (preview/handler request))
                      (when (= :get (:request-method request))
                        (static-response (:uri request)))
                      (api-handler request)))]
    (wrap-security handler token)))
