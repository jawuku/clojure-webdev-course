// Reusable "course engine": given course metadata + lesson data, derive
// everything the shared UI needs. Drop in a new lessons array to make a new
// course with the same layout, themes, REPL, search and cheat sheet.

export function buildCourse({
  id,
  name,
  tagline,
  brandMark = "( )",
  storageKey,
  // SCI evaluation namespace for this course. Every course must have its own
  // namespace so lesson snippets / the REPL / the cheat sheet never leak vars
  // between courses (see setCourseNs in lib/sci.js). Current mapping:
  //   clojure -> "user"   webdev -> "web"   regex -> "regex"
  // Use a short, valid Clojure symbol. If omitted, a safe per-course
  // namespace is derived from the id ("course-<id>") — isolated, but the
  // REPL prompt will show that name, so prefer declaring one explicitly.
  ns,
  lessons,
  cheatsheet = [],
  // Optional extra <script> URLs to load into the SCI runtime (e.g. Scittle
  // plugins like reagent / re-frame for the web-dev course).
  runtimeScripts = [],
  // Optional Clojure code evaluated once when the runtime is ready
  // (e.g. requiring commonly-used namespaces).
  bootstrapCode = "(require '[clojure.string :as str]) (require '[clojure.set :as set])",
  // Default REPL playground contents.
  replWelcome,
}) {
  const GROUPS = lessons.reduce((acc, lesson, index) => {
    const g = lesson.group || "Lessons";
    let group = acc.find((x) => x.name === g);
    if (!group) {
      group = { name: g, items: [] };
      acc.push(group);
    }
    group.items.push({ ...lesson, index });
    return acc;
  }, []);

  const indexOfLessonId = (lid) => lessons.findIndex((l) => l.id === lid);

  return {
    id,
    name,
    tagline,
    brandMark,
    storageKey: storageKey || `parens_course_${id}`,
    // Every course gets its own SCI namespace (see the `ns` field above).
    ns: ns || `course-${id}`,
    LESSONS: lessons,
    GROUPS,
    indexOfLessonId,
    cheatsheet,
    runtimeScripts,
    bootstrapCode,
    replWelcome,
  };
}
