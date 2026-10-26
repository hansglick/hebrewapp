import { useCallback, useEffect, useRef, useState } from "react";
import TeacherSpeech from "./TeacherSpeech";

// Ce que voit l'élève pendant la tâche « Lecture » (repris du prototype
// livecoach) : la dernière prise de parole du prof, le texte à lire, puis le
// verdict.
export default function ReadingBoard({ teacher, passage, verdict, notice }) {
  const bodyRef = useRef(null);

  const scrollToEnd = useCallback(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, []);

  useEffect(scrollToEnd, [passage, verdict, scrollToEnd]);

  if (!teacher && !passage && !verdict && !notice) return null;

  return (
    <div className="card ra-board" ref={bodyRef}>
      {notice && <p className="ra-alert">{notice}</p>}
      {teacher && <TeacherSpeech key={teacher.id} line={teacher} />}
      {passage && <PassageCard passage={passage} onGrow={scrollToEnd} />}
      {verdict && <VerdictCard verdict={verdict} />}
    </div>
  );
}

// --- Texte à lire -------------------------------------------------------------

const CHAR_DELAY_MS = 45;

// Affiche les phrases caractère par caractère, une phrase par ligne.
function PassageCard({ passage, onGrow }) {
  const { lesson, hebrew, french } = passage;
  const total = hebrew.reduce((n, s) => n + s.length, 0);
  const [shown, setShown] = useState(0);
  const [showFrench, setShowFrench] = useState(false);
  const done = shown >= total;

  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => setShown((n) => n + 1), CHAR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [shown, done]);

  useEffect(onGrow, [shown, showFrench, onGrow]);

  // Caractères déjà affichés avant chaque phrase.
  const offsets = hebrew.map((_, i) => hebrew.slice(0, i).reduce((n, s) => n + s.length, 0));
  const visible = hebrew.map((sentence, i) => sentence.slice(0, Math.max(0, shown - offsets[i])));
  const typingLine = done ? -1 : visible.findIndex((part, i) => part.length < hebrew[i].length);

  return (
    <div className="ra-panel">
      <div className="ra-panel-head">
        <span className="ra-label">Texte à lire</span>
        <span className="muted">
          leçon {lesson} · {hebrew.length} phrase{hebrew.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="ra-passage" dir="rtl" lang="he" aria-label={hebrew.join(" ")}>
        {visible.map((part, i) =>
          part || i === typingLine ? (
            <p key={i}>
              {part}
              {i === typingLine && <span className="ra-caret" aria-hidden="true" />}
            </p>
          ) : null,
        )}
      </div>
      {done && (
        <div className="ra-passage-foot">
          <button type="button" className="ra-ghost" onClick={() => setShowFrench((v) => !v)}>
            {showFrench ? "Masquer la traduction" : "Afficher la traduction"}
          </button>
          {showFrench && (
            <div className="ra-passage-french">
              {french.map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Verdict ------------------------------------------------------------------

const KIND_LABEL = {
  mot_remplace: "mot remplacé",
  mot_saute: "mot sauté",
  mot_ajoute: "mot ajouté",
  hesitation: "hésitation",
  consonne: "consonne",
  voyelle: "voyelle",
};
const SEVERE = ["mot_remplace", "mot_saute"];

// Compare les mots sans ponctuation ni voyelles (nikud).
const normalize = (word) => word.replace(/[֑-ׇ]/g, "").replace(/[^א-ת]/g, "");

// Carte exhaustive : texte attendu, verbatim de l'extracteur, erreurs relevées par l'évaluateur (sans note pour l'instant).
function VerdictCard({ verdict }) {
  const kindOf = new Map();
  for (const r of verdict.remarks) {
    const key = normalize(r.word);
    if (key) kindOf.set(key, r.kinds[0]);
  }

  return (
    <div className="ra-panel">
      <div className="ra-panel-head">
        <span className="ra-label">Évaluation de la lecture</span>
      </div>

      <div>
        <h3 className="ra-block-title">Phrases à lire</h3>
        <div className="ra-verdict-passage" dir="rtl" lang="he">
          {verdict.passage.map((line, i) => (
            <p key={i}>
              {line.split(" ").map((word, j) => {
                const kind = kindOf.get(normalize(word));
                return (
                  <span key={j}>
                    {j > 0 && " "}
                    {kind ? (
                      <mark className={`ra-mistake ${SEVERE.includes(kind) ? "ra-mistake-severe" : ""}`} title={KIND_LABEL[kind]}>
                        {word}
                      </mark>
                    ) : (
                      word
                    )}
                  </span>
                );
              })}
            </p>
          ))}
        </div>
      </div>

      <div>
        <h3 className="ra-block-title">Verbatim de la lecture (extracteur)</h3>
        <audio className="ra-audio" controls preload="auto" src={verdict.audio} />
        <p className="ra-mono">{verdict.verbatim || "(rien d’audible)"}</p>
      </div>

      <div>
        <h3 className="ra-block-title">
          {verdict.remarks.length > 0 ? `Erreurs de prononciation (${verdict.remarks.length})` : "Aucune erreur relevée"}
        </h3>
        {verdict.remarks.length > 0 && (
          <ul className="ra-remarks">
            {verdict.remarks.map((r, i) => (
              <li key={i}>
                <div className="ra-remark-head">
                  {r.word && (
                    <span className="ra-word" dir="rtl" lang="he">
                      {r.word_niqqud || r.word}
                    </span>
                  )}
                  {r.kinds.map((kind) => (
                    <span key={kind} className={`ra-kind ${SEVERE.includes(kind) ? "ra-kind-severe" : ""}`}>
                      {KIND_LABEL[kind]}
                    </span>
                  ))}
                  <span className="ra-phon">
                    {r.expected && (
                      <>
                        attendu <b>{r.expected}</b>
                      </>
                    )}
                    {r.expected && r.pronounced.length > 0 && " · "}
                    {r.pronounced.length > 0 && (
                      <>
                        entendu{" "}
                        {r.pronounced.map((p, k) => (
                          <span key={k}>
                            {k > 0 && ", "}
                            <b>{p}</b>
                          </span>
                        ))}
                      </>
                    )}
                  </span>
                </div>
                <span>{r.advice}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="ra-mono muted">
        extraction {verdict.timing.extraction.toFixed(1)} s · évaluation {verdict.timing.evaluation.toFixed(1)} s
      </p>
    </div>
  );
}
