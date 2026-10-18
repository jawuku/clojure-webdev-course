// Web Development with Clojure — Part 3: Hiccup (HTML as data).
// Every `hiccup` block runs on the JVM and is rendered by hiccup.core/html.

export const webPart3 = [
  {
    id: "hiccup-intro",
    title: "Hiccup: HTML as Data",
    group: "Hiccup — HTML as Data",
    summary: "Describe HTML using plain Clojure vectors.",
    content: [
      { t: "p", text: "Here's the big idea that makes web development in Clojure so pleasant: instead of writing HTML with angle brackets, you describe it as ordinary Clojure vectors. This format is called Hiccup." },
      { t: "p", text: "The rule is simple. A vector is an element. Its first item is a keyword naming the tag. An optional map right after is the attributes. Everything else is the children. The box below renders the vector on the JVM with hiccup.core/html — the very same function a real server calls." },
      { t: "hiccup", code: `[:div
 [:h1 "Hello, Hiccup!"]
 [:p "This is real HTML, generated from a Clojure vector."]]` },
      { t: "h", text: "Attributes are just a map" },
      { t: "p", text: "Put a map second to set attributes. Classes and ids are normal attributes. An inline style, unlike in some client-side libraries, is a CSS string — Hiccup writes the value straight into the attribute." },
      { t: "hiccup", code: `[:div {:class "card"
       :style "padding: 14px; border: 2px solid #7e9cd8; border-radius: 10px;"}
 [:h3 {:style "margin-top: 0; color: #7e9cd8;"} "Styled with data"]
 [:p "The style attribute is one string of CSS."]]` },
      { t: "h", text: "Handy shorthand" },
      { t: "p", text: "You can also bake an id and classes into the tag keyword: :div#main is a div with id main, and :p.note is a paragraph with class note. When you use both, write the id first — :div#main.card. The shorthand is a convenience for the common case; the attributes map always works." },
      { t: "hiccup", code: `[:div#main.card
 [:h2 "Shorthand tags"]
 [:p.muted "The id comes before the classes."]]` },
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
    title: "Building Pages from Data",
    group: "Hiccup — HTML as Data",
    summary: "Turn collections into lists, tables and conditional sections.",
    content: [
      { t: "p", text: "Real pages show real data — lists of products, rows in a table, messages in a feed. Since Hiccup is data, you generate it from your collections using the sequence tools you already know, especially for." },
      { t: "h", text: "A list from a vector" },
      { t: "p", text: "Use for to turn each item into an <li>. Hiccup accepts a sequence of children directly, so no extra step is needed." },
      { t: "hiccup", code: `[:div
 [:h3 "Fruit"]
 [:ul
  (for [fruit ["apple" "pear" "plum" "cherry"]]
    [:li fruit])]]` },
      { t: "h", text: "A table from maps" },
      { t: "p", text: "Given a vector of maps, build table rows by mapping over the data. This is exactly the kind of data-shaping you practised in the Clojure course." },
      { t: "hiccup", code: `(def people
  [{:name "Ada"  :role "Pioneer"}
   {:name "Alan" :role "Logician"}
   {:name "Rich" :role "Clojure's creator"}])

[:table {:style "border-collapse: collapse;"}
 [:tbody
  (for [person people]
    [:tr
     [:td {:style "padding: 4px 12px; border: 1px solid #d9d3c4;"} (:name person)]
     [:td {:style "padding: 4px 12px; border: 1px solid #d9d3c4;"} (:role person)]])]]` },
      { t: "h", text: "Conditionals in the markup" },
      { t: "p", text: "Because it's all just Clojure, you can use if or when inside your Hiccup to include or omit parts of the page. nil and false children render as nothing." },
      { t: "hiccup", code: `(def logged-in? true)

[:div
 [:h3 "Dashboard"]
 (if logged-in?
   [:p {:style "color: #587539;"} "Welcome back!"]
   [:p {:style "color: #b4553f;"} "Please sign in."])
 (when logged-in?
   [:p [:a {:href "/settings"} "Account settings"]])]` },
      { t: "note", text: "Notice you never left Clojure. Building a page is just building data — with for, map, if and the collection functions you already know. On the server there is no :key to add either: the page is rendered once per request, not diffed like a client-side UI." },
    ],
    exercises: [
      {
        prompt: "Write `bullet-list` that turns a vector of strings into Hiccup like [:ul [[:li \"a\"] [:li \"b\"]]]. Return the [:ul ...] with an [:li] child per item.",
        starter: "(defn bullet-list [items]\n  )",
        tests: ["(= (bullet-list [\"a\" \"b\"]) [:ul [[:li \"a\"] [:li \"b\"]]])", "(= (bullet-list []) [:ul []])"],
        solution: "(defn bullet-list [items]\n  [:ul (mapv (fn [item] [:li item]) items)])",
        hint: "Return [:ul ...] with (mapv (fn [item] [:li item]) items) as the children.",
      },
      {
        prompt: "Tables are just data too. Write `rows` that turns a vector of maps into a vector of [:tr [:td (:name p)]] rows, using mapv. e.g. (rows [{:name \"Ada\"} {:name \"Alan\"}]) => [[:tr [:td \"Ada\"]] [:tr [:td \"Alan\"]]].",
        starter: "(defn rows [people]\n  )",
        tests: ["(= (rows [{:name \"Ada\"} {:name \"Alan\"}])\n   [[:tr [:td \"Ada\"]] [:tr [:td \"Alan\"]]])"],
        solution: "(defn rows [people]\n  (mapv (fn [person] [:tr [:td (:name person)]]) people))",
        hint: "Use mapv over the maps, building [:tr [:td (:name person)]] per person.",
      },
    ],
  },

  {
    id: "hiccup-components",
    title: "Functions That Return Hiccup",
    group: "Hiccup — HTML as Data",
    summary: "Small reusable pieces, composed by calling functions.",
    content: [
      { t: "p", text: "A page built from one giant vector is hard to read. The solution is the same as everywhere else in Clojure: write small functions that return Hiccup, then compose them. A 'component' on the server is nothing more than that." },
      { t: "hiccup", code: `(defn badge [label colour]
  [:span {:style (str "background: " colour "; color: white; padding: 3px 9px; "
                      "border-radius: 999px; margin-right: 6px; font-size: 13px;")}
   label])

(defn badge-row []
  [:div
   (badge "Clojure" "#5881d8")
   (badge "Web" "#98bb6c")
   (badge "Ring" "#ffa066")])

(badge-row)` },
      { t: "p", text: "See how badge-row builds itself out of three badge calls, each with different arguments? That's composition — assembling a page from small, reusable pieces. Big pages are just many small functions nested together." },
      { t: "h", text: "Props can be maps too" },
      { t: "p", text: "For a piece with several inputs, pass a single map — exactly the kind of data you're used to — and destructure it in the function's argument list." },
      { t: "hiccup", code: `(defn user-card [{:keys [name role]}]
  [:div {:class "card"}
   [:strong name]
   [:div {:style "color: #7a766c;"} role]])

[:div
 (user-card {:name "Ada Lovelace" :role "First programmer"})
 (user-card {:name "Alan Turing" :role "Computer scientist"})]` },
      { t: "note", text: "On the server there is no component lifecycle, no state, and no re-rendering. A component is a function: you call it with data and put the returned vector in the tree. That simplicity is the point — the difficult parts of a UI stay in the data and the handlers." },
    ],
    exercises: [
      {
        prompt: "Write a function `footer` (no arguments) that returns [:footer \"© 2026\"].",
        starter: "(defn footer []\n  )",
        tests: ["(= (footer) [:footer \"© 2026\"])"],
        solution: "(defn footer []\n  [:footer \"© 2026\"])",
        hint: "A no-arg function returning the Hiccup vector.",
      },
      {
        prompt: "Write a function `welcome` (no arguments) that returns [:div {:class \"card\"} [:h2 \"Hi!\"]] — a div with a class attribute and a nested heading.",
        starter: "(defn welcome []\n  )",
        tests: ["(= (welcome) [:div {:class \"card\"} [:h2 \"Hi!\"]] )"],
        solution: "(defn welcome []\n  [:div {:class \"card\"} [:h2 \"Hi!\"]])",
        hint: "Return Hiccup with an attribute map and a child element: [:div {:class \"card\"} [:h2 \"Hi!\"]]. ",
      },
    ],
  },
];
