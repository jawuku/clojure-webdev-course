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

export function AppProvider({ children, storageKey = DEFAULT_STORAGE_KEY }) {
  const initial = load(storageKey);
  const [themeKey, setThemeKey] = useState(initial.themeKey || "kanagawa");
  const [fontSize, setFontSize] = useState(initial.fontSize || 16);
  const [progress, setProgress] = useState(initial.progress || {}); // { lessonId: { done, exercises: {idx:true} } }
  const [lastLocation, setLastLocation] = useState(initial.lastLocation || null); // { view, lessonId }

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ themeKey, fontSize, progress, lastLocation })
    );
  }, [storageKey, themeKey, fontSize, progress, lastLocation]);

  useEffect(() => {
    const theme = THEMES[themeKey];
    document.documentElement.classList.toggle("dark", theme.dark);
    document.documentElement.setAttribute("data-theme", themeKey);
  }, [themeKey]);

  const toggleTheme = useCallback(
    () => setThemeKey((k) => (k === "kanagawa" ? "gruvbox" : "kanagawa")),
    []
  );

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

  const theme = THEMES[themeKey];

  // Memoize the context value so consumers don't re-render on every provider
  // render (all callbacks below are already stable via useCallback).
  const value = useMemo(
    () => ({
      themeKey,
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
