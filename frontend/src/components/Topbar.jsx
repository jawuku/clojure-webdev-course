import { useState } from "react";
import { useApp } from "../context/AppContext";
import { resetRuntime } from "../lib/runtime";
import { Sun, Moon, Type, Minus, Plus, Share2, Check, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

export function Topbar({ title, getShareUrl }) {
  const { theme, toggleTheme, fontSize, changeFont } = useApp();
  const [copied, setCopied] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState(null);

  // The toggle flips to (and pins) the *other* theme, so label it with the
  // target theme — the effective one is already visible in the UI.
  const target = theme.dark ? "Gruvbox" : "Kanagawa";

  const share = async () => {
    const url = getShareUrl ? getShareUrl() : window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // A fresh worker JVM: the server keeps serving, but REPL definitions and any
  // atoms the learner created are gone. Lesson progress is untouched.
  const restartRuntime = async () => {
    setRestarting(true);
    const result = await resetRuntime();
    setRestarting(false);
    setRuntimeStatus(result.ok ? "Runtime restarted" : result.error);
    setTimeout(() => setRuntimeStatus(null), 5000);
  };

  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-title" data-testid="topbar-title">
        {title}
      </div>

      <div className="topbar-controls">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="icon-btn"
              data-testid="reset-runtime-btn"
              title="Restart the evaluation runtime"
              disabled={restarting}
            >
              <RotateCcw size={14} />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent data-testid="reset-runtime-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Restart the runtime?</AlertDialogTitle>
              <AlertDialogDescription>
                This starts a fresh JVM evaluator. Definitions you made in the REPL and
                anything they hold are cleared; your lesson progress is kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="reset-runtime-cancel">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={restartRuntime} data-testid="reset-runtime-confirm">
                Restart runtime
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {runtimeStatus && (
          <span className="runtime-status" role="status" data-testid="runtime-status">
            {runtimeStatus}
          </span>
        )}

        <button
          className={`share-btn ${copied ? "copied" : ""}`}
          onClick={share}
          data-testid="share-btn"
          title="Copy a shareable link"
        >
          {copied ? <Check size={15} /> : <Share2 size={14} />}
          <span>{copied ? "Link copied!" : "Share"}</span>
        </button>

        <div className="font-control" data-testid="font-control">
          <Type size={14} />
          <button className="icon-btn" onClick={() => changeFont(-1)} data-testid="font-decrease" title="Smaller text">
            <Minus size={14} />
          </button>
          <span className="font-size-val">{fontSize}</span>
          <button className="icon-btn" onClick={() => changeFont(1)} data-testid="font-increase" title="Larger text">
            <Plus size={14} />
          </button>
        </div>

        <button className="theme-toggle" onClick={toggleTheme} data-testid="theme-toggle" title={`Switch to ${target} theme`}>
          {theme.dark ? <Sun size={15} /> : <Moon size={15} />}
          <span>{target}</span>
        </button>
      </div>
    </header>
  );
}

export default Topbar;
