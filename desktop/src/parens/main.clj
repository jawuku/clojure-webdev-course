(ns parens.main
  "Starts the local server and (unless --no-open) the browser.

  This is the Phase 0 vertical slice: a real JVM app process, a real child JVM
  evaluator, and a token-protected loopback HTTP API."
  (:require [clojure.java.shell :as shell]
            [clojure.string :as str]
            [org.httpkit.server :as http]
            [parens.api :as api]
            [parens.runtime :as runtime])
  (:gen-class))

(def ^:private default-port 0)
(def ^:private default-timeout-ms 2000)

(defn- usage []
  (str "Parens Phase 0 slice\n\n"
       "  --no-open            do not open a browser\n"
       "  --port N             bind a specific loopback port (default: pick one)\n"
       "  --token T            use a fixed token (tests only; default: random)\n"
       "  --timeout-ms N       evaluation timeout (default: " default-timeout-ms ")\n"))

(defn- parse-args [args]
  (loop [remaining (seq args)
         opts {:no-open false
               :port default-port
               :timeout-ms default-timeout-ms
               :token nil}]
    (if-let [arg (first remaining)]
      (case arg
        "--no-open" (recur (next remaining) (assoc opts :no-open true))
        "--port" (recur (nnext remaining)
                        (assoc opts :port (Integer/parseInt (second remaining))))
        "--token" (recur (nnext remaining)
                         (assoc opts :token (second remaining)))
        "--timeout-ms" (recur (nnext remaining)
                              (assoc opts :timeout-ms
                                     (Integer/parseInt (second remaining))))
        "--help" (do (println (usage)) (System/exit 0))
        "-h" (do (println (usage)) (System/exit 0))
        (throw (ex-info (str "Unknown argument: " arg "\n\n" (usage)) {})))
      opts)))

(defn- free-port []
  (with-open [socket (java.net.ServerSocket. 0)]
    (.getLocalPort socket)))

(defn- open-browser! [url]
  (try
    (let [desktop-supported? (and (not (System/getProperty "java.awt.headless"))
                                  (java.awt.Desktop/isDesktopSupported))
          desktop (when desktop-supported? (java.awt.Desktop/getDesktop))]
      (if (and desktop (.isSupported desktop java.awt.Desktop$Action/BROWSE))
        (.browse desktop (java.net.URI. url))
        (let [os (str/lower-case (System/getProperty "os.name"))]
          (cond
            (str/includes? os "mac") (shell/sh "open" url)
            (str/includes? os "win") (shell/sh "rundll32" "url.dll,FileProtocolHandler" url)
            :else (shell/sh "xdg-open" url)))))
    (catch Throwable t
      (binding [*out* *err*]
        (println "Could not open a browser automatically:" (.getMessage t))
        (println "Open the printed URL manually.")))))

(defn- stop-server! [server]
  (try
    (if-let [stop (resolve 'org.httpkit.server/server-stop!)]
      (stop server)
      (server :stop))
    (catch Throwable _)))

(defn -main [& args]
  (let [{:keys [no-open port timeout-ms token]} (parse-args args)
        token (or token (api/new-token))
        actual-port (if (zero? port) (free-port) port)]
    (runtime/set-timeout-ms! timeout-ms)
    (let [server (http/run-server (api/app token)
                                  {:ip "127.0.0.1"
                                   :port actual-port
                                   :thread 4
                                   :queue-size 64
                                   :max-body (* 1024 1024)})
          url (str "http://127.0.0.1:" actual-port "/#token=" token)]
      (.addShutdownHook
       (Runtime/getRuntime)
       (Thread. ^Runnable
                (fn []
                  (stop-server! server)
                  (runtime/stop!))))
      (println "Parens Phase 0 slice")
      (println "  URL:       " url)
      (println "  Timeout:   " timeout-ms "ms")
      (println "  Ctrl+C to stop.")
      ;; Stable, machine-readable lines for the Phase 0 check script. The
      ;; server is ready now; the worker boots in the background so the UI can
      ;; paint while the second JVM is still starting.
      (println (str "PARENS_URL=" url))
      (println (str "PARENS_PORT=" actual-port))
      (println (str "PARENS_TOKEN=" token))
      (flush)
      (when-not no-open
        (future (Thread/sleep 150) (open-browser! url)))
      (future
        (try
          (runtime/start!)
          (catch Throwable t
            (binding [*out* *err*]
              (println "Could not start the evaluation worker:" (.getMessage t))))))
      @(promise))))
