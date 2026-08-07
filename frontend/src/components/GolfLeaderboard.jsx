import { useEffect, useState } from "react";
import { Trophy, RotateCcw } from "lucide-react";
import { GOLF_HOLES } from "../data/regexGolf";
import { getGolfScores, resetGolfScores, GOLF_EVENT } from "../lib/golf";

// A live leaderboard of the learner's shortest passing golf solutions.
export function GolfLeaderboard() {
  const [scores, setScores] = useState(getGolfScores());

  useEffect(() => {
    const handler = () => setScores(getGolfScores());
    window.addEventListener(GOLF_EVENT, handler);
    return () => window.removeEventListener(GOLF_EVENT, handler);
  }, []);

  const medalFor = (best, par) => {
    if (best == null) return null;
    if (best <= par) return "gold";
    if (best <= par + 2) return "silver";
    return "bronze";
  };
  const solved = GOLF_HOLES.filter((h) => scores[h.id] != null).length;

  return (
    <div className="golf-board" data-testid="golf-leaderboard">
      <div className="golf-board-head">
        <span className="golf-board-title">
          <Trophy size={16} /> Golf Leaderboard
        </span>
        <span className="golf-board-solved" data-testid="golf-solved">
          {solved}/{GOLF_HOLES.length} holes solved
        </span>
      </div>

      <div className="golf-table">
        <div className="golf-tr golf-th">
          <span>Hole</span>
          <span>Par</span>
          <span>Your best</span>
          <span>Medal</span>
        </div>
        {GOLF_HOLES.map((h) => {
          const best = scores[h.id] ?? null;
          const medal = medalFor(best, h.par);
          return (
            <div className="golf-tr" data-testid={`golf-row-${h.id}`} key={h.id}>
              <span className="golf-hole">{h.name}</span>
              <span className="golf-par">{h.par}</span>
              <span className="golf-best" data-testid={`golf-best-${h.id}`}>
                {best == null ? "—" : best}
              </span>
              <span className={`golf-medal ${medal || "none"}`}>
                {medal ? medal[0].toUpperCase() + medal.slice(1) : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="golf-board-foot">
        <span className="golf-foot-hint">
          Solve the holes in the previous lesson — your shortest passing pattern is recorded here.
          Match par for gold!
        </span>
        <button
          className="ghost-btn"
          onClick={() => {
            resetGolfScores();
            setScores({});
          }}
          data-testid="golf-reset"
        >
          <RotateCcw size={13} /> Reset scores
        </button>
      </div>
    </div>
  );
}

export default GolfLeaderboard;
