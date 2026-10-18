(ns parens.state
  "The learner's app state, stored as one EDN file in the platform's app-data
  directory.

  Shape:

      {:version 1
       :buckets {\"parens_clojure_v1\" {:themeKey \"kanagawa\" ...}
                 \"parens_active_course_v1\" \"clojure\"}}

  The browser treats this file as the source of truth and keeps a
  `localStorage` mirror only so `theme-init.js` can paint the right theme
  before the first request; without a server the browser falls back to that
  mirror. Writes go to a temporary file in the same directory and are moved
  into place atomically, so a crash or full disk cannot leave a half-written
  `state.edn`."
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str])
  (:import [java.io File IOException]
           [java.nio.file CopyOption Files StandardCopyOption]))

(def ^:private state-version 1)
(def ^:private key-pattern #"[A-Za-z0-9_.-]{1,80}")
(def ^:private lock (Object.))
(defonce ^:private dir* (atom nil))

(defn valid-key?
  "Bucket keys are the storage keys the UI already uses; keep them tame so a
  crafted request cannot write arbitrary paths."
  [key]
  (boolean (and (string? key) (re-matches key-pattern key))))

(defn editable-value?
  "Values arrive as parsed JSON: nil, strings, numbers, booleans, objects and
  arrays. Anything else is rejected before it reaches the EDN file."
  [value]
  (or (nil? value)
      (string? value)
      (number? value)
      (boolean? value)
      (map? value)
      (vector? value)))

(defn default-dir
  "Platform app-data directory:

  - Linux:   $XDG_CONFIG_HOME/parens or ~/.config/parens
  - macOS:   ~/Library/Application Support/Parens
  - Windows: %APPDATA%\\Parens"
  ^File []
  (let [os (str/lower-case (str (System/getProperty "os.name")))
        home (str (System/getProperty "user.home"))]
    (cond
      (str/includes? os "win")
      (io/file (or (System/getenv "APPDATA") home) "Parens")

      (str/includes? os "mac")
      (io/file home "Library" "Application Support" "Parens")

      :else
      (io/file (or (System/getenv "XDG_CONFIG_HOME")
                   (str (io/file home ".config")))
               "parens"))))

(defn dir-path
  "The directory state is read from and written to (configured or default)."
  ^File []
  (or @dir* (default-dir)))

(defn state-file ^File []
  (io/file (dir-path) "state.edn"))

(defn configure!
  "Point the store at `dir` (a string or File), or back at the platform default
  when called with nil. Tests and the packaged-app checkers use this to keep
  runs isolated from the developer's real profile."
  ([] (configure! nil))
  ([dir]
   (locking lock
     (reset! dir* (when (some? dir) (.getCanonicalFile (io/file (str dir)))))
     (dir-path))))

(defn- read-data
  "Read the EDN file. A corrupt file is moved aside instead of being silently
  overwritten: the learner can still recover it, and the app starts clean."
  [^File file]
  (when (.exists file)
    (try
      (let [data (edn/read-string (slurp file :encoding "UTF-8"))]
        (if (map? data) data {}))
      (catch Throwable e
        (let [backup (io/file (str (.getPath file) ".corrupt-" (System/currentTimeMillis)))]
          (try
            (Files/move (.toPath file) (.toPath backup)
                        (make-array CopyOption 0))
            (catch Throwable _))
          (binding [*out* *err*]
            (println "Could not read" (.getPath file)
                     "- moved it aside and started with empty state:"
                     (.getMessage e)))
          {})))))

(defn- buckets [data]
  (cond
    (map? (:buckets data)) (:buckets data)
    ;; Tolerate a hand-written file without the :version/:buckets wrapper.
    (map? data) (into {} (filter (fn [[k _]] (valid-key? k))) data)
    :else {}))

(defn read-buckets
  "Every saved bucket, filtered to valid keys. An absent file means empty."
  []
  (locking lock
    (let [data (read-data (state-file))]
      (into {} (filter (fn [[k _]] (valid-key? k))) (buckets data)))))

(defn- write-data! [data]
  (let [file (state-file)
        dir (.getParentFile file)]
    (when dir (.mkdirs dir))
    (let [tmp (File/createTempFile ".state-" ".edn.tmp" dir)]
      (try
        (spit tmp (pr-str data) :encoding "UTF-8")
        (try
          (Files/move (.toPath tmp) (.toPath file)
                      (into-array CopyOption
                                  [StandardCopyOption/ATOMIC_MOVE
                                   StandardCopyOption/REPLACE_EXISTING]))
          (catch IOException _
            ;; Some filesystems (a few network mounts, and some Windows
            ;; configurations) cannot replace an existing file atomically;
            ;; fall back to a plain replace. If that fails too, its exception
            ;; propagates and the API reports the save failure.
            (Files/move (.toPath tmp) (.toPath file)
                        (into-array CopyOption
                                    [StandardCopyOption/REPLACE_EXISTING]))))
        (finally
          (when (.exists tmp) (.delete tmp)))))))

(defn write-bucket!
  "Merge one bucket into the file. A nil `value` deletes the bucket. Returns
  {:ok true :key k :buckets n}."
  [key value]
  (when-not (valid-key? key)
    (throw (ex-info "Invalid state key" {:key key})))
  (locking lock
    (let [current (into {} (filter (fn [[k _]] (valid-key? k)))
                        (buckets (read-data (state-file))))
          next-buckets (if (nil? value)
                         (dissoc current key)
                         (assoc current key value))]
      (write-data! {:version state-version
                    :buckets (into (sorted-map) next-buckets)})
      {:ok true :key key :buckets (count next-buckets)})))
