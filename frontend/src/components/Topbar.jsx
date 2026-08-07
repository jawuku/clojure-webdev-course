import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Sun, Moon, Type, Minus, Plus, Share2, Check } from "lucide-react";

export function Topbar({ title, getShareUrl }) {
  const { theme, toggleTheme, fontSize, changeFont } = useApp();
  const isDark = theme.dark;
  const [copied, setCopied] = useState(false);

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

  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-title" data-testid="topbar-title">
        {title}
      </div>

      <div className="topbar-controls">
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

        <button className="theme-toggle" onClick={toggleTheme} data-testid="theme-toggle">
          {isDark ? <Moon size={15} /> : <Sun size={15} />}
          <span>{theme.name}</span>
        </button>
      </div>
    </header>
  );
}

export default Topbar;
