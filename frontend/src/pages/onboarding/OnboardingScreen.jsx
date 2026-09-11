import { useEffect, useMemo, useRef, useState } from "react";
import {
  advanceOnboardingExam,
  advanceQuicktestExam,
  getCurrentOnboardingExam,
  getCurrentQuicktestExam,
  skipOnboarding,
  startOnboardingExam,
  startQuicktestExam,
} from "../../api/onboarding";
import { getIdentity } from "../../api/identity";
import { evaluateOral, evaluateTranslation } from "../../api/gemini";
import { mediaUrl } from "../../api/media";
import { blobToWavBlob } from "../../utils/audioEncode";
import HebrewInput from "../../components/HebrewInput";
import { OralAnswerCapture } from "../../components/OralAnswerCapture";
import { GeminiWaiting } from "../../components/GeminiWaiting";
import { QuoteBlock, SectionTitle } from "../../components/QuoteBlock";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import "../screens.css";

// Même pastille numérotée que les écrans révision/verbe et onboarding
// sign-in/register (cf. StepBadge dans ces fichiers, même taille/police) —
// cf. demande explicite du user ("applique la même logique design que dans
// l'écran examen blanc / teacher", pastilles numérotées "Traduis"/"Réponse").
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
        // Centre la pastille sur le bord gauche du trait/du bloc (même
        // largeur, cf. stepHr ci-dessous) plutôt que de l'y faire démarrer —
        // cf. demande explicite du user. Désactivable (centerOnEdge=false) :
        // le bloc "Évaluation" oral s'aligne plutôt sur l'axe des pastilles
        // d'OralAnswerCapture (cf. son usage plus bas), pas sur un trait.
        ...(centerOnEdge ? { position: "relative", left: -STEP_BADGE_SIZE / 2 } : {}),
      }}
    >
      {number}
    </span>
  );
}

// Même largeur que les blocs pastille (QuoteBlock/SectionTitle, width:100%
// maxWidth:320) — nécessaire pour que leurs bords gauches coïncident
// exactement (cf. StepBadge.left ci-dessus) ; auparavant 70%, ce qui
// désalignait le trait par rapport aux blocs — cf. demande explicite du
// user.
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

