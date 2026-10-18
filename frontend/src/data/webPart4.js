// Web Development with Clojure — Part 4: HTMX, routing, JSON, and the capstone.
// The `live-app` block embeds the real Ring app served by the local JVM.

export const webPart4 = [
  {
    id: "htmx-intro",
    title: "Interactivity Without a JS Framework",
    group: "Interactive UI with HTMX",
    summary: "Attributes make a request and swap in the server's HTML.",
    content: [
      { t: "p", text: "A plain HTML page is static: clicking a link loads a whole new page. Modern apps feel instant because they update part of a page instead. You can build that behaviour with your Ring handlers and no JavaScript of your own, using a small library called HTMX." },
      { t: "p", text: "HTMX reads special attributes in your HTML. hx-post says 'when this element is clicked, send a POST to this path'; hx-target says which element should receive the response; hx-swap says how to put it there." },
      { t: "hiccup", code: `[:div
 [:button {:hx-post "/todos"
           :hx-target "#todos"
           :hx-swap "beforeend"}
  "Add todo"]
 [:ul#todos]]` },
      { t: "p", text: "The attributes are ordinary Hiccup. hx-post, hx-target and hx-swap become HTML attributes; the browser sends the request, your Ring handler returns an HTML fragment, and htmx inserts it. No JSON, no client-side state, no build step." },
      { t: "h", text: "The round trip" },
      { t: "list", items: [
        "You click the button. htmx sends POST /todos to the server.",
        "Your Ring handler updates the data and renders a fragment — just the new <li>, not a whole page.",
        "htmx puts that fragment inside #todos, before the existing children (beforeend).",
        "The page updates. The rest of the document is untouched.",
      ] },
      { t: "note", text: "This is the request/response cycle from chapter 1, just partial. The server is still the source of truth: it decides what the page should contain, exactly as it did when it rendered the whole page." },
      { t: "read", code: "<!-- The one script we load. It is bundled with the app, not fetched from a CDN. -->\n<script src=\"/vendor/htmx.min.js\"></script>\n\n<!-- What the Hiccup above renders -->\n<button hx-post=\"/todos\" hx-target=\"#todos\" hx-swap=\"beforeend\">Add todo</button>\n<ul id=\"todos\"></ul>" },
    ],
    exercises: [
      {
        prompt: "Write the Hiccup for a button that posts to \"/todos\", targets \"#todos\", and swaps its response before the end: attributes :hx-post, :hx-target and :hx-swap, with the text \"Add\".",
        starter: ";; write the hiccup vector\n",
        tests: ["(= answer [:button {:hx-post \"/todos\" :hx-target \"#todos\" :hx-swap \"beforeend\"} \"Add\"])"],
        solution: "[:button {:hx-post \"/todos\" :hx-target \"#todos\" :hx-swap \"beforeend\"} \"Add\"]",
        hint: "A :button keyword, then the attribute map with the three hx keys, then \"Add\".",
      },
      {
        prompt: "Write `fragment-response` that takes an HTML string and returns a 200 response with content-type \"text/html; charset=utf-8\". htmx swaps whatever this body contains.",
        starter: "(defn fragment-response [html]\n  )",
        tests: ["(= (fragment-response \"<li>Milk</li>\")\n   {:status 200\n    :headers {\"content-type\" \"text/html; charset=utf-8\"}\n    :body \"<li>Milk</li>\"})"],
        solution: "(defn fragment-response [html]\n  {:status 200\n   :headers {\"content-type\" \"text/html; charset=utf-8\"}\n   :body html})",
        hint: "A response map whose :body is the html argument.",
      },
    ],
  },

  {
    id: "htmx-attributes",
    title: "hx-get, hx-post, hx-target, hx-swap",
    group: "Interactive UI with HTMX",
    summary: "The four attributes that cover most interactions.",
    content: [
      { t: "p", text: "HTMX has a small vocabulary. Four attributes cover most of what a page needs: where the request goes, what it targets, and how the result is inserted." },
      { t: "list", items: [
        "hx-get / hx-post — the request to make. hx-get fetches data, hx-post sends a change.",
        "hx-target — a CSS selector for the element that receives the response. Omit it to target the element itself.",
        "hx-swap — how to insert the response: innerHTML (the default), outerHTML, beforeend, afterbegin, delete.",
        "hx-trigger — when to fire: click (default for buttons), submit, keyup changed delay:300ms, and so on.",
      ] },
      { t: "p", text: "Here is the shape of a search box: typing fires a request after a short pause, and the HTML that comes back replaces the results div. (This preview is static — the capstone at the end of the chapter is where the requests really run.)" },
      { t: "hiccup", code: `[:div
 [:input {:type "search"
          :name "q"
          :placeholder "Search todos"
          :hx-get "/search"
          :hx-target "#results"
          :hx-trigger "keyup changed delay:300ms"}]
 [:div#results {:style "margin-top: 8px; color: #7a766c;"}
  "Results appear here."]]` },
      { t: "h", text: "Appending a new item" },
      { t: "p", text: "For a list that grows, the handler should return only the new item, and hx-swap should be beforeend. Returning a whole list would replace the existing one; returning just the new <li> is cheaper and easier to read." },
      { t: "hiccup", code: `[:div
 [:form {:hx-post "/todos"
         :hx-target "#todos"
         :hx-swap "beforeend"}
  [:input {:type "text" :name "text" :placeholder "New todo"}]
  [:button {:type "submit"} "Add"]]
 [:ul#todos
  [:li "Learn Hiccup"]]]` },
      { t: "h", text: "Forms should still work without htmx" },
      { t: "p", text: "Give a form an action and method as well as its hx attributes. If the library ever fails to load, the browser falls back to a normal full-page form post — the same handler can serve both." },
      { t: "read", code: "<form action=\"/todos\" method=\"post\"\n      hx-post=\"/todos\" hx-target=\"#todos\" hx-swap=\"beforeend\">\n  <input type=\"text\" name=\"text\">\n  <button type=\"submit\">Add</button>\n</form>" },
      { t: "note", text: "A useful rule: choose the smallest fragment the page needs. If only one row changed, return one row. If the count above the list also changes, wrap both in one container and return that. The server decides the size of the update." },
    ],
    exercises: [
      {
        prompt: "Write the Hiccup for a search input with :type \"search\", :name \"q\", :hx-get \"/search\", :hx-target \"#results\" and :hx-trigger \"keyup changed delay:300ms\".",
        starter: ";; write the hiccup vector\n",
        tests: ["(= answer [:input {:type \"search\" :name \"q\" :hx-get \"/search\" :hx-target \"#results\" :hx-trigger \"keyup changed delay:300ms\"}])"],
        solution: "[:input {:type \"search\"\n          :name \"q\"\n          :hx-get \"/search\"\n          :hx-target \"#results\"\n          :hx-trigger \"keyup changed delay:300ms\"}]",
        hint: "A single [:input {...}] vector with those five keys.",
      },
      {
        prompt: "Write `swap-for` that returns the hx-swap value for an interaction: \"beforeend\" when appending a new item, \"outerHTML\" when replacing the element itself.",
        starter: "(defn swap-for [appending?]\n  )",
        tests: ["(= (swap-for true) \"beforeend\")", "(= (swap-for false) \"outerHTML\")"],
        solution: "(defn swap-for [appending?]\n  (if appending? \"beforeend\" \"outerHTML\"))",
        hint: "A simple if on the boolean.",
      },
    ],
  },

  {
    id: "forms-and-state",
    title: "Forms and Server-Held State",
    group: "Interactive UI with HTMX",
    summary: "Keep the data on the server and render it on every request.",
    content: [
      { t: "p", text: "A form sends its fields to the server. With Ring, a form post arrives as a request whose body contains those fields; parsing middleware turns them into a :params map. Your handler then updates the state and renders the result." },
      { t: "p", text: "For a small app, that state can be an atom — the same atom you learned in the Clojure course. Every request reads the current value; every change swaps in a new one." },
      { t: "code", code: `(require '[hiccup.core :as hiccup])

(def todos (atom [{:text "Learn Hiccup" :done true}
                  {:text "Build a Ring handler" :done false}]))

(defn add-todo! [text]
  (swap! todos conj {:text text :done false}))

(defn todos-fragment [_request]
  {:status 200
   :headers {"content-type" "text/html; charset=utf-8"}
   :body (hiccup/html
          [:div#todos
           [:ul (for [todo @todos]
                  [:li (:text todo)])]])})

(add-todo! "Try HTMX")
(:body (todos-fragment {}))` },
      { t: "p", text: "Notice the pattern. The atom is the data. add-todo! is the only way to change it. todos-fragment is a pure function of the current data — it doesn't remember anything between requests. That separation is the whole architecture of a server-rendered app." },
      { t: "h", text: "Toggling a todo" },
      { t: "p", text: "Updating a map in a collection is the same immutable work you did in the first course. The result is a new vector; the old one is untouched." },
      { t: "code", code: `(def todos (atom [{:id 1 :text "Learn Hiccup" :done true}
                  {:id 2 :text "Build a Ring handler" :done false}]))

(defn toggle! [id]
  (swap! todos
         (fn [items]
           (mapv (fn [todo]
                   (if (= (:id todo) id)
                     (update todo :done not)
                     todo))
                 items))))

(toggle! 2)
(mapv :done @todos)` },
      { t: "note", text: "An atom is fine while you're learning and for a single user, but it disappears when the server restarts. A production app writes to a database instead, behind the same handlers. The lesson to keep: state lives on the server, and the page is rendered from it." },
    ],
    exercises: [
      {
        prompt: "Write `add-todo` that takes a vector of todo maps and a text, and returns a NEW vector with the todo appended as {:text text :done false}. e.g. (add-todo [{:text \"a\" :done false}] \"b\") => [{:text \"a\" :done false} {:text \"b\" :done false}].",
        starter: "(defn add-todo [todos text]\n  )",
        tests: ["(= (add-todo [{:text \"a\" :done false}] \"b\")\n   [{:text \"a\" :done false} {:text \"b\" :done false}])",
                "(= (add-todo [] \"first\") [{:text \"first\" :done false}])"],
        solution: "(defn add-todo [todos text]\n  (conj todos {:text text :done false}))",
        hint: "conj appends to a vector: (conj todos {:text text :done false}).",
      },
      {
        prompt: "Write `count-done` that returns how many todos in a vector have :done true. e.g. (count-done [{:done true} {:done false}]) => 1.",
        starter: "(defn count-done [todos]\n  )",
        tests: ["(= (count-done [{:done true} {:done false} {:done true}]) 2)", "(= (count-done [{:done false}]) 0)"],
        solution: "(defn count-done [todos]\n  (count (filter :done todos)))",
        hint: "Keywords act as functions, so :done works as a filter predicate: (count (filter :done todos)).",
      },
    ],
  },

  {
    id: "routing",
    title: "Routing with Reitit",
    group: "Routing, APIs & the Capstone",
    summary: "Map URLs to handlers with data, including path parameters.",
    content: [
      { t: "p", text: "A real app has many URLs. Rather than one giant handler with a long cond, you describe routes as data and let a router pick the right handler. The most common Clojure router is Reitit." },
      { t: "p", text: "A Reitit route table is a vector of pairs: a path string and a map of HTTP methods to handlers. Path segments starting with a colon are parameters." },
      { t: "read", code: "(require '[reitit.ring :as ring])\n\n(defn home-page [_] {:status 200 :headers {} :body \"Home\"})\n(defn list-todos [_] {:status 200 :headers {} :body \"Todos\"})\n(defn todo-page [request]\n  {:status 200 :headers {} :body (str \"Todo \" (get-in request [:path-params :id]))})\n\n(def routes\n  [[\"/\"          {:get home-page}]\n   [\"/todos\"     {:get list-todos}]\n   [\"/todos/:id\" {:get todo-page}]])\n\n(def app (ring/ring-handler (ring/router routes)))" },
      { t: "p", text: "The router matches /todos/42 to todo-page and adds the parameter to the request map under :path-params. Your handler stays a plain function of one map — it just receives one more key." },
      { t: "code", code: `(defn todo-page [request]
  {:status 200
   :headers {"content-type" "text/plain; charset=utf-8"}
   :body (str "Todo " (get-in request [:path-params :id]))})

(todo-page {:path-params {:id 42}})` },
      { t: "h", text: "What matching means" },
      { t: "p", text: "You can see the essential idea without the library. A route table is data, and matching is a function over that data. The helper below handles a fixed path and one parameterised path — enough to show the shape." },
      { t: "code", code: `(def routes
  [["/"          :home]
   ["/todos"     :todos]
   ["/todos/:id" :todo]])

(defn match-route [uri]
  (some (fn [[pattern handler]]
          (cond
            (= pattern uri) [handler {}]
            (and (str/ends-with? pattern ":id")
                 (re-matches #"/todos/\\d+" uri))
            [handler {:id (parse-long (subs uri (count "/todos/")))}]))
        routes))

[(match-route "/") (match-route "/todos/42")]` },
      { t: "note", text: "Route tables are data, so you can inspect, test and compose them. That is why Reitit is popular: routes live beside the handlers they call, and middleware can be attached per route or for the whole app." },
    ],
    exercises: [
      {
        prompt: "Write `route-for` that returns the handler keyword for a URI, using the routes [ [\"/\" :home] [\"/todos\" :todos] ]. e.g. (route-for \"/todos\") => :todos.",
        starter: "(defn route-for [uri]\n  )",
        tests: ["(= (route-for \"/\") :home)", "(= (route-for \"/todos\") :todos)", "(= (route-for \"/nope\") nil)"],
        solution: "(defn route-for [uri]\n  (some (fn [[pattern handler]]\n          (when (= pattern uri) handler))\n        [[\"/\" :home] [\"/todos\" :todos]]))",
        hint: "Use some over the route pairs, returning the handler when the pattern equals the uri.",
      },
      {
        prompt: "Write `todo-id` that takes a request map with :path-params and returns the :id as a number. e.g. (todo-id {:path-params {:id 42}}) => 42.",
        starter: "(defn todo-id [request]\n  )",
        tests: ["(= (todo-id {:path-params {:id 42}}) 42)", "(= (todo-id {:path-params {:id 7}}) 7)"],
        solution: "(defn todo-id [request]\n  (get-in request [:path-params :id]))",
        hint: "The router puts parameters under :path-params: (get-in request [:path-params :id]).",
      },
    ],
  },

  {
    id: "json-apis",
    title: "JSON APIs",
    group: "Routing, APIs & the Capstone",
    summary: "Return data instead of HTML for clients that want it.",
    content: [
      { t: "p", text: "Browsers want HTML, but other clients — a mobile app, a script, another service — usually want JSON. In Ring, serving JSON is the same handler shape with a different body and content type." },
      { t: "p", text: "Clojure maps convert to JSON cleanly. The cheshire library is the usual choice: generate-string turns Clojure data into a JSON string, and parse-string goes the other way." },
      { t: "code", code: `(require '[cheshire.core :as json])

(json/generate-string {:ok true :todos 2})` },
      { t: "p", text: "To read JSON back, parse-string returns a Clojure map. Pass true as the second argument to turn the string keys into keywords, so :id works as you'd expect." },
      { t: "code", code: `(require '[cheshire.core :as json])

(def incoming "{\\"id\\": 7, \\"text\\": \\"Learn Hiccup\\", \\"done\\": false}")

(json/parse-string incoming true)` },
      { t: "h", text: "A JSON handler" },
      { t: "code", code: `(require '[cheshire.core :as json])

(defn todos-api [_request]
  {:status 200
   :headers {"content-type" "application/json; charset=utf-8"}
   :body (json/generate-string
          {:todos [{:id 1 :text "Learn Hiccup" :done true}
                   {:id 2 :text "Build a Ring handler" :done false}]})})

(:body (todos-api {}))` },
      { t: "note", text: "The same app can serve both: HTML routes for the browser and JSON routes for clients, both built from the same data and the same functions. Nothing about a handler is tied to HTML — the response map decides." },
    ],
    exercises: [
      {
        prompt: "Write `json-response` that takes Clojure data and returns a 200 response with content-type \"application/json; charset=utf-8\" and the JSON string as its body. Use cheshire.core/generate-string.",
        starter: "(defn json-response [data]\n  )",
        tests: ["(= (json-response {:ok true})\n   {:status 200\n    :headers {\"content-type\" \"application/json; charset=utf-8\"}\n    :body \"{\\\"ok\\\":true}\"})"],
        solution: "(defn json-response [data]\n  {:status 200\n   :headers {\"content-type\" \"application/json; charset=utf-8\"}\n   :body (cheshire.core/generate-string data)})",
        hint: "Wrap the data with cheshire.core/generate-string in the :body key.",
      },
      {
        prompt: "Write `parse-todo` that turns a JSON todo string into a Clojure map with keyword keys. e.g. (parse-todo \"{\\\"id\\\": 7}\") => {:id 7}.",
        starter: "(defn parse-todo [text]\n  )",
        tests: ["(= (parse-todo \"{\\\"id\\\": 7, \\\"done\\\": false}\") {:id 7 :done false})"],
        solution: "(defn parse-todo [text]\n  (cheshire.core/parse-string text true))",
        hint: "cheshire.core/parse-string with true as the second argument keywordizes the keys.",
      },
    ],
  },

  {
    id: "todo-capstone",
    title: "Capstone: A To-Do App",
    group: "Routing, APIs & the Capstone",
    summary: "A complete Ring app — add, complete and delete tasks.",
    content: [
      { t: "p", text: "Time to see everything working together. The app below is a real Ring application served by the local JVM that runs this course. Add a task, tick it off, delete it — each interaction is an HTTP request and a Hiccup-rendered response." },
      { t: "live-app" },
      { t: "p", text: "Read the flow in the app you just used:" },
      { t: "list", items: [
        "The page itself is HTML rendered from Hiccup by a Ring handler.",
        "Each form has hx-post and hx-target=\"#todos\", so htmx sends the request and swaps the list.",
        "The handler updates an atom, renders the whole #todos container again, and returns it.",
        "The button, the count and the list all come from the same data — no separate client state to keep in sync.",
      ] },
      { t: "read", code: ";; The real handlers behind the app, pared down:\n(defn handler [request]\n  (case [(:request-method request) (:uri request)]\n    [:get  \"/preview/todos\"]\n    (html-response (preview-page))\n\n    [:post \"/preview/todos\"]\n    (do (add-todo! (get (form-params request) \"text\"))\n        (html-response (hiccup/html (todos-view @state))))\n\n    (if-let [[id action] (parsed-route (:uri request))]\n      (do (case action\n            \"toggle\" (toggle-todo! id)\n            \"delete\" (delete-todo! id))\n          (html-response (hiccup/html (todos-view @state))))\n      (text-response 404 \"Not found.\"))))" },
      { t: "p", text: "Every part is something you learned: maps for each todo, a vector in an atom, mapv/remove/update to change the data immutably, Hiccup to describe the page, and a Ring handler to connect a request to it." },
      { t: "note", text: "The app's state is in memory, so the Restart button gives you a clean demo and a server restart would reset it. A production app replaces the atom with a database — the handlers, the Hiccup and the HTMX attributes stay the same." },
      { t: "h", text: "Where to go next" },
      { t: "p", text: "You have gone from 'what is the web?' to a working, interactive Ring app in Clojure. From here, a real project adds a proper project file (deps.edn or Leiningen), a database, sessions and authentication, and a deployment target. The shape you learned — request map in, response map out, HTML as data — is exactly what those tools build on." },
      { t: "note", text: "Build something of your own next: add an edit button, a filter for active tasks, or a second page with a real route. The fastest way to make it stick is to change this app and watch what each request returns." },
      { t: "cta", text: "Want a sharp, practical superpower for every language you'll ever use? Learn to search, match and transform text with regular expressions — taught the Clojure way, with a live Regex Golf leaderboard.", label: "Start: Master Regular Expressions", courseId: "regex" },
    ],
    exercises: [
      {
        prompt: "A helper for the app: write `toggle-done` that flips the :done value of a todo map. e.g. (toggle-done {:done false}) => {:done true}.",
        starter: "(defn toggle-done [todo]\n  )",
        tests: ["(= (toggle-done {:id 1 :done false}) {:id 1 :done true})", "(= (:done (toggle-done {:done true})) false)"],
        solution: "(defn toggle-done [todo]\n  (update todo :done not))",
        hint: "(update todo :done not).",
      },
      {
        prompt: "The app shows how many todos are done. Write `count-done` that returns how many todos in a vector have :done true. e.g. (count-done [{:done true} {:done false}]) => 1.",
        starter: "(defn count-done [todos]\n  )",
        tests: ["(= (count-done [{:done true} {:done false} {:done true}]) 2)", "(= (count-done [{:done false}]) 0)"],
        solution: "(defn count-done [todos]\n  (count (filter :done todos)))",
        hint: "Keywords act as functions, so :done works as a filter predicate: (count (filter :done todos)).",
      },
    ],
  },
];
