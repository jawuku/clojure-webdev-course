// Quick reference for Web Development with Clojure. Every example runs on the
// local JVM (click Run); Hiccup examples return the HTML hiccup.core/html
// produces, and JSON examples use the same library a Ring app would.

export const WEB_CHEATSHEET = [
  {
    group: "Ring — requests",
    items: [
      { name: "request map", desc: "An HTTP request arrives as plain Clojure data.", example: "(def request {:request-method :get :uri \"/todos\" :headers {\"accept\" \"text/html\"}})\n[(:request-method request) (:uri request)]" },
      { name: ":uri", desc: "The requested path.", example: "(:uri {:uri \"/todos/42\"})" },
      { name: ":headers", desc: "Header names are lower-case strings.", example: "(get-in {:headers {\"accept\" \"text/html\"}} [:headers \"accept\"])" },
      { name: ":query-string", desc: "The raw query string; middleware parses it into :params.", example: "(:query-string {:query-string \"q=clojure&page=2\"})" },
      { name: "path params", desc: "A router adds :path-params to the request map.", example: "(get-in {:path-params {:id 42}} [:path-params :id])" },
    ],
  },
  {
    group: "Ring — responses",
    items: [
      { name: "response map", desc: "status, headers and body.", example: "{:status 200 :headers {\"content-type\" \"text/html; charset=utf-8\"} :body \"<h1>Hi</h1>\"}" },
      { name: "handler", desc: "A function from request map to response map.", example: "((fn [_request] {:status 200 :headers {} :body \"Hello\"}) {:uri \"/\"})" },
      { name: "status by path", desc: "Choose the response with ordinary Clojure.", example: "(let [request {:uri \"/nope\"}]\n  (if (= \"/\" (:uri request)) 200 404))" },
      { name: "content types", desc: "Tell the browser what the body is.", example: "[\"text/html; charset=utf-8\" \"text/plain; charset=utf-8\" \"application/json; charset=utf-8\"]" },
    ],
  },
  {
    group: "Middleware",
    items: [
      { name: "middleware shape", desc: "Handler in, handler out.", example: "((fn [handler]\n   (fn [request]\n     (update (handler request) :headers assoc \"x-flag\" \"on\")))\n (fn [_] {:status 200 :headers {} :body \"Hi\"}))" },
      { name: "adding a header", desc: "Wrap a response without touching the handler.", example: "((fn [request] (assoc-in (request {}) [:headers \"x-flag\"] \"on\"))\n (fn [_] {:status 200 :headers {} :body \"Hi\"}))" },
      { name: "auth gate", desc: "Return early when a request is not allowed.", example: "(let [request {:headers {}}]\n  (if (= \"secret\" (get-in request [:headers \"x-token\"]))\n    {:status 200 :body \"secret data\"}\n    {:status 401 :body \"Unauthorized\"}))" },
    ],
  },
  {
    group: "Hiccup — HTML as data",
    items: [
      { name: "element", desc: "Tag keyword, then children.", example: "(hiccup.core/html [:h1 \"Title\"])" },
      { name: "attributes map", desc: "A map right after the tag sets attributes.", example: "(hiccup.core/html [:a {:href \"/home\"} \"Home\"])" },
      { name: "inline style", desc: "The style attribute is a CSS string (not a map).", example: "(hiccup.core/html [:p {:style \"color: #7e9cd8;\"} \"Hi\"])" },
      { name: "children from data", desc: "Generate children with for.", example: "(hiccup.core/html [:ul (for [x [1 2 3]] [:li x])])" },
      { name: "escaping", desc: "hiccup.core/h escapes text for HTML.", example: "(hiccup.core/html [:p (hiccup.core/h \"1 < 2 & 3 > 2\")])" },      { name: "fragment", desc: "Pass several elements to get one HTML string.", example: "(hiccup.core/html [:h2 \"Title\"] [:p \"Body\"]) " },
    ],
  },
  {
    group: "HTMX attributes",
    items: [
      { name: "hx-post + target + swap", desc: "Post, and insert the response before the target's children.", example: "(hiccup.core/html [:button {:hx-post \"/todos\" :hx-target \"#todos\" :hx-swap \"beforeend\"} \"Add\"])" },
      { name: "hx-get + trigger", desc: "Fetch as the user types, after a short pause.", example: "(hiccup.core/html [:input {:type \"search\" :name \"q\" :hx-get \"/search\" :hx-target \"#results\" :hx-trigger \"keyup changed delay:300ms\"}])" },
      { name: "hx-swap values", desc: "innerHTML (default), outerHTML, beforeend, afterbegin, delete.", example: "[\"innerHTML\" \"outerHTML\" \"beforeend\" \"afterbegin\" \"delete\"]" },
      { name: "fragment response", desc: "htmx swaps whatever HTML the handler returns.", example: "{:status 200 :headers {\"content-type\" \"text/html; charset=utf-8\"} :body \"<li>Milk</li>\"}" },
    ],
  },
  {
    group: "Server state",
    items: [
      { name: "atom", desc: "State that lives on the server for the app's lifetime.", example: "(deref (atom {:todos []}))" },
      { name: "swap!", desc: "Change state; the next request renders the new value.", example: "(let [todos (atom [])]\n  (swap! todos conj {:text \"Milk\" :done false})\n  @todos)" },
      { name: "toggle a map", desc: "Update one todo immutably.", example: "(update {:id 1 :done false} :done not)" },
      { name: "filter done", desc: "Keywords work as predicates.", example: "(count (filter :done [{:done true} {:done false}]))" },
    ],
  },
  {
    group: "Routing & JSON",
    items: [
      { name: "route table", desc: "Paths as data, each mapped to handlers.", example: "[ [\"/\" {:get :home}] [\"/todos\" {:get :todos}] [\"/todos/:id\" {:get :todo}] ]" },
      { name: "match a path", desc: "The router does this for you; the idea is a lookup.", example: "(some (fn [[path handler]] (when (= path \"/todos\") handler))\n      [[\"/\" :home] [\"/todos\" :todos]])" },
      { name: "generate JSON", desc: "Clojure data to a JSON string.", example: "(cheshire.core/generate-string {:ok true :count 2})" },
      { name: "parse JSON", desc: "Pass true to keywordize the keys.", example: "(cheshire.core/parse-string (cheshire.core/generate-string {:id 7 :done false}) true)" },
      { name: "JSON response", desc: "Same response shape, different content type.", example: "{:status 200 :headers {\"content-type\" \"application/json; charset=utf-8\"} :body (cheshire.core/generate-string {:ok true})}" },
    ],
  },
];
