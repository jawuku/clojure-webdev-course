import { buildCourse } from "./registry";
import { regexPart1 } from "../data/regexPart1";
import { regexPart2 } from "../data/regexPart2";
import { regexPart3 } from "../data/regexPart3";
import { REGEX_CHEATSHEET } from "../data/regexCheatsheet";

// Keep the wrap-up lesson last: core lessons, then the advanced/challenge
// lessons from Part 3, then "What's Next".
const whatsNext = regexPart2.find((l) => l.id === "whats-next");
const core2 = regexPart2.filter((l) => l.id !== "whats-next");
const LESSONS = [...regexPart1, ...core2, ...regexPart3, whatsNext];

const REPL_WELCOME =
  ';; Regex REPL — patterns are written as #"..." and run live.\n;; Try these:\n(re-seq #"\\d+" "order 66, item 99")\n(str/replace "2026-06-15" #"(\\d{4})-(\\d{2})-(\\d{2})" "$3/$2/$1")';

export const regexCourse = buildCourse({
  id: "regex",
  name: "Regex",
  tagline: "Master Regular Expressions",
  brandMark: ".*",
  storageKey: "regex_course_v1",
  ns: "regex",
  lessons: LESSONS,
  cheatsheet: REGEX_CHEATSHEET,
  replWelcome: REPL_WELCOME,
});

export default regexCourse;
