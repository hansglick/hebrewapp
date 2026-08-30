import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getExamenHard, getExamenHardStatus } from "../../api/content";
import { answerExamenHard } from "../../api/user";
import { evaluateTranslation, evaluateOral } from "../../api/gemini";
import { mediaUrl } from "../../api/media";
import { speak } from "../../utils/speech";
import { blobToWavBlob } from "../../utils/audioEncode";
import HebrewInput from "../../components/HebrewInput";
import "../../components/HebrewInput.css";
import { AudioPlayer } from "../../components/AudioPlayer";
import { WaitingVideo } from "../../components/WaitingVideo";
import { QuizzBubbles } from "../../components/QuizzBubbles";
import { EvalWaitModeToggle } from "../../components/EvalWaitModeToggle";
import { useExamTimer } from "../../context/ExamTimerContext";
import { useConfig } from "../../config/ConfigContext";
import "../screens.css";

const RED_THRESHOLD_SECONDS = 2 * 60;

// SQLite renvoie "YYYY-MM-DD HH:MM:SS" en UTC sans indicateur de fuseau —
// sans le "Z", le navigateur l'interpréterait comme une heure locale.
function parseUtc(sqliteDatetime) {
  return Date.parse(`${sqliteDatetime.replace(" ", "T")}Z`);
}

function firstUnanswered(answers) {
  const i = answers.findIndex((a) => a === null);
  return i === -1 ? answers.length - 1 : i;
}

function timeoutAnswerFor(question) {
  if (question.type === "verbe") return { submitted: "" };
  if (question.type === "quizz") return { selected_key: null };
  if (question.type === "traduction") {
    return { score: 1, translation: "", observations: ["Temps écoulé — question non traitée"] };
  }
  return {
    verbatim: "",
    rating_completeness: 1,
    errors_rating_completeness: [],
    rating_hebrew: 1,
    errors_rating_hebrew: [],
    rating_comprehension: 1,
    errors_rating_comprehension: [],
  };
}

function StarRating({ rating }) {
  return (
    <span aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= rating ? "#f5b301" : "var(--textMuted)" }}>
          ★
        </span>
      ))}
    </span>
  );
}

const QUESTION_LABELS = {
  verbe: "Verbe",
  traduction: "Traduction",
  quizz: "Quizz",
  oral: "Oral",
};

