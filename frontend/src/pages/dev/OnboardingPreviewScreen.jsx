import { useState } from "react";
import { ChapitreLogo } from "../../components/ChapitreLogo";
import HebrewInput from "../../components/HebrewInput";
import { OralAnswerCapture } from "../../components/OralAnswerCapture";
import { QuoteBlock, SectionTitle } from "../../components/QuoteBlock";
import { mediaUrl } from "../../api/media";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import "../screens.css";

// Même pastille/trait que OnboardingScreen.jsx (cf. ce fichier pour le
// commentaire détaillé) — dupliqués ici pour que cet écran de dev reste
// autonome (pas d'appel aux routes réelles), cf. demande explicite du user.
const STEP_BADGE_SIZE = 25;
function StepBadge({ number, background, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: STEP_BADGE_SIZE,
        height: STEP_BADGE_SIZE,
        borderRadius: "50%",
        background,
        color,
        fontSize: "0.9375em",
        fontWeight: 700,
        marginRight: 12,
        flexShrink: 0,
        position: "relative",
        left: -STEP_BADGE_SIZE / 2,
      }}
    >
      {number}
    </span>
  );
}

const stepHr = (
  <hr style={{ width: "100%", maxWidth: 320, border: "none", borderTop: "1px solid var(--cardBorder)", margin: "16px 0" }} />
);

function StarRating({ rating }) {
  return (
    <span aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= rating ? "#f5b301" : "var(--textSecondary)" }}>
          ★
        </span>
      ))}
    </span>
  );
}

const PHASES = [
  { key: "intro", label: "Intro" },
  { key: "test-intro", label: "Modalités du test" },
  { key: "ecrit-question", label: "Question écrite" },
  { key: "ecrit-result", label: "Résultat écrit" },
  { key: "oral-question", label: "Question orale" },
  { key: "oral-result", label: "Résultat oral" },
  { key: "done", label: "Terminé" },
];

