import { buildCourse } from "./registry";
import { webPart1 } from "../data/webPart1";
import { webPart2 } from "../data/webPart2";
import { webPart3 } from "../data/webPart3";
import { webPart4 } from "../data/webPart4";
import { WEB_CHEATSHEET } from "../data/webCheatsheet";

// "Web Development with ClojureScript" — the follow-on course. It reuses the
// exact same UI, themes, REPL, search and cheat sheet as the Clojure course.
// ClojureScript/Reagent-specific snippets are being ported to the JVM UI
// runtime; until then their live previews render as read-only examples.
const LESSONS = [...webPart1, ...webPart2, ...webPart3, ...webPart4];

const REPL_WELCOME =
  ';; Clojure REPL — running on the local JVM.\n;; Try a few expressions:\n(map inc [1 2 3])\n(->> (range 10) (filter even?) (reduce +))\n(clojure.string/upper-case "clojure")';

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
});

export default webCourse;
