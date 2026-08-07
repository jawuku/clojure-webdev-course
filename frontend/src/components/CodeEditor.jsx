import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { autocompletion, completeFromList, closeBrackets } from "@codemirror/autocomplete";
import { default_extensions, complete_keymap } from "@nextjournal/clojure-mode";

const CLOJURE_CORE = [
  "def", "defn", "defn-", "defmacro", "fn", "let", "letfn", "if", "if-not", "when",
  "when-not", "when-let", "if-let", "cond", "condp", "case", "do", "loop", "recur",
  "for", "doseq", "dotimes", "while", "and", "or", "not", "map", "mapv", "filter",
  "remove", "reduce", "reductions", "apply", "partial", "comp", "juxt", "identity",
  "constantly", "complement", "first", "second", "last", "rest", "next", "nth",
  "count", "conj", "cons", "into", "concat", "take", "drop", "take-while",
  "drop-while", "distinct", "sort", "sort-by", "group-by", "frequencies",
  "reverse", "range", "repeat", "repeatedly", "iterate", "interleave", "interpose",
  "partition", "flatten", "assoc", "dissoc", "get", "get-in", "assoc-in",
  "update", "update-in", "keys", "vals", "select-keys", "merge", "merge-with",
  "contains?", "find", "zipmap", "vector", "vec", "list", "hash-map", "hash-set",
  "set", "sorted-set", "sorted-map", "str", "subs", "join", "split", "replace",
  "upper-case", "lower-case", "trim", "blank?", "starts-with?", "ends-with?",
  "includes?", "name", "keyword", "symbol", "number?", "string?", "keyword?",
  "map?", "vector?", "seq?", "coll?", "nil?", "some?", "true?", "false?",
  "empty?", "seq", "even?", "odd?", "pos?", "neg?", "zero?", "inc", "dec",
  "max", "min", "abs", "quot", "rem", "mod", "println", "print", "prn", "pr",
  "pr-str", "print-str", "format", "atom", "deref", "swap!", "reset!", "swap-vals!",
  "some", "every?", "not-any?", "not-every?", "keep", "mapcat", "->", "->>",
  "as->", "cond->", "cond->>", "some->", "some->>", "doto", "when-first",
].map((label) => ({ label, type: "keyword" }));

function clojureCompletions(context) {
  const word = context.matchBefore(/[\w\-!?<>=*+.'\/]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return completeFromList(CLOJURE_CORE)(context);
}

function highlightStyleFor(vars) {
  return HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: vars.purple },
    { tag: [t.definitionKeyword, t.operatorKeyword], color: vars.red },
    { tag: [t.atom, t.bool, t.null], color: vars.orange },
    { tag: [t.literal], color: vars.aqua },
    { tag: [t.string, t.special(t.string)], color: vars.green },
    { tag: [t.number], color: vars.aqua },
    { tag: [t.comment, t.lineComment, t.blockComment], color: vars.gray, fontStyle: "italic" },
    { tag: [t.variableName, t.name], color: vars.fg },
    { tag: [t.definition(t.variableName), t.macroName], color: vars.blue },
    { tag: [t.function(t.variableName), t.function(t.name)], color: vars.blue },
    { tag: [t.propertyName, t.labelName], color: vars.yellow },
    { tag: [t.operator, t.punctuation, t.separator], color: vars.gray },
    { tag: [t.bracket, t.paren, t.brace, t.squareBracket], color: vars.gray },
    { tag: [t.meta], color: vars.orange },
  ]);
}

function editorTheme(vars, fontSize, dark) {
  return EditorView.theme(
    {
      "&": {
        color: vars.fg,
        backgroundColor: vars.bg,
        fontSize: `${fontSize}px`,
        borderRadius: "10px",
      },
      ".cm-content": {
        fontFamily: "'JetBrains Mono', monospace",
        caretColor: vars.blue,
        padding: "12px 0",
      },
      ".cm-scroller": { fontFamily: "'JetBrains Mono', monospace", lineHeight: "1.6" },
      "&.cm-focused": { outline: "none" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: vars.blue },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: vars.selection,
      },
      ".cm-gutters": {
        backgroundColor: vars.bg,
        color: vars.gray,
        border: "none",
        opacity: 0.7,
      },
      ".cm-activeLine": { backgroundColor: vars.activeLine },
      ".cm-activeLineGutter": { backgroundColor: vars.activeLine },
      ".cm-tooltip": {
        backgroundColor: vars.tooltipBg,
        color: vars.fg,
        border: `1px solid ${vars.selection}`,
        borderRadius: "8px",
      },
      ".cm-tooltip-autocomplete ul li[aria-selected]": {
        backgroundColor: vars.blue,
        color: vars.bg,
      },
      ".cm-matchingBracket, .cm-nonmatchingBracket": {
        backgroundColor: vars.selection,
        outline: `1px solid ${vars.orange}`,
      },
    },
    { dark }
  );
}

export function CodeEditor({ value, onChange, onRun, themeVars, dark, fontSize = 15, editable = true, showLineNumbers = false }) {
  const parentRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  onChangeRef.current = onChange;
  onRunRef.current = onRun;

  useEffect(() => {
    if (!parentRef.current) return;

    const runKeymap = keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          if (onRunRef.current) onRunRef.current();
          return true;
        },
      },
      {
        key: "Shift-Enter",
        run: () => {
          if (onRunRef.current) onRunRef.current();
          return true;
        },
      },
    ]);

    const extensions = [
      runKeymap,
      ...default_extensions,
      keymap.of(complete_keymap),
      history(),
      closeBrackets(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      autocompletion({ override: [clojureCompletions], activateOnTyping: true }),
      syntaxHighlighting(highlightStyleFor(themeVars)),
      editorTheme(themeVars, fontSize, dark),
      highlightActiveLine(),
      EditorView.lineWrapping,
      EditorState.readOnly.of(!editable),
      EditorView.editable.of(editable),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && onChangeRef.current) {
          onChangeRef.current(u.state.doc.toString());
        }
      }),
    ];
    if (showLineNumbers) extensions.push(lineNumbers());

    const state = EditorState.create({ doc: value || "", extensions });
    const view = new EditorView({ state, parent: parentRef.current });
    viewRef.current = view;

    return () => view.destroy();
    // Recreate editor when theme / size / mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, fontSize, editable, showLineNumbers, JSON.stringify(themeVars)]);

  // Sync external value changes (e.g. "reset" / "show solution") into the editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== undefined && value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value || "" } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <div ref={parentRef} className="cm-host" />;
}

export default CodeEditor;
