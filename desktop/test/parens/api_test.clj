(ns parens.api-test
  "Security-boundary tests for the local HTTP handler.

  These drive the Ring handler directly: no sockets, no worker JVM, so they are
  fast enough for every CI run. The end-to-end checker also exercises the same
  rules over a real loopback connection."
  (:require [cheshire.core :as json]
            [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.test :refer [deftest is testing]]
            [parens.api :as api]
            [parens.preview :as preview]
            [parens.runtime :as runtime]
            [parens.state :as state])
  (:import [java.io StringReader]
           [java.nio.file Files]
           [java.nio.file.attribute FileAttribute]))

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

(defn- put-json [uri body & [opts]]
  (request :put uri (merge {:body body} opts)))

(defn- body [response]
  (json/parse-string (:body response) true))

;; Like `body`, but keeps object keys as strings so tests can look up bucket
;; names (the state API echoes exactly what it stored).
(defn- string-body [response]
  (json/parse-string (:body response)))

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

(deftest reset-runtime-is-token-protected
  ;; The success path is covered end to end (phase0_check.mjs and
  ;; runtime_test.clj) because restarting really spawns a JVM; these only prove
  ;; the RESTART action cannot be reached without the launch token.
  (is (= 401 (:status ((handler) (post-json "/api/reset" "{}")))))
  (is (= 401 (:status ((handler) (post-json "/api/reset" "{}" {:token "wrong"})))))
  (is (= 403 (:status ((handler) (post-json "/api/reset" "{}"
                                         {:token token
                                          :headers {"origin" "http://evil.example"}}))))))

;; ---------------------------------------------------------------------------
;; State store (app-data state.edn)

(defn- with-state-dir [run]
  (let [dir (str (Files/createTempDirectory "parens-api-state-"
                                            (make-array FileAttribute 0)))]
    (try
      (state/configure! dir)
      (run dir)
      (finally
        (state/configure! nil)
        (doseq [file (reverse (file-seq (io/file dir)))]
          (.delete file))))))

(deftest state-api-roundtrips-through-the-edn-file
  (with-state-dir
    (fn [dir]
      (let [handler (handler)]
        (testing "a fresh install has no buckets"
          (let [response (handler (request :get "/api/state" {:token token}))]
            (is (= 200 (:status response)))
            (is (= {} (:state (body response))))))

        (testing "a course bucket is written and read back"
          (let [course-state {"themeKey" "gruvbox"
                              "progress" {"welcome" {"done" true}}}
                payload (json/generate-string {:key "parens_clojure_v1"
                                               :value course-state})
                response (handler (put-json "/api/state" payload {:token token}))]
            (is (= 200 (:status response)))
            (is (true? (:ok (body response))))
            (is (.exists (io/file dir "state.edn")))
            (is (= course-state
                   (get (get (string-body (handler (request :get "/api/state"
                                                                     {:token token})))
                             "state")
                        "parens_clojure_v1")))))

        (testing "plain JSON values are allowed (active course, celebrated flag)"
          (doseq [[key value expected] [["parens_active_course_v1" "clojure" "clojure"]
                                        ["parens_clojure_v1__celebrated" true true]
                                        ["regex_golf_scores_v1" {"double" 5} {"double" 5}]]]
            (is (= 200 (:status (handler
                                 (put-json "/api/state"
                                           (json/generate-string {:key key :value value})
                                           {:token token})))))
            (is (= expected
                   (get (get (string-body (handler (request :get "/api/state"
                                                                     {:token token})))
                             "state")
                        key)))))

        (testing "null deletes a bucket"
          (is (= 200 (:status (handler
                               (put-json "/api/state"
                                         "{\"key\":\"parens_active_course_v1\",\"value\":null}"
                                         {:token token})))))
          (is (not (contains? (get (string-body (handler (request :get "/api/state"
                                                                        {:token token})))
                                   "state")
                              "parens_active_course_v1"))))

        (testing "the file is versioned EDN"
          (let [data (edn/read-string (slurp (io/file dir "state.edn")))]
            (is (= 1 (:version data)))
            (is (contains? (:buckets data) "parens_clojure_v1"))))

        (testing "restarting the server on the same directory keeps the state"
          (state/configure! dir)
          (is (= {"themeKey" "gruvbox" "progress" {"welcome" {"done" true}}}
                 (get (get (string-body (handler (request :get "/api/state"
                                                                   {:token token})))
                           "state")
                      "parens_clojure_v1"))))))))

(deftest state-api-validates-keys-and-bodies
  (with-state-dir
    (fn [_dir]
      (doseq [payload ["{\"key\":\"../escape\",\"value\":{}}"
                       "{\"key\":\"\",\"value\":{}}"
                       "{\"key\":\"has space\",\"value\":{}}"
                       "{\"key\":\"missing-value\"}"]]
        (is (= 400 (:status ((handler) (put-json "/api/state" payload {:token token}))))
            payload))
      (is (= 400 (:status ((handler) (put-json "/api/state" "not json" {:token token})))))
      (is (= {} (:state (body ((handler) (request :get "/api/state" {:token token})))))))))

