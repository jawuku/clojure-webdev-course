import { useState } from "react";
import { Play, CheckCircle2, XCircle, Eye, RotateCcw, Lightbulb } from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { evalClojure, runExerciseTests } from "../lib/sci";
import { recordGolfScore, patternSourceLength } from "../lib/golf";
import { useApp } from "../context/AppContext";

export function Exercise({ lessonId, index, exercise }) {
  const { themeVars, dark, fontSize, markExercise, progress } = useApp();
  const [source, setSource] = useState(exercise.starter || "");
  const [output, setOutput] = useState(null);
  const [check, setCheck] = useState(null);
  const [showHint, setShowHint] = useState(false);

  const alreadyDone = !!progress?.[lessonId]?.exercises?.[index];

  const run = () => {
    const r = evalClojure(source);
    setOutput(r);
    setCheck(null);
  };

  const submit = () => {
    const res = runExerciseTests(source, exercise.tests);
    setCheck(res);
    setOutput(null);
    if (res.passed) {
      markExercise(lessonId, index);
      if (exercise.golf) recordGolfScore(exercise.golf.id, patternSourceLength(source));
    }
  };

  const reset = () => {
    setSource(exercise.starter || "");
    setOutput(null);
    setCheck(null);
  };

  const showSolution = () => {
    setSource(exercise.solution);
    setCheck(null);
    setOutput(null);
  };

  return (
    <div className="exercise" data-testid={`exercise-${index}`}>
      <div className="exercise-head">
        <div className="exercise-num">Exercise {index + 1}</div>
        {(alreadyDone || check?.passed) && (
          <div className="exercise-solved" data-testid={`exercise-solved-${index}`}>
            <CheckCircle2 size={15} /> Solved
          </div>
        )}
      </div>
      <p className="exercise-prompt">{exercise.prompt}</p>

      <div className="snippet-editor exercise-editor">
        <CodeEditor
          value={source}
          onChange={setSource}
          onRun={submit}
          themeVars={themeVars}
          dark={dark}
          fontSize={fontSize}
        />
      </div>

      <div className="exercise-actions">
        <button className="run-btn" onClick={submit} data-testid={`exercise-check-${index}`}>
          <CheckCircle2 size={14} /> Check answer
        </button>
        <button className="ghost-btn" onClick={run} data-testid={`exercise-run-${index}`}>
          <Play size={13} /> Run
        </button>
        <button className="ghost-btn" onClick={reset}>
          <RotateCcw size={13} /> Reset
        </button>
        {exercise.hint && (
          <button className="ghost-btn" onClick={() => setShowHint((s) => !s)} data-testid={`exercise-hint-${index}`}>
            <Lightbulb size={13} /> Hint
          </button>
        )}
        <button className="ghost-btn" onClick={showSolution} data-testid={`exercise-solution-${index}`}>
          <Eye size={13} /> Solution
        </button>
      </div>

      {showHint && exercise.hint && (
        <div className="exercise-hint" data-testid={`exercise-hint-text-${index}`}>
          <Lightbulb size={14} /> {exercise.hint}
        </div>
      )}

      {output && (
        <div className="snippet-result">
          {output.output && <pre className="out-line out-print">{output.output}</pre>}
          {output.ok ? (
            <pre className="out-line out-value"><span className="out-arrow">=&gt;</span> {output.value}</pre>
          ) : (
            <pre className="out-line out-error">{output.error}</pre>
          )}
        </div>
      )}

      {check && (
        <div className="check-result" data-testid={`exercise-result-${index}`}>
          {check.runError ? (
            <div className="check-banner fail">
              <XCircle size={16} /> Your code didn't run: {check.runError}
            </div>
          ) : (
            <>
              <div className={`check-banner ${check.passed ? "pass" : "fail"}`}>
                {check.passed ? (
                  <><CheckCircle2 size={16} /> Nice! All checks passed.</>
                ) : (
                  <><XCircle size={16} /> Not quite — {check.results.filter((r) => r.ok).length}/{check.results.length} checks passed.</>
                )}
              </div>
              <ul className="check-list">
                {check.results.map((r, i) => (
                  <li key={i} className={r.ok ? "ok" : "no"}>
                    {r.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    <code>{r.test}</code>
                    {!r.ok && <span className="check-detail">{r.detail}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default Exercise;
