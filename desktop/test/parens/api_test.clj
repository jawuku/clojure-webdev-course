(ns parens.api-test
  "Security-boundary tests for the local HTTP handler.

  These drive the Ring handler directly: no sockets, no worker JVM, so they are
  fast enough for every CI run. The end-to-end checker also exercises the same
  rules over a real loopback connection."
  (:require [cheshire.core :as json]
            [clojure.test :refer [deftest is testing]]
            [parens.api :as api]
            [parens.runtime :as runtime])
  (:import [java.io StringReader]))

(def ^:private token "test-token-0123456789abcdef")

(defn- request
  "Build a Ring request. Defaults to a valid loopback Host; `:token` nil means
  no X-Parens-Token header at all."
  ([method uri] (request method uri {}))
  ([method uri {:keys [headers body token]}]
   {:request-method method
    :uri uri
    :headers (cond-> (merge {"host" "127.0.0.1:4321"} headers)
               (some? token) (assoc "x-parens-token" token))
    :body (when body (StringReader. body))}))

(defn- post-json [uri body & [opts]]
  (request :post uri (merge {:body body} opts)))

(defn- body [response]
  (json/parse-string (:body response) true))

(defn- body-text [response]
  (let [raw (:body response)]
    (if (string? raw) raw (String. ^bytes raw "UTF-8"))))

(defn- handler [] (api/app token))

;; ---------------------------------------------------------------------------
;; Health and static content

(deftest health-is-public
  (let [response ((handler) (request :get "/api/health"))]
    (is (= 200 (:status response)))
    (is (true? (:ok (body response))))
    (is (pos? (:server-pid (body response))))))

