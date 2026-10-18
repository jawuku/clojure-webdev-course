(ns parens.main
  "Starts the local server and (unless --no-open) the UI.

  This is the Phase 0 vertical slice: a real JVM app process, a real child JVM
  evaluator, and a token-protected loopback HTTP API. Phase 6 adds launcher
  polish: one instance per state directory (a second launch focuses the running
  one), a readiness probe before the UI opens, and a Chromium/Edge/Brave
  `--app` window with the default browser as the fallback."
  (:require [clojure.java.io :as io]
            [clojure.java.shell :as shell]
            [clojure.string :as str]
            [org.httpkit.server :as http]
            [parens.api :as api]
            [parens.runtime :as runtime]
            [parens.state :as state])
  (:import [java.io File IOException]
           [java.net URI]
           [java.net.http HttpClient HttpRequest HttpResponse HttpResponse$BodyHandlers]
           [java.nio.channels FileChannel OverlappingFileLockException]
           [java.nio.file CopyOption Files StandardCopyOption StandardOpenOption]
           [java.nio.file.attribute PosixFilePermissions]
           [java.time Duration])
  (:gen-class))

(def ^:private default-port 0)
(def ^:private default-timeout-ms 2000)
(def ^:private instance-lock-name "instance.lock")
(def ^:private instance-url-name "instance.url")
(def ^:private ready-timeout-ms 5000)
(def ^:private handoff-timeout-ms 3000)

(defonce ^:private instance (atom nil))

(declare open-ui!)

(defn- usage []
  (str "Parens Phase 0 slice\n\n"
       "  --no-open            do not open a browser or app window\n"
       "  --no-app-window      use the default browser instead of Chromium --app\n"
       "  --port N             bind a specific loopback port (default: pick one)\n"
       "  --token T            use a fixed token (tests only; default: random)\n"
       "  --timeout-ms N       evaluation timeout (default: " default-timeout-ms ")\n"
       "  --state-dir DIR      where state.edn lives (default: platform app-data)\n"))

(defn parse-args [args]
  (loop [remaining (seq args)
         opts {:no-open false
               :no-app-window false
               :port default-port
               :timeout-ms default-timeout-ms
               :token nil
               :state-dir nil}]
    (if-let [arg (first remaining)]
      (case arg
        "--no-open" (recur (next remaining) (assoc opts :no-open true))
        "--no-app-window" (recur (next remaining) (assoc opts :no-app-window true))
        "--port" (recur (nnext remaining)
                        (assoc opts :port (Integer/parseInt (second remaining))))
        "--token" (recur (nnext remaining)
                         (assoc opts :token (second remaining)))
        "--timeout-ms" (recur (nnext remaining)
                              (assoc opts :timeout-ms
                                     (Integer/parseInt (second remaining))))
        "--state-dir" (recur (nnext remaining)
                             (assoc opts :state-dir (second remaining)))
        "--help" (do (println (usage)) (System/exit 0))
        "-h" (do (println (usage)) (System/exit 0))
        (throw (ex-info (str "Unknown argument: " arg "\n\n" (usage)) {})))
      opts)))

(defn- free-port []
  (with-open [socket (java.net.ServerSocket. 0)]
    (.getLocalPort socket)))

;; ---------------------------------------------------------------------------
;; Single instance

(defn- instance-files []
  {:lock (io/file (state/dir-path) instance-lock-name)
   :url (io/file (state/dir-path) instance-url-name)})

(defn try-acquire-instance!
  "Take the per-state-directory lock. Returns true when this process is the one
  instance. The OS releases the lock even if the process crashes, so a stale
  file never blocks a restart."
  []
  (let [{:keys [^File lock]} (instance-files)]
    (try
      (.mkdirs (.getParentFile lock))
      (let [channel (FileChannel/open
                     (.toPath lock)
                     (into-array java.nio.file.OpenOption
                                 [StandardOpenOption/CREATE StandardOpenOption/WRITE]))]
        (try
          (if-let [file-lock (.tryLock channel)]
            (do (reset! instance {:channel channel :lock file-lock})
                true)
            (do (.close channel) false))
          (catch OverlappingFileLockException _
            ;; Same JVM already holds it (only reachable from tests): close the
            ;; extra channel so a repeated probe does not leak file handles.
            (try (.close channel) (catch Throwable _))
            false)))
      (catch IOException e
        ;; A read-only app-data directory also breaks state.edn, but it should
        ;; not prevent the app from starting. Warn and run without the lock.
        (binding [*out* *err*]
          (println "Could not lock" (.getPath lock) "- continuing without it:"
                   (.getMessage e)))
        true))))

(defn release-instance!
  "Release the lock and remove the URL a second launch would read. Safe to call
  more than once (the shutdown hook does)."
  []
  (when-let [{:keys [channel lock]} @instance]
    (reset! instance nil)
    (try
      (Files/deleteIfExists (.toPath (:url (instance-files))))
      (catch Throwable _))
    (try (.release lock) (catch Throwable _))
    (try (.close channel) (catch Throwable _))))