export default function ExamenHardPasserScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setTimer } = useExamTimer();
  const { evalWaitMode } = useConfig();
  const [exam, setExam] = useState(null);
  const [index, setIndex] = useState(0);
  const [studentSolution, setStudentSolution] = useState("");
  const [selectedQuizz, setSelectedQuizz] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [geminiError, setGeminiError] = useState(null);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const [finalResult, setFinalResult] = useState(null);
  const [attemptError, setAttemptError] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [confirmed, setConfirmed] = useState(null); // null=vérification en cours, true=go, false=confirmation requise
  // Mode "attendre l'évaluation globale" (cf. Layout) : réponses traduction/
  // oral gardées ici en local, traitées les unes après les autres une fois
  // toutes les questions couvertes. {[index]: {type, studentSolution?, audioBlob?}}
  const [pendingAnswers, setPendingAnswers] = useState({});
  const [batchProgress, setBatchProgress] = useState(null);
  const timedOutRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const batchRunningRef = useRef(false);

  // Layout re-render son enfant (via <Outlet/>) à chaque poll actif-lockdown
  // (toutes les 5s pendant l'examen) — sans ce useMemo, URL.createObjectURL
  // recréerait une nouvelle URL à chaque fois, ce qui force le <audio> à
  // recharger et interrompt la lecture en cours.
  const audioUrl = useMemo(() => (audioBlob ? URL.createObjectURL(audioBlob) : null), [audioBlob]);

  // Même précaution que ExamenEcritScreen/ExamenOralScreen : une navigation
  // accidentelle ne doit pas consommer l'unique essai disponible sans
  // confirmation explicite.
  useEffect(() => {
    if (location.state?.abandonResult) return;
    setConfirmed(null);
    getExamenHardStatus().then((s) => setConfirmed(s.session_exists));
  }, [location.state]);

  useEffect(() => {
    if (location.state?.abandonResult) {
      setFinalResult(location.state.abandonResult);
      return;
    }
    if (confirmed !== true) return;
    getExamenHard()
      .then((data) => {
        setExam(data);
        setIndex(firstUnanswered(data.answers));
        const elapsedActive = (Date.now() - parseUtc(data.created_at)) / 1000 - data.paused_seconds;
        setRemainingSeconds(Math.max(0, data.timer_seconds - elapsedActive));
      })
      .catch((e) => setAttemptError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);

  useEffect(() => {
    if (location.state?.abandonResult) {
      setFinalResult(location.state.abandonResult);
    }
  }, [location.state]);

  useEffect(() => {
    setStudentSolution("");
    setSelectedQuizz(null);
    setGeminiError(null);
    setAudioBlob(null);
    setIsRecording(false);
  }, [index]);

  // Mode "évaluation globale" : dès que la question courante a reçu une
  // réponse (déjà notée pour verbe/quizz, ou en attente localement pour
  // traduction/oral), passe automatiquement à la suivante après 2s.
  useEffect(() => {
    if (evalWaitMode !== "global" || finalResult || !exam) return undefined;
    const isAnswered = exam.answers[index] !== null || pendingAnswers[index] !== undefined;
    if (!isAnswered || index >= exam.questions.length - 1) return undefined;
    const id = setTimeout(() => setIndex((i) => i + 1), 2000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.answers[index], pendingAnswers[index], evalWaitMode, index, finalResult]);

  // Minuteur : tourne tant qu'il reste du temps, en pause pendant l'attente
  // Gemini (traduction/oral) — même mécanisme que ExamenEcritScreen.
  useEffect(() => {
    if (remainingSeconds === null || finalResult || loadingGemini) return undefined;
    if (remainingSeconds <= 0) return undefined;
    const id = setInterval(() => {
      setRemainingSeconds((s) => (s === null ? null : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remainingSeconds === null, finalResult, loadingGemini]);

  useEffect(() => {
    if (remainingSeconds === null || finalResult) {
      setTimer(null);
      return undefined;
    }
    setTimer({ remainingSeconds, isRed: remainingSeconds <= RED_THRESHOLD_SECONDS });
    return undefined;
  }, [remainingSeconds, finalResult, setTimer]);

  useEffect(() => () => setTimer(null), [setTimer]);

  useEffect(() => {
    if (remainingSeconds === 0 && !timedOutRef.current && exam && !finalResult) {
      timedOutRef.current = true;
      handleTimeUp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds]);

  async function handleTimeUp() {
    let lastResponse = null;
    const pendingIndexes = exam.answers.map((a, i) => (a === null ? i : -1)).filter((i) => i !== -1);
    for (const idx of pendingIndexes) {
      try {
        const response = await answerExamenHard({ questionIndex: idx, answer: timeoutAnswerFor(exam.questions[idx]) });
        lastResponse = response;
      } catch {
        // tant pis pour cette question, on continue avec les suivantes
      }
    }
    if (lastResponse?.completed) setFinalResult(lastResponse);
  }

  async function submitAnswer(answer, pauseSeconds = 0) {
    const response = await answerExamenHard({ questionIndex: index, answer, pauseSeconds });
    setExam((prev) => ({ ...prev, answers: prev.answers.map((a, i) => (i === index ? answer : a)) }));
    if (response.completed) setFinalResult(response);
    return response;
  }

  async function handleSubmitVerbe() {
    if (!studentSolution.trim()) return;
    try {
      await submitAnswer({ submitted: studentSolution });
    } catch (e) {
      setAttemptError(e.message);
    }
  }

  async function handleSubmitQuizz() {
    if (!selectedQuizz) return;
    try {
      await submitAnswer({ selected_key: selectedQuizz });
    } catch (e) {
      setAttemptError(e.message);
    }
  }

  async function handleSubmitTraduction() {
    if (evalWaitMode === "global") {
      setPendingAnswers((prev) => ({ ...prev, [index]: { type: "traduction", studentSolution } }));
      return;
    }
    const q = exam.questions[index];
    setLoadingGemini(true);
    setGeminiError(null);
    const pauseStart = Date.now();
    try {
      const result = await evaluateTranslation({
        lessonCode: q.lesson_code,
        position: q.position,
        direction: q.direction,
        studentSolution,
      });
      const pauseSeconds = (Date.now() - pauseStart) / 1000;
      await submitAnswer(result, pauseSeconds);
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
    if (evalWaitMode === "global") {
      setPendingAnswers((prev) => ({ ...prev, [index]: { type: "oral", audioBlob } }));
      return;
    }
    const q = exam.questions[index];
    setLoadingGemini(true);
    setGeminiError(null);
    const pauseStart = Date.now();
    try {
      const result = await evaluateOral({ textCode: q.text_code, questionIndex: q.question_index, audioBlob });
      const pauseSeconds = (Date.now() - pauseStart) / 1000;
      await submitAnswer(result, pauseSeconds);
    } catch (e) {
      setGeminiError(e.message);
    } finally {
      setLoadingGemini(false);
    }
  }

  // Traite séquentiellement les réponses laissées en attente (mode
  // "évaluation globale"), une fois que toutes les questions ont reçu une
  // réponse — cf. l'effet juste après. Ré-appelable pour réessayer après
  // une erreur (les indices déjà notés sont exclus).
  async function runBatch() {
    if (batchRunningRef.current) return;
    batchRunningRef.current = true;
    setLoadingGemini(true);
    setGeminiError(null);
    try {
      const indices = Object.keys(pendingAnswers)
        .map(Number)
        .filter((i) => exam.answers[i] === null)
        .sort((a, b) => a - b);
      let lastResponse = null;
      for (const idx of indices) {
        setBatchProgress({ current: idx + 1, total: exam.questions.length });
        const q = exam.questions[idx];
        const pending = pendingAnswers[idx];
        const pauseStart = Date.now();
        let result;
        if (pending.type === "traduction") {
          result = await evaluateTranslation({
            lessonCode: q.lesson_code,
            position: q.position,
            direction: q.direction,
            studentSolution: pending.studentSolution,
          });
        } else {
          result = await evaluateOral({ textCode: q.text_code, questionIndex: q.question_index, audioBlob: pending.audioBlob });
        }
        const pauseSeconds = (Date.now() - pauseStart) / 1000;
        const response = await answerExamenHard({ questionIndex: idx, answer: result, pauseSeconds });
        setExam((prev) => ({ ...prev, answers: prev.answers.map((a, i) => (i === idx ? result : a)) }));
        lastResponse = response;
      }
      setBatchProgress(null);
      if (lastResponse?.completed) setFinalResult(lastResponse);
    } catch (e) {
      setGeminiError(e.message);
    } finally {
      setLoadingGemini(false);
      batchRunningRef.current = false;
    }
  }

  // Déclenche runBatch() dès que toutes les questions ont une réponse
  // (déjà notée côté serveur pour verbe/quizz, ou en attente localement).
  useEffect(() => {
    if (evalWaitMode !== "global" || !exam || finalResult || batchRunningRef.current) return;
    const allCovered = exam.questions.every((_, i) => exam.answers[i] !== null || pendingAnswers[i] !== undefined);
    if (allCovered && Object.keys(pendingAnswers).length > 0) runBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAnswers, exam, evalWaitMode, finalResult]);

  if (finalResult) {
    return (
      <section className="screen">
        <h1 style={{ fontWeight: 700, color: finalResult.passed ? "var(--success)" : "var(--danger)" }}>
          {finalResult.passed ? "Réussi" : "Echec"}
        </h1>
        <ul style={{ margin: 0, paddingInlineStart: "1.2em", textAlign: "start" }}>
          <li>Note moyenne : {finalResult.average_note.toFixed(1)} / 5</li>
          <li>Taux de bonnes réponses : {Math.round(finalResult.success_ratio * 100)}%</li>
        </ul>
        <p style={{ margin: 0, fontSize: "0.75em", color: "var(--textMuted)", fontStyle: "italic" }}>
          Seuil requis : {Math.round((finalResult.pass_threshold ?? 0.9) * 100)}%
        </p>
        {finalResult.attempt_id != null && (
          <button
            type="button"
            className="link-btn"
            onClick={() => navigate(`/examen/hard/copies/${finalResult.attempt_id}`)}
          >
            Consulter ma copie
          </button>
        )}
        <button type="button" className="link-btn" onClick={() => navigate("/examen")}>
          Retour à l'examen
        </button>
      </section>
    );
  }

  if (confirmed === false) {
    return (
      <section className="screen">
        <h1>Lancer le hard exam ?</h1>
        <p className="muted">Un seul essai — bloqué à nouveau à l'issue, réussite ou échec.</p>
        <EvalWaitModeToggle />
        <div style={{ display: "flex", gap: 16 }}>
          <button type="button" className="link-btn" onClick={() => setConfirmed(true)}>
            Accepter
          </button>
          <button type="button" className="link-btn" onClick={() => navigate("/examen/hard", { replace: true })}>
            Refuser
          </button>
        </div>
      </section>
    );
  }

  if (attemptError) {
    return (
      <section className="screen">
        <p className="muted" style={{ color: "var(--danger)" }}>
          {attemptError}
        </p>
        <button type="button" className="link-btn" onClick={() => navigate("/examen")}>
          Retour à l'examen
        </button>
      </section>
    );
  }

  if (!exam) return null;

  const q = exam.questions[index];
  const answer = exam.answers[index];
  // La réponse stockée localement pour "verbe" est la soumission brute
  // ({submitted: ...}), pas un résultat noté (contrairement à traduction/
  // oral, dont l'objet stocké est directement la réponse Gemini) — on
  // recalcule donc la réussite ici, même comparaison stricte que le serveur
  // (cf. app.hard_exam._note_and_success).
  const verbeCorrect =
    q?.type === "verbe" && answer ? (answer.submitted || "").trim() === (q.conjugaison || "").trim() : false;

  return (
    <section className="screen">
      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
        <tbody>
          <tr>
            <td style={{ border: "1px solid transparent", padding: "4px 8px", width: "25%", textAlign: "start" }}>
              <button
                type="button"
                className="link-btn"
                style={{ textDecoration: "none", color: "var(--text)" }}
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                ◀
              </button>
            </td>
            <td className="muted" style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "center" }}>
              Question {index + 1} / {exam.questions.length}{" "}
              <span style={{ fontSize: "0.85em" }}>({QUESTION_LABELS[q.type]})</span>
            </td>
            <td style={{ border: "1px solid transparent", padding: "4px 8px", width: "25%", textAlign: "end" }}>
              <button
                type="button"
                className="link-btn"
                style={{ textDecoration: "none", color: "var(--text)" }}
                disabled={index === exam.questions.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                ▶
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <hr style={{ width: "100%", maxWidth: 320, border: "none", borderTop: "1px solid var(--border)", margin: "1em 0 0" }} />

      {loadingGemini ? (
        <WaitingVideo
          key={batchProgress ? batchProgress.current : "single"}
          label={
            batchProgress ? (
              <>
                Patientez quelques instants, votre professeur évalue votre copie
                <br />
                (question n° {batchProgress.current} / {batchProgress.total})
              </>
            ) : undefined
          }
        />
      ) : (
        <>
          {geminiError && (
            <>
              <p className="muted" style={{ color: "var(--danger)" }}>
                {geminiError}
              </p>
              {Object.keys(pendingAnswers).length > 0 && (
                <button type="button" className="link-btn" onClick={runBatch}>
                  Réessayer
                </button>
              )}
            </>
          )}

          {q.type === "verbe" && (
            <>
              <p style={{ margin: "1em 0 0" }}>
                <span className="hebrew" style={{ fontSize: "1.2em" }}>
                  {q.verbe}
                </span>{" "}
                <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>({q.traduction})</span>
              </p>
              <p className="muted" style={{ margin: "4px 0" }}>
                {q.temps} — {q.personne}
              </p>
              {!answer && (
                <>
                  <HebrewInput key={index} value={studentSolution} onChange={setStudentSolution} rows={1} placeholder="Conjugue !" />
                  <button
                    type="button"
                    className="link-btn"
                    style={{ fontStyle: "italic", color: "var(--textMuted)", fontSize: "0.75em", textDecoration: "none" }}
                    disabled={!studentSolution.trim()}
                    onClick={handleSubmitVerbe}
                  >
                    Envoyer ma réponse
                  </button>
                </>
              )}
              {answer && (
                <>
                  <p className="hebrew" style={{ fontSize: "0.9em", margin: "0.4em 0" }}>
                    <span style={{ color: "var(--text)" }}>Réponse : </span>
                    <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{answer.submitted || "—"}</span>
                  </p>
                  <p style={{ fontWeight: 600, color: verbeCorrect ? "var(--success)" : "var(--danger)" }}>
                    {verbeCorrect ? "Correct" : "Incorrect"}
                  </p>
                  {!verbeCorrect && (
                    <p className="hebrew" style={{ fontSize: "0.9em", margin: 0 }}>
                      <span style={{ color: "var(--success)", fontWeight: 600 }}>{q.conjugaison}</span>{" "}
                      <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>(solution)</span>
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {q.type === "quizz" && (
            <>
              <p style={{ color: "var(--text)", margin: "1em 0 0" }}>{q.french}</p>
              {!answer && (
                <>
                  <QuizzBubbles
                    options={q.options}
                    correctKey={q.key}
                    selectedKey={selectedQuizz}
                    onSelect={setSelectedQuizz}
                    disabled={false}
                  />
                  {selectedQuizz && (
                    <button type="button" className="link-btn" onClick={handleSubmitQuizz}>
                      Valider
                    </button>
                  )}
                </>
              )}
              {answer && (
                <>
                  <QuizzBubbles options={q.options} correctKey={q.key} selectedKey={answer.selected_key} disabled />
                  <p style={{ fontWeight: 600, color: answer.selected_key === q.key ? "var(--success)" : "var(--danger)" }}>
                    {answer.selected_key === q.key ? "Correct" : "Incorrect"}
                  </p>
                </>
              )}
            </>
          )}

          {q.type === "traduction" && (
            <>
              <p style={{ color: "var(--text)", margin: "1em 0 0" }}>{q.direction === "hebreu" ? q.french : q.hebrew}</p>
              {!answer && !pendingAnswers[index] && q.direction === "hebreu" && (
                <HebrewInput key={index} value={studentSolution} onChange={setStudentSolution} rows={3} placeholder="Traduis !" />
              )}
              {!answer && !pendingAnswers[index] && q.direction === "francais" && (
                <input
                  type="text"
                  value={studentSolution}
                  onChange={(e) => setStudentSolution(e.target.value)}
                  placeholder="Traduis !"
                  className="hebrew-input-textarea"
                  style={{ width: "100%", maxWidth: 320, fontFamily: "var(--font-latin)" }}
                />
              )}
              {!answer && !pendingAnswers[index] && (
                <button
                  type="button"
                  className="link-btn"
                  style={{ fontStyle: "italic", color: "var(--textMuted)", fontSize: "0.75em", textDecoration: "none" }}
                  disabled={!studentSolution.trim()}
                  onClick={handleSubmitTraduction}
                >
                  Envoyer ma réponse
                </button>
              )}
              {!answer && pendingAnswers[index] && (
                <p className="muted" style={{ fontStyle: "italic", fontSize: "0.8em" }}>
                  Réponse enregistrée — sera évaluée à la fin de l'examen.
                </p>
              )}
              {answer && (
                <>
                  <p className="hebrew" style={{ fontSize: "0.8em", margin: "1em 0 0" }}>
                    <span style={{ color: "var(--text)" }}>Réponse : </span>
                    <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{answer.translation}</span>
                  </p>
                  <StarRating rating={answer.score} />
                  {answer.observations?.length > 0 && (
                    <ul
                      style={{
                        margin: "4px 0 0",
                        paddingInlineStart: "1.2em",
                        fontStyle: "italic",
                        fontSize: "0.85em",
                        color: "var(--textMuted)",
                        textAlign: "start",
                      }}
                    >
                      {answer.observations.map((obs, i) => (
                        <li key={i}>{obs}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}

          {q.type === "oral" && (
            <>
              <p className="muted" style={{ fontSize: "0.7em", margin: 0 }}>
                {q.text_code}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <AudioPlayer src={mediaUrl(q.voicepath)} barMaxWidth={58.5} toggleSize={27} />
                <button
                  type="button"
                  onClick={() => speak(q.question_hebrew)}
                  aria-label="Écouter la question"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 27,
                    height: 27,
                    borderRadius: "50%",
                    background: "#000",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "1.1em",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  ?
                </button>
                {!answer && !pendingAnswers[index] && !audioBlob && !isRecording && !isConverting && (
                  <button
                    type="button"
                    className="speak-btn"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--textMuted)", fontSize: "0.675em" }}
                    onClick={startRecording}
                  >
                    <span style={{ display: "inline-block", width: 27, height: 27, borderRadius: "50%", background: "var(--danger)" }} />
                    Répondre
                  </button>
                )}
              </div>

              {!answer && pendingAnswers[index] && (
                <p className="muted" style={{ fontStyle: "italic", fontSize: "0.8em" }}>
                  Réponse enregistrée — sera évaluée à la fin de l'examen.
                </p>
              )}

              {!answer && !pendingAnswers[index] && (
                <>
                  {isRecording && (
                    <button type="button" className="link-btn" onClick={stopRecording}>
                      ⏹️ Arrêter
                    </button>
                  )}
                  {isConverting && <p className="muted">Traitement de l'enregistrement...</p>}
                  {audioBlob && !isRecording && !loadingGemini && (
                    <>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio controls src={audioUrl} />
                      <div style={{ display: "flex", gap: 12 }}>
                        <button type="button" className="speak-btn" style={{ color: "var(--textMuted)", fontSize: "0.8em" }} onClick={() => setAudioBlob(null)}>
                          Recommencer
                        </button>
                        <button type="button" className="speak-btn" style={{ color: "var(--textMuted)", fontSize: "0.8em" }} onClick={handleSubmitOral}>
                          Envoyer
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {answer && (
                <>
                  <p className="hebrew" style={{ fontSize: "0.8em", margin: "1em 0 0" }}>
                    <span style={{ color: "var(--text)" }}>Réponse : </span>
                    <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{answer.verbatim}</span>
                  </p>
                  <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
                    <tbody>
                      <tr>
                        <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>Complétude</td>
                        <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                          <StarRating rating={answer.rating_completeness} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>Grammaire</td>
                        <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                          <StarRating rating={answer.rating_hebrew} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>Compréhension</td>
                        <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                          <StarRating rating={answer.rating_comprehension} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
