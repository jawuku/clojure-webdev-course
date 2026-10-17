import { createContext, useContext, useEffect } from "react";
import { setCourseNs } from "../lib/runtime";

const CourseContext = createContext(null);

export function CourseProvider({ course, children }) {
  useEffect(() => {
    if (course?.name) document.title = `${course.name} — ${course.tagline || "Course"}`;
    // Each course evaluates in its own namespace (declared on the course
    // object) so lessons/REPL/cheat sheet never leak vars between courses.
    setCourseNs(course?.ns);
  }, [course]);

  return <CourseContext.Provider value={course}>{children}</CourseContext.Provider>;
}

export const useCourse = () => useContext(CourseContext);
