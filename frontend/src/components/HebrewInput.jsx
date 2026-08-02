import { useEffect, useRef, useState } from "react";
import "./HebrewInput.css";

// Translittération phonétique simple (clavier latin/AZERTY -> hébreu),
// pensée pour un francophone qui tape au son plutôt qu'au clavier hébreu
// positionnel. N'est pas exhaustive/parfaite (ambiguïtés c/k/q, e/a...)
// mais suffisante pour saisir une réponse d'examen.
const DIGRAPH_MAP = {
  sh: "ש",
  ch: "ח",
  kh: "ח",
  ts: "צ",
  tz: "צ",
  th: "ת",
};

const TRANSLIT_MAP = {
  a: "א",
  b: "ב",
  c: "כ",
  d: "ד",
  e: "א",
  f: "פ",
  g: "ג",
  h: "ה",
  i: "י",
  j: "ג",
  k: "כ",
  l: "ל",
  m: "מ",
  n: "נ",
  o: "ו",
  p: "פ",
  q: "ק",
  r: "ר",
  s: "ס",
  t: "ט",
  u: "ו",
  v: "ו",
  w: "ו",
  x: "קס",
  y: "י",
  z: "ז",
  "'": "ע",
};

const FINAL_FORMS = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };

const KEYBOARD_ROWS = [
  ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "כ"],
  ["ל", "מ", "נ", "ס", "ע", "פ", "צ", "ק", "ר", "ש", "ת"],
  ["ך", "ם", "ן", "ף", "ץ"],
];

function finalizeWordAt(text, cursor) {
  const i = cursor - 1;
  if (i < 0) return text;
  const finalForm = FINAL_FORMS[text[i]];
  if (!finalForm) return text;
  return text.slice(0, i) + finalForm + text.slice(i + 1);
}

export default function HebrewInput({ value, onChange, rows = 3, placeholder }) {
  const [showKeyboard, setShowKeyboard] = useState(false);
  const textareaRef = useRef(null);
  const rawBufferRef = useRef("");

  function insertAt(text, start, end) {
    const newValue = value.slice(0, start) + text + value.slice(end);
    onChange(newValue);
    const pos = start + text.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function handleBeforeInput(e) {
    const inputType = e.inputType;
    const data = e.data;
    if (inputType !== "insertText" || !data || data.length !== 1) {
      rawBufferRef.current = "";
      return;
    }

    const el = e.target;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (/\s/.test(data)) {
      e.preventDefault();
      const finalized = finalizeWordAt(value.slice(0, start), start);
      const newValue = finalized + value.slice(start);
      onChange(newValue.slice(0, start) + data + newValue.slice(end));
      rawBufferRef.current = "";
      const pos = start + data.length;
      requestAnimationFrame(() => {
        el.setSelectionRange(pos, pos);
      });
      return;
    }

    if (!/^[a-zA-Z']$/.test(data)) {
      rawBufferRef.current = "";
      return;
    }

    e.preventDefault();
    const lower = data.toLowerCase();
    const prevLatin = rawBufferRef.current;

    if (prevLatin && start === end && start > 0 && DIGRAPH_MAP[prevLatin + lower]) {
      insertAt(DIGRAPH_MAP[prevLatin + lower], start - 1, end);
      rawBufferRef.current = "";
    } else {
      insertAt(TRANSLIT_MAP[lower] ?? data, start, end);
      rawBufferRef.current = lower;
    }
  }

  // React ne relaie pas correctement l'annulation (preventDefault) de
  // l'événement natif "beforeinput" via sa prop synthétique onBeforeInput
  // (c'est un événement synthétique reconstruit, pas un passthrough) : on
  // attache donc un vrai écouteur DOM pour pouvoir intercepter et remplacer
  // le caractère inséré (translittération).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.addEventListener("beforeinput", handleBeforeInput, true);
    return () => el.removeEventListener("beforeinput", handleBeforeInput, true);
  });

  function handleKeyDown(e) {
    if (e.key === "Backspace" || e.key === "Delete") rawBufferRef.current = "";
  }

  function handleBlur() {
    const finalized = finalizeWordAt(value, value.length);
    if (finalized !== value) onChange(finalized);
  }

  function handleKeyClick(letter) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    rawBufferRef.current = "";
    insertAt(letter, start, end);
  }

  return (
    <div className="hebrew-input">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        rows={rows}
        dir="rtl"
        className="hebrew-input-textarea"
        placeholder={placeholder}
      />
      <button
        type="button"
        className="link-btn"
        onClick={() => setShowKeyboard((s) => !s)}
      >
        ⌨️ Clavier hébreu
      </button>
      {showKeyboard && (
        <div className="hebrew-keyboard">
          {KEYBOARD_ROWS.map((row, i) => (
            <div key={i} className="hebrew-keyboard-row">
              {row.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  className="hebrew-key"
                  onClick={() => handleKeyClick(letter)}
                >
                  {letter}
                </button>
              ))}
            </div>
          ))}
          <div className="hebrew-keyboard-row">
            <button
              type="button"
              className="hebrew-key hebrew-key-space"
              onClick={() => handleKeyClick(" ")}
            >
              espace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
