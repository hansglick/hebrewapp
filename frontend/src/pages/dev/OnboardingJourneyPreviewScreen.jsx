import { useState } from "react";
import { useNavigate } from "react-router-dom";
import HebrewInput from "../../components/HebrewInput";
import { SectionTitle } from "../../components/QuoteBlock";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import "../screens.css";
import "../onboarding/AuthScreens.css";

// Même pastille numérotée que RegisterScreen/OnboardingScreen (cf. ces
// fichiers) — dupliquée ici pour que cet écran de dev reste autonome, cf.
// demande explicite du user.
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
      }}
    >
      {number}
    </span>
  );
}

const stepHr = (
  <hr style={{ width: "70%", maxWidth: 320, border: "none", borderTop: "1px solid var(--cardBorder)", margin: "16px 0" }} />
);

const PHASES = [
  { key: "inscription", label: "Inscription" },
  { key: "intro", label: "Intro onboarding" },
  { key: "test-intro", label: "Modalités du test" },
  { key: "done", label: "Résultat" },
];

// Parcours complet de l'onboarding, de l'inscription jusqu'au clic final qui
// mène à l'écran d'accueil RÉEL — avec des valeurs simulées (pas de vrai
// registerAccount/setIdentity/test conversationnel), pour évaluer rapidement
// le rendu graphique de chaque écran sans repasser par le vrai parcours à
// chaque fois — cf. demande explicite du user. Onglets en haut : accès
// direct à n'importe quelle étape ; chaque écran garde aussi son propre
// bouton principal, qui avance à l'étape suivante (comme le vrai parcours),
// jusqu'au bouton final qui navigue vers "/" (le vrai accueil).
export default function OnboardingJourneyPreviewScreen() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("inscription");
  const [pseudo, setPseudo] = useState("דוגמה");
  const [pin1, setPin1] = useState("1234");
  const [pin2, setPin2] = useState("1234");
  // Distingue le niveau simulé selon le chemin pris pour arriver à "done" —
  // cf. demande explicite du user. Le vrai /api/onboarding/skip renvoie
  // reference_lesson(DEFAULT_LEVEL="0.00") = la toute première leçon du
  // cours (0.01, cf. lesson_order.next_lesson_code — "0.00" n'étant dans
  // aucune leçon réelle, il retombe sur codes[0]) ; "0.07" reste une valeur
  // d'exemple arbitraire pour le chemin "test complété".
  const [doneLesson, setDoneLesson] = useState("0.01");

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

      {phase === "inscription" && (
        <>
          {/* Simplifié à l'extrême par rapport à RegisterScreen.jsx (pas de
              validation du pin, pas d'appel à registerAccount) — cf. demande
              explicite du user ("pas besoin d'enregistrer les vraies
              valeurs"). */}
          <div style={{ width: "70%", maxWidth: 320, display: "flow-root" }}>
            <SectionTitle fontSize="0.84em">
              <StepBadge number={1} background="#dbeafe" color="#1d4ed8" />
              Entre ton pseudo
            </SectionTitle>
          </div>
          <div className="auth-pseudo-input" style={{ width: "100%", maxWidth: 320 }}>
            <HebrewInput
              value={pseudo}
              onChange={setPseudo}
              rows={1}
              placeholder="שם..."
              showVoicePrefill={false}
              forceKeyboardHidden
              highlightKeyboardToggle
            />
          </div>

          {stepHr}

          <div style={{ width: "70%", maxWidth: 320, display: "flow-root" }}>
            <SectionTitle fontSize="0.84em">
              <StepBadge number={2} background="#dbeafe" color="#1d4ed8" />
              Entre ton mot de passe
            </SectionTitle>
          </div>
          <input
            type="password"
            inputMode="numeric"
            className="auth-pin-input"
            value={pin1}
            onChange={(e) => setPin1(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />

          <div style={{ width: "70%", maxWidth: 320, display: "flow-root", marginTop: -8 }}>
            <SectionTitle fontSize="0.84em">
              <StepBadge number={3} background="#dbeafe" color="#1d4ed8" />
              Re-entre ton mot de passe
            </SectionTitle>
          </div>
          <input
            type="password"
            inputMode="numeric"
            className="auth-pin-input"
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />

          {stepHr}

          <div style={{ width: "70%", maxWidth: 320, display: "flow-root" }}>
            <SectionTitle fontSize="0.84em">
              <StepBadge number={4} background="var(--validationGrisee)" color="var(--validationPleine)" />
              Connecte-toi
            </SectionTitle>
          </div>
          <button
            type="button"
            className="exam-tile green auth-submit-btn"
            style={{ cursor: "pointer" }}
            onClick={() => setPhase("intro")}
          >
            Créer ton compte
          </button>
        </>
      )}

      {phase === "intro" && (
        <>
          <h1 className="hebrew" style={{ direction: "rtl", fontWeight: 400 }}>
            שלום <strong style={{ fontWeight: 600 }}>{pseudo || "דוגמה"}</strong> !
          </h1>
          <button
            type="button"
            className="exam-tile green"
            style={{ cursor: "pointer" }}
            onClick={() => setPhase("test-intro")}
          >
            Evalue ton niveau!
          </button>
          <button
            type="button"
            className="exam-tile green pastel"
            style={{ cursor: "pointer" }}
            onClick={() => {
              setDoneLesson("0.01");
              setPhase("done");
            }}
          >
            Commencer à la première leçon
          </button>
        </>
      )}

      {phase === "test-intro" && (
        <>
          <h1 style={{ fontSize: "1.4em" }}>Evalue ton niveau!</h1>
          <div className="card">
            <p className="muted" style={{ fontSize: "0.765em", margin: 0 }}>
              Afin de te faire démarrer dans les meilleures conditions, ton professeure{" "}
              <span style={{ fontStyle: "italic" }}>'Gali'</span> va te poser quelques questions afin
              d'évaluer ton niveau en hébreu.
            </p>
            <p className="muted" style={{ fontSize: "0.765em", margin: "8px 0 0" }}>
              Pas de panique, si ton professeure t'a mal évalué, tu pourras toujours monter ou descendre de
              niveau en cliquant sur le logo central de la barre de contrôle.
            </p>
            <p className="muted" style={{ fontSize: "0.765em", margin: "8px 0 0" }}>
              Toutefois, si tu le souhaites, tu peux commencer directement à la première leçon.
            </p>
          </div>
          {/* Le vrai bouton navigue vers /dev/conversation-eval (test en
              direct, micro requis) — ici, on simule juste l'arrivée au
              résultat, cf. demande explicite du user ("valeurs simulées très
              rapidement"). */}
          <button
            type="button"
            className="exam-tile green"
            style={{ cursor: "pointer" }}
            onClick={() => {
              setDoneLesson("0.07");
              setPhase("done");
            }}
          >
            Commencer le test!
          </button>
          <button
            type="button"
            className="exam-tile green pastel"
            style={{ cursor: "pointer" }}
            onClick={() => {
              setDoneLesson("0.01");
              setPhase("done");
            }}
          >
            Commencer à la première leçon
          </button>
        </>
      )}

      {phase === "done" && (
        <>
          <h1 style={{ fontSize: "1.4em", fontWeight: 400 }}>
            Félicitations tu as le niveau{" "}
            <strong style={{ fontWeight: 600 }}>
              {displayChapitreLabel("0")}.{displayLessonNumber(doneLesson)}
            </strong>{" "}
            !
          </h1>
          <div className="card">
            <p className="muted" style={{ fontSize: "0.9em", margin: 0 }}>
              Ton niveau vient d'être estimé à partir des résultats du test d'évaluation, tu as le niveau{" "}
              <strong style={{ fontWeight: 600 }}>
                {displayChapitreLabel("0")}.{displayLessonNumber(doneLesson)}
              </strong>
              . Tu pourras toujours monter ou descendre de niveau en cliquant sur le milieu de la barre de
              contrôle si tu estimes que cela ne reflète pas ton niveau réel.
            </p>
          </div>
          {/* Dernière étape du parcours : navigue vers le VRAI écran
              d'accueil (pas une reproduction fictive) — cf. demande
              explicite du user ("jusqu'à l'arrivée à la page d'accueil"). */}
          <button type="button" className="exam-tile green" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
            Commencer
          </button>
        </>
      )}
    </section>
  );
}