(deftest state-api-is-token-protected
  (is (= 401 (:status ((handler) (request :get "/api/state")))))
  (is (= 401 (:status ((handler) (put-json "/api/state"
                                          "{\"key\":\"parens_x\",\"value\":1}")))))
  (is (= 401 (:status ((handler) (request :get "/api/state" {:token "wrong"})))))
  (is (= 403 (:status ((handler) (request :get "/api/state"
                                          {:token token
                                           :headers {"origin" "http://evil.example"}}))))))

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

(deftest hiccup-body-is-validated
  (testing "code must be a string"
    (let [response ((handler) (post-json "/api/hiccup" "{\"code\":42}" {:token token}))]
      (is (= 400 (:status response)))
      (is (re-find #"code must be a string" (:error (body response))))))

  (testing "invalid namespace"
    (let [response ((handler) (post-json "/api/hiccup"
                                         "{\"code\":\"[:p \\\"hi\\\"]\",\"ns\":\"bad ns\"}"
                                         {:token token}))]
      (is (= 400 (:status response)))))

  (testing "the endpoint is behind the launch token"
    (let [response ((handler) (post-json "/api/hiccup" "{\"code\":\"[:p \\\"hi\\\"]\"}"))]
      (is (= 401 (:status response))))))

(deftest preview-session-is-token-protected-and-sets-a-strict-cookie
  (testing "no token"
    (is (= 401 (:status ((handler) (post-json "/api/preview/session" "{}"))))))

  (testing "a valid token starts a session"
    (let [response ((handler) (post-json "/api/preview/session" "{}" {:token token}))
          cookie (get-in response [:headers "set-cookie"])]
      (is (= 200 (:status response)))
      (is (re-find #"^parens-preview=" cookie))
      (is (re-find #"HttpOnly" cookie))
      (is (re-find #"SameSite=Strict" cookie)))))

(defn- preview-session []
  (let [response ((handler) (post-json "/api/preview/session" "{}" {:token token}))
        cookie (first (str/split (get-in response [:headers "set-cookie"]) #";"))]
    (when (re-find #"^parens-preview=" cookie) cookie)))

(deftest live-preview-requires-its-session-cookie
  (preview/start-session!)
  (is (= 403 (:status ((handler) (request :get "/preview/todos")))))
  (is (= 403 (:status ((handler) (request :get "/preview/todos"
                                          {:headers {"cookie" "parens-preview=wrong"}}))))))

(deftest live-preview-renders-and-mutates-the-todo-app
  (let [cookie (preview-session)
        page ((handler) (request :get "/preview/todos" {:headers {"cookie" cookie}}))
        html (body-text page)]
    (is (= 200 (:status page)))
    (testing "the page is server-rendered Hiccup with vendored htmx"
      (is (str/includes? html "/vendor/htmx.min.js"))
      (is (str/includes? html "hx-post=\"/preview/todos\""))
      (is (str/includes? html "Learn Hiccup"))
      (is (str/includes? (get-in ((handler) (request :get "/")) [:headers "content-security-policy"])
                         "frame-src 'self'"))
      (is (re-find #"script-src 'self'" (get-in page [:headers "content-security-policy"]))))

    (testing "adding a todo returns just the list fragment"
      (let [response ((handler) (request :post "/preview/todos"
                                         {:headers {"cookie" cookie}
                                          :body "text=Write+a+Ring+handler"}))
            fragment (body-text response)]
        (is (= 200 (:status response)))
        (is (re-find #"Write a Ring handler" fragment))
        (is (not (re-find #"<html" fragment)))))

    (testing "toggling and deleting go through the same request/response cycle"
      (let [toggled (body-text ((handler) (request :post "/preview/todos/1/toggle"
                                                   {:headers {"cookie" cookie}})))
            deleted (body-text ((handler) (request :post "/preview/todos/2/delete"
                                                   {:headers {"cookie" cookie}})))]
        (is (re-find #"0 of 3 done" toggled))
        (is (not (re-find #"Build a Ring handler" deleted)))))))

(deftest live-preview-rejects-cross-site-requests
  (let [cookie (preview-session)]
    (is (= 403 (:status ((handler) (request :get "/preview/todos"
                                            {:headers {"cookie" cookie
                                                       "sec-fetch-site" "cross-site"}})))))
    (is (= 403 (:status ((handler) (request :get "/preview/todos"
                                            {:headers {"cookie" cookie
                                                       "origin" "http://evil.example"}})))))))

(deftest exercise-body-is-validated
  (is (= 400 (:status ((handler) (post-json "/api/exercise" "{\"code\":\"(def x 1)\"}"
                                            {:token token}))))
      "missing tests")
  (is (= 400 (:status ((handler) (post-json "/api/exercise"
                                            "{\"code\":\"(def x 1)\",\"tests\":[]}"
                                            {:token token}))))))
