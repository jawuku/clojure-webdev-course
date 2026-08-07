// Web Development with ClojureScript — Part 1: The Web & Its Foundations.
// Novice-friendly overview of the WWW and the three classic web technologies,
// before we introduce ClojureScript. Block types:
//   { t:"p"|"h"|"note"|"list", text|items }
//   { t:"code", code }   -> runnable ClojureScript (SCI)
//   { t:"read", code }   -> read-only sample (HTML/CSS/JS)
//   { t:"reagent", code} -> live Reagent component

export const webPart1 = [
  {
    id: "welcome-web",
    title: "Welcome — and a Prerequisite",
    group: "The Web & Its Foundations",
    summary: "What this course is, and why you should do the Clojure course first.",
    content: [
      { t: "p", text: "Welcome to Web Development with ClojureScript! In this course you'll build real, interactive web pages using the very same language you already learned — Clojure — this time running inside the browser as ClojureScript." },
      { t: "note", text: "Prerequisite: this course assumes you've completed the Learn Clojure course. Use the course switcher at the top of the sidebar to jump back any time. You'll lean heavily on def/defn, maps, vectors, keywords, atoms, map/filter/reduce and for — all of it transfers directly." },
      { t: "h", text: "What you'll be able to build" },
      { t: "p", text: "By the end you'll build components, manage state, handle user input, and assemble a small interactive app — a to-do list — entirely in ClojureScript. Every UI example runs live, right here on the page." },
      { t: "list", items: [
        "How the World Wide Web actually works (for complete novices).",
        "The three classic web languages — HTML, CSS and JavaScript — at a glance.",
        "ClojureScript: the same Clojure you know, compiled to JavaScript.",
        "Hiccup: describing HTML as plain Clojure data.",
        "Reagent: turning that data into a live, reactive user interface.",
      ] },
      { t: "p", text: "Let's start at the beginning: what is 'the web', and what happens when you visit a page?" },
    ],
    exercises: [
      {
        prompt: "This course assumes you know Clojure, and it lists the three classic web languages you'll meet. Write a vector containing them in order: HTML, CSS, JavaScript.",
        starter: ";; write a vector\n",
        tests: ["(= answer [\"HTML\" \"CSS\" \"JavaScript\"])"],
        solution: "[\"HTML\" \"CSS\" \"JavaScript\"]",
        hint: "Square brackets with the three names as strings, in the order they appear: [\"HTML\" \"CSS\" \"JavaScript\"].",
      },
    ],
  },

  {
    id: "www-design",
    title: "The Design of the World Wide Web",
    group: "The Web & Its Foundations",
    summary: "Where the web came from and the big ideas behind it.",
    content: [
      { t: "p", text: "The World Wide Web was invented in 1989 by Tim Berners-Lee at CERN, the physics laboratory near Geneva. He wanted a simple way for scientists around the world to share and link documents. That modest goal grew into the web we use every day." },
      { t: "h", text: "Three inventions that made the web" },
      { t: "p", text: "The web rests on three deceptively simple ideas, all still in use today:" },
      { t: "list", items: [
        "URL (Uniform Resource Locator) — a universal address for any resource, e.g. https://example.com/page. Every page and file gets its own name.",
        "HTTP (HyperText Transfer Protocol) — the set of rules browsers and servers use to ask for and send those resources.",
        "HTML (HyperText Markup Language) — the format for the documents themselves, including hyperlinks that connect one page to another.",
      ] },
      { t: "h", text: "The key idea: hypertext" },
      { t: "p", text: "The 'hyper' in hypertext means the text is linked. A link lets you jump from one document to any other, anywhere in the world, with a single click. That web of connections — pages linking to pages — is literally where the name 'web' comes from." },
      { t: "h", text: "Open standards, not one company" },
      { t: "p", text: "Crucially, Berners-Lee gave the web away for free. No single company owns it. Instead, open standards — agreed specifications that anyone can implement — let a browser from one maker talk to a server from another. That openness is why the web became universal." },
      { t: "note", text: "The web (pages you view in a browser) runs on top of the Internet (the global network of connected computers). The Internet is the roads; the web is one very popular kind of traffic on them — alongside email, video calls and more." },
    ],
    exercises: [
      {
        prompt: "The web rests on three inventions. Write a vector of their keywords in the order introduced: URL, HTTP, HTML.",
        starter: ";; write the vector\n",
        tests: ["(= answer [:url :http :html])"],
        solution: "[:url :http :html]",
        hint: "Three keywords starting with a colon: [:url :http :html].",
      },
      {
        prompt: "A URL is a universal address. Write `is-link?` that returns true when a string contains the \"http\" of a URL (use str/includes?).",
        starter: "(defn is-link? [s]\n  )",
        tests: ["(= (is-link? \"visit https://clojure.org\") true)", "(= (is-link? \"a plain note\") false)"],
        solution: "(defn is-link? [s]\n  (str/includes? s \"http\"))",
        hint: "str/includes? checks whether a string contains another: (str/includes? s \"http\").",
      },
    ],
  },

  {
    id: "how-web-works",
    title: "What Happens When You Visit a Page",
    group: "The Web & Its Foundations",
    summary: "The request–response cycle between browser and server.",
    content: [
      { t: "p", text: "Whenever you open a web page, two players talk to each other: the client (your browser) and a server (a computer somewhere that stores the page). Understanding this back-and-forth is the foundation of everything else." },
      { t: "h", text: "Step by step" },
      { t: "list", items: [
        "You type a URL (or click a link). The browser is the client.",
        "DNS lookup: the human-friendly name (example.com) is translated into a numeric IP address that identifies the server on the network.",
        "The browser sends an HTTP request to that server: 'GET me the page at this path, please.'",
        "The server does its work and sends back an HTTP response: a status code (e.g. 200 OK, or 404 Not Found) plus the content — usually an HTML document.",
        "The browser renders that HTML into the page you see, fetching any extra files it references (styles, scripts, images) with more requests.",
      ] },
      { t: "h", text: "Requests and responses carry more than content" },
      { t: "p", text: "Both requests and responses include headers — little labels of extra information, like the content type, the language, or authentication details. The main payload is called the body." },
      { t: "h", text: "Frontend vs backend" },
      { t: "p", text: "Code that runs in the browser is the frontend (or client-side). Code that runs on the server is the backend (or server-side). This course is about the frontend — building the interactive page the user sees. Thanks to ClojureScript, you can write that frontend in Clojure." },
      { t: "note", text: "A helpful mental model: the browser is a very capable program that (1) makes HTTP requests, (2) renders HTML/CSS, and (3) runs JavaScript. ClojureScript compiles to that JavaScript, so anything JavaScript can do in the browser, ClojureScript can do too." },
    ],
    exercises: [
      {
        prompt: "Every web conversation has two players. Write a vector of the two keywords, client first and server second.",
        starter: ";; write the vector\n",
        tests: ["(= answer [:client :server])"],
        solution: "[:client :server]",
        hint: "Two keywords: [:client :server].",
      },
      {
        prompt: "A successful page load comes back with a status code. Write `ok?` that returns true when the code is 200, false otherwise.",
        starter: "(defn ok? [code]\n  )",
        tests: ["(= (ok? 200) true)", "(= (ok? 404) false)"],
        solution: "(defn ok? [code]\n  (= code 200))",
        hint: "Compare with =: (= code 200).",
      },
    ],
  },

  {
    id: "html-basics",
    title: "HTML: The Structure of a Page",
    group: "The Web & Its Foundations",
    summary: "How documents are described with tags and elements.",
    content: [
      { t: "p", text: "HTML describes the structure and content of a page — its headings, paragraphs, lists, links, images and so on. It does this with tags written in angle brackets." },
      { t: "p", text: "Most content sits between an opening tag and a matching closing tag (note the slash). Together, a tag pair plus its content is called an element." },
      { t: "read", code: "<h1>My First Page</h1>\n<p>This is a paragraph of text.</p>" },
      { t: "h", text: "Nesting and attributes" },
      { t: "p", text: "Elements can contain other elements (nesting), and can carry attributes — extra settings written inside the opening tag as name=\"value\". The href attribute of a link says where it points." },
      { t: "read", code: "<div class=\"card\">\n  <h2>Welcome</h2>\n  <p>Visit <a href=\"https://clojure.org\">the Clojure site</a>.</p>\n  <ul>\n    <li>First item</li>\n    <li>Second item</li>\n  </ul>\n</div>" },
      { t: "h", text: "A whole document" },
      { t: "p", text: "A full page wraps everything in <html>, with a <head> (metadata, title, links to styles) and a <body> (the visible content)." },
      { t: "read", code: "<!doctype html>\n<html>\n  <head>\n    <title>Hello</title>\n  </head>\n  <body>\n    <h1>Hello, web!</h1>\n  </body>\n</html>" },
      { t: "note", text: "Keep the shape of HTML in mind: a tag, some attributes, and children nested inside. In a couple of lessons you'll see that Hiccup describes exactly this shape — but as a Clojure vector instead of angle brackets." },
    ],
    exercises: [
      {
        prompt: "In a couple of lessons you'll describe HTML as Clojure data. Translate <h1>Hello</h1> into that shape now: a keyword for the tag, then the text.",
        starter: ";; write the vector\n",
        tests: ["(= answer [:h1 \"Hello\"])"],
        solution: "[:h1 \"Hello\"]",
        hint: "A keyword for the tag, then the text as a string: [:h1 \"Hello\"].",
      },
      {
        prompt: "A link's href attribute says where it points. Write a map with the attribute name :href and the value \"https://clojure.org\".",
        starter: ";; write the map\n",
        tests: ["(= answer {:href \"https://clojure.org\"})"],
        solution: "{:href \"https://clojure.org\"}",
        hint: "A map with one key and value: {:href \"https://clojure.org\"}.",
      },
    ],
  },

  {
    id: "css-basics",
    title: "CSS: Styling the Page",
    group: "The Web & Its Foundations",
    summary: "How pages get their colours, spacing and layout.",
    content: [
      { t: "p", text: "HTML gives a page structure; CSS (Cascading Style Sheets) gives it style — colours, fonts, spacing, borders and layout. Without CSS, every page would look like plain black text on white." },
      { t: "h", text: "Rules: selector + declarations" },
      { t: "p", text: "A CSS rule picks some elements with a selector, then lists style declarations (property: value;) to apply to them." },
      { t: "read", code: "h1 {\n  color: #7e9cd8;\n  font-size: 32px;\n}\n\n.card {\n  padding: 16px;\n  border: 1px solid #ccc;\n  border-radius: 10px;\n}" },
      { t: "p", text: "Here h1 selects every <h1> element, while .card selects every element with class=\"card\". A # selects a single element by its id." },
      { t: "h", text: "How CSS reaches the page" },
      { t: "p", text: "You can attach styles inline on an element (a style attribute), or — more commonly — in a stylesheet linked from the document's <head>. In this course, our Reagent components will set styles inline via a Clojure map, which keeps the style right next to the element it affects." },
      { t: "read", code: "<p style=\"color: green; font-weight: bold;\">Styled inline</p>" },
      { t: "note", text: "The word 'cascading' means rules can layer and override one another according to clear priority rules. You don't need the details now — just remember: CSS = the look; HTML = the structure." },
    ],
    exercises: [
      {
        prompt: "A CSS rule picks elements with a selector and styles them with declarations. Write a map with :selector \"h1\" and :property \"color\".",
        starter: ";; write the map\n",
        tests: ["(= answer {:selector \"h1\" :property \"color\"})"],
        solution: "{:selector \"h1\" :property \"color\"}",
        hint: "A two-key map: {:selector \"h1\" :property \"color\"}.",
      },
      {
        prompt: "Soon you'll set styles as a Clojure map of property to value. Write the style map that makes text the colour #98bb6c.",
        starter: ";; write the map\n",
        tests: ["(= answer {:color \"#98bb6c\"})"],
        solution: "{:color \"#98bb6c\"}",
        hint: "A keyword key with the hex string as its value: {:color \"#98bb6c\"}.",
      },
    ],
  },

  {
    id: "js-and-cljs",
    title: "JavaScript & Enter ClojureScript",
    group: "The Web & Its Foundations",
    summary: "The browser's language — and how Clojure joins the party.",
    content: [
      { t: "p", text: "HTML and CSS are not programming languages — they describe content and style, but they can't make decisions or respond to the user. For that, the browser runs a programming language: JavaScript. Clicking a button, validating a form, updating part of the page without a full reload — that's JavaScript at work." },
      { t: "read", code: "// JavaScript: change a heading when a button is clicked\nconst btn = document.querySelector('button');\nbtn.addEventListener('click', () => {\n  document.querySelector('h1').textContent = 'Clicked!';\n});" },
      { t: "h", text: "Where ClojureScript comes in" },
      { t: "p", text: "Every browser can run JavaScript, and only JavaScript. So how do we use Clojure in the browser? We compile it. ClojureScript is the Clojure language with a compiler that turns your Clojure code into JavaScript the browser can run." },
      { t: "list", items: [
        "Same language: the syntax, immutable data, and core functions you learned are all here.",
        "Compiles to JavaScript: your .cljs code becomes .js that runs in the browser.",
        "Full access to the browser: you can call any JavaScript API through interop (next chapter).",
      ] },
      { t: "h", text: "Why bother, when JavaScript already works?" },
      { t: "list", items: [
        "Immutable data by default — fewer bugs from accidental changes.",
        "A tiny, consistent core of functions that work on all data.",
        "The REPL: build your UI interactively, seeing changes instantly.",
        "Great UI libraries like Reagent that make Clojure's data a natural fit for building interfaces.",
      ] },
      { t: "note", text: "Real ClojureScript projects use a build tool (commonly shadow-cljs) to run the compiler and reload your code as you save. In THIS course we use a lightweight in-browser interpreter (SCI/Scittle) so you can run everything instantly with no setup — perfect for learning. We'll point out where a real project would differ." },
      { t: "p", text: "Enough background — in the next chapter you'll run actual ClojureScript. Onwards!" },
    ],
    exercises: [
      {
        prompt: "The browser runs one programming language directly, and only one. Write the string that names it.",
        starter: "\"\"",
        tests: ["(= answer \"JavaScript\")"],
        solution: "\"JavaScript\"",
        hint: "The name of the browser's language, in double quotes.",
      },
      {
        prompt: "ClojureScript can call JavaScript through interop — something you already learned in the Clojure course. Write `loud` that upper-cases its argument with .toUpperCase.",
        starter: "(defn loud [s]\n  )",
        tests: ["(= (loud \"hey\") \"HEY\")"],
        solution: "(defn loud [s]\n  (.toUpperCase s))",
        hint: "A dot before the method name: (.toUpperCase s).",
      },
    ],
  },
];
