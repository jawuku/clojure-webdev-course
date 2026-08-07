import { useState, useEffect, useMemo } from "react";
import { Play, RotateCcw } from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { renderReagent, reagentReady, waitForReagent } from "../lib/sci";
import { useApp } from "../context/AppContext";

// A live, editable ClojureScript snippet whose last expression is a Reagent
// component (in Hiccup form). It is mounted into a real DOM node so learners
// see the actual rendered UI update as they edit and run.
let uid = 0;

export function ReagentSnippet({ code }) {
  const { themeVars, dark, fontSize } = useApp();
  const [source, setSource] = useState(code);
  const [error, setError] = useState(null);
  const [output, setOutput] = useState("");
  const [ready, setReady] = useState(reagentReady());
  const mountId = useMemo(() => `reagent-preview-${++uid}`, []);

  useEffect(() => {
    if (!ready) waitForReagent().then(setReady);
  }, [ready]);

  const run = () => {
    const r = renderReagent(source, mountId);
    setError(r.ok ? null : r.error);
    setOutput(r.output || "");
  };

  // Render the initial example automatically once the runtime is ready.
  useEffect(() => {
    if (ready) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mountId]);

  const reset = () => {
    setSource(code);
    setError(null);
    setOutput("");
  };

  return (
    <div className="snippet reagent-snippet" data-testid="reagent-snippet">
      <div className="snippet-toolbar">
        <span className="snippet-label">live component — edit &amp; run</span>
        <div className="snippet-actions">
          <button className="icon-btn" onClick={reset} title="Reset" data-testid="reagent-reset">
            <RotateCcw size={14} />
          </button>
          <button className="run-btn" onClick={run} data-testid="reagent-run">
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
      <div className="reagent-preview-wrap" data-testid="reagent-preview-wrap">
        <span className="reagent-preview-label">live preview</span>
        {!ready && (
          <div className="reagent-loading" data-testid="reagent-loading">
            Loading the Reagent runtime…
          </div>
        )}
        <div id={mountId} className="reagent-preview" data-testid="reagent-preview" />
        {output && <pre className="out-line out-print">{output}</pre>}
        {error && (
          <pre className="out-line out-error" data-testid="reagent-error">
            {error}
          </pre>
        )}
      </div>
    </div>
  );
}

export default ReagentSnippet;
