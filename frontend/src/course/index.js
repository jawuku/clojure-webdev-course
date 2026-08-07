import { clojureCourse } from "./clojureCourse";
import { webCourse } from "./webCourse";
import { regexCourse } from "./regexCourse";

// All courses hosted by the same UI. Recommended path: Clojure first, then Web
// Development with ClojureScript. The Regex course is a standalone extra.
export const COURSES = [clojureCourse, webCourse, regexCourse];

export const DEFAULT_COURSE_ID = "clojure";

export function getCourseById(id) {
  return COURSES.find((c) => c.id === id) || clojureCourse;
}
