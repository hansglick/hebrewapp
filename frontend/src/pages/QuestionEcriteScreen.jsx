import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getRandomPhrase } from "../api/content";
import { createEvaluation } from "../api/user";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import "./screens.css";

export default function QuestionEcriteScreen() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [evalMode, setEvalMode] = useState("auto"); // auto | prof (Phase 7)
  const [direction, setDirection] = useState("hebreu"); // hebreu = ->Hébreu (source français), francais = ->Français (source hébreu)
  const [revealed, setRevealed] = useState(false);

  const { current: phrase, next, back } = useRandomBrowser(
    () => getRandomPhrase(code),
    [code]
  );

  useEffect(() => {
    setRevealed(false);
  }, [phrase]);

  function handleEvaluate(success) {
    createEvaluation({
      objectType: "phrase_auto",
      objectKey: `${phrase.lesson_code}|${phrase.position}|${direction}`,
      success,
    }).then(next);
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (!back()) navigate(-1);
    },
    onSwipeRight: () => next(),
  });

  if (!phrase) return null;

  const isSourceHebrew = direction === "francais";
  const sourceText = isSourceHebrew ? phrase.hebrew : phrase.french;
  const targetText = isSourceHebrew ? phrase.french : phrase.hebrew;

  return (
    <section className="screen" {...swipeHandlers}>
      <div className="toggle-group">
        <button
          type="button"
          className={evalMode === "auto" ? "active" : ""}
          onClick={() => setEvalMode("auto")}
        >
          Auto-éval
        </button>
        <button type="button" disabled style={{ opacity: 0.5 }}>
          Prof éval (Phase 7)
        </button>
      </div>
      <div className="toggle-group">
        <button
          type="button"
          className={direction === "hebreu" ? "active" : ""}
          onClick={() => setDirection("hebreu")}
        >
          -&gt; Hébreu
        </button>
        <button
          type="button"
          className={direction === "francais" ? "active" : ""}
          onClick={() => setDirection("francais")}
        >
          -&gt; Français
        </button>
      </div>

      <p className={isSourceHebrew ? "hebrew-large" : ""}>{sourceText}</p>

      {!revealed && (
        <button type="button" className="link-btn" onClick={() => setRevealed(true)}>
          ?
        </button>
      )}

      {revealed && (
        <>
          <p className={!isSourceHebrew ? "hebrew-large" : ""}>{targetText}</p>
          <button type="button" className="link-btn" onClick={() => speak(phrase.hebrew)}>
            🔊
          </button>
          <div className="eval-actions">
            <button
              type="button"
              className="eval-btn danger"
              onClick={() => handleEvaluate(false)}
            >
              ✗
            </button>
            <button
              type="button"
              className="eval-btn success"
              onClick={() => handleEvaluate(true)}
            >
              ✓
            </button>
          </div>
        </>
      )}
    </section>
  );
}
