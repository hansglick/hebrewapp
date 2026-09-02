import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getExamen } from "../../api/content";
import { answerExamen, getExamenStatus, getSessionExists } from "../../api/user";
import { evaluateTranslation, evaluateTranslationsGrouped } from "../../api/gemini";
import HebrewInput from "../../components/HebrewInput";
import { GeminiWaiting } from "../../components/GeminiWaiting";
import { QuizzBubbles } from "../../components/QuizzBubbles";
import { EvalWaitModeToggle } from "../../components/EvalWaitModeToggle";
import { ExamenBilanScreen } from "./ExamenBilanScreen";
import { useExamTimer } from "../../context/ExamTimerContext";
import { useConfig } from "../../config/ConfigContext";
import { displayLessonCode } from "../../utils/lessonDisplay";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { ShekelIcon } from "../../components/ShekelIcon";
import "../screens.css";

const RED_THRESHOLD_SECONDS = 5 * 60;
const TIMEOUT_ANSWER = { score: 1, translation: "", observations: ["Temps écoulé — question non traitée"] };

// SQLite renvoie "YYYY-MM-DD HH:MM:SS" en UTC sans indicateur de fuseau —
// sans le "Z", le navigateur l'interpréterait comme une heure locale.
function parseUtc(sqliteDatetime) {
  return Date.parse(`${sqliteDatetime.replace(" ", "T")}Z`);
}

