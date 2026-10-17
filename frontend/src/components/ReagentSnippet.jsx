import { CodeEditor } from "./CodeEditor";
import { useApp } from "../context/AppContext";
import { Eye } from "lucide-react";

// Reagent was rendered by Scittle in the browser. That runtime is gone: the app
// now evaluates Clojure on a local JVM, where Reagent/ClojureScript needs a
// ClojureScript compiler and a browser preview host. Until that lands (Phase 4
// of the JVM migration), component snippets stay visible and read-only instead
// of failing at click time.
export function ReagentSnippet({ code }) {
  const { themeVars, dark, fontSize } = useApp();

  return (
    <div className="snippet reagent-snippet" data-testid="reagent-snippet">
      <div className="snippet-toolbar">
        <span className="snippet-label">component example — read only</span>
        <span className="static-badge"><Eye size={13} /> preview</span>
      </div>
      <div className="snippet-editor">
        <CodeEditor
          value={code}
          themeVars={themeVars}
          dark={dark}
          fontSize={fontSize}
          editable={false}
        />
      </div>
      <div className="reagent-preview-wrap" data-testid="reagent-preview-wrap">
        <span className="reagent-preview-label">live preview</span>
        <div className="reagent-loading" data-testid="reagent-coming-soon">
          Component previews return with the JVM UI runtime. This example is
          shown read-only so the lesson still reads in order.
        </div>
      </div>
    </div>
  );
}

export default ReagentSnippet;
