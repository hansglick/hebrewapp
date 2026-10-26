import { useEffect, useMemo, useState } from "react";

// Dernière prise de parole du prof, en hébreu et traduite en français (communs à toutes les tâches).

// --- Drapeaux en SVG : Windows n'affiche pas les émojis de drapeaux. ---------

function FlagIsrael() {
  return (
    <svg viewBox="0 0 220 160" className="ra-flag" role="img" aria-label="Hébreu">
      <rect width="220" height="160" fill="#fff" />
      <rect y="15" width="220" height="25" fill="#0038b8" />
      <rect y="120" width="220" height="25" fill="#0038b8" />
      <g fill="none" stroke="#0038b8" strokeWidth="5.5">
        <path d="M110 48 82 96h56z" />
        <path d="M110 112 82 64h56z" />
      </g>
    </svg>
  );
}

function FlagFrance() {
  return (
    <svg viewBox="0 0 3 2" className="ra-flag" role="img" aria-label="Français">
      <rect width="1" height="2" fill="#0055a4" />
      <rect x="1" width="1" height="2" fill="#fff" />
      <rect x="2" width="1" height="2" fill="#ef4135" />
    </svg>
  );
}

// --- Prise de parole du prof ------------------------------------------------

const SPEECH_STEP_MS = 35;

// Découpe en caractères visibles : une lettre hébraïque et ses nikkoud apparaissent ensemble.
const graphemes = (text) =>
  Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);

// Hébreu et français s'écrivent caractère par caractère, en même temps : ils finissent ensemble.
// Si la prise de parole est complétée, l'écriture continue là où elle en était.
export default function TeacherSpeech({ line }) {
  const hebrew = useMemo(() => graphemes(line.hebrew), [line.hebrew]);
  const french = useMemo(() => graphemes(line.french), [line.french]);
  const [shown, setShown] = useState({ he: 0, fr: 0 });
  const done = shown.he >= hebrew.length && shown.fr >= french.length;

  useEffect(() => {
    if (done) return;
    const timer = setTimeout(
      () =>
        setShown(({ he, fr }) => {
          // Chaque langue avance en proportion de ce qui lui reste : les deux arrivent au bout au même pas.
          const steps = Math.max(hebrew.length - he, french.length - fr);
          return { he: he + Math.max(0, hebrew.length - he) / steps, fr: fr + Math.max(0, french.length - fr) / steps };
        }),
      SPEECH_STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [shown, done, hebrew.length, french.length]);

  const part = (chars, n) => chars.slice(0, Math.ceil(n)).join("");

  return (
    <div className="ra-speech" aria-live="polite">
      <div className="ra-speech-row">
        <FlagIsrael />
        <p className="ra-speech-he" dir="rtl" lang="he">
          {part(hebrew, shown.he)}
          {!done && <span className="ra-caret" aria-hidden="true" />}
        </p>
      </div>
      {french.length > 0 && (
        <div className="ra-speech-row">
          <FlagFrance />
          <p className="ra-speech-fr" lang="fr">
            {part(french, shown.fr)}
            {!done && <span className="ra-caret" aria-hidden="true" />}
          </p>
        </div>
      )}
    </div>
  );
}
