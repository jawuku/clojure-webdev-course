;; The slice is built and measured on JDK 25 LTS. Lein evaluates this file in the
;; JVM it was launched with, so a mismatched `java` on PATH is rejected before
;; anything is compiled. scripts/run.sh and the app-image build check their own
;; JVM too.
(def required-java-version "25")

(let [spec (System/getProperty "java.specification.version")]
  (when-not (= required-java-version spec)
    (throw (ex-info (str "JDK " required-java-version " LTS is required (found "
                         (or spec "unknown") "). Point JAVA_HOME/PATH at a JDK "
                         required-java-version " install.")
                    {:required required-java-version :found spec}))))

(defproject parens-desktop "0.1.0"
  :description "Parens Phase 0 vertical slice: local JVM server + killable eval worker"
  :url "https://github.com/jawuku/clojure-webdev-course"
  :license {:name "MIT"}
  :dependencies [[org.clojure/clojure "1.12.5"]
                 [http-kit/http-kit "2.8.0"]
                 [cheshire/cheshire "5.13.0"]
                 ;; Course 2 renders its Hiccup previews through the real
                 ;; library, in the worker JVM, so what learners see is what
                 ;; hiccup.core/html actually produces.
                 [hiccup/hiccup "1.0.5"]]
  :main parens.main
  :aot [parens.main parens.worker]
  :javac-options ["--release" "25"]
  :uberjar-name "parens-desktop.jar"
  :profiles {:uberjar {:aot :all
                       :jvm-opts ["-Dclojure.compiler.direct-linking=true"]}}
  :repl-options {:init-ns user})
