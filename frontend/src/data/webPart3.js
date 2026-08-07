// Web Development with ClojureScript — Part 3: Hiccup (HTML as data).

export const webPart3 = [
  {
    id: "hiccup-intro",
    title: "Hiccup: HTML as Data",
    group: "Hiccup — HTML as Data",
    summary: "Describe HTML using plain Clojure vectors.",
    content: [
      { t: "p", text: "Here's the big idea that makes web development in Clojure so pleasant: instead of writing HTML with angle brackets, you describe it as ordinary Clojure vectors. This format is called Hiccup." },
      { t: "p", text: "The rule is simple. A vector is an element. Its first item is a keyword naming the tag. An optional map right after is the attributes. Everything else is the children." },
      { t: "read", code: ";; This Hiccup...\n[:h1 \"Hello, Hiccup!\"]\n\n;; ...describes this HTML:\n;; <h1>Hello, Hiccup!</h1>" },
      { t: "h", text: "See it live" },
      { t: "p", text: "The box below is live: the vector is rendered to real HTML on the page. Edit the text and press Run to see it change." },
      { t: "reagent", code: "[:div\n [:h2 \"Hello, Hiccup!\"]\n [:p \"This is real HTML, described as a Clojure vector.\"]\n [:p \"Everything you know about vectors applies here.\"]]" },
      { t: "h", text: "Attributes are just a map" },
      { t: "p", text: "Put a map second to set attributes — including inline styles, which are themselves a Clojure map of property to value." },
      { t: "reagent", code: "[:div {:style {:padding \"14px\"\n               :border \"2px solid #7e9cd8\"\n               :border-radius \"10px\"}}\n [:h3 {:style {:color \"#7e9cd8\" :margin-top 0}} \"Styled with data\"]\n [:p \"The style attribute is a map of CSS properties.\"]]" },
      { t: "h", text: "Handy shorthand" },
      { t: "p", text: "You can bake a CSS class or id right into the tag keyword: :div.card is a div with class \"card\", and :p#intro is a paragraph with id \"intro\". It's optional, but common." },
      { t: "read", code: "[:div.card\n  [:h2#title \"Shorthand tags\"]\n  [:p \".card adds a class, #title adds an id\"]]" },
      { t: "note", text: "Because Hiccup is just data, all your Clojure skills apply: you can build it with functions, map over collections to produce children, and store it in variables. That's what the next lesson is about." },
    ],
    exercises: [
      {
        prompt: "Return the Hiccup for a level-1 heading containing the text \"My Site\". (Just the vector.)",
        starter: ";; write the hiccup vector\n",
        tests: ["(= answer [:h1 \"My Site\"])"],
        solution: "[:h1 \"My Site\"]",
        hint: "A tag keyword then the text: [:h1 \"My Site\"].",
      },
      {
        prompt: "Write `link-to` that returns Hiccup for an anchor: (link-to \"https://clojure.org\" \"Clojure\") => [:a {:href \"https://clojure.org\"} \"Clojure\"].",
        starter: "(defn link-to [url label]\n  )",
        tests: ["(= (link-to \"https://clojure.org\" \"Clojure\") [:a {:href \"https://clojure.org\"} \"Clojure\"])"],
        solution: "(defn link-to [url label]\n  [:a {:href url} label])",
        hint: "Return [:a {:href url} label].",
      },
    ],
  },

  {
    id: "hiccup-from-data",
    title: "Building UI from Data",
    group: "Hiccup — HTML as Data",
    summary: "Turn collections into lists, tables and grids with for and map.",
    content: [
      { t: "p", text: "Real pages show real data — lists of products, rows in a table, messages in a feed. Since Hiccup is data, you generate it from your collections using the sequence tools you already know, especially for." },
      { t: "h", text: "A list from a vector" },
      { t: "p", text: "Use for to turn each item into an <li>. When you render a list, Reagent wants a unique :key on each item so it can update efficiently — add it with ^{:key ...}." },
      { t: "reagent", code: "[:ul\n (for [fruit [\"apple\" \"pear\" \"plum\" \"cherry\"]]\n   ^{:key fruit} [:li fruit])]" },
      { t: "note", text: "See that ^{:key fruit} in the example? The ^{...} is metadata — a small annotation Clojure attaches to a value. It doesn't change the value itself; it just travels along with it. Reagent reads the :key off the metadata to tell list items apart. For now, think of it as 'attach this :key label to this element'." },
      { t: "h", text: "A table from maps" },
      { t: "p", text: "Given a vector of maps, build table rows by mapping over the data. This is exactly the kind of data-shaping you practised in the Clojure course." },
      { t: "reagent", code: "(def people\n  [{:name \"Ada\"  :role \"Pioneer\"}\n   {:name \"Alan\" :role \"Logician\"}\n   {:name \"Rich\" :role \"Clojure's creator\"}])\n\n[:table {:style {:border-collapse \"collapse\"}}\n [:tbody\n  (for [p people]\n    ^{:key (:name p)}\n    [:tr\n     [:td {:style {:padding \"4px 12px\"}} (:name p)]\n     [:td {:style {:padding \"4px 12px\"}} (:role p)]])]]" },
      { t: "h", text: "Conditionals in the markup" },
      { t: "p", text: "Because it's all just Clojure, you can use if/when inside your Hiccup to include or omit parts of the page." },
      { t: "reagent", code: "(def logged-in? true)\n\n[:div\n [:h3 \"Dashboard\"]\n (if logged-in?\n   [:p {:style {:color \"#98bb6c\"}} \"Welcome back!\"]\n   [:p {:style {:color \"#ff5d62\"}} \"Please sign in.\"])]" },
      { t: "note", text: "Notice you never left Clojure. Building a UI is just building data — with for, map, if and the collection functions you already know. Next we make it interactive with Reagent components." },
    ],
    exercises: [
      {
        prompt: "Write `bullet-list` that turns a vector of strings into Hiccup like [:ul [:li \"a\"] [:li \"b\"]]. (Return the [:ul ...] with an [:li] child per item; a lazy seq of children is fine.)",
        starter: "(defn bullet-list [items]\n  )",
        tests: ["(= (bullet-list [\"a\" \"b\"]) [:ul '([:li \"a\"] [:li \"b\"])])"],
        solution: "(defn bullet-list [items]\n  [:ul (for [x items] [:li x])])",
        hint: "[:ul (for [x items] [:li x])].",
      },
      {
        prompt: "Tables are just data too. Write `rows` that turns a vector of maps into a sequence of [:tr [:td (:name p)]] rows, using for. e.g. (rows [{:name \"Ada\"} {:name \"Alan\"}]) => ([:tr [:td \"Ada\"]] [:tr [:td \"Alan\"]]).",
        starter: "(defn rows [people]\n  )",
        tests: ["(= (rows [{:name \"Ada\"} {:name \"Alan\"}]) '([:tr [:td \"Ada\"]] [:tr [:td \"Alan\"]]))"],
        solution: "(defn rows [people]\n  (for [p people] [:tr [:td (:name p)]]))",
        hint: "Use for over the maps, building [:tr [:td (:name p)]] per person.",
      },
    ],
  },
];
