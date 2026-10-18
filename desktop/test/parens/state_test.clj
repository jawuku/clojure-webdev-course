(ns parens.state-test
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.test :refer [deftest is testing use-fixtures]]
            [parens.state :as state])
  (:import [java.nio.file Files]
           [java.nio.file.attribute FileAttribute]))

(def ^:private dir (atom nil))

(defn- temp-dir []
  (str (Files/createTempDirectory "parens-state-" (make-array FileAttribute 0))))

(defn- delete-tree! [file]
  (doseq [entry (reverse (file-seq file))]
    (.delete entry)))

(use-fixtures :each
  (fn [run]
    (let [path (temp-dir)]
      (reset! dir path)
      (state/configure! path)
      (try
        (run)
        (finally
          (state/configure! nil)
          (delete-tree! (io/file path)))))))

(deftest empty-store-has-no-buckets
  (is (= {} (state/read-buckets)))
  (is (not (.exists (state/state-file)))))

(deftest buckets-round-trip-through-edn
  (testing "JSON-shaped course state"
    (is (= {:ok true :key "parens_clojure_v1" :buckets 1}
           (state/write-bucket! "parens_clojure_v1"
                                {:themeKey "kanagawa"
                                 :fontSize 17
                                 :progress {"welcome" {:done true :exercises {0 true}}}
                                 :lastLocation {:view "lesson" :lessonId "welcome"}})))
    (is (= {:themeKey "kanagawa"
            :fontSize 17
            :progress {"welcome" {:done true :exercises {0 true}}}
            :lastLocation {:view "lesson" :lessonId "welcome"}}
           (get (state/read-buckets) "parens_clojure_v1"))))

  (testing "plain string and number buckets (active course, golf scores)"
    (state/write-bucket! "parens_active_course_v1" "clojure")
    (state/write-bucket! "regex_golf_scores_v1" {"double" 5})
    (is (= "clojure" (get (state/read-buckets) "parens_active_course_v1")))
    (is (= {"double" 5} (get (state/read-buckets) "regex_golf_scores_v1"))))

  (testing "a nil value deletes the bucket"
    (state/write-bucket! "parens_active_course_v1" nil)
    (is (not (contains? (state/read-buckets) "parens_active_course_v1")))))

(deftest file-is-versioned-edn-with-no-temporary-files-left
  (state/write-bucket! "parens_clojure_v1" {:lastLocation {:view "repl"}})
  (let [file (state/state-file)
        text (slurp file)
        data (edn/read-string text)]
    (is (= 1 (:version data)))
    (is (= {:lastLocation {:view "repl"}}
           (get-in data [:buckets "parens_clojure_v1"])))
    (testing "the write is complete and no .tmp sibling remains"
      (is (= [] (->> (.listFiles (.getParentFile file))
                     (filter #(str/ends-with? (.getName %) ".tmp"))
                     vec))))))

(deftest state-survives-a-new-process-pointing-at-the-same-directory
  (state/write-bucket! "parens_clojure_v1" {:lastLocation {:view "cheatsheet"}})
  ;; Re-configuring is what a fresh process does with the same --state-dir.
  (state/configure! @dir)
  (is (= {:lastLocation {:view "cheatsheet"}}
         (get (state/read-buckets) "parens_clojure_v1"))))

(deftest invalid-keys-are-rejected
  (doseq [key [nil "" "../escape" "has space" "slash/key" 42]]
    (is (thrown? clojure.lang.ExceptionInfo (state/write-bucket! key {}))
        (pr-str key))))

(deftest corrupt-file-is-moved-aside
  (let [file (state/state-file)]
    (io/make-parents file)
    (spit file "{:buckets {")
    (is (= {} (state/read-buckets)))
    (is (not (.exists file)))
    (let [backups (->> (.listFiles (.getParentFile file))
                       (filter #(str/includes? (.getName %) ".corrupt-")))]
      (is (= 1 (count backups)))))

  (testing "the next write recreates a valid file"
    (state/write-bucket! "parens_clojure_v1" {:progress {}})
    (is (= {:progress {}}
           (get (state/read-buckets) "parens_clojure_v1")))))

(deftest concurrent-writes-do-not-drop-buckets
  (let [writes (doall
                (for [i (range 20)]
                  (future (state/write-bucket! (str "parens_bucket_" i) {:i i}))))]
    (doseq [write writes] @write)
    (let [buckets (state/read-buckets)]
      (is (= 20 (count buckets)))
      (is (= {:i 7} (get buckets "parens_bucket_7"))))))
