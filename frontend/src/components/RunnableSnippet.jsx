import { useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { evalClojure } from "../lib/sci";
import { useApp } from "../context/AppContext";

export function RunnableSnippet({ code }) {
  const { themeVars, dark, fontSize } = useApp();
  const [source, setSource] = useState(code);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    const r = evalClojure(source);
    setResult(r);
    setRunning(false);
  };

  const reset = () => {
    setSource(code);
    setResult(null);
  };

  return (
    <div className="snippet" data-testid="runnable-snippet">
      <div className="snippet-toolbar">
        <span className="snippet-label">try it — edit &amp; run</span>
        <div className="snippet-actions">
          <button className="icon-btn" onClick={reset} title="Reset" data-testid="snippet-reset">
            <RotateCcw size={14} />
          </button>
          <button className="run-btn" onClick={run} disabled={running} data-testid="snippet-run">
            <Play size={13} /> Run
          </button>
        </div>
      </div>
      <div className="snippet-editor">
        <CodeEditor
          value={source}
          onChange={setSource}
          onRun={run}
          themeVars={themeVars}
          dark={dark}
          fontSize={fontSize}
        />
      </div>
      {result && (
        <div className="snippet-result" data-testid="snippet-result">
          {result.output && (
            <pre className="out-line out-print">{result.output}</pre>
          )}
          {result.ok ? (
            <pre className="out-line out-value">
              <span className="out-arrow">=&gt;</span> {result.value}
            </pre>
          ) : (
            <pre className="out-line out-error" data-testid="snippet-error">
              {result.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default RunnableSnippet;
