import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { debug } from "../lib/log";

const DEFAULT_STORAGE_KEY = "parens_app_v1";

// Editor syntax colors per theme (also used for CodeMirror highlighting).
export const THEMES = {
  kanagawa: {
    name: "Kanagawa",
    dark: true,
    editor: {
      bg: "#1f1f28",
      fg: "#dcd7ba",
      gray: "#727169",
      red: "#ff5d62",
      green: "#98bb6c",
      yellow: "#e6c384",
      blue: "#7e9cd8",
      purple: "#957fb8",
      aqua: "#7aa89f",
      orange: "#ffa066",
      selection: "#2d4f67",
      activeLine: "#232331",
      tooltipBg: "#16161d",
    },
  },
  gruvbox: {
    name: "Gruvbox",
    dark: false,
    editor: {
      bg: "#fbf1c7",
      fg: "#3c3836",
      gray: "#928374",
      red: "#9d0006",
      green: "#79740e",
      yellow: "#b57614",
      blue: "#076678",
      purple: "#8f3f71",
      aqua: "#427b58",
      orange: "#af3a03",
      selection: "#ebdbb2",
      activeLine: "#f2e5bc",
      tooltipBg: "#f9f5d7",
    },
  },
};

const AppContext = createContext(null);

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch (e) {
    debug("AppContext: could not read localStorage", e);
    return {};
  }
}

// Resolve the OS light/dark preference (guarded for non-browser environments).
function systemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function AppProvider({ children, storageKey = DEFAULT_STORAGE_KEY }) {
  const initial = load(storageKey);
  // themeKey is the *pinned* user choice, or null to follow the OS theme.
  const [themeKey, setThemeKey] = useState(initial.themeKey ?? null);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const [fontSize, setFontSize] = useState(initial.fontSize || 16);
  const [progress, setProgress] = useState(initial.progress || {}); // { lessonId: { done, exercises: {idx:true} } }
  const [lastLocation, setLastLocation] = useState(initial.lastLocation || null); // { view, lessonId }

  // Live-follow OS light/dark changes (e.g. macOS auto-switching at sunset)
  // until the learner pins a theme explicitly.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // The theme actually in effect: pinned choice if any, else the OS preference.
  const effectiveThemeKey = themeKey ?? (systemDark ? "kanagawa" : "gruvbox");

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ themeKey, fontSize, progress, lastLocation })
    );
  }, [storageKey, themeKey, fontSize, progress, lastLocation]);

  useEffect(() => {
    const theme = THEMES[effectiveThemeKey];
    document.documentElement.classList.toggle("dark", theme.dark);
    document.documentElement.setAttribute("data-theme", effectiveThemeKey);
  }, [effectiveThemeKey]);

  // Toggle flips the *effective* theme and pins it, so the choice persists and
  // the app stops following OS changes until the learner picks "system" again.
  const toggleTheme = useCallback(() => {
    setThemeKey((k) => {
      const current = k ?? (systemDark ? "kanagawa" : "gruvbox");
      return current === "kanagawa" ? "gruvbox" : "kanagawa";
    });
  }, [systemDark]);

  const changeFont = useCallback((delta) => {
    setFontSize((s) => Math.min(24, Math.max(13, s + delta)));
  }, []);

  const markExercise = useCallback((lessonId, idx) => {
    setProgress((p) => {
      const l = p[lessonId] || { done: false, exercises: {} };
      return {
        ...p,
        [lessonId]: { ...l, exercises: { ...l.exercises, [idx]: true } },
      };
    });
  }, []);

  const markLessonDone = useCallback((lessonId, done = true) => {
    setProgress((p) => {
      const l = p[lessonId] || { done: false, exercises: {} };
      return { ...p, [lessonId]: { ...l, done } };
    });
  }, []);

  const resetProgress = useCallback(() => setProgress({}), []);

  const theme = THEMES[effectiveThemeKey];

  // Memoize the context value so consumers don't re-render on every provider
  // render (all callbacks below are already stable via useCallback).
  const value = useMemo(
    () => ({
      themeKey,
      effectiveThemeKey,
      theme,
      themeVars: theme.editor,
      dark: theme.dark,
      toggleTheme,
      setThemeKey,
      fontSize,
      changeFont,
      progress,
      markExercise,
      markLessonDone,
      resetProgress,
      lastLocation,
      setLastLocation,
    }),
    [
      themeKey,
      effectiveThemeKey,
      theme,
      fontSize,
      progress,
      lastLocation,
      toggleTheme,
      setThemeKey,
      changeFont,
      markExercise,
      markLessonDone,
      resetProgress,
      setLastLocation,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
