import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useCourse } from "../context/CourseContext";
import { CheckCircle2, Circle, TerminalSquare, BookOpen, RotateCcw, Search, BookMarked, Check, ChevronsUpDown } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

export function Sidebar({ current, view, onSelectLesson, onOpenRepl, onOpenSearch, onOpenCheatsheet, courses = [], activeCourseId, onSwitchCourse }) {
  const { progress, resetProgress } = useApp();
  const { LESSONS, GROUPS, name, tagline, brandMark } = useCourse();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const doneCount = LESSONS.filter((l) => progress[l.id]?.done).length;
  const pct = Math.round((doneCount / LESSONS.length) * 100);

  const modKey = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";

  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="brand">
        <div className="brand-mark">{brandMark}</div>
        <div className="brand-text">
          <span className="brand-name">{name}</span>
          <span className="brand-sub">{tagline}</span>
        </div>
      </div>

      {courses.length > 1 && (
        <div className="course-switcher" data-testid="course-switcher">
          <button
            className="course-switcher-btn"
            onClick={() => setSwitcherOpen((o) => !o)}
            data-testid="course-switcher-btn"
          >
            <span className="cs-eyebrow">Course</span>
            <span className="cs-current">{name}</span>
            <ChevronsUpDown size={14} className="cs-chevron" />
          </button>
          {switcherOpen && (
            <>
              <div className="cs-scrim" onClick={() => setSwitcherOpen(false)} />
              <div className="course-switcher-menu" data-testid="course-switcher-menu">
                {courses.map((c, i) => (
                  <button
                    key={c.id}
                    className={`cs-item ${c.id === activeCourseId ? "active" : ""}`}
                    onClick={() => {
                      if (c.id !== activeCourseId) onSwitchCourse(c.id);
                      setSwitcherOpen(false);
                    }}
                    data-testid={`course-option-${c.id}`}
                  >
                    <span className="cs-item-mark">{c.brandMark}</span>
                    <span className="cs-item-text">
                      <span className="cs-item-name">
                        {c.name}
                        <span className="cs-item-order">{i + 1}</span>
                      </span>
                      <span className="cs-item-sub">{c.tagline}</span>
                    </span>
                    {c.id === activeCourseId && <Check size={15} className="cs-item-check" />}
                  </button>
                ))}
                <div className="cs-hint">Complete the courses in order for the best experience.</div>
              </div>
            </>
          )}
        </div>
      )}

      <button className="search-trigger" onClick={onOpenSearch} data-testid="open-search">
        <Search size={15} />
        <span>Search lessons…</span>
        <kbd>{modKey} K</kbd>
      </button>

      <div className="progress-card" data-testid="progress-card">
        <div className="progress-row">
          <span>Your progress</span>
          <span className="progress-pct">{pct}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-bottom">
          <span className="progress-caption">
            {doneCount} of {LESSONS.length} lessons complete
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="reset-progress-btn" data-testid="reset-progress-btn" disabled={doneCount === 0 && Object.keys(progress).length === 0}>
                <RotateCcw size={11} /> Reset
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent data-testid="reset-progress-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all progress?</AlertDialogTitle>
                <AlertDialogDescription>
                  This clears every completed lesson and solved exercise from this browser. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="reset-cancel">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={resetProgress} data-testid="reset-confirm">
                  Reset everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <button
        className={`repl-link ${view === "repl" ? "active" : ""}`}
        onClick={onOpenRepl}
        data-testid="open-repl"
      >
        <TerminalSquare size={16} /> REPL Playground
      </button>

      <button
        className={`repl-link ${view === "cheatsheet" ? "active" : ""}`}
        onClick={onOpenCheatsheet}
        data-testid="open-cheatsheet"
      >
        <BookMarked size={16} /> Cheat Sheet
      </button>

      <nav className="lesson-nav">
        {GROUPS.map((group) => (
          <div className="nav-group" key={group.name}>
            <div className="nav-group-title">{group.name}</div>
            {group.items.map((item) => {
              const done = progress[item.id]?.done;
              const active = view === "lesson" && current === item.index;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${active ? "active" : ""}`}
                  onClick={() => onSelectLesson(item.index)}
                  data-testid={`nav-lesson-${item.index}`}
                >
                  {done ? (
                    <CheckCircle2 size={15} className="nav-icon done" />
                  ) : (
                    <Circle size={15} className="nav-icon" />
                  )}
                  <span className="nav-num">{item.index + 1}</span>
                  <span className="nav-title">{item.title}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <BookOpen size={13} /> Runs 100% in your browser via SCI
      </div>
    </aside>
  );
}

export default Sidebar;
