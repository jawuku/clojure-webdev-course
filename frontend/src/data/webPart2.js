// Web Development with Clojure — Part 2: Clojure on the server.
// Ring requests and responses, middleware, and serving HTML with Hiccup.

export const webPart2 = [
  {
    id: "ring-request",
    title: "A Request Is a Map",
    group: "Clojure on the Server",
    summary: "Ring turns an HTTP request into ordinary Clojure data.",
    content: [
      { t: "p", text: "Clojure servers are built on Ring, a standard interface between a web server and your application. Its central idea is beautifully simple: an HTTP request arrives as a Clojure map. No special objects, no getter methods — just data you already know how to read." },
      { t: "code", code: `(def request
  {:request-method :get
   :uri "/hello"
   :headers {"accept" "text/html"}
   :query-string "name=Ada"})

[(:request-method request) (:uri request)]` },
      { t: "h", text: "The keys you'll use most" },
      { t: "list", items: [
        ":request-method — the HTTP verb as a keyword: :get, :post, :put, :delete.",
        ":uri — the path that was requested, like \"/todos\" or \"/todos/42\".",
        ":headers — a map of header names (lower-case strings) to values.",
        ":query-string — everything after the ? in the URL, still unparsed.",
        ":body — the request body, as a stream, for form posts and uploads.",
      ] },
      { t: "p", text: "Reading a request is therefore just map access. Keyword lookup, get-in, destructuring — every tool from the Clojure course works." },
      { t: "code", code: `(def request
  {:uri "/todos"
   :headers {"accept" "text/html"
             "user-agent" "Parens"}})

[(:uri request)
 (get-in request [:headers "accept"])
 (:lang request "en")]` },
      { t: "note", text: "A request map is read-only data. You don't 'change the request'; you compute a response from it. That immutability is why Ring handlers are so easy to test: call the function with a plain map." },
    ],
    exercises: [
      {
        prompt: "Write `request-path` that takes a request map and returns its path. e.g. (request-path {:uri \"/todos\"}) => \"/todos\".",
        starter: "(defn request-path [request]\n  )",
        tests: ["(= (request-path {:uri \"/todos\"}) \"/todos\")", "(= (request-path {:uri \"/\" :headers {}}) \"/\")"],
        solution: "(defn request-path [request]\n  (:uri request))",
        hint: "Look up the :uri key: (:uri request).",
      },
      {
        prompt: "Write `header` that takes a request map and a header name, and returns the value. e.g. (header request \"accept\") => \"text/html\".",
        starter: "(defn header [request name]\n  )",
        tests: ["(= (header {:headers {\"accept\" \"text/html\"}} \"accept\") \"text/html\")", "(= (header {:headers {}} \"accept\") nil)"],
        solution: "(defn header [request name]\n  (get-in request [:headers name]))",
        hint: "The headers are a nested map: (get-in request [:headers name]).",
      },
    ],
  },

  {
    id: "ring-response",
    title: "A Response Is a Map",
    group: "Clojure on the Server",
    summary: "A handler is a function from request map to response map.",
    content: [
      { t: "p", text: "If requests are maps, responses are maps too. A Ring handler is simply a function that takes a request map and returns a response map. Handle a request, return some data — that's the whole job." },
      { t: "code", code: `(defn hello [request]
  {:status 200
   :headers {"content-type" "text/html; charset=utf-8"}
   :body "<h1>Hello, web!</h1>"})

(hello {:uri "/"})` },
      { t: "h", text: "The three keys of a response" },
      { t: "list", items: [
        ":status — a number: 200 OK, 404 Not Found, 302 Found (redirect), 500 Server Error.",
        ":headers — a map of header names to string values. Always set content-type so the browser knows what it received.",
        ":body — the content. A string for HTML or text; anything else needs a matching body-encoding middleware.",
      ] },
      { t: "p", text: "Because a handler is a normal function, you can choose the response with the same tools as any other code: if, cond, case, or a lookup in a map." },
      { t: "code", code: `(defn greet [request]
  (if (= "/admin" (:uri request))
    {:status 403
     :headers {"content-type" "text/plain; charset=utf-8"}
     :body "Not allowed"}
    {:status 200
     :headers {"content-type" "text/plain; charset=utf-8"}
     :body "Welcome"}))

(mapv #(-> (greet {:uri %}) :status) ["/" "/admin"])` },
      { t: "note", text: "A handler must always return a response map. Forgetting the map (or returning nil) is the most common first bug in a Ring app — the server has nothing to send, so the browser sees an error." },
    ],
    exercises: [
      {
        prompt: "Write `ok-response` that takes a body string and returns a 200 response with content-type \"text/html; charset=utf-8\" and that body.",
        starter: "(defn ok-response [body]\n  )",
        tests: ["(= (ok-response \"<h1>Hi</h1>\")\n   {:status 200\n    :headers {\"content-type\" \"text/html; charset=utf-8\"}\n    :body \"<h1>Hi</h1>\"})"],
        solution: "(defn ok-response [body]\n  {:status 200\n   :headers {\"content-type\" \"text/html; charset=utf-8\"}\n   :body body})",
        hint: "Build the map with :status, :headers and :body, putting the argument in :body.",
      },
      {
        prompt: "Write `not-found` that returns a 404 response with content-type \"text/plain; charset=utf-8\" and body \"Not found\".",
        starter: "(defn not-found []\n  )",
        tests: ["(= (not-found)\n   {:status 404\n    :headers {\"content-type\" \"text/plain; charset=utf-8\"}\n    :body \"Not found\"})"],
        solution: "(defn not-found []\n  {:status 404\n   :headers {\"content-type\" \"text/plain; charset=utf-8\"}\n   :body \"Not found\"})",
        hint: "Same shape as ok-response, with status 404 instead of 200.",
      },
      {
        prompt: "Write `status-for` that returns 200 for the path \"/\" and 404 for anything else. e.g. (status-for {:uri \"/\"}) => 200.",
        starter: "(defn status-for [request]\n  )",
        tests: ["(= (status-for {:uri \"/\"}) 200)", "(= (status-for {:uri \"/nope\"}) 404)"],
        solution: "(defn status-for [request]\n  (if (= \"/\" (:uri request)) 200 404))",
        hint: "Compare (:uri request) with \"/\" using if.",
      },
    ],
  },

  {
    id: "ring-middleware",
    title: "Middleware: Wrapping Handlers",
    group: "Clojure on the Server",
    summary: "Add behaviour to every request without repeating yourself.",
    content: [
      { t: "p", text: "Real applications need the same work on many requests: logging, authentication, parsing a form body, adding a header. Ring's answer is middleware — a function that takes a handler and returns a new handler wrapped around it." },
      { t: "p", text: "That sounds abstract, but the code is ordinary Clojure. A middleware is a function of one handler that returns a function of one request:" },
      { t: "code", code: `(defn wrap-powered-by [handler]
  (fn [request]
    (update (handler request) :headers assoc "x-powered-by" "Parens")))

(defn hello [request]
  {:status 200
   :headers {"content-type" "text/plain; charset=utf-8"}
   :body "Hello"})

((wrap-powered-by hello) {:uri "/"})` },
      { t: "h", text: "Reading the wrapping" },
      { t: "list", items: [
        "wrap-powered-by receives the original handler.",
        "It returns a new function that will be called with each request.",
        "That function calls the original handler, then changes its response.",
        "The caller sees a handler with the same shape — request in, response out.",
      ] },
      { t: "p", text: "Middlewares compose, because each one returns a handler. Wrap a handler in three middlewares and requests flow through all three, inside out." },
      { t: "code", code: `(defn wrap-auth [handler]
  (fn [request]
    (if (= "secret" (get-in request [:headers "x-token"]))
      (handler request)
      {:status 401
       :headers {"content-type" "text/plain; charset=utf-8"}
       :body "Unauthorized"})))

(defn wrap-json-header [handler]
  (fn [request]
    (update (handler request) :headers assoc "x-content-type" "application")))

(defn dashboard [_]
  {:status 200 :headers {} :body "secret data"})

(def app (wrap-json-header (wrap-auth dashboard)))

[(app {:headers {"x-token" "secret"}})
 (app {:headers {}})]` },
      { t: "note", text: "Middleware is where cross-cutting concerns live: sessions, cookies, form parsing, compression. A real Ring app is your routes wrapped in a stack of them. You rarely write them by hand once you use a framework, but knowing the shape makes the stack readable." },
    ],
    exercises: [
      {
        prompt: "Write `wrap-flag` — middleware that adds the header \"x-flag\" with value \"on\" to every response. e.g. ((wrap-flag (fn [_] {:status 200 :headers {} :body \"\"})) {}) => {:status 200 :headers {\"x-flag\" \"on\"} :body \"\"}.",
        starter: "(defn wrap-flag [handler]\n  )",
        tests: ["(= ((wrap-flag (fn [_] {:status 200 :headers {} :body \"\"})) {})\n   {:status 200 :headers {\"x-flag\" \"on\"} :body \"\"})"],
        solution: "(defn wrap-flag [handler]\n  (fn [request]\n    (assoc-in (handler request) [:headers \"x-flag\"] \"on\")))",
        hint: "Return a function of request that calls the handler, then assoc-in the header: (assoc-in response [:headers \"x-flag\"] \"on\").",
      },
      {
        prompt: "Write `wrap-teapot` — middleware that changes every response's status to 418 while leaving the rest alone.",
        starter: "(defn wrap-teapot [handler]\n  )",
        tests: ["(= ((wrap-teapot (fn [_] {:status 200 :headers {\"a\" \"b\"} :body \"x\"})) {})\n   {:status 418 :headers {\"a\" \"b\"} :body \"x\"})"],
        solution: "(defn wrap-teapot [handler]\n  (fn [request]\n    (assoc (handler request) :status 418)))",
        hint: "Call the handler, then assoc the new :status.",
      },
    ],
  },

  {
    id: "serving-html",
    title: "Serving HTML with Hiccup",
    group: "Clojure on the Server",
    summary: "Turn Clojure vectors into the HTML a browser understands.",
    content: [
      { t: "p", text: "A response body is a string. Writing HTML by hand in a string works, but it is exactly the kind of tedious, error-prone work Clojure is good at. The library Hiccup turns Clojure data into HTML:" },
      { t: "code", code: `(require '[hiccup.core :as hiccup])

(hiccup/html [:h1 "Hello, web!"])` },
      { t: "p", text: "The vector is the element, the keyword is the tag, the string is its text. Attributes go in a map right after the tag. The result is a plain string, ready for a response body." },
      { t: "code", code: `(require '[hiccup.core :as hiccup])

(hiccup/html
 [:main
  [:h1 "My Todos"]
  [:p {:class "intro"} "A page built from Clojure data."]])` },
      { t: "h", text: "Putting it in a handler" },
      { t: "p", text: "Now the two ideas meet: a handler returns a response map, and Hiccup supplies the body. This is a complete, working page — request map in, response map out." },
      { t: "code", code: `(require '[hiccup.core :as hiccup])

(defn page [request]
  {:status 200
   :headers {"content-type" "text/html; charset=utf-8"}
   :body (hiccup/html
          [:main
           [:h1 "Hello, web!"]
           [:p "You asked for " (:uri request)]])})

(:body (page {:uri "/hello"}))` },
      { t: "note", text: "Hiccup does not escape strings for you: a body like [:p \"a & b\"] is inserted as written. For user-supplied text use hiccup.core/h, which escapes &, < and >. That distinction matters as soon as you display a name someone typed." },
      { t: "code", code: `(require '[hiccup.core :as hiccup])

[(hiccup/html [:p "1 < 2 & 3 > 2"])
 (hiccup/html [:p (hiccup/h "1 < 2 & 3 > 2")])]` },
    ],
    exercises: [
      {
        prompt: "Write `page-body` that returns the HTML string for a main element containing an h1 \"Hello\" and a p \"Welcome\". Use hiccup.core/html.",
        starter: "(defn page-body []\n  )",
        tests: ["(= (page-body) \"<main><h1>Hello</h1><p>Welcome</p></main>\")"],
        solution: "(defn page-body []\n  (hiccup.core/html [:main [:h1 \"Hello\"] [:p \"Welcome\"]]))",
        hint: "Pass the whole vector to hiccup.core/html: (hiccup.core/html [:main [:h1 \"Hello\"] [:p \"Welcome\"]]) .",
      },
      {
        prompt: "Write `greeting` that returns HTML for an h1 saying \"Hello, NAME\", using the name it receives. e.g. (greeting \"Ada\") => \"<h1>Hello, Ada</h1>\".",
        starter: "(defn greeting [name]\n  )",
        tests: ["(= (greeting \"Ada\") \"<h1>Hello, Ada</h1>\")", "(= (greeting \"web\") \"<h1>Hello, web</h1>\")"],
        solution: "(defn greeting [name]\n  (hiccup.core/html [:h1 (str \"Hello, \" name)]))",
        hint: "Build the text with str inside the vector: [:h1 (str \"Hello, \" name)].",
      },
    ],
  },
];
