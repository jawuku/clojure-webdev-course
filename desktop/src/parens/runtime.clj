(ns parens.runtime
  "Owns the child JVM that actually evaluates learner code.

  The worker is a separate process on purpose: a tight loop such as
  (while true) cannot be stopped safely inside the app's JVM. On timeout we
  kill the worker and start a fresh one, which is the only reliable recovery
  on modern JDKs. Requests are serialized (one eval at a time)."
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str])
  (:import [java.io BufferedReader BufferedWriter File InputStreamReader
            OutputStreamWriter]
           [java.nio.charset StandardCharsets]
           [java.nio.file Files]
           [java.nio.file.attribute FileAttribute]
           [java.util.concurrent LinkedBlockingQueue TimeUnit]
           [java.util.concurrent.atomic AtomicLong]))

(def ^:private request-counter (AtomicLong. 0))
(def ^:private eof (Object.))
(def ^:private ready-timeout-ms 15000)
(def ^:private timeout-ms* (atom 2000))
;; The namespace an eval lands in when the request omits one. The UI sends the
;; course namespace explicitly on every eval, so this is the API default
;; (POST /api/set-ns changes it) rather than shared evaluation state.
(def ^:private active-ns* (atom "user"))
(def ^:private state (atom nil))
(def ^:private lock (Object.))

(defrecord Worker [^Process process ^BufferedWriter writer ^LinkedBlockingQueue queue
                   pid ^File dir])

(defn timeout-ms [] @timeout-ms*)

(defn active-ns [] @active-ns*)
(defn set-active-ns! [ns] (reset! active-ns* ns))

(defn worker-pid [] (:pid @state))
(defn set-timeout-ms! [ms] (reset! timeout-ms* (max 250 (long ms))))

(defn- windows? []
  (str/starts-with? (System/getProperty "os.name") "Windows"))

(defn- runtime-bin
  "Name of a launcher inside the JVM's bin directory (java.exe on Windows)."
  [name]
  (if (windows?) (str name ".exe") name))

(defn- java-bin []
  (io/file (System/getProperty "java.home") "bin" (runtime-bin "java")))

(defn- classpath
  "The current classpath with every entry made absolute, so the worker can run
  from a different working directory."
  []
  (let [sep (System/getProperty "path.separator")
        raw (System/getProperty "java.class.path")
        entries (if (str/blank? raw)
                  ["."]
                  (str/split raw (re-pattern (java.util.regex.Pattern/quote sep))))]
    (str/join sep
              (map (fn [entry]
                     (let [f (io/file entry)]
                       (if (.isAbsolute f) (.getPath f) (.getAbsolutePath f))))
                   entries))))

(defn- launcher-candidates
  "Every place jpackage may have put the ParensWorker launcher, walking up from
  java.home. The layout differs per platform:
    Linux    <app>/bin/ParensWorker
    Windows  <app>/ParensWorker.exe
    macOS    <app>.app/Contents/MacOS/ParensWorker"
  [^File java-home]
  (let [name (runtime-bin "ParensWorker")]
    (->> (iterate #(.getParentFile ^File %) java-home)
         (take-while some?)
         (take 6)
         (mapcat (fn [^File dir]
                   [(io/file dir "bin" name)
                    (io/file dir name)
                    (io/file dir "MacOS" name)
                    (io/file dir "Contents" "MacOS" name)]))
         distinct)))

(defn- worker-launcher
  "In a jpackage app-image (and in the Windows installers, whose runtime
  jpackage regenerates) the runtime may be built with --strip-native-commands,
  so there is no bin/java. The build adds a second launcher for the worker; use
  it in that case."
  []
  (let [java (java-bin)]
    (or
     (when (.canExecute java)
       {:command [(str java) "-Xmx512m" "-XX:TieredStopAtLevel=1"
                  "-cp" (classpath) "parens.worker"]})
     (when-let [launcher (->> (launcher-candidates
                               (io/file (System/getProperty "java.home")))
                              (filter (fn [^File f] (.canExecute f)))
                              first)]
       {:command [(str launcher)]}))))

(defn- worker-command []
  (or (:command (worker-launcher))
      (throw (ex-info "No Java executable found for the evaluation worker."
                      {:java-home (System/getProperty "java.home")}))))

(defn- drain-stderr [^Process process]
  (doto (Thread.
         (fn []
           (try
             (with-open [reader (io/reader (.getErrorStream process))]
               (doseq [line (line-seq reader)]
                 (binding [*out* *err*]
                   (println "[worker]" line))))
             (catch Throwable _))))
    (.setDaemon true)
    (.setName "parens-worker-stderr")
    (.start)))

(defn- start-reader [^BufferedReader reader ^LinkedBlockingQueue queue]
  (doto (Thread.
         (fn []
           (try
             (loop []
               (if-let [line (.readLine reader)]
                 (do (.put queue line) (recur))
                 (.put queue eof)))
             (catch Throwable _
               (.put queue eof)))))
    (.setDaemon true)
    (.setName "parens-worker-reader")
    (.start)))