(defn write-instance-url!
  "Publish the launch URL for a second launch to open. Written atomically; on
  POSIX it is owner-readable only because it contains the launch token."
  [url]
  (let [url-file (:url (instance-files))
        dir (.getParentFile ^File url-file)]
    (try
      (.mkdirs dir)
      (let [tmp (File/createTempFile ".instance-" ".url" dir)]
        (try
          (spit tmp url :encoding "UTF-8")
          (try
            (Files/setPosixFilePermissions
             (.toPath tmp) (PosixFilePermissions/fromString "rw-------"))
            (catch UnsupportedOperationException _))
          (try
            (Files/move (.toPath tmp) (.toPath ^File url-file)
                        (into-array CopyOption
                                    [StandardCopyOption/ATOMIC_MOVE
                                     StandardCopyOption/REPLACE_EXISTING]))
            (catch IOException _
              (Files/move (.toPath tmp) (.toPath ^File url-file)
                          (into-array CopyOption
                                      [StandardCopyOption/REPLACE_EXISTING]))))
          (finally
            (when (.exists tmp) (.delete tmp)))))
      (catch Throwable t
        (binding [*out* *err*]
          (println "Could not record the running instance URL:" (.getMessage t)))))))

(def ^:private launch-url-pattern
  #"http://127\.0\.0\.1:\d+/#token=[A-Za-z0-9_-]+")

(defn running-url
  "The URL published by the running instance, or nil."
  []
  (try
    (let [file (:url (instance-files))]
      (when (.isFile file)
        (let [url (str/trim (slurp file :encoding "UTF-8"))]
          (when (re-matches launch-url-pattern url) url))))
    (catch Throwable _ nil)))

(defn- hand-off!
  "Wait briefly for the owner to publish its URL, open it, and report that this
  launch is not starting a second server."
  [no-open no-app-window]
  (let [deadline (+ (System/currentTimeMillis) handoff-timeout-ms)]
    (loop []
      (if-let [url (running-url)]
        (do
          (println "Parens is already running.")
          (println "  URL:" url)
          (when-not no-open (open-ui! url no-app-window))
          true)
        (if (< (System/currentTimeMillis) deadline)
          (do (Thread/sleep 100) (recur))
          (do
            (binding [*out* *err*]
              (println "Parens is already running, but its URL is not ready yet.")
              (println "Stop the other instance and try again."))
            false))))))

;; ---------------------------------------------------------------------------
;; Opening the UI

(defn- os-name [] (str/lower-case (str (System/getProperty "os.name"))))
(defn- windows? [] (str/includes? (os-name) "win"))
(defn- mac? [] (str/includes? (os-name) "mac"))

(defn- executable? [file]
  (let [^File f (io/file file)]
    (and (.isFile f)
         (or (windows?) (.canExecute f)))))

(defn- find-on-path [name]
  (when-let [path (System/getenv "PATH")]
    (some (fn [dir]
            (let [candidate (io/file dir name)]
              (when (executable? candidate) (.getPath candidate))))
          (str/split path (re-pattern (java.util.regex.Pattern/quote File/pathSeparator))))))

(defn- absolute-browser-paths []
  (cond
    (mac?) ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            "/Applications/Chromium.app/Contents/MacOS/Chromium"
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"]

    (windows?)
    (let [env #(System/getenv %)
          pf (env "ProgramFiles")
          pf86 (env "ProgramFiles(x86)")
          local (env "LOCALAPPDATA")]
      (remove nil?
              [(when pf (str pf "\\Google\\Chrome\\Application\\chrome.exe"))
               (when pf86 (str pf86 "\\Google\\Chrome\\Application\\chrome.exe"))
               (when local (str local "\\Google\\Chrome\\Application\\chrome.exe"))
               (when pf (str pf "\\Microsoft\\Edge\\Application\\msedge.exe"))
               (when pf86 (str pf86 "\\Microsoft\\Edge\\Application\\msedge.exe"))
               (when local (str local "\\Microsoft\\Edge\\Application\\msedge.exe"))
               (when pf (str pf "\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"))
               (when pf86 (str pf86 "\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"))]))

    :else []))

(defn- browser-command-names []
  (if (windows?)
    ["chrome.exe" "msedge.exe" "brave.exe"]
    ["google-chrome" "google-chrome-stable" "chromium" "chromium-browser"
     "microsoft-edge" "brave-browser"]))

(defn find-browser
  "A Chromium-family browser that supports `--app`, or nil. PARENS_BROWSER
  overrides detection (useful for tests and unusual installs)."
  []
  (or (when-let [override (System/getenv "PARENS_BROWSER")]
        (when (executable? override) override))
      (some #(when (executable? %) %) (absolute-browser-paths))
      (some find-on-path (browser-command-names))))

(defn app-window-command
  "The argv for an app window with its own profile, so the learner's everyday
  browser profile is never touched and a running browser cannot swallow the
  launch."
  [browser url profile-dir]
  [browser
   (str "--app=" url)
   (str "--user-data-dir=" profile-dir)
   "--no-first-run"
   "--no-default-browser-check"])

(defn- try-app-window! [url]
  (when-let [browser (find-browser)]
    (let [profile (io/file (state/dir-path) "browser-profile")]
      (try
        (.mkdirs profile)
        (let [builder (ProcessBuilder.
                       ^java.util.List
                       (app-window-command browser url (.getPath profile)))]
          (.redirectOutput builder java.lang.ProcessBuilder$Redirect/DISCARD)
          (.redirectError builder java.lang.ProcessBuilder$Redirect/DISCARD)
          (.start builder)
          true)
        (catch Throwable t
          (binding [*out* *err*]
            (println "Could not start an app window:" (.getMessage t)))
          false)))))

(defn- open-browser! [url]
  (try
    (let [desktop-supported? (and (not (System/getProperty "java.awt.headless"))
                                  (java.awt.Desktop/isDesktopSupported))
          desktop (when desktop-supported? (java.awt.Desktop/getDesktop))]
      (if (and desktop (.isSupported desktop java.awt.Desktop$Action/BROWSE))
        (.browse desktop (java.net.URI. url))
        (let [os (os-name)]
          (cond
            (mac?) (shell/sh "open" url)
            (windows?) (shell/sh "rundll32" "url.dll,FileProtocolHandler" url)
            :else (shell/sh "xdg-open" url)))))
    (catch Throwable t
      (binding [*out* *err*]
        (println "Could not open a browser automatically:" (.getMessage t))
        (println "Open the printed URL manually.")))))

(defn open-ui!
  "Open the app window when a Chromium-family browser exists, otherwise the
  default browser. Returns :app-window or :browser."
  [url no-app-window]
  (if (and (not no-app-window) (try-app-window! url))
    (do (println "Opened the Parens app window.")
        :app-window)
    (do (open-browser! url)
        :browser)))

;; ---------------------------------------------------------------------------
;; Readiness and lifecycle

(defn- server-ready? [port]
  (try
    (let [client (HttpClient/newHttpClient)
          request (-> (HttpRequest/newBuilder
                       (URI. (str "http://127.0.0.1:" port "/api/health")))
                      (.timeout (Duration/ofMillis 500))
                      (.GET)
                      (.build))
          response (.send client request (HttpResponse$BodyHandlers/discarding))]
      (= 200 (.statusCode response)))
    (catch Throwable _ false)))

(defn wait-for-server!
  "Poll /api/health until it answers. `run-server` is synchronous, so this is a
  belt-and-braces check before the browser window points at the URL."
  [port timeout-ms]
  (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (cond
        (server-ready? port) true
        (>= (System/currentTimeMillis) deadline) false
        :else (do (Thread/sleep 50) (recur))))))

(defn- stop-server! [server]
  (try
    (if-let [stop (resolve 'org.httpkit.server/server-stop!)]
      (stop server)
      (server :stop))
    (catch Throwable _)))

(defn -main [& args]
  (let [{:keys [no-open no-app-window port timeout-ms token state-dir]}
        (parse-args args)
        token (or token (api/new-token))
        state-dir (state/configure! state-dir)]

    ;; A second launch must not bind another port or start another worker: the
    ;; lock fails, we open the running instance (or print its URL), and exit.
    (when-not (try-acquire-instance!)
      (System/exit (if (hand-off! no-open no-app-window) 0 1)))

    (try
      (runtime/set-timeout-ms! timeout-ms)
      (let [actual-port (if (zero? port) (free-port) port)
            server (try
                     (http/run-server (api/app token)
                                      {:ip "127.0.0.1"
                                       :port actual-port
                                       :thread 4
                                       :queue-size 64
                                       :max-body (* 1024 1024)})
                     (catch java.net.BindException e
                       (binding [*out* *err*]
                         (println (str "Could not bind 127.0.0.1:" actual-port
                                       " - " (.getMessage e)))
                         (println "Another program may be using that port; start without --port to pick a free one."))
                       (release-instance!)
                       (System/exit 1)))
            url (str "http://127.0.0.1:" actual-port "/#token=" token)]
        (write-instance-url! url)
        (.addShutdownHook
         (Runtime/getRuntime)
         (Thread. ^Runnable
                  (fn []
                    (stop-server! server)
                    (runtime/stop!)
                    (release-instance!))))
        (println "Parens Phase 0 slice")
        (println "  URL:       " url)
        (println "  Timeout:   " timeout-ms "ms")
        (println "  State:     " (.getPath state-dir))
        (println "  Ctrl+C to stop.")
        ;; Stable, machine-readable lines for the Phase 0 check script. The
        ;; server is ready now; the worker boots in the background so the UI can
        ;; paint while the second JVM is still starting.
        (println (str "PARENS_URL=" url))
        (println (str "PARENS_PORT=" actual-port))
        (println (str "PARENS_TOKEN=" token))
        (println (str "PARENS_STATE_DIR=" (.getPath state-dir)))
        (flush)
        (when-not no-open
          (future
            (when (wait-for-server! actual-port ready-timeout-ms)
              (open-ui! url no-app-window))))
        (future
          (try
            (runtime/start!)
            (catch Throwable t
              (binding [*out* *err*]
                (println "Could not start the evaluation worker:" (.getMessage t))))))
        @(promise))
      (catch Throwable t
        (release-instance!)
        (throw t)))))
