import { useState, useRef, useEffect } from "react";
import { Play, Trash2, TerminalSquare, RotateCcw, Keyboard } from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { evalClojure, getCourseNs } from "../lib/sci";
import { useApp } from "../context/AppContext";
import { useCourse } from "../context/CourseContext";

const DEFAULT_WELCOME = ";; Welcome to the REPL playground.\n;; Type a Clojure expression and press Cmd/Ctrl + Enter to run it.\n(println \"Hello, Clojure!\")\n(map inc [1 2 3])";

const SHORTCUTS = [
  { keys: ["⌘/Ctrl", "Enter"], label: "Run the code" },
  { keys: ["Shift", "Enter"], label: "Run the code" },
  { keys: ["Ctrl", "Space"], label: "Trigger autocomplete" },
  { keys: ["Tab"], label: "Accept completion / indent" },
  { keys: ["⌘/Ctrl", "→"], label: "Slurp (pull next form in)" },
  { keys: ["⌘/Ctrl", "←"], label: "Barf (push last form out)" },
  { keys: ["Alt", "S"], label: "Splice (remove surrounding parens)" },
  { keys: ["⌘/Ctrl", "Z"], label: "Undo" },
];

export function Repl() {
  const { themeVars, dark, fontSize } = useApp();
  const course = useCourse();
  const WELCOME = (course && course.replWelcome) || DEFAULT_WELCOME;
  const [source, setSource] = useState(WELCOME);
  const [history, setHistory] = useState([]);
  const [showCheat, setShowCheat] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history]);

  const run = () => {
    const code = source.trim();
    if (!code) return;
    const r = evalClojure(code);
    setHistory((h) => [...h, { code, ...r }]);
    setSource("");
  };

  const clear = () => setHistory([]);

  return (
    <div className="repl" data-testid="repl">
      <div className="repl-head">
        <div className="repl-title"><TerminalSquare size={18} /> REPL Playground</div>
        <div className="repl-head-actions">
          <button className="ghost-btn" onClick={() => setShowCheat((s) => !s)} data-testid="repl-cheatsheet-toggle">
            <Keyboard size={14} /> Shortcuts
          </button>
          <button className="ghost-btn" onClick={() => setSource(WELCOME)} data-testid="repl-restore">
            <RotateCcw size={14} /> Restore default
          </button>
          <button className="ghost-btn" onClick={clear} data-testid="repl-clear">
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      {showCheat && (
        <div className="cheatsheet" data-testid="repl-cheatsheet">
          <div className="cheatsheet-title">Keyboard shortcuts</div>
          <div className="cheatsheet-grid">
            {SHORTCUTS.map((s, i) => (
              <div className="cheat-row" key={i}>
                <span className="cheat-keys">
                  {s.keys.map((k, j) => (
                    <kbd key={j}>{k}</kbd>
                  ))}
                </span>
                <span className="cheat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="repl-log" ref={scrollRef} data-testid="repl-log">
        {history.length === 0 && (
          <div className="repl-empty">Run an expression to see results here.</div>
        )}
        {history.map((h, i) => (
          <div className="repl-entry" key={i}>
            <pre className="repl-input"><span className="repl-prompt">{getCourseNs()}=&gt;</span> {h.code}</pre>
            {h.output && <pre className="out-line out-print">{h.output}</pre>}
            {h.ok ? (
              <pre className="out-line out-value">{h.value}</pre>
            ) : (
              <pre className="out-line out-error">{h.error}</pre>
            )}
          </div>
        ))}
      </div>

      <div className="repl-input-area">
        <div className="snippet-editor">
          <CodeEditor
            value={source}
            onChange={setSource}
            onRun={run}
            themeVars={themeVars}
            dark={dark}
            fontSize={fontSize}
            showLineNumbers
          />
        </div>
        <button className="run-btn repl-run" onClick={run} data-testid="repl-run">
          <Play size={14} /> Run <kbd>⌘↵</kbd>
        </button>
      </div>
    </div>
  );
}

export default Repl;