// Écran de développement : reproduit à l'identique chacun des états visuels
// de OnboardingScreen (intro / question+résultat écrit / question+résultat
// oral / fin) avec des données fictives, sans appeler aucune route
// d'onboarding réelle — le vrai écran appelle des endpoints stateful liés au
// compte réel (démarrage d'examen, avancement...), pas adaptés à de
// l'itération de design. Un bouton en haut permet de basculer entre les
// états. Accessible uniquement en tapant l'URL (/dev/onboarding-preview),
// cf. demande explicite du user.
export default function OnboardingPreviewScreen() {
  const [phase, setPhase] = useState("intro");
  const [studentSolution, setStudentSolution] = useState("שלום, אני לומד עברית");

  return (
    <section className="screen">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
        {PHASES.map((p) => (
          <button
            key={p.key}
            type="button"
            className="link-btn"
            style={{
              border: "1px solid var(--cardBorder)",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: "0.8em",
              textDecoration: "none",
              background: phase === p.key ? "var(--accent)" : "none",
              color: phase === p.key ? "#fff" : "var(--accent)",
            }}
            onClick={() => setPhase(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {phase === "intro" && (
        <>
          <h1 className="hebrew" style={{ direction: "rtl" }}>
            שלום דוגמה
          </h1>
          <button type="button" className="exam-tile green" style={{ cursor: "pointer" }}>
            Évaluer son niveau
          </button>
          <button type="button" className="exam-tile green pastel" style={{ cursor: "pointer" }}>
            Commencer à la première leçon
          </button>
        </>
      )}

      {phase === "test-intro" && (
        <>
          <h1>Évaluation de ton niveau</h1>
          <p className="muted" style={{ fontSize: "0.9em" }}>
            7 questions (un mélange de traductions écrites et de questions orales) pour te proposer des
            leçons adaptées à ton niveau — réponds du mieux que tu peux, il n'y a pas de mauvaise surprise
            possible : si le niveau retenu s'avère trop facile ou trop difficile, tu pourras toujours
            demander une équivalence par la suite pour ajuster dans un sens comme dans l'autre.
          </p>
          <button type="button" className="exam-tile green" style={{ cursor: "pointer" }}>
            Commencer le test !
          </button>
          <button type="button" className="exam-tile green pastel" style={{ cursor: "pointer" }}>
            Je préfère commencer à la première leçon
          </button>
        </>
      )}

      {(phase === "ecrit-question" ||
        phase === "ecrit-result" ||
        phase === "oral-question" ||
        phase === "oral-result") && (
        <>
          {/* Ligne partagée écrit/oral : index de question + logo "accident"
              (remplace l'ancien bouton "Abandonner le test") + trait — cf.
              OnboardingScreen.jsx, dupliqué ici pour cet écran de dev
              autonome, cf. demande explicite du user. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" }}>
            <p className="muted" style={{ margin: 0 }}>
              Question n°{phase.startsWith("ecrit") ? "3" : "5"}/7
            </p>
            <button type="button" className="onboarding-abandon-btn">
              <img src={mediaUrl("logos/accident.png")} alt="" style={{ width: 28, height: 28 }} draggable={false} />
              <span className="exam-tile-tooltip">Abandonne le test</span>
            </button>
          </div>

          {stepHr}
        </>
      )}

      {(phase === "ecrit-question" || phase === "ecrit-result") && (
        <>
          <QuoteBlock
            label={
              <>
                <StepBadge number={1} background="#dbeafe" color="#1d4ed8" />
                Traduis
              </>
            }
            marginTop={20}
          >
            <p style={{ color: "var(--textSecondary)", margin: 0, fontSize: "0.96em", fontStyle: "italic" }}>
              Le chat mange une pomme dans le jardin.
            </p>
          </QuoteBlock>

          {phase === "ecrit-question" && (
            <>
              {stepHr}
              <div style={{ width: "100%", maxWidth: 320, marginTop: 20 }}>
                <SectionTitle>
                  <StepBadge number={2} background="var(--validationGrisee)" color="var(--validationPleine)" />
                  Réponse
                </SectionTitle>
                <div style={{ marginTop: "1em" }}>
                  <HebrewInput value={studentSolution} onChange={setStudentSolution} rows={3} placeholder="Traduis !" />
                </div>
              </div>
              {/* disabled + vert pastel (via .exam-tile.green:disabled,
                  screens.css) tant que le champ est vide — même câblage que
                  l'écran réel, cf. demande explicite du user. */}
              <button
                type="button"
                className="exam-tile green"
                style={{ marginTop: 4, cursor: studentSolution.trim() ? "pointer" : "default" }}
                disabled={!studentSolution.trim()}
              >
                Envoyer ma réponse
              </button>
            </>
          )}

          {phase === "ecrit-result" && (
            <>
              <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
                <span style={{ color: "var(--textPrimary)" }}>Réponse de l'étudiant : </span>
                <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>{studentSolution}</span>
              </p>
              <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0" }} />
              <StarRating rating={4} />
              <button
                type="button"
                className="link-btn"
                style={{ fontStyle: "italic", color: "var(--textSecondary)", fontSize: "0.96em", textDecoration: "none" }}
              >
                Question suivante
              </button>
            </>
          )}
        </>
      )}

      {(phase === "oral-question" || phase === "oral-result") && (
        <>
          {/* src fictifs : pas de vrais fichiers audio en preview, seule la
              chrome visuelle importe ici. */}
          <OralAnswerCapture
            contentSrc=""
            questionText="שלום, מה שלומך?"
            showRecorder={phase === "oral-question"}
            isRecording={false}
            isConverting={false}
            audioBlob={null}
            audioUrl={null}
            onStart={() => {}}
            onStop={() => {}}
            onEnvoyer={() => {}}
          />

          {phase === "oral-result" && (
            <>
              <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
                <span style={{ color: "var(--textPrimary)" }}>Réponse de l'étudiant : </span>
                <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>שלום, אני אוכל תפוח</span>
              </p>
              <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0" }} />
              <StarRating rating={3} />
              <button
                type="button"
                className="link-btn"
                style={{ fontStyle: "italic", color: "var(--textSecondary)", fontSize: "0.96em", textDecoration: "none" }}
              >
                Voir mon niveau
              </button>
            </>
          )}
        </>
      )}

      {phase === "done" && (
        <>
          <h1>C'est parti !</h1>
          <div className="card" style={{ textAlign: "center" }}>
            <ChapitreLogo chapId="0" size="3.4em" style={{ marginInlineStart: 0 }} />
            <div style={{ fontWeight: 600, margin: "6px 0 0" }}>
              {displayChapitreLabel("0")} — {displayLessonNumber("0.07")}
            </div>
          </div>
          <p className="muted" style={{ fontSize: "0.9em" }}>
            Ton niveau de départ vient d'être fixé à partir de tes réponses. Tu peux commencer à apprendre dès
            maintenant.
          </p>
          <button type="button" className="exam-tile green" style={{ cursor: "pointer" }}>
            Commencer
          </button>
        </>
      )}
    </section>
  );
}
