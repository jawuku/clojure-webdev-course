import { buildCourse } from "./registry";
import { lessonsPart1 } from "../data/lessonsPart1";
import { lessonsPart2 } from "../data/lessonsPart2";
import { lessonsPart3 } from "../data/lessonsPart3";
import { lessonsPart4 } from "../data/lessonsPart4";
import { lessonsPart5 } from "../data/lessonsPart5";
import { CHEATSHEET } from "../data/cheatsheet";

// Assemble the lessons in teaching order (capstone near the end, followed by
// the "What's Next" preview).
const capstone = lessonsPart2[lessonsPart2.length - 1];
const p2rest = lessonsPart2.slice(0, -1);
const moreEssentials = lessonsPart5.slice(0, -1);
const whatsNext = lessonsPart5[lessonsPart5.length - 1];

const LESSONS = [
  ...lessonsPart1,
  ...p2rest,
  ...moreEssentials,
  ...lessonsPart3,
  ...lessonsPart4,
  capstone,
  whatsNext,
];

const REPL_WELCOME =
  ';; Welcome to the REPL playground.\n;; Type a Clojure expression and press Cmd/Ctrl + Enter to run it.\n(println "Hello, Clojure!")\n(map inc [1 2 3])';

export const clojureCourse = buildCourse({
  id: "clojure",
  name: "Parens",
  tagline: "Learn Clojure",
  brandMark: "( )",
  storageKey: "parens_clojure_v1",
  // The idiomatic REPL default namespace.
  ns: "user",
  lessons: LESSONS,
  cheatsheet: CHEATSHEET,
  replWelcome: REPL_WELCOME,
});

export default clojureCourse;
