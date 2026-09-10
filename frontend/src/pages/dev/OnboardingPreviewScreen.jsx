import { useState } from "react";
import HebrewInput from "../../components/HebrewInput";
import { OralAnswerCapture } from "../../components/OralAnswerCapture";
import { GeminiWaiting } from "../../components/GeminiWaiting";
import { QuoteBlock, SectionTitle } from "../../components/QuoteBlock";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import "../screens.css";

// Même pastille/trait que OnboardingScreen.jsx (cf. ce fichier pour le
// commentaire détaillé) — dupliqués ici pour que cet écran de dev reste
// autonome (pas d'appel aux routes réelles), cf. demande explicite du user.
const STEP_BADGE_SIZE = 25;
function StepBadge({ number, background, color, centerOnEdge = true }) {
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
        ...(centerOnEdge ? { position: "relative", left: -STEP_BADGE_SIZE / 2 } : {}),
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
  { key: "ecrit-loading", label: "Attente (écrit)" },
  { key: "ecrit-result", label: "Résultat écrit" },
  { key: "oral-question", label: "Question orale" },
  { key: "oral-loading", label: "Attente (oral)" },
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
          {/* שלום non gras, pseudo en gras, "!" final — cf.
              OnboardingScreen.jsx, cf. demande explicite du user. */}
          <h1 className="hebrew" style={{ direction: "rtl", fontWeight: 400 }}>
            שלום <strong style={{ fontWeight: 600 }}>דוגמה</strong> !
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
          {/* 1.4em = 2em (taille par défaut d'un h1) * 0.7 : -30%, cf.
              OnboardingScreen.jsx, cf. demande explicite du user. */}
          <h1 style={{ fontSize: "1.4em" }}>Évaluation de ton niveau</h1>
          {/* Encadré de même largeur que "Commencer le test !" ; police
              réduite de 15% — cf. OnboardingScreen.jsx, cf. demande
              explicite du user. */}
          <div className="card">
            <p className="muted" style={{ fontSize: "0.765em", margin: 0 }}>
              Un test rapide de 7 questions nous permettra d'évaluer ton niveau et ainsi de déterminer où
              commencer ton parcours. Cependant, tu peux commencer à la première leçon si tu es débutant.
            </p>
            <p className="muted" style={{ fontSize: "0.765em", margin: "8px 0 0" }}>
              Pas de panique, si l'estimation s'avère trop éloigné de ton niveau réel, tu pourras toujours
              monter ou descendre de niveau en cliquant sur le logo central de la barre de contrôle
              supérieure qui représente ta progression.
            </p>
          </div>
          <button type="button" className="exam-tile green" style={{ cursor: "pointer" }}>
            Commencer le test !
          </button>
          <button type="button" className="exam-tile green pastel" style={{ cursor: "pointer" }}>
            Je préfère commencer à la première leçon
          </button>
        </>
      )}

      {(phase === "ecrit-question" ||
        phase === "ecrit-loading" ||
        phase === "ecrit-result" ||
        phase === "oral-question" ||
        phase === "oral-loading" ||
        phase === "oral-result") && (
        <>
          {/* Toujours affiché, même pendant l'avance automatique (le message
              clignotant "Prêt pour la question suivante ?" vit désormais
              sous les étoiles de chaque bloc "Évaluation", cf. plus bas) —
              cf. OnboardingScreen.jsx, cf. demande explicite du user. */}
          <p className="muted" style={{ margin: 0, textAlign: "center", width: "100%" }}>
            Question n° {phase.startsWith("ecrit") ? "3" : "5"}/7
          </p>

          {stepHr}
        </>
      )}

      {(phase === "ecrit-question" || phase === "ecrit-loading" || phase === "ecrit-result") && (
        <>
          {/* Toujours affiché (seule l'indication "Question n°X/Y" du header
              se masque pendant l'avance automatique, pas ce bloc) — cf.
              demande explicite du user. */}
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

          {/* Bloc "Réponse" (pastille 2, verte) partagé question/attente/
              résultat — même bascule champ de saisie / texte figé (dès
              l'envoi, pas seulement une fois noté) que l'écran réel, cf.
              demande explicite du user. */}
          {stepHr}
          <div style={{ width: "100%", maxWidth: 320, marginTop: 20 }}>
            <SectionTitle>
              <StepBadge number={2} background="var(--validationGrisee)" color="var(--validationPleine)" />
              Réponse
            </SectionTitle>
            {phase === "ecrit-question" ? (
              <div className="onboarding-question-input" style={{ marginTop: "1em" }}>
                <HebrewInput value={studentSolution} onChange={setStudentSolution} rows={3} placeholder="Traduis !" />
              </div>
            ) : (
              // 1.248em = 0.96em * 1.3 : +30%, cf. demande explicite du user.
              <p
                className="hebrew"
                style={{ margin: "1em 0 0", fontSize: "1.248em", fontStyle: "italic", color: "var(--textSecondary)" }}
              >
                {studentSolution}
              </p>
            )}
          </div>

          {phase === "ecrit-question" && (
            /* disabled + vert pastel (via .exam-tile.green:disabled,
               screens.css) tant que le champ est vide — même câblage que
               l'écran réel, cf. demande explicite du user. */
            <button
              type="button"
              className="exam-tile green"
              style={{ marginTop: 4, cursor: studentSolution.trim() ? "pointer" : "default" }}
              disabled={!studentSolution.trim()}
            >
              Envoyer ma réponse
            </button>
          )}

          {(phase === "ecrit-loading" || phase === "ecrit-result") && (
            <>
              {/* Bloc "Évaluation" (pastille 3, orange pastel) : vidéo
                  d'attente (sans la tuile "courrier") pendant "ecrit-loading",
                  note + message clignotant une fois le résultat prêt — cf.
                  OnboardingScreen.jsx, cf. demande explicite du user. */}
              {stepHr}
              <div style={{ width: "100%", maxWidth: 320, marginTop: 20 }}>
                <SectionTitle>
                  <StepBadge number={3} background="#ffedd5" color="#c2410c" />
                  Évaluation
                </SectionTitle>
                <div style={{ marginTop: "1em" }}>
                  {phase === "ecrit-loading" ? (
                    <GeminiWaiting allowCourrier={false} />
                  ) : (
                    <>
                      <StarRating rating={4} />
                      <p className="onboarding-next-blink" style={{ margin: "12px 0 0" }}>
                        Prêt pour la question suivante ?
                      </p>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {(phase === "oral-question" || phase === "oral-loading" || phase === "oral-result") && (
        <>
          {/* src fictifs : pas de vrais fichiers audio en preview, seule la
              chrome visuelle importe ici. Toujours affiché (seule
              l'indication "Question n°X/Y" du header se masque pendant
              l'avance automatique, pas ce bloc). Classe
              "onboarding-oral-answer-capture" : réduit l'espace au-dessus du
              bloc 1 (cf. screens.css), un trait le précède déjà ici (le
              header). Bloc 3 ("Réponse") bascule vers la lecture dès l'envoi
              (pas seulement une fois noté), plus de verbatim ici, déplacé
              dans le bloc "Évaluation" — cf. resultAudioUrl
              (OralAnswerCapture.jsx) — cf. OnboardingScreen.jsx, cf. demande
              explicite du user. */}
          <div className="onboarding-oral-answer-capture" style={{ width: "100%" }}>
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
              resultAudioUrl={phase !== "oral-question" ? "#" : undefined}
            />
          </div>

          {(phase === "oral-loading" || phase === "oral-result") && (
            <>
              {/* Bloc "Évaluation" (pastille 4, orange pastel) : vidéo
                  d'attente (sans la tuile "courrier") pendant "oral-loading",
                  verbatim + note une fois le résultat prêt. Continue la
                  numérotation des 3 blocs "originels" d'OralAnswerCapture —
                  espace réduit (-8, comme le bloc 1), pastille décalée à
                  droite (marginLeft:33.5, même calcul que TITLE_AXIS_OFFSET -
                  STEP_BADGE_SIZE/2 dans OralAnswerCapture.jsx) pour s'aligner
                  verticalement avec les pastilles 1/2/3, verbatim centré
                  au-dessus des étoiles — cf. OnboardingScreen.jsx, dupliqué
                  ici pour cet écran de dev autonome, cf. demande explicite du
                  user. */}
              {stepHr}
              <div style={{ width: "100%", maxWidth: 320, marginTop: -8 }}>
                <div style={{ marginLeft: 33.5 }}>
                  <SectionTitle>
                    <StepBadge number={4} background="#ffedd5" color="#c2410c" centerOnEdge={false} />
                    Évaluation
                  </SectionTitle>
                </div>
                <div style={{ marginTop: "1em", textAlign: "center" }}>
                  {phase === "oral-loading" ? (
                    <GeminiWaiting allowCourrier={false} />
                  ) : (
                    <>
                      <p className="hebrew" style={{ margin: 0, fontSize: "0.96em" }}>
                        <span style={{ fontStyle: "normal", color: "var(--textPrimary)" }}>Verbatim : </span>
                        <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>
                          שלום, אני אוכל תפוח
                        </span>
                      </p>
                      <div style={{ marginTop: 8 }}>
                        <StarRating rating={3} />
                      </div>
                      <p className="onboarding-next-blink" style={{ margin: "12px 0 0" }}>
                        Prêt pour la question suivante ?
                      </p>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {phase === "done" && (
        <>
          {/* Plus de tuile logo/chapitre — titre + message reprennent
              directement le niveau estimé ("[label].[index]"), -30% et gras
              ciblé sur le titre, encadré de même largeur que "Commencer" —
              cf. OnboardingScreen.jsx pour le même calcul sur de vraies
              données, cf. demande explicite du user. */}
          <h1 style={{ fontSize: "1.4em", fontWeight: 400 }}>
            Félicitations tu as le niveau{" "}
            <strong style={{ fontWeight: 600 }}>
              {displayChapitreLabel("0")}.{displayLessonNumber("0.07")}
            </strong>{" "}
            !
          </h1>
          <div className="card">
            <p className="muted" style={{ fontSize: "0.9em", margin: 0 }}>
              Ton niveau vient d'être estimé à partir des résultats du test d'évaluation, tu as le niveau{" "}
              <strong style={{ fontWeight: 600 }}>
                {displayChapitreLabel("0")}.{displayLessonNumber("0.07")}
              </strong>
              . Tu pourras toujours monter ou descendre de niveau en cliquant sur le milieu de la barre de
              contrôle si tu estimes que cela ne reflète pas ton niveau réel.
            </p>
          </div>
          <button type="button" className="exam-tile green" style={{ cursor: "pointer" }}>
            Commencer
          </button>
        </>
      )}
    </section>
  );
}
