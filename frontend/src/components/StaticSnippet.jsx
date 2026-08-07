import { CodeEditor } from "./CodeEditor";
import { useApp } from "../context/AppContext";
import { Eye } from "lucide-react";

// A non-runnable, syntax-highlighted code sample (for preview/reference code
// that needs a real project build and can't run in the SCI sandbox).
export function StaticSnippet({ code }) {
  const { themeVars, dark, fontSize } = useApp();
  return (
    <div className="snippet static-snippet" data-testid="static-snippet">
      <div className="snippet-toolbar">
        <span className="snippet-label">example — read only</span>
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
    </div>
  );
}

export default StaticSnippet;
