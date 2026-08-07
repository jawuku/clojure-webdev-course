import { debug } from "./log";

// Client-side scoring for the Regex Golf leaderboard. Stores each hole's
// SHORTEST passing pattern length in localStorage, and notifies listeners.
export const GOLF_SCORES_KEY = "regex_golf_scores_v1";
export const GOLF_EVENT = "regex-golf-updated";

export function getGolfScores() {
  try {
    return JSON.parse(localStorage.getItem(GOLF_SCORES_KEY)) || {};
  } catch (e) {
    debug("golf: could not read scores", e);
    return {};
  }
}

export function recordGolfScore(id, len) {
  try {
    const scores = getGolfScores();
    if (scores[id] == null || len < scores[id]) {
      scores[id] = len;
      localStorage.setItem(GOLF_SCORES_KEY, JSON.stringify(scores));
    }
    window.dispatchEvent(new CustomEvent(GOLF_EVENT));
  } catch (e) {
    debug("golf: could not record score", e);
  }
}

export function resetGolfScores() {
  try {
    localStorage.removeItem(GOLF_SCORES_KEY);
    window.dispatchEvent(new CustomEvent(GOLF_EVENT));
  } catch (e) {
    debug("golf: could not reset scores", e);
  }
}

// Count only the pattern source inside #"...", so the leaderboard measures the
// regex itself, not the Clojure wrapper. Falls back to the trimmed length.
export function patternSourceLength(code) {
  const s = (code || "").trim();
  const m = s.match(/#"([\s\S]*)"/);
  return (m ? m[1] : s).length;
}
