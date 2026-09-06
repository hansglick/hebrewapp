import { useEffect, useMemo, useRef, useState } from "react";
import {
  abandonOnboardingExam,
  advanceOnboardingExam,
  getCurrentOnboardingExam,
  skipOnboarding,
  startOnboardingExam,
} from "../../api/onboarding";
import { getIdentity } from "../../api/identity";
import { evaluateOral, evaluateTranslation } from "../../api/gemini";
import { mediaUrl } from "../../api/media";
import { blobToWavBlob } from "../../utils/audioEncode";
import HebrewInput from "../../components/HebrewInput";
import { OralAnswerCapture } from "../../components/OralAnswerCapture";
import { GeminiWaiting } from "../../components/GeminiWaiting";
import { ChapitreLogo } from "../../components/ChapitreLogo";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import "../screens.css";

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
  const [abandoning, setAbandoning] = useState(false);
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

  useEffect(() => {
    getCurrentOnboardingExam().then((current) => {
      if (current.in_progress) {
        setQuestionNumber(current.question_number);
        setTotalQuestions(current.total_questions);
        setQuestion(current.question);
        setPhase("question");
      } else {
        setPhase("intro");
      }
    });
  }, []);

  function resetQuestionState() {
    setStudentSolution("");
    setAudioBlob(null);
    setIsRecording(false);
    setResult(null);
    setGeminiError(null);
  }

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      const data = await startOnboardingExam();
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

  async function handleAbandonTest() {
    if (!window.confirm("Abandonner le test ? Les questions restantes recevront la note minimale.")) return;
    setAbandoning(true);
    try {
      const response = await abandonOnboardingExam();
      setDoneResult(response);
      setPhase("done");
    } finally {
      setAbandoning(false);
    }
  }

  async function handleNext() {
    const response = await advanceOnboardingExam({
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

  if (phase === "loading" || (phase === "question" && !question)) return null;

  if (phase === "intro") {
    return (
      <section className="screen">
        <h1 className="hebrew" style={{ direction: "rtl" }}>
          שלום {pseudo}
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
        <h1>Évaluation de ton niveau</h1>
        <p className="muted" style={{ fontSize: "0.9em" }}>
          7 questions (un mélange de traductions écrites et de questions orales) pour te proposer des
          leçons adaptées à ton niveau — réponds du mieux que tu peux, il n'y a pas de mauvaise surprise
          possible : si le niveau retenu s'avère trop facile ou trop difficile, tu pourras toujours
          demander une équivalence par la suite pour ajuster dans un sens comme dans l'autre.
        </p>
        {startError && (
          <p className="muted" style={{ color: "var(--annulationPleine)" }}>
            {startError}
          </p>
        )}
        <button
          type="button"
          className="exam-tile green"
          style={{ cursor: "pointer" }}
          disabled={starting || skipping}
          onClick={handleStart}
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
    return (
      <section className="screen">
        <h1>C'est parti !</h1>
        {chapId && (
          <div className="card" style={{ textAlign: "center" }}>
            <ChapitreLogo chapId={chapId} size="3.4em" style={{ marginInlineStart: 0 }} />
            <div style={{ fontWeight: 600, margin: "6px 0 0" }}>
              {displayChapitreLabel(chapId)} — {displayLessonNumber(doneResult.reference_lesson)}
            </div>
          </div>
        )}
        <p className="muted" style={{ fontSize: "0.9em" }}>
          Ton niveau de départ vient d'être fixé à partir de tes réponses. Tu peux commencer à apprendre dès
          maintenant.
        </p>
        <button type="button" className="exam-tile green" style={{ cursor: "pointer" }} onClick={onCompleted}>
          Commencer
        </button>
      </section>
    );
  }

  return (
    <section className="screen">
      <p className="muted" style={{ margin: 0 }}>
        Question {questionNumber} / {totalQuestions}
      </p>

      {loadingGemini ? (
        <GeminiWaiting />
      ) : (
        <>
          <button
            type="button"
            className="exam-tile red pastel"
            style={{ cursor: "pointer", maxWidth: 200, padding: "8px", fontSize: "0.85em" }}
            disabled={abandoning}
            onClick={handleAbandonTest}
          >
            Abandonner le test
          </button>

          {geminiError && (
            <p className="muted" style={{ color: "var(--annulationPleine)" }}>
              {geminiError}
            </p>
          )}

          {question.kind === "ecrit" && (
            <>
              <p style={{ color: "var(--textPrimary)", margin: "1em 0 0", fontSize: "0.96em" }}>{question.french}</p>

              {!result && (
                <>
                  <HebrewInput
                    key={questionNumber}
                    value={studentSolution}
                    onChange={setStudentSolution}
                    rows={3}
                    placeholder="Traduis !"
                  />
                  <button
                    type="button"
                    className="exam-tile green"
                    style={{ marginTop: 0, cursor: studentSolution.trim() ? "pointer" : "default" }}
                    disabled={!studentSolution.trim()}
                    onClick={handleSubmitEcrit}
                  >
                    Envoyer ma réponse
                  </button>
                </>
              )}

              {result && (
                <>
                  <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
                    <span style={{ color: "var(--textPrimary)" }}>Réponse de l'étudiant : </span>
                    <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>{result.translation}</span>
                  </p>
                  <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0" }} />
                  <StarRating rating={result.score} />
                </>
              )}
            </>
          )}

          {question.kind === "oral" && (
            <>
              <OralAnswerCapture
                contentSrc={mediaUrl(question.voicepath)}
                questionText={question.question_hebrew}
                showRecorder={!result}
                isRecording={isRecording}
                isConverting={isConverting}
                audioBlob={audioBlob}
                audioUrl={audioUrl}
                onStart={startRecording}
                onStop={stopRecording}
                onEnvoyer={handleSubmitOral}
              />

              {result && (
                <>
                  <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
                    <span style={{ color: "var(--textPrimary)" }}>Réponse de l'étudiant : </span>
                    <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>{result.verbatim}</span>
                  </p>
                  <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0" }} />
                  <StarRating
                    rating={Math.round(
                      (result.rating_completeness + result.rating_hebrew + result.rating_comprehension) / 3
                    )}
                  />
                </>
              )}
            </>
          )}

          {result && (
            <button
              type="button"
              className="link-btn"
              style={{ fontStyle: "italic", color: "var(--textSecondary)", fontSize: "0.96em", textDecoration: "none" }}
              onClick={handleNext}
            >
              {questionNumber < totalQuestions ? "Question suivante" : "Voir mon niveau"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
