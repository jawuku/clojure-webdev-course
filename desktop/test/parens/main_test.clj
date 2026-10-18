(ns parens.main-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer [deftest is testing use-fixtures]]
            [parens.main :as main]
            [parens.state :as state])
  (:import [java.nio.file Files]
           [java.nio.file.attribute FileAttribute]))

(def ^:private dir (atom nil))

(defn- temp-dir []
  (str (Files/createTempDirectory "parens-launcher-" (make-array FileAttribute 0))))

(defn- delete-tree! [file]
  (doseq [entry (reverse (file-seq file))]
    (.delete entry)))

(use-fixtures :each
  (fn [run]
    (let [path (temp-dir)]
      (main/release-instance!)
      (state/configure! path)
      (reset! dir path)
      (try
        (run)
        (finally
          (main/release-instance!)
          (state/configure! nil)
          (delete-tree! (io/file path)))))))

(deftest app-window-command-uses-a-private-profile
  (let [url "http://127.0.0.1:4321/#token=test-token-0123456789"
        argv (main/app-window-command "/usr/bin/chromium" url "/tmp/parens-profile")]
    (is (= "/usr/bin/chromium" (first argv)))
    (is (some #{(str "--app=" url)} argv))
    (is (some #{"--user-data-dir=/tmp/parens-profile"} argv))
    (is (some #{"--no-first-run"} argv))
    (is (every? string? argv))))

(deftest only-one-instance-owns-a-state-directory
  (is (true? (main/try-acquire-instance!)))
  (let [url "http://127.0.0.1:4567/#token=test-token-0123456789"]
    (main/write-instance-url! url)
    (is (= url (main/running-url)))

    (testing "a second attempt is refused while the lock is held"
      (is (false? (main/try-acquire-instance!))))

    (main/release-instance!)
    (is (nil? (main/running-url)))
    (is (not (.exists (io/file @dir "instance.url"))))

    (testing "the lock can be taken again after release"
      (is (true? (main/try-acquire-instance!))))))

(deftest running-url-rejects-anything-that-is-not-the-local-app
  (main/write-instance-url! "http://evil.example/#token=abc")
  (is (nil? (main/running-url)))
  (main/write-instance-url! "http://127.0.0.1:1/#token=")
  (is (nil? (main/running-url)))
  (main/write-instance-url! "not a url")
  (is (nil? (main/running-url))))

(deftest parse-args-understands-the-launcher-flags
  (let [opts (main/parse-args ["--no-open" "--no-app-window" "--port" "0"
                               "--timeout-ms" "1500" "--state-dir" "/tmp/parens"])]
    (is (true? (:no-open opts)))
    (is (true? (:no-app-window opts)))
    (is (= 0 (:port opts)))
    (is (= 1500 (:timeout-ms opts)))
    (is (= "/tmp/parens" (:state-dir opts))))

  (is (false? (:no-app-window (main/parse-args [])))))