export default function OnboardingScreen({ onCompleted }) {
  const [phase, setPhase] = useState("loading"); // loading | intro | test-intro | question | done
  const [startError, setStartError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const pseudo = getIdentity()?.pseudo ?? "";

  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(7);
  const [question, setQuestion] = useState(null);
  const [result, setResult] = useState(null); // résultat Gemini de la question courante, une fois notée
  const [loadingGemini, setLoadingGemini] = useState(false);
  const [geminiError, setGeminiError] = useState(null);

  const [studentSolution, setStudentSolution] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  // Layout re-render son enfant à chaque poll actif-lockdown — sans ce
  // useMemo, URL.createObjectURL recréerait une nouvelle URL à chaque fois,
  // ce qui force le <audio> à recharger et interrompt la lecture en cours
  // (cf. ExamenOralScreen, même remarque).
  const audioUrl = useMemo(() => (audioBlob ? URL.createObjectURL(audioBlob) : null), [audioBlob]);

  const [doneResult, setDoneResult] = useState(null);
  // "classic" (7 questions fixes, algorithme actuel) | "quick" (4-6
  // questions, bissection adaptative, cf. app/quicktest_exam.py) — cf.
  // demande explicite du user ("Quick Test" en plus, sans rien casser).
  const [variant, setVariant] = useState("classic");

  useEffect(() => {
    // Reprise après reload : les deux parcours sont mutuellement exclusifs
    // (compléter l'un termine l'onboarding), mais une session peut avoir
    // été interrompue en cours de l'un OU l'autre — on vérifie le
    // classique d'abord, puis le Quick Test, cf. demande explicite du
    // user.
    getCurrentOnboardingExam().then((current) => {
      if (current.in_progress) {
        setVariant("classic");
        setQuestionNumber(current.question_number);
        setTotalQuestions(current.total_questions);
        setQuestion(current.question);
        setPhase("question");
        return;
      }
      getCurrentQuicktestExam().then((quickCurrent) => {
        if (quickCurrent.in_progress) {
          setVariant("quick");
          setQuestionNumber(quickCurrent.question_number);
          setTotalQuestions(quickCurrent.total_questions);
          setQuestion(quickCurrent.question);
          setPhase("question");
        } else {
          setPhase("intro");
        }
      });
    });
  }, []);

  function resetQuestionState() {
    setStudentSolution("");
    setAudioBlob(null);
    setIsRecording(false);
    setResult(null);
    setGeminiError(null);
  }

  async function handleStart(chosenVariant) {
    setVariant(chosenVariant);
    setStarting(true);
    setStartError(null);
    try {
      const data = await (chosenVariant === "quick" ? startQuicktestExam() : startOnboardingExam());
      setQuestionNumber(data.question_number);
      setTotalQuestions(data.total_questions);
      setQuestion(data.question);
      setPhase("question");
    } catch (e) {
      setStartError(e.message);
    } finally {
      setStarting(false);
    }
  }

  async function handleSkip() {
    setSkipping(true);
    setStartError(null);
    try {
      const data = await skipOnboarding();
      setDoneResult(data);
      setPhase("done");
    } catch (e) {
      setStartError(e.message);
    } finally {
      setSkipping(false);
    }
  }

  async function handleSubmitEcrit() {
    setLoadingGemini(true);
    setGeminiError(null);
    try {
      const geminiResult = await evaluateTranslation({
        lessonCode: question.lesson_code,
        position: question.position,
        direction: question.direction,
        studentSolution,
      });
      setResult(geminiResult);
    } catch (e) {
      setGeminiError(e.message);
    } finally {
      setLoadingGemini(false);
    }
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const rawBlob = new Blob(chunksRef.current, { type: recorder.mimeType });
      setIsConverting(true);
      try {
        setAudioBlob(await blobToWavBlob(rawBlob));
      } catch {
        setGeminiError("Impossible de traiter l'enregistrement audio. Réessaie.");
      } finally {
        setIsConverting(false);
      }
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  async function handleSubmitOral() {
    setLoadingGemini(true);
    setGeminiError(null);
    try {
      const geminiResult = await evaluateOral({
        textCode: question.text_code,
        questionIndex: question.question_index,
        audioBlob,
      });
      setResult(geminiResult);
    } catch (e) {
      setGeminiError(e.message);
    } finally {
      setLoadingGemini(false);
    }
  }

  async function handleNext() {
    const advance = variant === "quick" ? advanceQuicktestExam : advanceOnboardingExam;
    const response = await advance({
      questionNumber,
      kind: question.kind,
      result,
    });
    if (response.completed) {
      setDoneResult(response);
      setPhase("done");
      return;
    }
    setQuestionNumber(response.question_number);
    setTotalQuestions(response.total_questions);
    setQuestion(response.question);
    resetQuestionState();
  }

  // Avance automatiquement 5s après l'affichage de l'évaluation (plus de
  // bouton "Question suivante" manuel) — cf. demande explicite du user.
  useEffect(() => {
    if (!result) return;
    const timeout = setTimeout(handleNext, 5000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  if (phase === "loading" || (phase === "question" && !question)) return null;

  if (phase === "intro") {
    return (
      <section className="screen">
        {/* שלום non gras, pseudo en gras, "!" final — cf. demande explicite
            du user. */}
        <h1 className="hebrew" style={{ direction: "rtl", fontWeight: 400 }}>
          שלום <strong style={{ fontWeight: 600 }}>{pseudo}</strong> !
        </h1>
        <button
          type="button"
          className="exam-tile green"
          style={{ cursor: "pointer" }}
          disabled={skipping}
          onClick={() => setPhase("test-intro")}
        >
          Évaluer son niveau
        </button>
        <button
          type="button"
          className="exam-tile green pastel"
          style={{ cursor: "pointer" }}
          disabled={skipping}
          onClick={handleSkip}
        >
          Commencer à la première leçon
        </button>
      </section>
    );
  }

  if (phase === "test-intro") {
    return (
      <section className="screen">
        {/* 1.4em = 2em (taille par défaut d'un h1) * 0.7 : -30%, cf. demande
            explicite du user. */}
        <h1 style={{ fontSize: "1.4em" }}>Évaluation de ton niveau</h1>
        {/* Encadré de même largeur que le bouton "Commencer le test !" (.card
            et .exam-tile partagent width:100%/max-width:320px) ; police
            réduite de 15% (0.9em * 0.85 = 0.765em) — cf. demande explicite
            du user. */}
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
        {startError && (
          <p className="muted" style={{ color: "var(--annulationPleine)" }}>
            {startError}
          </p>
        )}
        {/* Bouton additionnel, au-dessus de "Commencer le test !" — lance
            l'algorithme adaptatif (4-6 questions, cf.
            backend/app/quicktest_exam.py) plutôt que les 7 questions
            fixes ci-dessous, sans rien changer à ce dernier — cf. demande
            explicite du user. */}
        <button
          type="button"
          className="exam-tile green pastel"
          style={{ cursor: "pointer" }}
          disabled={starting || skipping}
          onClick={() => handleStart("quick")}
        >
          Quick Test
        </button>
        <button
          type="button"
          className="exam-tile green"
          style={{ cursor: "pointer" }}
          disabled={starting || skipping}
          onClick={() => handleStart("classic")}
        >
          Commencer le test !
        </button>
        <button
          type="button"
          className="exam-tile green pastel"
          style={{ cursor: "pointer" }}
          disabled={starting || skipping}
          onClick={handleSkip}
        >
          Je préfère commencer à la première leçon
        </button>
      </section>
    );
  }

  if (phase === "done") {
    const chapId = doneResult.reference_lesson ? doneResult.reference_lesson.split(".")[0] : null;
    // "[label du chapitre].[index de la leçon]" — cf. demande explicite du
    // user. Repli sur un titre/message génériques si reference_lesson
    // manque (ex: skipOnboarding, qui ne fixe pas de niveau estimé).
    const levelLabel = chapId ? `${displayChapitreLabel(chapId)}.${displayLessonNumber(doneResult.reference_lesson)}` : null;
    return (
      <section className="screen">
        {/* 1.4em = 2em (taille par défaut d'un h1) * 0.7 : -30%. "Félicitations
            tu as le niveau" en graisse normale, le niveau lui-même en gras —
            cf. demande explicite du user. */}
        <h1 style={{ fontSize: "1.4em", fontWeight: 400 }}>
          {levelLabel ? (
            <>
              Félicitations tu as le niveau <strong style={{ fontWeight: 600 }}>{levelLabel}</strong> !
            </>
          ) : (
            "C'est parti !"
          )}
        </h1>
        {/* Encadré de même largeur que le bouton "Commencer" ci-dessous
            (.card et .exam-tile partagent width:100%/max-width:320px) — cf.
            demande explicite du user. */}
        <div className="card">
          <p className="muted" style={{ fontSize: "0.9em", margin: 0 }}>
            {levelLabel ? (
              <>
                Ton niveau vient d'être estimé à partir des résultats du test d'évaluation, tu as le niveau{" "}
                <strong style={{ fontWeight: 600 }}>{levelLabel}</strong>. Tu pourras toujours monter ou
                descendre de niveau en cliquant sur le milieu de la barre de contrôle si tu estimes que
                cela ne reflète pas ton niveau réel.
              </>
            ) : (
              "Ton niveau de départ vient d'être fixé à partir de tes réponses. Tu peux commencer à apprendre dès maintenant."
            )}
          </p>
        </div>
        <button type="button" className="exam-tile green" style={{ cursor: "pointer" }} onClick={onCompleted}>
          Commencer
        </button>
      </section>
    );
  }

  // true dès l'envoi de la réponse (pendant l'attente ET une fois notée) —
  // gèle le bloc "Réponse" (input/enregistreur) et affiche le bloc
  // "Évaluation" (vidéo d'attente puis note) sans jamais quitter cette
  // page ni masquer les blocs précédents — cf. demande explicite du user.
  const submitted = loadingGemini || !!result;

  return (
    <section className="screen">
      {/* Toujours affiché, même pendant l'avance automatique (le message
          clignotant "Prêt pour la question suivante ?" vit désormais sous
          les étoiles de chaque bloc "Évaluation", cf. plus bas) — cf.
          demande explicite du user. */}
      <p className="muted" style={{ margin: 0, textAlign: "center", width: "100%" }}>
        Question n° {questionNumber}/{totalQuestions}
      </p>

      {stepHr}

      {geminiError && (
        <p className="muted" style={{ color: "var(--annulationPleine)" }}>
          {geminiError}
        </p>
      )}

      {question.kind === "ecrit" && (
        <>
          {/* Même gabarit que QuestionEcriteScreen (mode "prof") : pastille +
              titre "Traduis", barre de citation + phrase française en gris
              italique — cf. demande explicite du user. Toujours affiché
              (seule l'indication "Question n°X/Y" du header se masque
              pendant l'avance automatique, pas ce bloc) — cf. demande
              explicite du user. */}
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
              {question.french}
            </p>
          </QuoteBlock>

          {/* Bloc "Réponse" (pastille 2, verte) : toujours affiché entre les
              deux traits, son contenu bascule du champ de saisie (avant
              envoi) au texte traduit figé (dès l'envoi, pas seulement une
              fois noté — sinon le champ resterait éditable et le bouton
              "Envoyer" cliquable pendant l'attente) — même pastille, cf.
              demande explicite du user. */}
          {stepHr}

          <div style={{ width: "100%", maxWidth: 320, marginTop: 20 }}>
            <SectionTitle>
              <StepBadge number={2} background="var(--validationGrisee)" color="var(--validationPleine)" />
              Réponse
            </SectionTitle>
            {!submitted ? (
              // HebrewInput ne relaie pas de prop "style", d'où ce div
              // wrapper pour le saut de ligne — cf. demande explicite du
              // user. Classe "onboarding-question-input" : bordure gris
              // clair et plus fine (au lieu du bleu nuit par défaut),
              // règle scopée à cet écran seul (cf. screens.css) — cf.
              // demande explicite du user.
              <div className="onboarding-question-input" style={{ marginTop: "1em" }}>
                <HebrewInput
                  key={questionNumber}
                  value={studentSolution}
                  onChange={setStudentSolution}
                  rows={3}
                  placeholder="Traduis !"
                />
              </div>
            ) : (
              // 1.248em = 0.96em * 1.3 : +30%, cf. demande explicite du
              // user. result.translation pas encore disponible pendant
              // l'attente : on retombe sur la réponse telle que tapée.
              <p
                className="hebrew"
                style={{ margin: "1em 0 0", fontSize: "1.248em", fontStyle: "italic", color: "var(--textSecondary)" }}
              >
                {result ? result.translation : studentSolution}
              </p>
            )}
          </div>

          {!submitted && (
            <button
              type="button"
              className="exam-tile green"
              style={{ marginTop: 4, cursor: studentSolution.trim() ? "pointer" : "default" }}
              disabled={!studentSolution.trim()}
              onClick={handleSubmitEcrit}
            >
              Envoyer ma réponse
            </button>
          )}

          {/* Bloc "Évaluation" (pastille 3, orange pastel) : affiché dès
              l'envoi (pas seulement une fois noté) — la vidéo d'attente
              (sans la tuile "courrier", non pertinente pour une correction
              aussi rapide) y remplace la note le temps de la requête, sans
              jamais quitter cette page ni masquer les blocs précédents —
              cf. demande explicite du user. Le message clignotant d'avance
              automatique vit sous la note. */}
          {submitted && (
            <>
              {stepHr}
              <div style={{ width: "100%", maxWidth: 320, marginTop: 20 }}>
                <SectionTitle>
                  <StepBadge number={3} background="#ffedd5" color="#c2410c" />
                  Évaluation
                </SectionTitle>
                <div style={{ marginTop: "1em" }}>
                  {loadingGemini ? (
                    <GeminiWaiting allowCourrier={false} />
                  ) : (
                    <>
                      <StarRating rating={result.score} />
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

      {question.kind === "oral" && (
        <>
          {/* Toujours affiché (seule l'indication "Question n°X/Y" du
              header se masque pendant l'avance automatique, pas ce
              bloc) — cf. demande explicite du user. Classe
              "onboarding-oral-answer-capture" : réduit l'espace au-dessus
              du bloc 1 (cf. screens.css), un trait le précède déjà ici
              (le header), contrairement aux autres écrans qui utilisent
              OralAnswerCapture sans trait avant le bloc 1 — cf. demande
              explicite du user. Bloc 3 ("Réponse") bascule vers la lecture
              dès l'envoi (pas seulement une fois noté, cf. `submitted` —
              sinon l'enregistreur resterait actif pendant l'attente), plus
              de verbatim ici, déplacé dans le bloc "Évaluation" — cf.
              resultAudioUrl (OralAnswerCapture.jsx). */}
          <div className="onboarding-oral-answer-capture" style={{ width: "100%" }}>
            <OralAnswerCapture
              contentSrc={mediaUrl(question.voicepath)}
              questionText={question.question_hebrew}
              showRecorder={!submitted}
              isRecording={isRecording}
              isConverting={isConverting}
              audioBlob={audioBlob}
              audioUrl={audioUrl}
              onStart={startRecording}
              onStop={stopRecording}
              onEnvoyer={handleSubmitOral}
              resultAudioUrl={submitted ? audioUrl : undefined}
            />
          </div>

          {/* Bloc "Évaluation" (pastille 4, orange pastel) : affiché dès
              l'envoi — vidéo d'attente (sans la tuile "courrier") le temps
              de la requête, puis verbatim + note, cf. demande explicite du
              user. Continue la numérotation des 3 blocs "originels"
              d'OralAnswerCapture — espace avant ce bloc réduit pour
              matcher l'espacement interne d'OralAnswerCapture (-8, comme
              le bloc 1 ci-dessus), pastille décalée à droite
              (marginLeft:33.5 = même calcul que TITLE_AXIS_OFFSET -
              STEP_BADGE_SIZE/2 dans OralAnswerCapture.jsx) pour s'aligner
              verticalement avec les pastilles 1/2/3, verbatim centré
              au-dessus des étoiles. */}
          {submitted && (
            <>
              {stepHr}
              <div style={{ width: "100%", maxWidth: 320, marginTop: -8 }}>
                <div style={{ marginLeft: 33.5 }}>
                  <SectionTitle>
                    <StepBadge number={4} background="#ffedd5" color="#c2410c" centerOnEdge={false} />
                    Évaluation
                  </SectionTitle>
                </div>
                <div style={{ marginTop: "1em", textAlign: "center" }}>
                  {loadingGemini ? (
                    <GeminiWaiting allowCourrier={false} />
                  ) : (
                    <>
                      <p className="hebrew" style={{ margin: 0, fontSize: "0.96em" }}>
                        <span style={{ fontStyle: "normal", color: "var(--textPrimary)" }}>Verbatim : </span>
                        <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>
                          {result.verbatim}
                        </span>
                      </p>
                      <div style={{ marginTop: 8 }}>
                        <StarRating
                          rating={Math.round(
                            (result.rating_completeness + result.rating_hebrew + result.rating_comprehension) / 3
                          )}
                        />
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
    </section>
  );
}
