import { createContext, useContext, useEffect } from "react";
import { setCourseNs } from "../lib/sci";

const CourseContext = createContext(null);

export function CourseProvider({ course, children }) {
  // Load any course-specific runtime scripts (e.g. Scittle plugins) once.
  useEffect(() => {
    if (course?.name) document.title = `${course.name} — ${course.tagline || "Course"}`;
    // Each course evaluates in its own SCI namespace (declared on the course
    // object) so lessons/REPL/cheat sheet never leak vars between courses.
    setCourseNs(course?.ns);
    (course?.runtimeScripts || []).forEach((src) => {
      if (document.querySelector(`script[data-course-runtime="${src}"]`)) return;
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.setAttribute("data-course-runtime", src);
      document.head.appendChild(s);
    });
  }, [course]);

  return <CourseContext.Provider value={course}>{children}</CourseContext.Provider>;
}

export const useCourse = () => useContext(CourseContext);