(defn- await-ready [queue]
  (let [line (.poll queue ready-timeout-ms TimeUnit/MILLISECONDS)]
    (cond
      (nil? line)
      (throw (ex-info "Evaluation worker did not report ready in time." {}))

      (identical? line eof)
      (throw (ex-info "Evaluation worker exited during startup. See the [worker] log lines above." {}))

      :else
      (let [msg (try (edn/read-string line)
                     (catch Throwable _ nil))]
        (if (:ready msg)
          msg
          (throw (ex-info "Unexpected first message from evaluation worker."
                          {:line line})))))))

(defn- spawn-worker! []
  (let [dir (.toFile (Files/createTempDirectory "parens-worker-"
                                                (make-array FileAttribute 0)))
        command (worker-command)
        builder (doto (ProcessBuilder. (into-array String command))
                  (.directory dir))
        process (.start builder)
        writer (BufferedWriter. (OutputStreamWriter. (.getOutputStream process)
                                                     StandardCharsets/UTF_8))
        reader (BufferedReader. (InputStreamReader. (.getInputStream process)
                                                    StandardCharsets/UTF_8))
        queue (LinkedBlockingQueue.)]
    (drain-stderr process)
    (start-reader reader queue)
    (let [worker (->Worker process writer queue (.pid process) dir)]
      (reset! state worker)
      (try
        (await-ready queue)
        worker
        (catch Throwable t
          (try (.destroyForcibly process) (catch Throwable _))
          (throw t))))))

(defn- alive? [^Worker worker]
  (and worker (.isAlive ^Process (:process worker))))

(defn- delete-dir! [^File dir]
  (when (and dir (.exists dir))
    (doseq [f (reverse (file-seq dir))]
      (try (.delete ^File f) (catch Throwable _)))))

(defn stop!
  "Force-stop the worker. Safe to call repeatedly and from a shutdown hook."
  []
  (when-let [^Worker worker @state]
    (reset! state nil)
    (try (.close ^BufferedWriter (:writer worker)) (catch Throwable _))
    (try (.destroyForcibly ^Process (:process worker)) (catch Throwable _))
    (try (.waitFor ^Process (:process worker) 2 TimeUnit/SECONDS) (catch Throwable _))
    (delete-dir! (:dir worker))))

(defn- ensure! []
  (when-not (alive? @state)
    (stop!)
    (spawn-worker!)))

(defn start!
  "Start the worker if it is not already running."
  []
  (locking lock
    (ensure!)
    {:ok true :pid (:pid @state)}))

(defn- await-response [^LinkedBlockingQueue queue id deadline]
  (loop []
    (let [remaining (- deadline (System/currentTimeMillis))]
      (if (<= remaining 0)
        [:timeout]
        (let [line (.poll queue remaining TimeUnit/MILLISECONDS)]
          (cond
            (nil? line) [:timeout]
            (identical? line eof) [:eof]
            :else
            (let [msg (try (edn/read-string line)
                           (catch Throwable e {:parse-error e}))]
              (cond
                (:parse-error msg) [:protocol msg]
                (= (:id msg) id) [:ok msg]
                :else (recur)))))))))

(defn request!
  "Send one EDN request to the worker and wait for its response.

  Returns the worker's response map, or {:ok false :error ...} when the worker
  timed out, exited, or broke the protocol. In every failure case the worker is
  killed; the next request starts a fresh one."
  [message]
  (locking lock
    (ensure!)
    (let [^Worker worker @state
          id (str (.incrementAndGet request-counter))
          deadline (+ (System/currentTimeMillis) @timeout-ms*)]
      (try
        (.write ^BufferedWriter (:writer worker) (pr-str (assoc message :id id)))
        (.newLine ^BufferedWriter (:writer worker))
        (.flush ^BufferedWriter (:writer worker))
        (let [[status payload] (await-response (:queue worker) id deadline)]
          (case status
            :timeout
            (do (stop!)
                {:ok false
                 :timeout true
                 :error (str "Evaluation timed out after " @timeout-ms*
                             " ms; the worker was killed and will restart.")})

            :eof
            (do (stop!)
                {:ok false
                 :crashed true
                 :error "The evaluation worker exited unexpectedly and will restart."})

            :protocol
            (do (stop!)
                {:ok false
                 :crashed true
                 :error (str "Evaluation worker protocol error: "
                             (some-> ^Throwable (:parse-error payload) .getMessage))})

            :ok payload))
        (catch Throwable e
          (stop!)
          {:ok false
           :error (str "Evaluation worker I/O failed: " (.getMessage e))})))))

(defn restart! []
  (locking lock
    (stop!)
    (ensure!)
    {:ok true :pid (:pid @state)}))

(defn info []
  (request! {:op :ping}))

(defn eval-code [ns code]
  (let [t0 (System/nanoTime)
        response (request! {:op :eval :ns ns :code code})]
    (assoc response :ms (/ (double (- (System/nanoTime) t0)) 1e6))))

(defn render-hiccup [ns code]
  (let [t0 (System/nanoTime)
        response (request! {:op :hiccup :ns ns :code code})]
    (assoc response :ms (/ (double (- (System/nanoTime) t0)) 1e6))))

(defn run-exercise [ns code tests]
  (let [t0 (System/nanoTime)
        response (request! {:op :exercise :ns ns :code code :tests tests})]
    (assoc response :ms (/ (double (- (System/nanoTime) t0)) 1e6))))
