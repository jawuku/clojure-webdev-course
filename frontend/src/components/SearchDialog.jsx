import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "./ui/command";
import { useCourse } from "../context/CourseContext";
import { FileText } from "lucide-react";

// Build a searchable text blob for each lesson (title + summary + prose + code).
function buildIndex(LESSONS) {
  return LESSONS.map((l, index) => {
    const parts = [l.title, l.summary, l.group];
    (l.content || []).forEach((b) => {
      if (b.text) parts.push(b.text);
      if (b.code) parts.push(b.code);
      if (b.items) parts.push(b.items.join(" "));
    });
    (l.exercises || []).forEach((ex) => {
      if (ex.prompt) parts.push(ex.prompt);
    });
    const text = parts.join("  ·  ");
    return { index, id: l.id, title: l.title, group: l.group, text, lower: text.toLowerCase() };
  });
}

function makeSnippet(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const start = Math.max(0, i - 34);
  const end = Math.min(text.length, i + q.length + 46);
  return {
    pre: (start > 0 ? "… " : "") + text.slice(start, i),
    match: text.slice(i, i + q.length),
    post: text.slice(i + q.length, end) + (end < text.length ? " …" : ""),
  };
}

export function SearchDialog({ open, onOpenChange, onSelect }) {
  const { LESSONS } = useCourse();
  const index = useMemo(() => buildIndex(LESSONS), [LESSONS]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) {
      // Show all lessons as a browsable list when there's no query.
      return index.map((it) => ({ ...it, snippet: null, inTitle: false }));
    }
    return index
      .filter((it) => it.lower.includes(query))
      .map((it) => ({
        ...it,
        inTitle: it.title.toLowerCase().includes(query),
        snippet: makeSnippet(it.text, q.trim()),
      }))
      .sort((a, b) => (b.inTitle === a.inTitle ? 0 : b.inTitle ? 1 : -1))
      .slice(0, 20);
  }, [q, index]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden search-dialog" data-testid="search-dialog">
        <DialogTitle className="sr-only">Search lessons</DialogTitle>
        <DialogDescription className="sr-only">
          Search across every lesson's title, text and code examples.
        </DialogDescription>
        <Command shouldFilter={false} className="search-command">
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="Search lessons, concepts and code…"
            data-testid="search-input"
          />
          <CommandList className="search-list">
            <CommandEmpty>No lessons match “{q}”.</CommandEmpty>
            {results.map((r) => (
              <CommandItem
                key={r.id}
                value={r.id}
                onSelect={() => onSelect(r.index)}
                className="search-item"
                data-testid={`search-result-${r.index}`}
              >
                <FileText size={15} className="search-item-icon" />
                <div className="search-item-body">
                  <div className="search-item-title">
                    <span className="search-item-num">{r.index + 1}</span>
                    {r.title}
                    <span className="search-item-group">{r.group}</span>
                  </div>
                  {r.snippet && (
                    <div className="search-item-snippet">
                      {r.snippet.pre}
                      <mark>{r.snippet.match}</mark>
                      {r.snippet.post}
                    </div>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export default SearchDialog;
