import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Server } from "lucide-react";
import { startPreview } from "../lib/runtime";

// The capstone runs as a real Ring app on the local server. The iframe loads a
// server-rendered page whose buttons and forms are HTMX requests; each response
// is Hiccup rendered on the JVM. Restart starts a fresh demo.
export function LiveApp() {
  const [status, setStatus] = useState("starting");
  const [error, setError] = useState(null);
  const [generation, setGeneration] = useState(0);

  const start = useCallback(async () => {
    setStatus("starting");
    setError(null);
    const result = await startPreview();
    if (result.ok) {
      setStatus("ready");
    } else {
      setStatus("error");
      setError(result.error || "The live app could not start.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await startPreview();
      if (cancelled) return;
      if (result.ok) {
        setStatus("ready");
      } else {
        setStatus("error");
        setError(result.error || "The live app could not start.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const restart = () => {
    setGeneration((n) => n + 1);
    start();
  };

  return (
    <div className="snippet live-app" data-testid="live-app">
      <div className="snippet-toolbar">
        <span className="snippet-label">
          <Server size={12} /> live ring app — click &amp; type
        </span>
        <div className="snippet-actions">
          <button
            className="icon-btn"
            onClick={restart}
            title="Restart with fresh todos"
            data-testid="live-app-restart"
            disabled={status === "starting"}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {status === "ready" && (
        <iframe
          key={generation}
          className="live-app-frame"
          title="Live Ring to-do app"
          src="/preview/todos"
          data-testid="live-app-frame"
        />
      )}
      {status === "starting" && (
        <div className="hiccup-loading" data-testid="live-app-starting">
          Starting the local Ring app…
        </div>
      )}
      {status === "error" && (
        <div className="snippet-result" data-testid="live-app-error">
          <pre className="out-line out-error">{error}</pre>
        </div>
      )}
    </div>
  );
}

export default LiveApp;
