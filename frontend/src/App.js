import { useEffect, useState, useCallback } from "react";
import "@/App.css";
import { AppProvider, useApp } from "@/context/AppContext";
import { CourseProvider, useCourse } from "@/context/CourseContext";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { LessonView } from "@/components/LessonView";
import { Repl } from "@/components/Repl";
import { SearchDialog } from "@/components/SearchDialog";
import { CheatSheet } from "@/components/CheatSheet";
import { CourseComplete } from "@/components/CourseComplete";
import { COURSES, getCourseById, DEFAULT_COURSE_ID } from "@/course";
import { waitForSci, sciReady, setCourseNs } from "@/lib/sci";
import { debug } from "@/lib/log";
import { Menu, X } from "lucide-react";

function readInitialState(course, lastLocation) {
  const params = new URLSearchParams(window.location.search);
  const v = params.get("view");
  if (v === "repl") return { view: "repl", current: 0 };
  if (v === "cheatsheet") return { view: "cheatsheet", current: 0 };
  const lessonId = params.get("lesson");
  if (lessonId) {
    const idx = course.indexOfLessonId(lessonId);
    if (idx >= 0) return { view: "lesson", current: idx };
  }
  // No deep-link: resume where the learner left off, if we have it.
  if (lastLocation) {
    if (lastLocation.view === "repl") return { view: "repl", current: 0 };
    if (lastLocation.view === "cheatsheet") return { view: "cheatsheet", current: 0 };
    const idx = course.indexOfLessonId(lastLocation.lessonId);
    if (idx >= 0) return { view: "lesson", current: idx };
  }
  return { view: "lesson", current: 0 };
}

function urlFor(course, view, current) {
  const base = window.location.origin + window.location.pathname;
  if (view === "repl") return `${base}?view=repl`;
  if (view === "cheatsheet") return `${base}?view=cheatsheet`;
  return `${base}?lesson=${course.LESSONS[current].id}`;
}

function Shell({ courses, activeCourseId, onSwitchCourse }) {
  const { lastLocation, setLastLocation } = useApp();
  const course = useCourse();
  const { LESSONS } = course;
  const init = readInitialState(course, lastLocation);
  const [view, setView] = useState(init.view);
  const [current, setCurrent] = useState(init.current);
  const [ready, setReady] = useState(sciReady());
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const courseIdx = courses.findIndex((c) => c.id === activeCourseId);
  const nextCourse = courseIdx >= 0 ? courses[courseIdx + 1] : undefined;

  useEffect(() => {
    if (!ready) waitForSci().then(setReady);
  }, [ready]);

  // Once the runtime is ready, make sure the active course's namespace is
  // applied (it may not have been when the course mounted, before SCI loaded).
  useEffect(() => {
    if (ready && course) setCourseNs(course.ns);
  }, [ready, course]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the URL in sync so any view is bookmarkable / shareable.
  const pushUrl = useCallback(
    (v, c) => {
      const url = urlFor(course, v, c);
      if (url !== window.location.href) window.history.pushState({ v, c }, "", url);
    },
    [course]
  );

  useEffect(() => {
    const onPop = () => {
      const s = readInitialState(course, null);
      setView(s.view);
      setCurrent(s.current);
    };
    window.addEventListener("popstate", onPop);
    // Normalise the URL on first load.
    window.history.replaceState({ v: init.view, c: init.current }, "", urlFor(course, init.view, init.current));
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goLesson = (i) => {
    setCurrent(i);
    setView("lesson");
    setMobileNav(false);
    pushUrl("lesson", i);
    setLastLocation({ view: "lesson", lessonId: LESSONS[i].id });
    const main = document.querySelector(".main-scroll");
    if (main) main.scrollTop = 0;
  };

  const openRepl = () => {
    setView("repl");
    setMobileNav(false);
    pushUrl("repl", current);
    setLastLocation({ view: "repl", lessonId: LESSONS[current].id });
  };

  const openCheatsheet = () => {
    setView("cheatsheet");
    setMobileNav(false);
    pushUrl("cheatsheet", current);
    setLastLocation({ view: "cheatsheet", lessonId: LESSONS[current].id });
    const main = document.querySelector(".main-scroll");
    if (main) main.scrollTop = 0;
  };

  const getShareUrl = useCallback(() => urlFor(course, view, current), [course, view, current]);

  const title =
    view === "repl"
      ? "REPL Playground"
      : view === "cheatsheet"
      ? "Reference Cheat Sheet"
      : LESSONS[current].title;

  return (
    <div className="app-shell">
      <div className={`sidebar-wrap ${mobileNav ? "open" : ""}`}>
        <Sidebar
          current={current}
          view={view}
          onSelectLesson={goLesson}
          onOpenRepl={openRepl}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenCheatsheet={openCheatsheet}
          courses={courses}
          activeCourseId={activeCourseId}
          onSwitchCourse={onSwitchCourse}
        />
      </div>
      {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} />}

      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(idx) => {
          setSearchOpen(false);
          goLesson(idx);
        }}
      />

      <div className="content">
        <div className="topbar-row">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobileNav((v) => !v)}
            data-testid="mobile-menu-toggle"
          >
            {mobileNav ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Topbar title={title} getShareUrl={getShareUrl} />
        </div>

        {!ready && (
          <div className="sci-loading" data-testid="sci-loading">
            Loading the in-browser ClojureScript runtime…
          </div>
        )}

        <main className="main-scroll" data-testid="main-content">
          <div className="main-inner">
            {view === "repl" ? (
              <Repl />
            ) : view === "cheatsheet" ? (
              <CheatSheet />
            ) : (
              <LessonView index={current} onNavigate={goLesson} onSwitchCourse={onSwitchCourse} />
            )}
          </div>
        </main>
      </div>

      <CourseComplete nextCourse={nextCourse} onSwitchCourse={onSwitchCourse} />
    </div>
  );
}

const ACTIVE_COURSE_KEY = "parens_active_course_v1";

function App() {
  const [courseId, setCourseId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_COURSE_KEY) || DEFAULT_COURSE_ID;
    } catch (e) {
      debug("App: could not read active course from localStorage", e);
      return DEFAULT_COURSE_ID;
    }
  });
  const course = getCourseById(courseId);

  const switchCourse = useCallback((id) => {
    setCourseId(id);
    try {
      localStorage.setItem(ACTIVE_COURSE_KEY, id);
    } catch (e) {
      debug("App: could not persist active course to localStorage", e);
    }
    // Drop any deep-link from the previous course so the new one starts clean.
    const base = window.location.origin + window.location.pathname;
    window.history.replaceState({}, "", base);
  }, []);

  // Remounting on courseId (via key) resets lesson/view state cleanly.
  return (
    <CourseProvider course={course} key={courseId}>
      <AppProvider storageKey={course.storageKey}>
        <Shell courses={COURSES} activeCourseId={courseId} onSwitchCourse={switchCourse} />
      </AppProvider>
    </CourseProvider>
  );
}

export default App;
