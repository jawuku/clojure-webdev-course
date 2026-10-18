(ns parens.runtime-test
  "Integration tests for the child-JVM evaluator.

  These start the real worker from the test JVM's classpath, so they cover the
  timeout kill + restart path and `System/exit` containment that the app relies
  on. The worker binary must be on the classpath (lein compiles the `:aot`
  namespaces before tests run)."
  (:require [clojure.test :refer [deftest is testing]]
            [parens.runtime :as runtime]))

(def ^:private default-timeout-ms 2000)

(defn- with-worker [f]
  (try
    (runtime/stop!)
    (f)
    (finally
      (runtime/stop!)
      (runtime/set-timeout-ms! default-timeout-ms))))

(defn- evaluate [code]
  (runtime/eval-code "user" code))

(deftest worker-launcher-candidates-cover-every-packaged-layout
  (let [paths (fn [home]
                (->> (#'runtime/launcher-candidates (java.io.File. home))
                     (map #(.getPath ^java.io.File %))
                     set))]
    (testing "Linux app image: <app>/bin/ParensWorker"
      (is (contains? (paths "/opt/parens/lib/runtime")
                     "/opt/parens/bin/ParensWorker")))
    (testing "Windows installer: <app>/ParensWorker.exe next to the launcher"
      (is (contains? (paths "C:/Program Files/ParensPhase0/runtime")
                     "C:/Program Files/ParensPhase0/ParensWorker")))
    (testing "macOS bundle: Contents/MacOS/ParensWorker"
      (is (contains? (paths "/Applications/Parens.app/Contents/runtime/Contents/Home")
                     "/Applications/Parens.app/Contents/MacOS/ParensWorker")))))

(deftest worker-evaluates-real-clojure
  (with-worker
    (fn []
      (let [pid (:pid (runtime/start!))
            response (evaluate "(+ 1 2)")]
        (is (pos? pid) "worker reported a pid")
        (is (true? (:ok response)))
        (is (= "3" (:value response)))
        (is (number? (:ms response)))))))

(deftest multi-form-code-sees-earlier-definitions
  (with-worker
    (fn []
      (let [response (evaluate
                      (str "(defprotocol Shape (area [s]))\n"
                           "(defrecord Square [side] Shape (area [s] (* side side)))\n"
                           "(area (->Square 3))"))]
        (is (true? (:ok response)) (:error response))
        (is (= "9" (:value response)))))))

(deftest exercise-answers-can-use-protocols
  (with-worker
    (fn []
      (let [result (runtime/run-exercise
                    "exercise"
                    (str "(defprotocol Named (label [x]))\n"
                         "(defn make-label [text] (reify Named (label [x] text)))")
                    ["(= (label (make-label \"hi\")) \"hi\")"])]
        (is (true? (:passed result)) (pr-str (:runError result)))))))

(deftest compiler-errors-include-the-cause
  (with-worker
    (fn []
      (let [response (evaluate "(js/Math.max 1 2)")]
        (is (false? (:ok response)))
        (is (re-find #"caused by" (:error response)))
        (is (re-find #"No such namespace: js" (:error response)))))))

(deftest hiccup-renders-through-the-real-library
  (with-worker
    (fn []
      (let [response (runtime/render-hiccup
                      "web"
                      (str "(defn card [title] [:div.card [:h2 title]])\n"
                           "(card \"Hi\")"))]
        (is (true? (:ok response)) (:error response))
        (is (= "<div class=\"card\"><h2>Hi</h2></div>" (:html response)))
        (is (number? (:ms response)))))))

(deftest hiccup-reports-errors-clearly
  (with-worker
    (fn []
      (let [response (runtime/render-hiccup "web" "(js/Math.sqrt 16)")]
        (is (false? (:ok response)))
        (is (re-find #"No such namespace: js" (:error response)))))))

(deftest exercises-run-in-fresh-namespaces
  (with-worker
    (fn []
      (let [correct (runtime/run-exercise "exercise" "(defn twice [x] (* 2 x))"
                                          ["(= (twice 2) 4)" "(= (twice 0) 0)"])
            wrong (runtime/run-exercise "exercise" "(defn twice [x] (+ x 1))"
                                        ["(= (twice 2) 4)"])]
        (is (true? (:passed correct)))
        (is (= 2 (count (:results correct))))
        (is (false? (:passed wrong)))
        (is (false? (-> wrong :results first :ok)))))))

(deftest timeout-kills-the-worker-and-the-next-eval-recovers
  (with-worker
    (fn []
      (runtime/set-timeout-ms! 600)
      (let [before (runtime/start!)
            started (System/currentTimeMillis)
            timed-out (evaluate "(while true)")
            elapsed (- (System/currentTimeMillis) started)]
        (testing "the runaway eval is reported as a timeout"
          (is (true? (:timeout timed-out)))
          (is (false? (:ok timed-out)))
          (is (re-find #"timed out" (:error timed-out))))

        (testing "the timeout is enforced promptly"
          (is (< elapsed 5000) (str "took " elapsed " ms")))

        (testing "the killed worker is gone"
          (is (nil? (runtime/worker-pid))))

        (testing "the next eval starts a fresh worker"
          (let [recovered (evaluate "(+ 1 2)")]
            (is (true? (:ok recovered)))
            (is (= "3" (:value recovered)))
            (is (some? (runtime/worker-pid)))
            (is (not= (:pid before) (runtime/worker-pid)))))))))

(deftest system-exit-is-contained-to-the-worker
  (with-worker
    (fn []
      (let [before (runtime/start!)
            crashed (evaluate "(System/exit 0)")]
        (testing "the parent survives and reports a crash"
          (is (true? (:crashed crashed)))
          (is (not (:timeout crashed)))
          (is (false? (:ok crashed))))

        (testing "the next eval starts a fresh worker"
          (let [recovered (evaluate "(+ 1 2)")]
            (is (= "3" (:value recovered)))
            (is (not= (:pid before) (runtime/worker-pid)))))))))

(deftest stop-is-idempotent-and-deletes-the-worker-state
  (with-worker
    (fn []
      (runtime/start!)
      (is (some? (runtime/worker-pid)))
      (runtime/stop!)
      (is (nil? (runtime/worker-pid)))
      (runtime/stop!) ; safe to call twice
      (is (nil? (runtime/worker-pid)))
      (is (= "3" (:value (evaluate "(+ 1 2)")))))))
