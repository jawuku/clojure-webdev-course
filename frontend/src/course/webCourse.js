import { buildCourse } from "./registry";
import { webPart1 } from "../data/webPart1";
import { webPart2 } from "../data/webPart2";
import { webPart3 } from "../data/webPart3";
import { webPart4 } from "../data/webPart4";
import { WEB_CHEATSHEET } from "../data/webCheatsheet";

// "Web Development with ClojureScript" — the follow-on course. It reuses the
// exact same UI, themes, REPL, search and cheat sheet as the Clojure course.
// The only extra ingredient is a live Reagent runtime, loaded via runtimeScripts.
const LESSONS = [...webPart1, ...webPart2, ...webPart3, ...webPart4];

const REPL_WELCOME =
  ';; ClojureScript REPL — same language, running as JavaScript in your browser.\n;; Try some interop:\n(js/Math.max 3 9 2)\n(.toUpperCase "clojurescript")';

export const webCourse = buildCourse({
  id: "webdev",
  name: "Hiccup",
  tagline: "Web Dev with ClojureScript",
  brandMark: "</>",
  storageKey: "parens_webdev_v1",
  ns: "web",
  lessons: LESSONS,
  cheatsheet: WEB_CHEATSHEET,
  replWelcome: REPL_WELCOME,
  // Reagent needs React + ReactDOM, then the Scittle reagent plugin (loaded in
  // order, after the Scittle core that public/index.html already provides).
  // React 18 gives us the modern createRoot API used by renderReagent().
  runtimeScripts: [
    "https://unpkg.com/react@18/umd/react.production.min.js",
    "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
    "https://cdn.jsdelivr.net/npm/scittle@0.7.27/dist/scittle.reagent.js",
  ],
});

export default webCourse;
