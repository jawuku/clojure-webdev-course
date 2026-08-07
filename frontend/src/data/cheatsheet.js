// Quick reference: core functions taught in the course, grouped, each with a
// one-line description and a runnable example.

export const CHEATSHEET = [
  {
    group: "Math & Numbers",
    items: [
      { name: "+  -  *  /", desc: "Basic arithmetic (any number of args).", example: "(+ 1 2 3)" },
      { name: "inc / dec", desc: "Add or subtract one.", example: "(inc 41)" },
      { name: "quot / rem / mod", desc: "Integer division, remainder, modulo.", example: "(rem 17 5)" },
      { name: "max / min", desc: "Largest / smallest of the arguments.", example: "(max 3 9 2)" },
      { name: "even? / odd?", desc: "Test a number's parity.", example: "(even? 10)" },
      { name: "pos? / neg? / zero?", desc: "Sign tests.", example: "(pos? 4)" },
    ],
  },
  {
    group: "Comparison & Logic",
    items: [
      { name: "=  not=", desc: "Value equality / inequality.", example: "(= [1 2] [1 2])" },
      { name: "<  >  <=  >=", desc: "Ordered comparisons.", example: "(< 1 2 3)" },
      { name: "and", desc: "True if all truthy; returns the last value.", example: "(and 1 2 3)" },
      { name: "or", desc: "Returns the first truthy value.", example: "(or nil false :found)" },
      { name: "not", desc: "Logical negation.", example: "(not (= 1 2))" },
    ],
  },
  {
    group: "Strings",
    items: [
      { name: "str", desc: "Join values into one string.", example: "(str \"a\" 1 :b)" },
      { name: "count", desc: "Length of a string (or collection).", example: "(count \"clojure\")" },
      { name: "subs", desc: "Substring from a start (and optional end).", example: "(subs \"clojure\" 0 4)" },
      { name: "str/upper-case", desc: "Upper-case a string.", example: "(str/upper-case \"hi\")" },
      { name: "str/lower-case", desc: "Lower-case a string.", example: "(str/lower-case \"LOUD\")" },
      { name: "str/join", desc: "Join a collection with a separator.", example: "(str/join \"-\" [1 2 3])" },
      { name: "str/split", desc: "Split a string on a pattern.", example: "(str/split \"a,b,c\" #\",\")" },
      { name: "str/split-lines", desc: "Split text into lines.", example: "(str/split-lines \"a\\nb\\nc\")" },
      { name: "str/trim", desc: "Remove leading/trailing whitespace.", example: "(str/trim \"  hi  \")" },
      { name: "str/replace", desc: "Rewrite a substring (or pattern) everywhere.", example: "(str/replace \"hello world\" \"o\" \"0\")" },
      { name: "str/includes?", desc: "Does a string contain another?", example: "(str/includes? \"clojure\" \"cloj\")" },
    ],
  },
  {
    group: "Collections — build & access",
    items: [
      { name: "vector / vec", desc: "Make a vector.", example: "(vec (range 4))" },
      { name: "conj", desc: "Add an item (end of vector, front of list).", example: "(conj [1 2] 3)" },
      { name: "into", desc: "Pour one collection into another.", example: "(into [] #{3 1 2})" },
      { name: "first / rest / last", desc: "Head / tail / final element.", example: "(rest [1 2 3])" },
      { name: "nth / get", desc: "Element by index / key.", example: "(nth [:a :b :c] 1)" },
      { name: "assoc / dissoc", desc: "Add-or-update / remove a key.", example: "(assoc {:a 1} :b 2)" },
      { name: "update", desc: "Apply a function to a key's value.", example: "(update {:n 1} :n inc)" },
      { name: "keys / vals", desc: "A map's keys / values.", example: "(keys {:a 1 :b 2})" },
      { name: "contains?", desc: "Is a key/element present?", example: "(contains? #{1 2 3} 2)" },
      { name: "merge", desc: "Combine maps (right wins).", example: "(merge {:a 1} {:b 2})" },
      { name: "set", desc: "Turn any collection into a set.", example: "(set [1 1 2 3])" },
      { name: "get-in / assoc-in / update-in", desc: "Read / set / update along a path of keys.", example: "(update-in {:user {:n 1}} [:user :n] inc)" },
    ],
  },
  {
    group: "Sequences — transform",
    items: [
      { name: "map", desc: "Apply a function to every element.", example: "(map inc [1 2 3])" },
      { name: "filter / remove", desc: "Keep / drop matching elements.", example: "(filter even? [1 2 3 4])" },
      { name: "reduce", desc: "Combine all elements into one value.", example: "(reduce + [1 2 3 4])" },
      { name: "take / drop", desc: "First n / all but first n.", example: "(take 3 (range 10))" },
      { name: "sort / sort-by", desc: "Order a collection.", example: "(sort > [3 1 2])" },
      { name: "distinct", desc: "Remove duplicates.", example: "(distinct [1 1 2 3 3])" },
      { name: "frequencies", desc: "Count occurrences into a map.", example: "(frequencies [:a :b :a])" },
      { name: "group-by", desc: "Group items by a function's result.", example: "(group-by even? [1 2 3 4])" },
      { name: "map-indexed", desc: "Apply a function to each element AND its index.", example: "(map-indexed vector [\"red\" \"green\"])" },
      { name: "mapv", desc: "Like map, but returns a vector.", example: "(mapv inc [1 2 3])" },
      { name: "apply", desc: "Spread a collection into a function's arguments.", example: "(apply + [1 2 3 4 5])" },
      { name: "some / every?", desc: "Is ANY / EVERY element true for a predicate?", example: "[(some even? [1 3 5 6]) (every? pos? [1 -2 3])]" },
    ],
  },
  {
    group: "Flow & Binding",
    items: [
      { name: "def / defn", desc: "Name a value / define a function.", example: "(do (defn sq [x] (* x x)) (sq 6))" },
      { name: "let", desc: "Local names within an expression.", example: "(let [x 5 y 10] (+ x y))" },
      { name: "if / when", desc: "Choose a branch / do-when-true.", example: "(if (> 5 3) :yes :no)" },
      { name: "cond", desc: "Multiple test/result branches.", example: "(cond (> 1 2) :a :else :b)" },
      { name: "-> (thread-first)", desc: "Pipe value as first argument.", example: "(-> 5 (+ 3) (* 2))" },
      { name: "->> (thread-last)", desc: "Pipe value as last argument.", example: "(->> [1 2 3] (map inc) (reduce +))" },
      { name: "loop / recur", desc: "Efficient looping (positional recur!).", example: "(loop [i 0 acc 0] (if (> i 3) acc (recur (inc i) (+ acc i))))" },
      { name: "fn / #()", desc: "Anonymous function; % is the argument.", example: "(map #(* % %) [1 2 3 4])" },
      { name: "for", desc: "Build a sequence by looping over bindings.", example: "(for [x [1 2 3 4] :when (even? x)] (* x x))" },
      { name: "case", desc: "Branch on one value against constants.", example: "(case 2 1 :one 2 :two :many)" },
      { name: "if-let / when-let", desc: "Bind a name, then test it — one step.", example: "(if-let [n (:name {:name \"Ada\"})] (str \"Hi \" n) \"anonymous\")" },
      { name: "comp", desc: "Chain functions right-to-left.", example: "((comp #(* 2 %) inc) 5)" },
      { name: "partial", desc: "Fix some leading arguments.", example: "((partial + 10) 5)" },
      { name: "do", desc: "Run several expressions, return the last.", example: "(do (println \"working…\") (+ 1 2))" },
      { name: "destructuring", desc: "Unpack collections into named locals.", example: "(let [{:keys [name]} {:name \"Ada\"}] name)" },
    ],
  },
  {
    group: "Side Effects & Iteration",
    items: [
      { name: "println / print", desc: "Print to the screen.", example: "(println \"Hello!\")" },
      { name: "dotimes", desc: "Run a body N times.", example: "(with-out-str (dotimes [i 3] (println i)))" },
      { name: "doseq", desc: "Run a body for each element.", example: "(with-out-str (doseq [x [:a :b]] (println x)))" },
    ],
  },
  {
    group: "Lazy Sequences",
    items: [
      { name: "range", desc: "Sequence of numbers (can be infinite).", example: "(take 5 (range))" },
      { name: "iterate", desc: "x, (f x), (f (f x)), … forever.", example: "(take 5 (iterate #(* 2 %) 1))" },
      { name: "repeatedly", desc: "Call a function again and again.", example: "(repeatedly 3 (fn [] 7))" },
      { name: "lazy-seq", desc: "Build your own lazy sequence.", example: "(do (defn from [n] (lazy-seq (cons n (from (inc n))))) (take 4 (from 100)))" },
      { name: "cons", desc: "Prepend an item to a sequence.", example: "(cons 1 [2 3])" },
    ],
  },
  {
    group: "State",
    items: [
      { name: "atom", desc: "A mutable container for a value.", example: "(deref (atom 42))" },
      { name: "deref / @", desc: "Read an atom's current value.", example: "(let [a (atom 1)] @a)" },
      { name: "swap!", desc: "Update via a function.", example: "(let [a (atom 0)] (swap! a inc) @a)" },
      { name: "reset!", desc: "Replace the value outright.", example: "(let [a (atom 0)] (reset! a 99) @a)" },
    ],
  },
  {
    group: "Errors & Types",
    items: [
      { name: "try / catch / finally", desc: "Handle failures gracefully (finally always runs).", example: "(try (throw (js/Error. \"x\")) (catch :default e :caught) (finally (println \"cleanup\")))" },
      { name: "ex-info / ex-data", desc: "Errors that carry data.", example: "(ex-data (ex-info \"bad\" {:code 42}))" },
      { name: "defprotocol / defrecord", desc: "Shared behaviour & data types.", example: "(do (defrecord P [x]) (:x (->P 7)))" },
      { name: "reify", desc: "One-off protocol implementation.", example: "(do (defprotocol N (v [_])) (v (reify N (v [_] 5))))" },
    ],
  },
  {
    group: "JavaScript Interop",
    items: [
      { name: ".method", desc: "Call a JS method on an object.", example: "(.toUpperCase \"hi\")" },
      { name: ".-property", desc: "Read a JS property.", example: "(.-length \"clojure\")" },
      { name: "js/…", desc: "Reach a global JS object.", example: "(js/Math.max 3 9 2)" },
    ],
  },
  {
    group: "Namespaces & Libraries",
    items: [
      { name: "require", desc: "Load another namespace, usually aliased.", example: "(do (require '[clojure.string :as str]) (str/upper-case \"hi\"))" },
      { name: "clojure.set", desc: "union / intersection / difference for sets.", example: "(do (require '[clojure.set :as set]) (set/intersection #{1 2 3} #{2 3 4}))" },
    ],
  },
  {
    group: "Macros",
    items: [
      { name: "defmacro", desc: "Define code that rewrites code — see its expansion.", example: ";; A macro rewrites your code before it runs — the best way to see one is\n;; to expand it. In the REPL you'd define the macro first, then call\n;; it on the next line (a single snippet can't do both steps at once).\n(do (defmacro unless [test body] (list 'if test nil body)) (macroexpand '(unless false :ran)))" },
      { name: "macroexpand", desc: "See what any macro expands into.", example: "(macroexpand '(when true :ok))" },
    ],
  },
];