// Les observations sont affichées en italique, mais un mot en hébreu au
// milieu d'une phrase française perd en lisibilité en italique — on l'en
// exempte pour qu'il ressorte mieux (cf. QuestionEcriteScreen, même logique).
function renderWithHebrewHighlight(text) {
  return text
    .split(/([֐-׿]+(?:[\s'"־][֐-׿]+)*)/g)
    .map((part, i) =>
      /[֐-׿]/.test(part) ? (
        <span key={i} className="hebrew" style={{ fontStyle: "normal" }}>
          {part}
        </span>
      ) : (
        part
      )
    );
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

function firstUnanswered(answers) {
  const i = answers.findIndex((a) => a === null);
  return i === -1 ? answers.length - 1 : i;
}

export default function ExamenEcritScreen() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { setTimer } = useExamTimer();
  const { godMode, evalWaitMode } = useConfig();
  const [exam, setExam] = useState(null);
  const [index, setIndex] = useState(0);
  const [studentSolution, setStudentSolution] = useState("");
  const [selectedQuizz, setSelectedQuizz] = useState(null);
  const [quizzSubmitted, setQuizzSubmitted] = useState(false);
  const [geminiError, setGeminiError] = useState(null);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const [finalResult, setFinalResult] = useState(null);
  const [attemptError, setAttemptError] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [confirmed, setConfirmed] = useState(null); // null=vérification en cours, true=go, false=confirmation requise
  const [pointsAGagner, setPointsAGagner] = useState(null);

  useEffect(() => {
    getExamenStatus(code).then((s) => setPointsAGagner(s.points_a_gagner_ecrit));
  }, [code]);
  // Mode "attendre l'évaluation globale" (cf. Layout) : réponses traduction
  // gardées ici en local (pas envoyées à Gemini tout de suite), traitées les
  // unes après les autres une fois toutes les questions couvertes.
  const [pendingAnswers, setPendingAnswers] = useState({});
  const [batchProgress, setBatchProgress] = useState(null);
  const timedOutRef = useRef(false);
  const batchRunningRef = useRef(false);

  // Une navigation accidentelle (ex: bouton "précédent" du navigateur)
  // ramenant directement sur cette URL ne doit PAS suffire à tirer une
  // nouvelle tentative : on vérifie d'abord si une tentative est déjà en
  // cours (auquel cas on la reprend directement, aucune confirmation
  // nécessaire) ; sinon on exige un clic explicite sur "Accepter" avant de
  // consommer un essai (cf. handleAccept, effet suivant).
  useEffect(() => {
    if (location.state?.abandonResult) return;
    setConfirmed(null);
    getSessionExists(code).then((exists) => setConfirmed(exists.ecrit));
  }, [code, location.state]);

  useEffect(() => {
    // Un abandon déclenché depuis la barre supérieure (Layout, hors de cet
    // écran) arrive ici avec le résultat déjà calculé côté serveur — la
    // session vient d'être supprimée, un nouveau fetch tirerait une
    // nouvelle tentative au lieu d'afficher le récapitulatif de celle
    // abandonnée.
    if (location.state?.abandonResult) {
      setFinalResult(location.state.abandonResult);
      return;
    }
    if (confirmed !== true) return;
    getExamen(code, godMode)
      .then((data) => {
        setExam(data);
        setIndex(firstUnanswered(data.answers));
        if (data.timer_seconds != null) {
          const elapsedActive = (Date.now() - parseUtc(data.created_at)) / 1000 - data.paused_seconds;
          setRemainingSeconds(Math.max(0, data.timer_seconds - elapsedActive));
        }
      })
      .catch((e) => setAttemptError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);

  // Cas le plus courant : l'abandon est déclenché depuis Layout PENDANT
  // qu'on est déjà sur cet écran — le pathname ne change pas (même leçon),
  // donc l'effet ci-dessus (gardé sur [code] pour ne pas re-fetcher un
  // examen déjà chargé) ne se redéclenche pas. On surveille location.state
  // séparément pour couvrir ce cas.
  useEffect(() => {
    if (location.state?.abandonResult) {
      setFinalResult(location.state.abandonResult);
    }
  }, [location.state]);

  useEffect(() => {
    setStudentSolution("");
    setGeminiError(null);
    setSelectedQuizz(null);
    setQuizzSubmitted(false);
  }, [index]);

  // Le minuteur tourne tant qu'il reste du temps et que l'examen n'est pas
  // terminé. Il est mis en pause (interval arrêté) pendant l'attente d'une
  // réponse Gemini, cf. handleSubmitOnline.
  useEffect(() => {
    if (remainingSeconds === null || finalResult || loadingGemini) return undefined;
    if (remainingSeconds <= 0) return undefined;
    const id = setInterval(() => {
      setRemainingSeconds((s) => (s === null ? null : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remainingSeconds === null, finalResult, loadingGemini]);

  // Reflète le minuteur dans la barre supérieure (Layout), et le retire à
  // la sortie de l'écran ou une fois l'examen terminé.
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
    const pendingIndexes = exam.answers
      .map((a, i) => (a === null ? i : -1))
      .filter((i) => i !== -1);
    const succeeded = [];
    for (const idx of pendingIndexes) {
      try {
        const response = await answerExamen(code, {
          examType: "ecrit",
          questionIndex: idx,
          answer: TIMEOUT_ANSWER,
        });
        succeeded.push(idx);
        lastResponse = response;
      } catch {
        // tant pis pour cette question, on continue avec les suivantes
      }
    }
    setExam((prev) => ({
      ...prev,
      answers: prev.answers.map((a, i) => (succeeded.includes(i) ? TIMEOUT_ANSWER : a)),
    }));
    if (lastResponse?.completed) {
      setFinalResult(lastResponse);
    }
  }

  async function handleSubmitOnline() {
    // Mode "évaluation globale" : on garde juste la réponse en local, sans
    // appeler Gemini ni le serveur maintenant — cf. l'effet ci-dessous qui
    // déclenche runBatch() une fois toutes les questions couvertes.
    if (evalWaitMode === "global") {
      setPendingAnswers((prev) => ({ ...prev, [index]: studentSolution }));
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
        direction: "hebreu",
        studentSolution,
      });
      const pauseSeconds = (Date.now() - pauseStart) / 1000;
      const response = await answerExamen(code, {
        examType: "ecrit",
        questionIndex: index,
        answer: result,
        pauseSeconds,
      });
      setExam((prev) => ({
        ...prev,
        answers: prev.answers.map((a, i) => (i === index ? result : a)),
      }));
      if (response.completed) {
        setFinalResult(response);
      }
    } catch (e) {
      setGeminiError(e.message);
    } finally {
      setLoadingGemini(false);
    }
  }

  // Traite séquentiellement les réponses traduction laissées en attente
  // (mode "évaluation globale"), une fois que toutes les questions de
  // l'examen ont reçu une réponse (cf. l'effet juste après). Ré-appelable
  // telle quelle pour réessayer après une erreur : les indices déjà notés
  // (exam.answers[i] non nul) sont automatiquement exclus.
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
      if (indices.length === 0) return;

      // Un seul appel Gemini pour tout le lot de traductions en attente,
      // plutôt qu'un par question (cf. plan "regroupement des évaluations").
      setBatchProgress({
        label: `Évaluation de ${indices.length === 1 ? "votre traduction" : `vos ${indices.length} traductions`}...`,
      });
      const items = indices.map((idx) => {
        const q = exam.questions[idx];
        return {
          identifiant: String(idx),
          lessonCode: q.lesson_code,
          position: q.position,
          direction: "hebreu",
          studentSolution: pendingAnswers[idx],
        };
      });
      const pauseStart = Date.now();
      const results = await evaluateTranslationsGrouped(items);
      const pauseSeconds = (Date.now() - pauseStart) / 1000;
      const byIdentifiant = new Map(results.map((r) => [r.identifiant, r]));

      let lastResponse = null;
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const result = byIdentifiant.get(String(idx));
        const response = await answerExamen(code, {
          examType: "ecrit",
          questionIndex: idx,
          answer: result,
          // Le temps d'attente Gemini n'est mesuré qu'une fois pour tout le
          // lot (un seul appel groupé) : crédité entièrement sur le premier
          // answerExamen de la passe, 0 sur les suivants — la somme
          // accumulée côté serveur (paused_seconds) reste correcte.
          pauseSeconds: i === 0 ? pauseSeconds : 0,
        });
        setExam((prev) => ({ ...prev, answers: prev.answers.map((a, j) => (j === idx ? result : a)) }));
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
  // (déjà notée côté serveur pour le quizz, ou en attente localement pour
  // les traductions) — c'est le moment où "l'examen se termine" en mode
  // évaluation globale.
  useEffect(() => {
    if (evalWaitMode !== "global" || !exam || finalResult || batchRunningRef.current) return;
    const allCovered = exam.questions.every((_, i) => exam.answers[i] !== null || pendingAnswers[i] !== undefined);
    if (allCovered && Object.keys(pendingAnswers).length > 0) runBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAnswers, exam, evalWaitMode, finalResult]);

  async function handleSubmitQuizz() {
    if (!selectedQuizz) return;
    try {
      const response = await answerExamen(code, {
        examType: "ecrit",
        questionIndex: index,
        answer: { selected_key: selectedQuizz },
      });
      setExam((prev) => ({
        ...prev,
        answers: prev.answers.map((a, i) => (i === index ? { selected_key: selectedQuizz } : a)),
      }));
      setQuizzSubmitted(true);
      if (response.completed) {
        setFinalResult(response);
      }
    } catch (e) {
      setAttemptError(e.message);
    }
  }

  useEffect(() => {
    const q = exam?.questions[index];
    if (!q || q.type !== "quizz" || exam.answers[index]) return undefined;
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Enter") handleSubmitQuizz();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, index, selectedQuizz]);

  // Après validation d'une question quizz, avance automatiquement à la
  // question suivante (si elle existe) au bout de 2 secondes — laisse le
  // temps de voir la bulle correcte s'allumer avant d'enchaîner, même
  // logique que l'écran Quizz des révisions. Mode "évaluation globale" :
  // géré uniformément par l'effet suivant, pas ici (évite un double avance).
  useEffect(() => {
    if (!quizzSubmitted || finalResult || evalWaitMode === "global") return undefined;
    const id = setTimeout(() => {
      setIndex((i) => (exam && i < exam.questions.length - 1 ? i + 1 : i));
    }, 2000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizzSubmitted]);

  // Mode "évaluation globale" : dès que la question courante a reçu une
  // réponse (déjà notée pour le quizz, ou en attente localement pour la
  // traduction), passe automatiquement à la suivante après 2s — le user n'a
  // pas à cliquer "▶" lui-même, cf. demande explicite.
  useEffect(() => {
    if (evalWaitMode !== "global" || finalResult || !exam) return undefined;
    const isAnswered = exam.answers[index] !== null || pendingAnswers[index] !== undefined;
    if (!isAnswered || index >= exam.questions.length - 1) return undefined;
    const id = setTimeout(() => setIndex((i) => i + 1), 2000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.answers[index], pendingAnswers[index], evalWaitMode, index, finalResult]);

  // L'ordre compte : un abandon déclenché depuis Layout affiche directement
  // le récapitulatif sans jamais charger `exam` (cf. effet ci-dessus).
  if (finalResult) {
    return (
      <ExamenBilanScreen code={code} finalResult={finalResult} onRetour={() => navigate(`/examen/cible/${code}`)} />
    );
  }

  if (confirmed === false) {
    return (
      <section className="screen">
        <h1>
          Lancer l'examen écrit {displayChapitreLabel(code.split(".")[0])} - {displayLessonCode(code)}
        </h1>
        <EvalWaitModeToggle />
        <p className="muted" style={{ fontSize: "0.8em" }}>
          {pointsAGagner > 0 ? (
            <>
              Vous gagnerez {Math.round(pointsAGagner)}{" "}
              <ShekelIcon size={11} style={{ verticalAlign: -1 }} /> en réussissant cet
              examen maintenant.
            </>
          ) : (
            <>
              0 <ShekelIcon size={11} style={{ verticalAlign: -1 }} /> pour l'instant (l'oral
              doit aussi être réussi pour que les points soient crédités).
            </>
          )}
        </p>
        <p className="muted" style={{ fontSize: "0.8em" }}>
          Une fois l'examen lancé, si vous abandonnez l'épreuve, alors la note la plus faible sera assigné aux
          questions auxquelles vous n'avez pas répondu. N'oubliez pas que vous avez seulement trois essais par
          jour.
        </p>
        <div style={{ display: "flex", gap: 16 }}>
          <button
            type="button"
            className="exam-tile green"
            style={{ cursor: "pointer" }}
            onClick={() => setConfirmed(true)}
          >
            Accepter
          </button>
          <button
            type="button"
            className="exam-tile red"
            onClick={() => navigate(`/examen/cible/${code}`, { replace: true })}
          >
            Refuser
          </button>
        </div>
      </section>
    );
  }

  if (!exam) return null;

  const q = exam.questions[index];
  const answer = exam.answers[index];

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
              Question {index + 1} / {exam.questions.length}
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

      <hr
        style={{
          width: "100%",
          maxWidth: 320,
          border: "none",
          borderTop: "1px solid var(--border)",
          margin: "1em 0 0",
        }}
      />

      {loadingGemini ? (
        <>
          <GeminiWaiting
            key={batchProgress ? "batch" : "single"}
            showCuriosite={exam.exam_type === "long" || exam.exam_type === "tres_long"}
            label={
              batchProgress ? (
                <>
                  Patientez quelques instants, votre professeur évalue votre copie
                  <br />
                  ({batchProgress.label})
                </>
              ) : undefined
            }
          />
        </>
      ) : (
        <>
          <p style={{ color: "var(--text)", margin: "1em 0 0", fontSize: "0.96em" }}>
            {q.french}
          </p>

          {attemptError && (
            <p className="muted" style={{ color: "var(--danger)" }}>
              {attemptError}
            </p>
          )}

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

          {!answer && q.type === "quizz" && (
            <>
              <QuizzBubbles
                options={q.options}
                correctKey={q.key}
                selectedKey={selectedQuizz}
                onSelect={setSelectedQuizz}
                disabled={false}
              />
              {selectedQuizz && (
                <button
                  type="button"
                  className="link-btn"
                  style={{
                    marginTop: 0,
                    fontStyle: "italic",
                    color: "var(--textMuted)",
                    fontSize: "0.75em",
                    textDecoration: "none",
                  }}
                  onClick={handleSubmitQuizz}
                >
                  Valider ma réponse
                </button>
              )}
            </>
          )}

          {!answer && q.type !== "quizz" && pendingAnswers[index] === undefined && (
            <>
              <HebrewInput
                key={index}
                value={studentSolution}
                onChange={setStudentSolution}
                rows={3}
                placeholder="Traduis !"
              />
              <button
                type="button"
                className="link-btn"
                style={{
                  marginTop: 0,
                  fontStyle: "italic",
                  color: "var(--textMuted)",
                  fontSize: "0.75em",
                  textDecoration: "none",
                }}
                disabled={!studentSolution.trim()}
                onClick={handleSubmitOnline}
              >
                Envoyer ma réponse
              </button>
            </>
          )}

          {!answer && q.type !== "quizz" && pendingAnswers[index] !== undefined && (
            <p className="hebrew" style={{ fontSize: "0.8em", margin: "1em 0 0" }}>
              <span style={{ color: "var(--text)" }}>Réponse enregistrée : </span>
              <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{pendingAnswers[index]}</span>
              <br />
              <span className="muted" style={{ fontStyle: "italic", fontSize: "0.75em" }}>
                Sera évaluée à la fin de l'examen.{" "}
                <button
                  type="button"
                  className="link-btn"
                  style={{ fontSize: "1em", fontStyle: "italic" }}
                  onClick={() => {
                    setStudentSolution(pendingAnswers[index]);
                    setPendingAnswers((prev) => {
                      const next = { ...prev };
                      delete next[index];
                      return next;
                    });
                  }}
                >
                  Modifier
                </button>
              </span>
            </p>
          )}

          {answer && q.type === "quizz" && (
            <>
              <QuizzBubbles
                options={q.options}
                correctKey={q.key}
                selectedKey={answer.selected_key}
                disabled
              />
              <p
                style={{
                  fontWeight: 600,
                  color: answer.selected_key === q.key ? "var(--success)" : "var(--danger)",
                }}
              >
                {answer.selected_key === q.key ? "Correct" : "Incorrect"}
              </p>
            </>
          )}

          {answer && q.type !== "quizz" && (
            <>
              <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
                <span style={{ color: "var(--text)" }}>Réponse de l'étudiant : </span>
                <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{answer.translation}</span>
              </p>

              <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />

              <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
                <tbody>
                  <tr>
                    <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                      Note
                    </td>
                    <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                      <StarRating rating={answer.score} />
                    </td>
                  </tr>
                  {answer.observations.length > 0 && (
                    <tr>
                      <td
                        colSpan={2}
                        style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}
                      >
                        <ul
                          style={{
                            margin: 0,
                            paddingInlineStart: "1.2em",
                            fontStyle: "italic",
                            fontSize: "0.85em",
                            color: "var(--textMuted)",
                          }}
                        >
                          {answer.observations.map((obs, i) => (
                            <li key={i}>{renderWithHebrewHighlight(obs)}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </section>
  );
}
