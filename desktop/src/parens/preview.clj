(ns parens.preview
  "A small, real Ring app for the Course 2 capstone.

  The course embeds it in an iframe and drives it with HTMX: every interaction
  in the page is an ordinary request to these handlers, and every response is
  Hiccup rendered with hiccup.core/html. That is the same request/response
  cycle the lessons teach, running on the learner's own machine.

  State is in memory and per launch — it is a teaching demo, not user data.
  Access is gated by a SameSite=Strict cookie handed out by the token-protected
  /api/preview/session endpoint, so another local page cannot drive it."
  (:require [clojure.string :as str]
            [hiccup.core :as hiccup])
  (:import [java.net URLDecoder]
           [java.nio.charset StandardCharsets]
           [java.security MessageDigest SecureRandom]
           [java.util Base64]))

(def ^:private cookie-name "parens-preview")

;; The preview document loads only its own vendored htmx and inline styles.
(def ^:private content-security-policy
  (str "default-src 'none'; "
       "script-src 'self'; "
       "style-src 'unsafe-inline'; "
       "connect-src 'self'; "
       "img-src data:; "
       "base-uri 'none'; "
       "form-action 'self'"))

(defonce ^:private state (atom nil))
(defonce ^:private session (atom nil))

(defn- random-id []
  (let [bytes (byte-array 24)]
    (.nextBytes (SecureRandom.) bytes)
    (.encodeToString (Base64/getUrlEncoder) bytes)))

(defn start-session!
  "Start a fresh demo and return the session id. Each launch (and each reset
  of the preview) begins with the same two example todos."
  []
  (reset! state {:todos [{:id 1 :text "Learn Hiccup" :done true}
                         {:id 2 :text "Build a Ring handler" :done false}]
                 :next-id 3})
  (let [id (random-id)]
    (reset! session id)
    id))

(defn session-cookie
  "The Set-Cookie header value for a preview session."
  [id]
  (str cookie-name "=" id "; Path=/; HttpOnly; SameSite=Strict"))

(defn- secure= [expected provided]
  (and (string? expected)
       (string? provided)
       (MessageDigest/isEqual (.getBytes ^String expected StandardCharsets/UTF_8)
                              (.getBytes ^String provided StandardCharsets/UTF_8))))

