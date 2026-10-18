import { useMemo, useState } from "react";
import { Eye, Play, RotateCcw } from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { renderHiccup } from "../lib/runtime";
import { useApp } from "../context/AppContext";

// A Hiccup example with a real preview: the source runs on the JVM and the
// returned form is rendered by hiccup.core/html, then shown in a sandboxed
// iframe. No scripts run inside the preview.
function documentFor(html, { bg, fg, muted, border, accent }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { color-scheme: light dark; }
    body { margin: 0; padding: 14px 16px; background: ${bg}; color: ${fg};
           font: 15px/1.55 "IBM Plex Sans", system-ui, sans-serif; }
    h1, h2, h3 { margin: 0 0 8px; line-height: 1.25; color: ${fg}; }
    h1 { font-size: 24px; } h2 { font-size: 20px; } h3 { font-size: 17px; }
    p { margin: 6px 0; }
    ul, ol { margin: 6px 0; padding-left: 20px; }
    li { margin: 3px 0; }
    a { color: ${accent}; }
    table { border-collapse: collapse; }
    td, th { padding: 4px 12px; border: 1px solid ${border}; text-align: left; }
    .card, [class*="card"] { border: 1px solid ${border}; border-radius: 10px; padding: 12px; }
    small, .muted { color: ${muted}; }
    button { font: inherit; padding: 6px 12px; margin: 2px 4px 2px 0; border-radius: 8px;
             border: 1px solid ${border}; background: ${accent}; color: ${bg}; font-weight: 600; }
    input, select, textarea { font: inherit; padding: 6px 9px; border-radius: 8px;
             border: 1px solid ${border}; background: ${bg}; color: ${fg}; }
  </style></head><body>${html}</body></html>`;
}

export function HiccupSnippet({ code }) {
  const { themeVars, dark, fontSize } = useApp();
  const [source, setSource] = useState(code);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const doc = useMemo(() => {
    if (!result || !result.ok) return "";
    return documentFor(result.html, {
      bg: themeVars.bg,
      fg: themeVars.fg,
      muted: themeVars.gray,
      border: dark ? "#3b3831" : "#d9d3c4",
      accent: themeVars.blue,
    });
  }, [result, themeVars, dark]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      setResult(await renderHiccup(source));
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setSource(code);
    setResult(null);
  };

  return (
    <div className="snippet hiccup-snippet" data-testid="hiccup-snippet">
      <div className="snippet-toolbar">
        <span className="snippet-label">hiccup — edit &amp; render</span>
        <div className="snippet-actions">
          <button className="icon-btn" onClick={reset} title="Reset" data-testid="hiccup-reset">
            <RotateCcw size={14} />
          </button>
          <button className="run-btn" onClick={run} disabled={running} data-testid="hiccup-run">
            <Play size={13} /> {running ? "Rendering…" : "Run"}
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

      {result && result.ok && (
        <div className="hiccup-preview-wrap" data-testid="hiccup-preview">
          <span className="hiccup-preview-label">
            <Eye size={12} /> rendered by hiccup.core/html
          </span>
          <iframe
            className="hiccup-frame"
            title="Hiccup preview"
            sandbox=""
            srcDoc={doc}
            data-testid="hiccup-frame"
          />
          <details className="hiccup-source">
            <summary>HTML output</summary>
            <pre>{result.html}</pre>
          </details>
        </div>
      )}

      {result && !result.ok && (
        <div className="snippet-result" data-testid="hiccup-error">
          <pre className="out-line out-error">{result.error}</pre>
        </div>
      )}
    </div>
  );
}

export default HiccupSnippet;
