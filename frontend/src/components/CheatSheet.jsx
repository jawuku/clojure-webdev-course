import { useState, useMemo } from "react";
import { Play, Search, BookMarked } from "lucide-react";
import { evalClojure } from "../lib/sci";
import { useCourse } from "../context/CourseContext";

function CheatRow({ item }) {
  const [result, setResult] = useState(null);

  const run = () => setResult(evalClojure(item.example));

  return (
    <div className="cheat-item" data-testid="cheat-item">
      <div className="cheat-item-head">
        <code className="cheat-name">{item.name}</code>
        <span className="cheat-desc">{item.desc}</span>
      </div>
      <div className="cheat-example">
        <code className="cheat-code">{item.example}</code>
        <button className="cheat-run" onClick={run} data-testid="cheat-run" title="Run this example">
          <Play size={12} /> Run
        </button>
      </div>
      {result && (
        <div className="cheat-result" data-testid="cheat-result">
          {result.output && <span className="out-print">{result.output} </span>}
          {result.ok ? (
            <span className="out-value">
              <span className="out-arrow">=&gt;</span> {result.value}
            </span>
          ) : (
            <span className="out-error">{result.error}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function CheatSheet() {
  const { cheatsheet: CHEATSHEET } = useCourse();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CHEATSHEET;
    return CHEATSHEET.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) => it.name.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)
      ),
    })).filter((g) => g.items.length > 0);
  }, [query, CHEATSHEET]);

  return (
    <div className="cheatsheet-page" data-testid="cheatsheet-page">
      <div className="cheat-page-head">
        <div className="repl-title"><BookMarked size={18} /> Reference Cheat Sheet</div>
        <p className="cheat-page-sub">
          Every core function from the course in one place. Click <strong>Run</strong> on any example to try it instantly.
        </p>
      </div>

      <div className="cheat-filter-wrap">
        <Search size={15} />
        <input
          className="cheat-filter"
          placeholder="Filter functions… (e.g. map, atom, split)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="cheatsheet-filter"
        />
      </div>

      {groups.length === 0 && (
        <div className="cheat-empty" data-testid="cheatsheet-empty">
          No functions match “{query}”.
        </div>
      )}

      {groups.map((g) => (
        <section className="cheat-group" key={g.group}>
          <h3 className="cheat-group-title">{g.group}</h3>
          <div className="cheat-grid">
            {g.items.map((it) => (
              <CheatRow key={it.name} item={it} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default CheatSheet;
