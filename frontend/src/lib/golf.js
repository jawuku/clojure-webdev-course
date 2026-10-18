import { debug } from "./log";
import { readBucket, removeBucket, writeBucket } from "./store";

// Client-side scoring for the Regex Golf leaderboard. Stores each hole's
// SHORTEST passing pattern length through the app store (state.edn in the
// desktop app, localStorage in a plain browser), and notifies listeners.
export const GOLF_SCORES_KEY = "regex_golf_scores_v1";
export const GOLF_EVENT = "regex-golf-updated";

export function getGolfScores() {
  const scores = readBucket(GOLF_SCORES_KEY, {});
  return scores && typeof scores === "object" && !Array.isArray(scores) ? scores : {};
}

export function recordGolfScore(id, len) {
  try {
    const scores = getGolfScores();
    if (scores[id] == null || len < scores[id]) {
      scores[id] = len;
      writeBucket(GOLF_SCORES_KEY, scores);
    }
    window.dispatchEvent(new CustomEvent(GOLF_EVENT));
  } catch (e) {
    // Scores are a convenience; never break the exercise flow over them.
    debug("golf: could not record score", e);
  }
}

export function resetGolfScores() {
  removeBucket(GOLF_SCORES_KEY);
  window.dispatchEvent(new CustomEvent(GOLF_EVENT));
}

// Count only the pattern source inside #"...", so the leaderboard measures the
// regex itself, not the Clojure wrapper. Falls back to the trimmed length.
export function patternSourceLength(code) {
  const s = (code || "").trim();
  const m = s.match(/#"([\s\S]*)"/);
  return (m ? m[1] : s).length;
}
