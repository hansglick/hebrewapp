import { useEffect, useRef, useState } from "react";
import { VoicePrefill } from "./VoicePrefill";
import "./HebrewInput.css";
import "./ConfigModal.css";

const KEYBOARD_VISIBLE_KEY = "hebrew-keyboard-visible";

// Mapping du clavier hébreu physique français AZERTY (cf.
// instructions/keyboard/example.jpg — vrai sticker de clavier bilingue
// hébreu/AZERTY vendu dans le commerce). Contrairement au clavier QWERTY,
// AZERTY inverse physiquement A<->Q, Z<->W et M<->; : chaque lettre hébraïque
// reste donc sur la MÊME touche physique que sur un clavier hébreu/QWERTY
// standard, mais son étiquette latine change en conséquence (ex: la touche
// physique "A/Q" porte ש sur un clavier hébreu/QWERTY ; sur AZERTY cette
// même touche physique s'appelle "Q", donc q -> ש ici, pas a).
// a et z tombent sur des touches de ponctuation du clavier hébreu (/ et '),
// pas sur une lettre — comportement authentique du clavier réel, pas un
// oubli. צ/ת/ץ sont sur les touches de ponctuation ,/;/ : (accessibles
// uniquement via ces touches sur un vrai clavier, pas via une lettre a-z).
const TRANSLIT_MAP = {
  a: "/",
  b: "נ",
  c: "ב",
  d: "ג",
  e: "ק",
  f: "כ",
  g: "ע",
  h: "י",
  i: "ן",
  j: "ח",
  k: "ל",
  l: "ך",
  m: "ף",
  n: "מ",
  o: "ם",
  p: "פ",
  q: "ש",
  r: "ר",
  s: "ד",
  t: "א",
  u: "ו",
  v: "ה",
  w: "ז",
  x: "ס",
  y: "ט",
  z: "'",
  ",": "צ",
  ";": "ת",
  ":": "ץ",
};

const FINAL_FORMS = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };

// Touches "brutes" du clavier virtuel : insèrent directement le caractère
// lui-même plutôt qu'une lettre hébraïque translittérée — même résultat
// que Alt Gr + touche sur un clavier physique (cf. handleBeforeInput,
// altGrRef) pour ces mêmes touches. La touche ":" normale produit ץ (cf.
// TRANSLIT_MAP) ; "colon" est le pendant qui produit ":" littéralement,
// cf. demande explicite du user.
const RAW_KEYS = { colon: ":" };

