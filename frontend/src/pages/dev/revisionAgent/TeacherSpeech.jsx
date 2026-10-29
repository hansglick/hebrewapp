import { useEffect, useMemo, useState } from "react";
import { graphemes, withoutNikkud } from "./hebrew";
import LanguageSwitch from "./LanguageSwitch";

// Dernière prise de parole du prof, en hébreu et traduite en français (communs à toutes les tâches).

// --- Prise de parole du prof ------------------------------------------------

// Mots hébreux cités dans une phrase en français, en gras (cf. demande
// explicite du user) ; isolés (dir), ils ne bouleversent pas l'ordre de la phrase.
const HEBREW_RUN =
  /([\u0590-\u05FF]+(?:[\s'"\u05BE\u05F3\u05F4-]+[\u0590-\u05FF]+)*)/;

function withHebrewInBold(text) {
  return text.split(HEBREW_RUN).map((piece, i) =>
    i % 2 ? (
      <strong key={i} dir="rtl" lang="he">
        {piece}
      </strong>
    ) : (
      piece
    ),
  );
}

export const SPEECH_STEP_MS = 35;

// Hébreu et français s'écrivent caractère par caractère, en même temps : ils finissent ensemble.
// Si la prise de parole est complétée, l'écriture continue là où elle en était. L'hébreu s'affiche sans nikkoud ; la
// traduction est masquée par défaut, le drapeau français l'affiche ou la masque (cf. demande explicite du user).
// À gauche, le logo des deux pastilles (cf. LanguageSwitch), à cheval entre la
// réplique et l'espace de sa traduction, affichée par défaut et repliée par un
// petit bouton discret en haut à droite de cet espace (cf. demande explicite du
// user). mode : le mode de langue qu'on peut changer (évaluation orale) ; sans
// lui, le logo montre seulement la langue que le prof a parlée.
export default function TeacherSpeech({ line, mode = null }) {
  const [translated, setTranslated] = useState(true);
  const hebrew = useMemo(
    () => graphemes(withoutNikkud(line.hebrew)),
    [line.hebrew],
  );
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
          return {
            he: he + Math.max(0, hebrew.length - he) / steps,
            fr: fr + Math.max(0, french.length - fr) / steps,
          };
        }),
      SPEECH_STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [shown, done, hebrew.length, french.length]);

  const part = (chars, n) => chars.slice(0, Math.ceil(n)).join("");
  const caret = !done && <span className="ra-caret" aria-hidden="true" />;
  // translation : le texte est la traduction, affichée en plus petit sous l'original.
  const hebrewText = (translation) => (
    <p
      className={`ra-speech-he${translation ? " ra-speech-translation" : ""}`}
      dir="rtl"
      lang="he"
    >
      {part(hebrew, shown.he)}
      {caret}
    </p>
  );
  const frenchText = (translation) => (
    <p
      className={`ra-speech-fr${translation ? "" : " ra-speech-spoken-fr"}`}
      lang="fr"
    >
      {translation
        ? part(french, shown.fr)
        : withHebrewInBold(part(french, shown.fr))}
      {caret}
    </p>
  );

  // Langue parlée par le prof d'abord, sa traduction dessous ; en miroir quand il
  // parle français (évaluation orale).
  const spokenFrench = line.spoken === "fr" || hebrew.length === 0;
  const [original, translation] = spokenFrench
    ? [french, hebrew]
    : [hebrew, french];
  const logo = mode ?? <LanguageSwitch language={spokenFrench ? "fr" : "he"} />;

  const canTranslate = translation.length > 0 && original.length > 0;
  const originalText = spokenFrench ? frenchText(false) : hebrewText(false);
  const translationText =
    translated &&
    translation.length > 0 &&
    (spokenFrench ? hebrewText(true) : frenchText(true));

  return (
    <div className="ra-speech ra-speech-plain" aria-live="polite">
      {!canTranslate && <div className="ra-speech-mode">{logo}</div>}
      <div className="ra-speech-texts">
        {originalText}
        {canTranslate && (
          <div className="ra-speech-translation-block">
            <div className="ra-speech-mode ra-speech-mode-straddle">{logo}</div>
            <button
              type="button"
              className="ra-translate-toggle"
              onClick={() => setTranslated((t) => !t)}
              aria-expanded={translated}
              title={
                translated ? "Masquer la traduction" : "Afficher la traduction"
              }
            >
              <span lang="he">א</span>
              <span lang="fr">A</span>
            </button>
            {translationText}
          </div>
        )}
      </div>
    </div>
  );
}