(defn- cookie-value [request]
  (some (fn [pair]
          (let [[name value] (str/split (str/trim pair) #"=" 2)]
            (when (= name cookie-name) (or value ""))))
        (some-> (get-in request [:headers "cookie"]) (str/split #";"))))

(defn- valid-session? [request]
  (let [expected @session]
    (boolean (and expected (secure= expected (cookie-value request))))))

(defn- html-response [body]
  {:status 200
   :headers {"content-type" "text/html; charset=utf-8"
             "cache-control" "no-store"
             "x-content-type-options" "nosniff"
             "content-security-policy" content-security-policy}
   :body body})

(defn- text-response [status body]
  {:status status
   :headers {"content-type" "text/plain; charset=utf-8"
             "cache-control" "no-store"}
   :body body})

(defn- form-params [request]
  (let [raw (try (slurp (:body request) :encoding "UTF-8")
                 (catch Throwable _ ""))]
    (into {}
          (keep (fn [pair]
                  (let [[key value] (str/split pair #"=" 2)]
                    (when (seq key)
                      [(URLDecoder/decode key "UTF-8")
                       (URLDecoder/decode (or value "") "UTF-8")]))))
          (when-not (str/blank? raw) (str/split raw #"&")))))

(defn- add-todo! [text]
  (let [text (str/trim (or text ""))]
    (when (seq text)
      (swap! state
             (fn [{:keys [next-id] :as current}]
               (-> current
                   (update :todos conj {:id next-id :text text :done false})
                   (assoc :next-id (inc next-id))))))))

(defn- toggle-todo! [id]
  (swap! state update :todos
         (fn [todos]
           (mapv (fn [todo]
                   (if (= (:id todo) id) (update todo :done not) todo))
                 todos))))

(defn- delete-todo! [id]
  (swap! state update :todos
         (fn [todos] (vec (remove #(= (:id %) id) todos)))))

;; ---------------------------------------------------------------------------
;; Hiccup rendering

(defn- todo-item [{:keys [id text done]}]
  [:li.todo
   [:form {:hx-post (str "/preview/todos/" id "/toggle")
           :hx-target "#todos"
           :hx-swap "outerHTML"}
    [:button.toggle {:type "submit"
                     :class (when done "is-done")
                     :title (if done "Mark as not done" "Mark as done")
                     :aria-label (if done "Mark as not done" "Mark as done")}
     (if done "✓" "○")]]
   [:span.text {:class (when done "is-done")} text]
   [:form {:hx-post (str "/preview/todos/" id "/delete")
           :hx-target "#todos"
           :hx-swap "outerHTML"}
    [:button.delete {:type "submit" :aria-label "Delete todo"} "delete"]]])

(defn- todos-view [{:keys [todos]}]
  [:div#todos
   [:ul.todos
    (for [todo todos]
      (todo-item todo))]
   [:p.count (str (count (filter :done todos)) " of " (count todos) " done")]])

(defn- new-todo-input
  "The text field. On an add response it is also sent as an out-of-band swap so
  the box clears without inline event-handler JavaScript (which CSP blocks)."
  [& {:keys [oob?]}]
  (cond-> [:input#new-todo {:type "text"
                            :name "text"
                            :value ""
                            :placeholder "What needs doing?"
                            :autocomplete "off"
                            :aria-label "New todo"}]
    oob? (assoc-in [1 :hx-swap-oob] "true")))

(defn- page [body]
  (str
   "<!doctype html>"
   (hiccup/html
    [:html {:lang "en"}
     [:head
      [:meta {:charset "utf-8"}]
      [:meta {:name "viewport" :content "width=device-width, initial-scale=1"}]
      [:title "Parens · To-Do Ring app"]
      [:script {:src "/vendor/htmx.min.js"}]]
     [:body body]])))

(def ^:private page-css
  (str "body{margin:0;padding:20px;font:15px/1.5 system-ui,-apple-system,"
       "\"Segoe UI\",sans-serif;color:#2b2a27;background:#fffdf7}"
       "h1{font-size:19px;margin:0 0 2px}"
       ".sub{color:#7a766c;font-size:12.5px;margin:0 0 16px}"
       "form.add{display:flex;gap:6px;margin:0 0 14px}"
       "input[type=text]{flex:1;padding:7px 10px;font:inherit;border:1px solid #d9d3c4;"
       "border-radius:8px;background:#fff}"
       "button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid #d9d3c4;"
       "background:#f4efe2;padding:6px 12px}"
       "button.primary{background:#7e9cd8;border-color:#7e9cd8;color:#fff;font-weight:600}"
       "ul.todos{list-style:none;margin:0;padding:0}"
       ".todo{display:flex;align-items:center;gap:8px;padding:6px 0;"
       "border-bottom:1px solid #efe9db}"
       ".todo form{margin:0}"
       ".toggle{width:26px;height:26px;padding:0;border-radius:999px}"
       ".toggle.is-done{background:#98bb6c;border-color:#98bb6c;color:#fff}"
       ".text{flex:1}"
       ".text.is-done{text-decoration:line-through;color:#9a9686}"
       ".delete{padding:3px 8px;font-size:12px;color:#b4553f;background:transparent}"
       ".count{color:#7a766c;font-size:13px;margin:12px 0 0}"
       "@media (prefers-color-scheme: dark){body{background:#1c1b18;color:#e6e1d6}"
       "input[type=text]{background:#262420;border-color:#3b3831;color:inherit}"
       "button{background:#2c2a25;border-color:#3b3831;color:inherit}"
       "button.primary{background:#7e9cd8;border-color:#7e9cd8;color:#14130f}"
       ".todo{border-bottom-color:#2c2a25}.sub,.count{color:#9a9686}}"))

(defn- preview-page []
  (page
   [:div
    [:style page-css]
    [:h1 "My Todos"]
    [:p.sub "A tiny Ring app: each click sends a request and gets Hiccup-rendered HTML back."]
    [:form.add {:hx-post "/preview/todos"
                :hx-target "#todos"
                :hx-swap "outerHTML"}
     (new-todo-input)
     [:button.primary {:type "submit"} "Add"]]
    (todos-view @state)]))

;; ---------------------------------------------------------------------------
;; Routing

(defn- parsed-route [uri]
  (when-let [[_ id action] (re-matches #"/preview/todos/(\d+)/(toggle|delete)" uri)]
    [(parse-long id) action]))

(defn handler
  "Ring handler for /preview/todos. The session cookie is required; the page
  itself is a plain server-rendered document with htmx attributes."
  [request]
  (let [{:keys [request-method uri]} request]
    (cond
      (not (valid-session? request))
      (text-response 403 "Open the course in Parens to start the live app.")

      (and (= :get request-method) (= uri "/preview/todos"))
      (html-response (preview-page))

      (and (= :post request-method) (= uri "/preview/todos"))
      (do (add-todo! (get (form-params request) "text"))
          (html-response (hiccup/html (todos-view @state)
                                      (new-todo-input :oob? true))))

      (and (= :post request-method) (parsed-route uri))
      (let [[id action] (parsed-route uri)
            _ (if (= action "toggle") (toggle-todo! id) (delete-todo! id))]
        (html-response (hiccup/html (todos-view @state))))

      :else
      (text-response 404 "Not found."))))
