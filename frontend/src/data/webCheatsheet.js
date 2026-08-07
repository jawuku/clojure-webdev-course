// Quick reference for the Web Development course. Every example is runnable in
// the in-browser ClojureScript runtime (click Run). Hiccup examples return the
// data that would be rendered; interop examples call real JavaScript.

export const WEB_CHEATSHEET = [
  {
    group: "Hiccup — HTML as data",
    items: [
      { name: "[:tag …]", desc: "An element: tag keyword then children.", example: "[:h1 \"Title\"]" },
      { name: "attributes map", desc: "A map right after the tag sets attributes.", example: "[:a {:href \"/home\"} \"Home\"]" },
      { name: "inline :style", desc: "Styles are a map of CSS properties.", example: "[:p {:style {:color \"red\"}} \"Hi\"]" },
      { name: ":tag.class#id", desc: "Shorthand for class and id.", example: "[:div.card#main \"content\"]" },
      { name: "children from data", desc: "Generate children with for / into.", example: "(into [:ul] (for [x [1 2 3]] [:li x]))" },
      { name: "^{:key …}", desc: "Unique key for each item in a list.", example: "(for [x [:a :b]] ^{:key x} [:li x])" },
    ],
  },
  {
    group: "Reagent patterns",
    items: [
      { name: "component", desc: "A function that returns Hiccup.", example: "((fn greeting [] [:h2 \"Hi\"]))" },
      { name: "render a component", desc: "Put it in a vector like a tag.", example: ";; [logo] is just data here — in a real Reagent app this renders the component.\n(let [logo (fn [] [:b \"</>\"])] [logo])" },
      { name: "props", desc: "Pass data as function arguments.", example: "((fn badge [t] [:span t]) \"New\")" },
      { name: "props as a map", desc: "Destructure a props map.", example: "((fn [{:keys [name]}] [:p name]) {:name \"Ada\"})" },
    ],
  },
  {
    group: "State (reactive atoms)",
    items: [
      { name: "atom", desc: "A container for changing state (r/atom in Reagent).", example: "(deref (atom 42))" },
      { name: "deref / @", desc: "Read the current value.", example: "(let [a (atom 5)] @a)" },
      { name: "swap!", desc: "Update via a function; re-renders the UI.", example: "(let [a (atom 0)] (swap! a inc) @a)" },
      { name: "reset!", desc: "Replace the value outright.", example: "(let [a (atom 0)] (reset! a 99) @a)" },
      { name: "swap! + conj", desc: "Add to a collection in state.", example: "(let [a (atom [1 2])] (swap! a conj 3) @a)" },
    ],
  },
  {
    group: "Events & forms",
    items: [
      { name: ":on-click  :on-change  :on-submit", desc: "Event attributes — their value is a function run when the event fires.", example: "[:button {:on-click #(println \"clicked!\")} \"Go\"]" },
      { name: "controlled input", desc: ":value from state + :on-change writes back — UI is a function of state.", example: "(let [text (atom \"\")] [:input {:value @text :on-change #(reset! text (.. % -target -value))}])" },
      { name: "(.. e -target -value)", desc: "Read what the user typed from the event (example simulates the event as a map — real DOM events use (.. e -target -value)).", example: "(get-in {:target {:value \"hi\"}} [:target :value])" },
    ],
  },
  {
    group: "JavaScript interop",
    items: [
      { name: "js/…", desc: "Reach a global JS object.", example: "(js/Math.max 3 9 2)" },
      { name: ".method", desc: "Call a method on an object.", example: "(.toUpperCase \"cljs\")" },
      { name: ".-property", desc: "Read a property.", example: "(.-length \"clojure\")" },
      { name: "js/parseInt", desc: "Use any built-in JS function.", example: "(js/parseInt \"2026px\" 10)" },
      { name: "clj->js", desc: "Convert Clojure data to a JS object.", example: ";; clj->js returns a real JavaScript object — ClojureScript prints those\n;; with a #js prefix, so you'll see #js {...}. Convert it back with js->clj\n;; (next entry) to inspect the data as plain Clojure:\n(clj->js {:a 1 :b [2 3]})" },
      { name: "js->clj", desc: "Convert JS data back to Clojure.", example: "(js->clj (clj->js {:a 1}) :keywordize-keys true)" },
    ],
  },
  {
    group: "Text helpers",
    items: [
      { name: "str/includes?", desc: "Does a string contain another?", example: "(str/includes? \"hello\" \"ell\")" },
      { name: "str/upper-case", desc: "Uppercase a string.", example: "(str/upper-case \"hi there\")" },
    ],
  },
  {
    group: "Shaping data for the UI",
    items: [
      { name: "map", desc: "Transform each element.", example: "(map inc [1 2 3])" },
      { name: "filter", desc: "Keep matching elements.", example: "(filter :done [{:done true} {:done false}])" },
      { name: "for", desc: "Build a sequence (list rows).", example: "(for [x (range 3)] [:li x])" },
      { name: "map-indexed", desc: "Like map, but hands each element AND its index.", example: "(map-indexed vector [\"a\" \"b\"])" },
      { name: "->> (thread-last)", desc: "Pipe value into the LAST argument — data pipelines.", example: "(->> [1 2 3] (map inc) (reduce +))" },
      { name: "mapv", desc: "Like map, but returns a vector.", example: "(mapv #(update % :n inc) [{:n 1} {:n 2}])" },
      { name: "remove", desc: "Drop matching elements (e.g. delete).", example: "(vec (remove #(= % 2) [1 2 3]))" },
      { name: "update / assoc", desc: "Change a map immutably.", example: "(update {:done false} :done not)" },
    ],
  },
];