// Disposition AZERTY : chaque touche affiche la lettre hébraïque qu'elle
// produit (via TRANSLIT_MAP), pour que le clavier virtuel reflète exactement
// ce que produirait la frappe physique (cf. handleBeforeInput). Les 3
// dernières touches lettre de la rangée du bas (, ; :) portent צ/ת/ץ,
// introuvables sur une touche-lettre a-z d'un vrai clavier hébreu. "colon"
// (RAW_KEYS) complète la rangée à 10 touches, comme les deux au-dessus.
const AZERTY_ROWS = [
  ["a", "z", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["q", "s", "d", "f", "g", "h", "j", "k", "l", "m"],
  ["w", "x", "c", "v", "b", "n", ",", ";", ":", "colon"],
];

// Sur Windows, Alt Gr est le plus souvent transmis au navigateur comme un
// Ctrl+Alt simultané plutôt qu'un vrai "AltGraph" détecté par
// getModifierState (peu fiable selon navigateur/OS/disposition) — on
// combine donc les deux signaux pour une détection robuste.
function isAltGrPressed(e) {
  return (e.getModifierState && e.getModifierState("AltGraph")) || (e.ctrlKey && e.altKey);
}

function finalizeWordAt(text, cursor) {
  const i = cursor - 1;
  if (i < 0) return text;
  const finalForm = FINAL_FORMS[text[i]];
  if (!finalForm) return text;
  return text.slice(0, i) + finalForm + text.slice(i + 1);
}

export default function HebrewInput({ value, onChange, rows = 3, placeholder, showVoicePrefill = true }) {
  const [activeKey, setActiveKey] = useState(null);
  // Affiché par défaut ; mémorisé (localStorage) car c'est un choix
  // durable du user, pas un état ponctuel par question — cf. demande
  // explicite du user (toggle manuel, plus de masquage automatique sur
  // mobile ni d'aide contextuelle).
  const [keyboardVisible, setKeyboardVisible] = useState(
    () => localStorage.getItem(KEYBOARD_VISIBLE_KEY) !== "false"
  );
  const textareaRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(KEYBOARD_VISIBLE_KEY, keyboardVisible ? "true" : "false");
  }, [keyboardVisible]);
  // Suivi de l'état de la touche Alt Gr (via keydown/keyup, seuls porteurs
  // fiables de getModifierState — l'événement "beforeinput" n'expose aucun
  // état de touche modificatrice) pour laisser passer "," et ":" tels quels
  // quand Alt Gr est enfoncée, au lieu de les translittérer en צ/ץ.
  const altGrRef = useRef(false);

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
    if (inputType !== "insertText" || !data || data.length !== 1) return;

    const el = e.target;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (/\s/.test(data)) {
      e.preventDefault();
      const finalized = finalizeWordAt(value.slice(0, start), start);
      const newValue = finalized + value.slice(start);
      onChange(newValue.slice(0, start) + data + newValue.slice(end));
      const pos = start + data.length;
      requestAnimationFrame(() => {
        el.setSelectionRange(pos, pos);
      });
      return;
    }

    const key = /^[a-zA-Z]$/.test(data) ? data.toLowerCase() : data;
    if ((key === "," || key === ":") && altGrRef.current) return;
    if (!(key in TRANSLIT_MAP)) return;

    e.preventDefault();
    insertAt(TRANSLIT_MAP[key], start, end);
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
    const altGr = isAltGrPressed(e);
    altGrRef.current = altGr;

    // Alt Gr + "," ou ":" : on insère nous-mêmes le caractère littéral et on
    // court-circuite tout le reste, plutôt que de dépendre de ce que le
    // driver clavier du système déciderait de produire (pas fiable pour ces
    // touches sur cette disposition bilingue).
    if (altGr && (e.key === "," || e.key === ":")) {
      e.preventDefault();
      const el = textareaRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      insertAt(e.key, start, end);
      return;
    }

    if (e.key === " ") {
      setActiveKey(" ");
      return;
    }
    const key = /^[a-zA-Z]$/.test(e.key) ? e.key.toLowerCase() : e.key;
    if (key in TRANSLIT_MAP) setActiveKey(key);
  }

  function handleKeyUp(e) {
    altGrRef.current = isAltGrPressed(e);
    if (e.key === " ") {
      setActiveKey(null);
      return;
    }
    const key = /^[a-zA-Z]$/.test(e.key) ? e.key.toLowerCase() : e.key;
    if (key in TRANSLIT_MAP) setActiveKey(null);
  }

  function handleBlur() {
    const finalized = finalizeWordAt(value, value.length);
    if (finalized !== value) onChange(finalized);
  }

  function handleKeyClick(letter) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    insertAt(letter, start, end);
  }

  return (
    <div className="hebrew-input">
      {showVoicePrefill && <VoicePrefill lang="he" onChange={onChange} />}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={handleBlur}
        rows={rows}
        dir="rtl"
        className="hebrew-input-textarea"
        placeholder={placeholder}
      />
      {/* Toggle manuel (mémorisé) : plus de masquage automatique par
          largeur d'écran ni d'aide contextuelle — cf. demande explicite
          du user. */}
      <div className="config-modal-row hebrew-keyboard-toggle-row">
        <span>Clavier hébreu</span>
        <button
          type="button"
          className={`switch${keyboardVisible ? " on" : ""}`}
          role="switch"
          aria-checked={keyboardVisible}
          aria-label="Afficher/masquer le clavier hébreu"
          onClick={() => setKeyboardVisible((v) => !v)}
        >
          <span className="switch-knob" />
        </button>
      </div>

      {keyboardVisible && (
        <div className="hebrew-keyboard">
          {AZERTY_ROWS.map((row, i) => (
            <div key={i} className="hebrew-keyboard-row">
              {row.map((latin) => {
                const isRaw = latin in RAW_KEYS;
                const insertChar = isRaw ? RAW_KEYS[latin] : TRANSLIT_MAP[latin];
                return (
                  <button
                    key={latin}
                    type="button"
                    className={`hebrew-key${activeKey === latin ? " active" : ""}`}
                    onClick={() => handleKeyClick(insertChar)}
                  >
                    <span className="hebrew-key-hebrew">{insertChar}</span>
                    {!isRaw && <span className="hebrew-key-latin">{latin}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="hebrew-keyboard-row">
            <button
              type="button"
              className={`hebrew-key hebrew-key-space${activeKey === " " ? " active" : ""}`}
              onClick={() => handleKeyClick(" ")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
