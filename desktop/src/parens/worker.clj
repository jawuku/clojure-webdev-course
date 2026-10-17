(ns parens.worker
  "The child JVM. Speaks newline-delimited EDN over stdin/stdout, one request
  at a time. Learner stdout is captured, so the protocol channel stays clean
  for normal println/prn use."
  (:require [clojure.edn :as edn]
            [clojure.set :as set]
            [clojure.string :as str])
  (:import [java.lang ProcessHandle])
  (:gen-class :main true))

(def ^:private exercise-counter (atom 0))

(defn- clean-error [^Throwable t]
  (let [message (or (.getMessage t) (str t))]
    (str (.getName (class t)) ": " message)))

(defn- capture
  "Run f with stdout/stderr captured. Returns {:result v :output s} or
  {:error t :output s}. The output is preserved even when f throws."
  [f]
  (let [out (java.io.StringWriter.)
        err (java.io.StringWriter.)
        output (fn []
                 (str out (when (pos? (.length (str err)))
                            (str "\n[stderr]\n" err))))]
    (try
      (let [value (binding [*out* (java.io.PrintWriter. out true)
                            *err* (java.io.PrintWriter. err true)
                            *in* (java.io.StringReader. "")]
                    (f))]
        {:result value :output (output)})
      (catch Throwable t
        {:error t :output (output)}))))

(defn- prepare-ns! [ns-name]
  (let [ns-object (create-ns (symbol (str ns-name)))]
    (binding [*ns* ns-object]
      (refer 'clojure.core)
      (require '[clojure.string :as str])
      (require '[clojure.set :as set]))
    ns-object))

(defn- eval-in [ns-name code]
  (let [ns-object (prepare-ns! ns-name)]
    (binding [*ns* ns-object]
      (eval (read-string (str "(do " code "\n)"))))))

(defn- eval-code [ns-name code]
  (let [{:keys [result error output]} (capture #(pr-str (eval-in ns-name code)))]
    (if error
      {:ok false :value nil :output output :error (clean-error error)}
      {:ok true :value result :output output :error nil})))

(defn- run-exercise [code tests]
  (let [ns-name (str "exercise" (swap! exercise-counter inc))
        ns-object (prepare-ns! ns-name)]
    (binding [*ns* ns-object]
      (try
        (eval (read-string (str "(def answer (do\n" code "\n))")))
        (let [results (mapv (fn [test]
                              (try
                                (let [value (eval (read-string test))
                                      passed? (true? value)]
                                  {:test test
                                   :ok passed?
                                   :detail (if passed?
                                             "passed"
                                             (str "got " (pr-str value)))})
                                (catch Throwable t
                                  {:test test :ok false :detail (clean-error t)})))
                            tests)]
          {:ok true
           :passed (boolean (and (seq results) (every? :ok results)))
           :results results
           :runError nil})
        (catch Throwable t
          {:ok false
           :passed false
           :results []
           :runError (clean-error t)})))))

(defn- exercise [code tests]
  (let [{:keys [result error output]} (capture #(run-exercise code tests))]
    (if error
      {:ok false :passed false :results [] :runError (clean-error error) :output output}
      (assoc result :output output))))

(defn- handle [{:keys [op ns code tests] :as _message}]
  (case op
    :ping
    {:ok true
     :pid (.pid (ProcessHandle/current))
     :clojure (clojure-version)
     :java (System/getProperty "java.version")}

    :eval
    (eval-code (or ns "user") (str code))

    :exercise
    (exercise (str code) (vec (or tests [])))

    {:ok false :error (str "Unknown op: " (pr-str op))}))

(defn -main [& _]
  (println (pr-str {:ready true
                    :pid (.pid (ProcessHandle/current))
                    :clojure (clojure-version)
                    :java (System/getProperty "java.version")}))
  (flush)
  (loop []
    (when-let [line (read-line)]
      (let [message (try (edn/read-string line)
                         (catch Throwable _ nil))]
        (if (map? message)
          (let [response (try (handle message)
                              (catch Throwable t
                                {:ok false :error (clean-error t)}))]
            (println (pr-str (assoc response :id (:id message))))
            (flush))
          (do
            (println (pr-str {:ok false :error "Malformed request"}))
            (flush))))
      (recur))))
