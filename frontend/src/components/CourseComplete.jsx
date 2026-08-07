import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { useCourse } from "../context/CourseContext";
import { COURSES } from "../course";
import { Trophy, ArrowRight, X, Sparkles, PartyPopper } from "lucide-react";
import { debug } from "../lib/log";

// Read a course's saved completion from its own localStorage bucket so we can
// reason about the whole journey (not just the active course).
function courseCompletion(course) {
  try {
    const data = JSON.parse(localStorage.getItem(course.storageKey)) || {};
    const prog = data.progress || {};
    const done = course.LESSONS.filter((l) => prog[l.id]?.done).length;
    return { done, total: course.LESSONS.length };
  } catch (e) {
    debug("CourseComplete: could not read course completion", e);
    return { done: 0, total: course.LESSONS.length };
  }
}

// A small, dismissible celebration shown once when a learner completes every
// lesson in the current course. It offers a smart "what next":
//   - the recommended next course (if one follows this one), else
//   - the first still-unfinished course (so the final course sends you back to
//     anything you skipped), else
//   - a grand finale when every course in the journey is complete.
export function CourseComplete({ nextCourse, onSwitchCourse }) {
  const { progress } = useApp();
  const { id, LESSONS, name, storageKey } = useCourse();
  const [open, setOpen] = useState(false);

  const doneCount = LESSONS.filter((l) => progress[l.id]?.done).length;
  const allDone = LESSONS.length > 0 && doneCount === LESSONS.length;
  const celebratedKey = `${storageKey}__celebrated`;

  // Where should the "continue" button point?
  const firstIncomplete = COURSES.find((c) => {
    if (c.id === id) return false;
    const { done, total } = courseCompletion(c);
    return total > 0 && done < total;
  });
  const target = nextCourse || firstIncomplete;
  const allComplete = !target; // final course done AND nothing left unfinished

  useEffect(() => {
    if (allDone) {
      let already = false;
      try {
        already = localStorage.getItem(celebratedKey) === "1";
      } catch (e) {
        debug("CourseComplete: could not read celebrated flag", e);
      }
      if (!already) {
        setOpen(true);
        try {
          localStorage.setItem(celebratedKey, "1");
        } catch (e) {
          debug("CourseComplete: could not persist celebrated flag", e);
        }
      }
    } else {
      // Progress dropped below 100% (e.g. reset) — allow the celebration again.
      try {
        localStorage.removeItem(celebratedKey);
      } catch (e) {
        debug("CourseComplete: could not clear celebrated flag", e);
      }
    }
  }, [allDone, celebratedKey]);

  if (!open) return null;

  return (
    <div className="celebrate-overlay" data-testid="course-complete" role="dialog" aria-modal="true">
      <div className="celebrate-scrim" onClick={() => setOpen(false)} />
      <div className="celebrate-card">
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: allComplete ? 40 : 28 }).map((_, i) => (
            <span
              key={i}
              className={`confetti-bit c${i % 6}`}
              style={{ left: `${(i * 2.5) % 100}%`, animationDelay: `${(i % 9) * 0.11}s` }}
            />
          ))}
        </div>

        <button
          className="celebrate-close"
          onClick={() => setOpen(false)}
          data-testid="course-complete-close"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="celebrate-badge">
          {allComplete ? <PartyPopper size={30} /> : <Trophy size={30} />}
        </div>

        {allComplete ? (
          <>
            <h2 className="celebrate-title" data-testid="course-complete-title">
              You did it — the whole journey!
            </h2>
            <p className="celebrate-sub">
              You finished <strong>{name}</strong> — and every course here.
              Clojure, ClojureScript and Regex, all complete. That's real range. Bravo.
            </p>
            <button
              className="celebrate-cta"
              data-testid="course-complete-restart"
              onClick={() => {
                setOpen(false);
                if (onSwitchCourse) onSwitchCourse(COURSES[0].id);
              }}
            >
              <Sparkles size={16} /> Back to the start — revisit any course
              <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <>
            <h2 className="celebrate-title" data-testid="course-complete-title">
              Course complete!
            </h2>
            <p className="celebrate-sub">
              You finished <strong>{name}</strong> — all {LESSONS.length} lessons done. Beautiful work.
            </p>
            <button
              className="celebrate-cta"
              data-testid="course-complete-next"
              onClick={() => {
                setOpen(false);
                if (onSwitchCourse) onSwitchCourse(target.id);
              }}
            >
              <Sparkles size={16} /> {nextCourse ? "Continue to" : "Finish off"} “{target.name} — {target.tagline}”
              <ArrowRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default CourseComplete;
