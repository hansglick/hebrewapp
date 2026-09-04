import { useState } from "react";
import { QuizzBubbles } from "../../components/QuizzBubbles";

const FAKE_QUIZZ = {
  french: "Comment dit-on \"maison\" ?",
  key: "b",
  options: [
    { key: "a", hebrew: "שֻׁלְחָן" },
    { key: "b", hebrew: "בַּיִת" },
    { key: "c", hebrew: "סֵפֶר" },
    { key: "d", hebrew: "חַלּוֹן" },
  ],
};

// Écran de développement : reproduit côte à côte le rendu d'un objet quizz
// tel qu'affiché en révisions (zoom:1.6, référence) et tel qu'affiché
// désormais dans un examen écrit (même zoom:1.6, appliqué à
// ExamenEcritScreen/ExamenHardPasserScreen) — pour vérifier visuellement
// qu'ils ont bien la même taille/format sans avoir à lancer un vrai examen
// (une tentative réelle est limitée à 3/jour), cf. demande explicite du
// user. Accessible uniquement en tapant l'URL (/dev/quizz-preview).
export default function QuizzPreviewScreen() {
  const [selected, setSelected] = useState(null);

  return (
    <section className="screen">
      <h2 style={{ margin: 0 }}>Révisions (référence)</h2>
      <div style={{ zoom: 1.6, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <p style={{ color: "var(--text)", margin: 0, fontSize: "0.96em" }}>{FAKE_QUIZZ.french}</p>
        <hr style={{ width: 200, border: "none", borderTop: "1px solid var(--border)", margin: 0 }} />
        <QuizzBubbles
          options={FAKE_QUIZZ.options}
          correctKey={FAKE_QUIZZ.key}
          selectedKey={selected}
          onSelect={setSelected}
          disabled={false}
        />
      </div>

      <hr style={{ width: "100%", maxWidth: 320, border: "none", borderTop: "2px dashed var(--border)", margin: "24px 0" }} />

      <h2 style={{ margin: 0 }}>Examen écrit (après correction)</h2>
      <div style={{ zoom: 1.6, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <p style={{ color: "var(--text)", margin: 0, fontSize: "0.96em" }}>{FAKE_QUIZZ.french}</p>
        <QuizzBubbles
          options={FAKE_QUIZZ.options}
          correctKey={FAKE_QUIZZ.key}
          selectedKey={selected}
          onSelect={setSelected}
          disabled={false}
        />
      </div>
    </section>
  );
}