(deftest static-page-is-served-with-csp
  (let [response ((handler) (request :get "/"))
        html (body-text response)]
    (is (= 200 (:status response)))
    (is (re-find #"text/html" (get-in response [:headers "content-type"])))
    (is (re-find #"default-src 'self'" (get-in response [:headers "content-security-policy"])))
    (is (re-find #"Parens" html))
    (testing "the shipped UI has no external scripts, styles, or fonts"
      (is (not (re-find #"(?:src|href)=\"(?:https?:)?//" html))))))

(deftest binary-assets-are-served-as-bytes
  (let [response ((handler) (request :get "/fonts/ibm-plex-sans-latin-var.woff2"))
        raw (:body response)]
    (is (= 200 (:status response)))
    (is (re-find #"font/woff2" (get-in response [:headers "content-type"])))
    (is (bytes? raw))
    (testing "woff2 magic bytes survive the round trip (slurp would corrupt them)"
      (is (= [0x77 0x4F 0x46 0x32] (mapv #(bit-and (int %) 0xFF) (take 4 raw)))))))

(deftest static-page-still-requires-a-valid-host
  (is (= 403 (:status ((handler) (request :get "/" {:headers {"host" "evil.example"}}))))))

;; ---------------------------------------------------------------------------
;; set-ns

(deftest set-ns-selects-the-default-eval-namespace
  (try
    (let [response ((handler) (post-json "/api/set-ns" "{\"ns\":\"demo-course\"}" {:token token}))]
      (is (= 200 (:status response)))
      (is (= {:ok true :ns "demo-course"} (body response)))
      (is (= "demo-course" (runtime/active-ns))))
    (finally
      (runtime/set-active-ns! "user"))))

(deftest set-ns-rejects-invalid-namespaces
  (doseq [payload ["{\"ns\":\"not a ns\"}"
                   "{\"ns\":42}"
                   "{}"]]
    (let [response ((handler) (post-json "/api/set-ns" payload {:token token}))]
      (is (= 400 (:status response)))
      (is (false? (:ok (body response))))))
  (is (= "user" (runtime/active-ns))))

;; ---------------------------------------------------------------------------
;; Token

(deftest token-required-on-api-routes
  (testing "missing token"
    (let [response ((handler) (post-json "/api/eval" "{\"code\":\"(+ 1 2)\"}"))]
      (is (= 401 (:status response)))
      (is (false? (:ok (body response))))))

  (testing "wrong token"
    (let [response ((handler) (post-json "/api/eval" "{\"code\":\"(+ 1 2)\"}"
                                         {:token "wrong"}))]
      (is (= 401 (:status response)))))

  (testing "token in the query string is not accepted"
    (let [response ((handler) (request :get (str "/api/runtime?token=" token)))]
      (is (= 401 (:status response)))))

  (testing "correct token passes the gate"
    ;; 404 rather than 401 proves the token was accepted without starting the
    ;; evaluation worker.
    (let [response ((handler) (request :get "/api/nope" {:token token}))]
      (is (= 404 (:status response))))))

(deftest health-needs-no-token-but-still-checks-fetch-site
  (is (= 403 (:status ((handler) (request :get "/api/health"
                                          {:headers {"sec-fetch-site" "cross-site"}}))))))

;; ---------------------------------------------------------------------------
;; Host (DNS-rebinding guard)

(deftest host-must-be-loopback
  (doseq [host ["evil.example" "127.0.0.1.evil.example" "localhost.evil.example" ""]]
    (is (= 403 (:status ((handler) (request :get "/api/health" {:headers {"host" host}}))))
        (str "host " (pr-str host))))

  (doseq [host ["127.0.0.1:1234" "localhost:8080" "LOCALHOST" "127.0.0.1"]]
    (is (= 200 (:status ((handler) (request :get "/api/health" {:headers {"host" host}}))))
        (str "host " (pr-str host)))))

;; ---------------------------------------------------------------------------
;; Origin and Sec-Fetch-Site

(deftest origin-must-be-the-local-app
  (testing "foreign origin is rejected even with a valid token"
    (let [response ((handler) (post-json "/api/eval" "{\"code\":\"(+ 1 2)\"}"
                                         {:token token
                                          :headers {"origin" "http://evil.example"}}))]
      (is (= 403 (:status response)))))

  (testing "local origin is accepted"
    (doseq [origin ["http://127.0.0.1:4321" "http://localhost:3000"]]
      (let [response ((handler) (request :get "/api/nope"
                                         {:token token :headers {"origin" origin}}))]
        (is (= 404 (:status response)) (str "origin " origin)))))

  (testing "https and non-loopback origins are rejected"
    (doseq [origin ["https://127.0.0.1:4321" "http://192.168.1.2:4321"]]
      (is (= 403 (:status ((handler) (post-json "/api/eval" "{\"code\":\"(+ 1 2)\"}"
                                                {:token token :headers {"origin" origin}}))))
          (str "origin " origin)))))

(deftest cross-site-fetch-is-rejected
  (doseq [site ["cross-site" "same-site"]]
    (is (= 403 (:status ((handler) (post-json "/api/eval" "{\"code\":\"(+ 1 2)\"}"
                                              {:token token
                                               :headers {"sec-fetch-site" site}}))))
        (str "sec-fetch-site " site)))

  (doseq [site ["same-origin" "none"]]
    (is (= 404 (:status ((handler) (request :get "/api/nope"
                                            {:token token
                                             :headers {"sec-fetch-site" site}}))))
        (str "sec-fetch-site " site))))

;; ---------------------------------------------------------------------------
;; Body validation (does not reach the worker)

(deftest request-bodies-are-validated
  (testing "empty body"
    (is (= 400 (:status ((handler) (post-json "/api/eval" "" {:token token}))))))

  (testing "invalid JSON"
    (is (= 400 (:status ((handler) (post-json "/api/eval" "not json" {:token token}))))))

  (testing "code must be a string"
    (let [response ((handler) (post-json "/api/eval" "{\"code\":42}" {:token token}))]
      (is (= 400 (:status response)))
      (is (re-find #"code must be a string" (:error (body response))))))

  (testing "invalid namespace"
    (let [response ((handler) (post-json "/api/eval" "{\"code\":\"(+ 1 2)\",\"ns\":\"bad ns\"}"
                                         {:token token}))]
      (is (= 400 (:status response)))
      (is (re-find #"Invalid namespace" (:error (body response))))))

  (testing "declared body over the limit"
    (let [response ((handler) (post-json "/api/eval" "{\"code\":\"(+ 1 2)\"}"
                                         {:token token
                                          :headers {"content-length" (str (* 2 1024 1024))}}))]
      (is (= 413 (:status response))))))

(deftest exercise-body-is-validated
  (is (= 400 (:status ((handler) (post-json "/api/exercise" "{\"code\":\"(def x 1)\"}"
                                            {:token token}))))
      "missing tests")
  (is (= 400 (:status ((handler) (post-json "/api/exercise"
                                            "{\"code\":\"(def x 1)\",\"tests\":[]}"
                                            {:token token}))))))
