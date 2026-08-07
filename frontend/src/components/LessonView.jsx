import { RunnableSnippet } from "./RunnableSnippet";
import { StaticSnippet } from "./StaticSnippet";
import { ReagentSnippet } from "./ReagentSnippet";
import { Exercise } from "./Exercise";
import { GolfLeaderboard } from "./GolfLeaderboard";
import { useApp } from "../context/AppContext";
import { useCourse } from "../context/CourseContext";
import { ChevronLeft, ChevronRight, CheckCircle2, Dumbbell, Info, ArrowRight } from "lucide-react";

function Block({ block, onSwitchCourse }) {
  switch (block.t) {
    case "h":
      return <h3 className="lesson-h">{block.text}</h3>;
    case "note":
      return (
        <div className="lesson-note">
          <Info size={16} />
          <span>{block.text}</span>
        </div>
      );
    case "cta":
      return (
        <div className="lesson-cta" data-testid="lesson-cta">
          {block.text && <p className="lesson-cta-text">{block.text}</p>}
          <button
            className="lesson-cta-btn"
            data-testid="lesson-cta-btn"
            onClick={() => onSwitchCourse && onSwitchCourse(block.courseId)}
          >
            {block.label || "Start the next course"} <ArrowRight size={16} />
          </button>
        </div>
      );
    case "code":
      return <RunnableSnippet code={block.code} />;
    case "read":
      return <StaticSnippet code={block.code} />;
    case "reagent":
      return <ReagentSnippet code={block.code} />;
    case "golf-board":
      return <GolfLeaderboard />;
    case "list":
      return (
        <ul className="lesson-list">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case "p":
    default:
      return <p className="lesson-p">{block.text}</p>;
  }
}

export function LessonView({ index, onNavigate, onSwitchCourse }) {
  const { progress, markLessonDone } = useApp();
  const { LESSONS } = useCourse();
  const lesson = LESSONS[index];
  const prog = progress[lesson.id] || { done: false, exercises: {} };
  const totalEx = lesson.exercises?.length || 0;
  const doneEx = Object.keys(prog.exercises || {}).length;

  return (
    <article className="lesson" data-testid="lesson-view" key={lesson.id}>
      <div className="lesson-meta">
        <span className="lesson-kicker">
          {lesson.group} · Lesson {index + 1} of {LESSONS.length}
        </span>
        {prog.done && (
          <span className="lesson-done-badge" data-testid="lesson-done-badge">
            <CheckCircle2 size={14} /> Completed
          </span>
        )}
      </div>
      <h1 className="lesson-title">{lesson.title}</h1>
      <p className="lesson-summary">{lesson.summary}</p>

      <div className="lesson-body">
        {lesson.content.map((b, i) => (
          <Block key={i} block={b} onSwitchCourse={onSwitchCourse} />
        ))}
      </div>

      {totalEx > 0 && (
        <section className="exercises" data-testid="exercises-section">
          <div className="exercises-head">
            <Dumbbell size={18} />
            <h2>Practice</h2>
            <span className="exercises-count">
              {doneEx}/{totalEx} solved
            </span>
          </div>
          {lesson.exercises.map((ex, i) => (
            <Exercise key={i} lessonId={lesson.id} index={i} exercise={ex} />
          ))}
        </section>
      )}

      <div className="lesson-footer">
        <button
          className="ghost-btn"
          disabled={index === 0}
          onClick={() => onNavigate(index - 1)}
          data-testid="prev-lesson"
        >
          <ChevronLeft size={16} /> Previous
        </button>

        <button
          className={`complete-btn ${prog.done ? "is-done" : ""}`}
          onClick={() => markLessonDone(lesson.id, !prog.done)}
          data-testid="mark-complete"
        >
          <CheckCircle2 size={16} />
          {prog.done ? "Completed" : "Mark complete"}
        </button>

        <button
          className="ghost-btn"
          disabled={index === LESSONS.length - 1}
          onClick={() => onNavigate(index + 1)}
          data-testid="next-lesson"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </article>
  );
}

export default LessonView;
