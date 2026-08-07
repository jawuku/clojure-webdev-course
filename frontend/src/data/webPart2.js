// Web Development with ClojureScript — Part 2: ClojureScript Fundamentals.
// The Clojure you know, now running as JavaScript. Interop with the browser.

export const webPart2 = [
  {
    id: "cljs-same-language",
    title: "It's the Same Language",
    group: "ClojureScript Fundamentals",
    summary: "Your Clojure knowledge runs unchanged in the browser.",
    content: [
      { t: "p", text: "Good news first: almost everything you learned in the Clojure course works identically in ClojureScript. Vectors, maps, keywords, def/defn, map/filter/reduce, for, atoms — all the same. Every code box below runs live as ClojureScript." },
      { t: "code", code: "(def fruits [\"apple\" \"pear\" \"plum\"])\n(map str/upper-case fruits)" },
      { t: "p", text: "Data transformation you already know:" },
      { t: "code", code: "(->> (range 1 11)\n     (filter even?)\n     (map #(* % %))\n     (reduce +))" },
      { t: "h", text: "Atoms work too" },
      { t: "p", text: "The atom you met for managing state is central to building UIs — a special reactive version powers Reagent. Here's the plain version as a refresher." },
      { t: "code", code: "(def counter (atom 0))\n(swap! counter inc)\n(swap! counter inc)\n@counter" },
      { t: "note", text: "There are a few differences from Clojure-on-the-JVM (numbers are JavaScript numbers, and you interoperate with JavaScript instead of Java). But the language you write day-to-day is the same. If you can read the code above, you're ready." },
    ],
    exercises: [
      {
        prompt: "Using the tools you know, write `shout` that upper-cases a string and adds \"!\". e.g. (shout \"hi\") => \"HI!\".",
        starter: "(defn shout [s]\n  )",
        tests: ["(= (shout \"hi\") \"HI!\")", "(= (shout \"web\") \"WEB!\")"],
        solution: "(defn shout [s]\n  (str (str/upper-case s) \"!\"))",
        hint: "Combine str/upper-case with str and \"!\".",
      },
      {
        prompt: "The tools from the Clojure course work unchanged. Write `sum-of-odd-squares` that takes numbers, keeps the odd ones, squares them, and sums them, using ->>. e.g. (sum-of-odd-squares [1 2 3 4 5]) => 35.",
        starter: "(defn sum-of-odd-squares [nums]\n  )",
        tests: ["(= (sum-of-odd-squares [1 2 3 4 5]) 35)", "(= (sum-of-odd-squares [2 4 6]) 0)"],
        solution: "(defn sum-of-odd-squares [nums]\n  (->> nums (filter odd?) (map #(* % %)) (reduce +)))",
        hint: "Thread with ->>: filter odd?, map square, reduce +.",
      },
    ],
  },

  {
    id: "js-interop",
    title: "Talking to JavaScript (Interop)",
    group: "ClojureScript Fundamentals",
    summary: "Reach JavaScript objects, methods and properties from Clojure.",
    content: [
      { t: "p", text: "Because ClojureScript runs as JavaScript, you can call any JavaScript function or object. This is called interop, and it uses a small, memorable set of syntax." },
      { t: "h", text: "Global objects with js/" },
      { t: "p", text: "The js/ prefix reaches a global JavaScript object, like Math or the browser's console." },
      { t: "code", code: "(js/Math.max 3 9 2 7)" },
      { t: "code", code: "(js/parseInt \"42px\" 10)" },
      { t: "note", text: "One gotcha while we're here: parentheses always mean 'call it'. Classic JVM Clojure would write Math/sqrt — and this runtime happens to accept that JVM-style call too: (Math/sqrt 16) returns 4, because Math/ is mapped onto JavaScript's Math object. But only method-style calls work: reading a constant fails — (Math/PI) errors, and even (js/Math.PI) with parentheses does too. Read a constant with the bare form — js/Math.PI gives 3.14159… — or the .-property form you'll see below: (.-PI js/Math). Stick with js/ for everything: (js/Math.sqrt 16) calls a function, js/Math.PI reads a value." },
      { t: "h", text: "Calling methods with .method" },
      { t: "p", text: "To call a method ON an object, put a dot before the method name and the object first — like (.method object args...)." },
      { t: "code", code: "(.toUpperCase \"clojurescript\")" },
      { t: "code", code: "(.repeat \"ab\" 3)" },
      { t: "h", text: "Reading properties with .-name" },
      { t: "p", text: "To read a property (not call a method), use a dot-dash: (.-property object)." },
      { t: "code", code: "(.-length \"clojure\")" },
      { t: "h", text: "Converting between Clojure and JS data" },
      { t: "p", text: "clj->js turns Clojure data into JavaScript objects/arrays; js->clj goes the other way. You'll need these when passing data to JavaScript libraries." },
      { t: "code", code: "(clj->js {:name \"Ada\" :langs [\"clj\" \"cljs\"]})" },
      { t: "note", text: "That's essentially the whole interop toolkit: js/… for globals, .method to call, .-prop to read, and clj->js / js->clj to convert. You'll use these constantly when working with the browser." },
    ],
    exercises: [
      {
        prompt: "Use interop to write `char-count` that returns the number of characters in a string (its JS .length property).",
        starter: "(defn char-count [s]\n  )",
        tests: ["(= (char-count \"clojure\") 7)", "(= (char-count \"\") 0)"],
        solution: "(defn char-count [s]\n  (.-length s))",
        hint: "Read the .-length property: (.-length s).",
      },
      {
        prompt: "Write `loudest` that returns the largest of three numbers using JavaScript's Math.max via js/.",
        starter: "(defn loudest [a b c]\n  )",
        tests: ["(= (loudest 3 9 2) 9)", "(= (loudest 5 1 4) 5)"],
        solution: "(defn loudest [a b c]\n  (js/Math.max a b c))",
        hint: "(js/Math.max a b c).",
      },
    ],
  },

  {
    id: "browser-apis",
    title: "The Browser as a Playground",
    group: "ClojureScript Fundamentals",
    summary: "console, alerts, and the document — the browser's built-in tools.",
    content: [
      { t: "p", text: "The browser exposes many objects your code can use. Two you'll meet immediately are the console (for printing debug messages) and the document (the live page itself)." },
      { t: "h", text: "The console" },
      { t: "p", text: "println works here and its output appears below the snippet. Under the hood it uses the browser's console — the same place developer tools show messages." },
      { t: "code", code: "(println \"Hello from ClojureScript!\")\n(println \"2 + 2 =\" (+ 2 2))" },
      { t: "h", text: "The document" },
      { t: "p", text: "js/document represents the current page. In a real app you rarely touch it directly — libraries like Reagent do the heavy lifting — but it's good to know it's there. Reading its title is harmless:" },
      { t: "code", code: "(.-title js/document)" },
      { t: "h", text: "Why we don't hand-edit the page" },
      { t: "p", text: "You COULD build a whole UI by manually creating and updating elements through js/document. But that quickly becomes tangled: you must remember to update every piece by hand whenever data changes. The rest of this course shows a far better way — describe what the UI should look like as data, and let Reagent keep the page in sync for you." },
      { t: "note", text: "This 'describe it as data, let the library sync the page' approach is the single most important idea in modern frontend development. Everything from here builds toward it." },
    ],
    exercises: [
      {
        prompt: "This lesson introduces two browser tools. Write a vector of their keywords, in the order introduced: :console and :document.",
        starter: ";; write the vector\n",
        tests: ["(= answer [:console :document])"],
        solution: "[:console :document]",
        hint: "The console (for printing) and the document (the live page): [:console :document].",
      },
    ],
  },
];
