import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getExamenOral } from "../../api/content";
import { answerExamen, getExamenStatus, getSessionExists } from "../../api/user";
import { evaluateOral, evaluateOralsGrouped, evaluateReport, evaluateReportsGrouped } from "../../api/gemini";
import { mediaUrl } from "../../api/media";
import { blobToWavBlob } from "../../utils/audioEncode";
import { AudioPlayer } from "../../components/AudioPlayer";
import { OralAnswerCapture } from "../../components/OralAnswerCapture";
import { GeminiWaiting } from "../../components/GeminiWaiting";
import { VoicePrefill } from "../../components/VoicePrefill";
import { EvalWaitModeToggle } from "../../components/EvalWaitModeToggle";
import { ExamenBilanScreen } from "./ExamenBilanScreen";
import { useConfig } from "../../config/ConfigContext";
import { displayLessonCode } from "../../utils/lessonDisplay";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { ShekelIcon } from "../../components/ShekelIcon";
import "../screens.css";

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Les observations sont affichées en italique, mais un mot en hébreu au
// milieu d'une phrase française perd en lisibilité en italique — on l'en
// exempte pour qu'il ressorte mieux.
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

function computeGlobalNote(result) {
  const ratings = [result.rating_completeness, result.rating_hebrew, result.rating_comprehension];
  const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const comment = ratings.every((r) => r >= 4) ? "excellent" : "insuffisant";
  return { average, comment };
}

// Le Résumé compte deux fois plus que les Détails dans la note globale du
// rapport (pondération explicitement demandée par le user).
function computeReportNote(answer) {
  const average = (2 * answer.score_summary + answer.score_details) / 3;
  const comment = average >= 4 ? "Satisfaisant" : "Insatisfaisant";
  return { average, comment };
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

export default function ExamenOralScreen() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { godMode, evalWaitMode } = useConfig();
  const [exam, setExam] = useState(null);
  const [index, setIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [geminiError, setGeminiError] = useState(null);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const [finalResult, setFinalResult] = useState(null);
  const [attemptError, setAttemptError] = useState(null);
  const [rapportText, setRapportText] = useState("");
  const [confirmed, setConfirmed] = useState(null); // null=vérification en cours, true=go, false=confirmation requise
  const [pointsAGagner, setPointsAGagner] = useState(null);

  useEffect(() => {
    getExamenStatus(code).then((s) => setPointsAGagner(s.points_a_gagner_oral));
  }, [code]);
  // Mode "attendre l'évaluation globale" (cf. Layout) : réponses (oral ou
  // rapport) gardées ici en local, traitées les unes après les autres une
  // fois toutes les questions couvertes. {[index]: {type, audioBlob?, rapportText?}}
  const [pendingAnswers, setPendingAnswers] = useState({});
  const [batchProgress, setBatchProgress] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const batchRunningRef = useRef(false);

  // Layout re-render son enfant (via <Outlet/>) à chaque poll actif-lockdown
  // (toutes les 5s pendant l'examen) — sans ce useMemo, URL.createObjectURL
  // recréerait une nouvelle URL à chaque fois, ce qui force le <audio> à
  // recharger et interrompt la lecture en cours.
  const audioUrl = useMemo(() => (audioBlob ? URL.createObjectURL(audioBlob) : null), [audioBlob]);

  // Une navigation accidentelle (ex: bouton "précédent" du navigateur)
  // ramenant directement sur cette URL ne doit PAS suffire à tirer une
  // nouvelle tentative : on vérifie d'abord si une tentative est déjà en
  // cours (auquel cas on la reprend directement, aucune confirmation
  // nécessaire) ; sinon on exige un clic explicite sur "Accepter" avant de
  // consommer un essai (cf. l'effet suivant).
  useEffect(() => {
    if (location.state?.abandonResult) return;
    setConfirmed(null);
    getSessionExists(code).then((exists) => setConfirmed(exists.oral));
  }, [code, location.state]);

  useEffect(() => {
    // Cf. ExamenEcritScreen : un abandon déclenché depuis Layout arrive ici
    // avec le résultat déjà calculé, la session vient d'être supprimée.
    if (location.state?.abandonResult) {
      setFinalResult(location.state.abandonResult);
      return;
    }
    if (confirmed !== true) return;
    getExamenOral(code, godMode)
      .then((data) => {
        setExam(data);
        setIndex(firstUnanswered(data.answers));
      })
      .catch((e) => setAttemptError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);

  // Cas le plus courant : l'abandon est déclenché depuis Layout PENDANT
  // qu'on est déjà sur cet écran — le pathname ne change pas, donc l'effet
  // ci-dessus (gardé sur [code]) ne se redéclenche pas. On surveille
  // location.state séparément pour couvrir ce cas.
  useEffect(() => {
    if (location.state?.abandonResult) {
      setFinalResult(location.state.abandonResult);
    }
  }, [location.state]);

  useEffect(() => {
    setAudioBlob(null);
    setGeminiError(null);
    setIsRecording(false);
    setRapportText("");
  }, [index]);

  // Mode "évaluation globale" : dès que la question courante a reçu une
  // réponse (en attente localement), passe automatiquement à la suivante
  // après 2s — le user n'a pas à cliquer "▶" lui-même.
  useEffect(() => {
    if (evalWaitMode !== "global" || finalResult || !exam) return undefined;
    const isAnswered = exam.answers[index] !== null || pendingAnswers[index] !== undefined;
    if (!isAnswered || index >= exam.questions.length - 1) return undefined;
    const id = setTimeout(() => setIndex((i) => i + 1), 2000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.answers[index], pendingAnswers[index], evalWaitMode, index, finalResult]);

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

  async function handleSubmit() {
    if (evalWaitMode === "global") {
      setPendingAnswers((prev) => ({ ...prev, [index]: { type: "oral", audioBlob } }));
      return;
    }
    const q = exam.questions[index];
    setLoadingGemini(true);
    setGeminiError(null);
    try {
      const result = await evaluateOral({
        textCode: q.text_code,
        questionIndex: q.question_index,
        audioBlob,
      });
      const response = await answerExamen(code, { examType: "oral", questionIndex: index, answer: result });
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

  async function handleSubmitRapport() {
    if (evalWaitMode === "global") {
      setPendingAnswers((prev) => ({ ...prev, [index]: { type: "rapport", rapportText } }));
      return;
    }
    const q = exam.questions[index];
    setLoadingGemini(true);
    setGeminiError(null);
    try {
      const geminiResult = await evaluateReport({ textCode: q.text_code, rapport: rapportText });
      // Gemini ne renvoie aucun champ echo du rapport de l'étudiant : on le
      // fusionne nous-mêmes plutôt que de risquer de lui faire "recopier"
      // (cf. bug des paroles de chanson hallucinées plus tôt dans le projet).
      const result = { ...geminiResult, rapport: rapportText };
      const response = await answerExamen(code, { examType: "oral", questionIndex: index, answer: result });
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

  // Traite séquentiellement les réponses laissées en attente (mode
  // "évaluation globale"), une fois que toutes les questions de l'examen ont
  // reçu une réponse — cf. l'effet juste après. Ré-appelable telle quelle
  // pour réessayer après une erreur.
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

      const oralIndices = indices.filter((idx) => pendingAnswers[idx].type !== "rapport");
      const rapportIndices = indices.filter((idx) => pendingAnswers[idx].type === "rapport");
      let lastResponse = null;

      // Persiste les réponses d'un lot déjà évalué en groupé : dès qu'un
      // thème est noté, on l'enregistre tout de suite plutôt que d'attendre
      // les deux thèmes — si le second thème échoue ensuite, celui-ci reste
      // déjà acquis (Réessayer ne relancera que ce qui manque encore).
      async function persistGroup(groupIndices, results) {
        const byIdentifiant = new Map(results.map((r) => [r.identifiant, r]));
        for (const idx of groupIndices) {
          const result = byIdentifiant.get(String(idx));
          const response = await answerExamen(code, { examType: "oral", questionIndex: idx, answer: result });
          setExam((prev) => ({ ...prev, answers: prev.answers.map((a, i) => (i === idx ? result : a)) }));
          lastResponse = response;
        }
      }

      // Un seul appel Gemini par thème présent (oral / rapport) plutôt qu'un
      // par question (cf. plan "regroupement des évaluations").
      if (oralIndices.length > 0) {
        setBatchProgress({
          label: `Évaluation de ${
            oralIndices.length === 1 ? "votre réponse orale" : `vos ${oralIndices.length} réponses orales`
          }...`,
        });
        const items = oralIndices.map((idx) => {
          const q = exam.questions[idx];
          return {
            identifiant: String(idx),
            textCode: q.text_code,
            questionIndex: q.question_index,
            audioBlob: pendingAnswers[idx].audioBlob,
          };
        });
        const results = await evaluateOralsGrouped(items);
        await persistGroup(oralIndices, results);
      }

      if (rapportIndices.length > 0) {
        setBatchProgress({
          label: `Évaluation de ${rapportIndices.length === 1 ? "votre résumé" : `vos ${rapportIndices.length} résumés`}...`,
        });
        const items = rapportIndices.map((idx) => {
          const q = exam.questions[idx];
          return { identifiant: String(idx), textCode: q.text_code, rapport: pendingAnswers[idx].rapportText };
        });
        const results = await evaluateReportsGrouped(items);
        await persistGroup(rapportIndices, results);
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
  // (déjà notée côté serveur, ou en attente localement).
  useEffect(() => {
    if (evalWaitMode !== "global" || !exam || finalResult || batchRunningRef.current) return;
    const allCovered = exam.questions.every((_, i) => exam.answers[i] !== null || pendingAnswers[i] !== undefined);
    if (allCovered && Object.keys(pendingAnswers).length > 0) runBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAnswers, exam, evalWaitMode, finalResult]);

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
          Lancer l'examen oral {displayChapitreLabel(code.split(".")[0])} - {displayLessonCode(code)}
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
              0 <ShekelIcon size={11} style={{ verticalAlign: -1 }} /> pour l'instant (l'écrit
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
  const globalNote = answer && q.type !== "rapport" ? computeGlobalNote(answer) : null;
  const reportNote = answer && q.type === "rapport" ? computeReportNote(answer) : null;

  return (
    <section className="screen" style={{ flex: 1 }}>
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
      ) : (
        <>
      <p className="muted" style={{ fontSize: "0.7em", margin: 0 }}>
        {q.text_code}
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

      {q.type === "rapport" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <AudioPlayer src={mediaUrl(q.voicepath)} barMaxWidth={58.5} toggleSize={27} />
        </div>
      ) : (
        <OralAnswerCapture
          contentSrc={mediaUrl(q.voicepath)}
          questionText={q.question_hebrew}
          showRecorder={!answer && !pendingAnswers[index]}
          isRecording={isRecording}
          isConverting={isConverting}
          audioBlob={audioBlob}
          audioUrl={audioUrl}
          onStart={startRecording}
          onStop={stopRecording}
          onRecommencer={() => setAudioBlob(null)}
          onEnvoyer={handleSubmit}
        />
      )}

      {!answer && q.type === "rapport" && !pendingAnswers[index] && (
        <>
          <textarea
            value={rapportText}
            onChange={(e) => setRapportText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (rapportText.trim() && !loadingGemini) handleSubmitRapport();
            }}
            rows={4}
            placeholder="Écris ton compte-rendu en français..."
            style={{ width: "100%", maxWidth: 320 }}
            disabled={loadingGemini}
          />
          <VoicePrefill lang="fr" onChange={setRapportText} key={index} />
          {!loadingGemini && (
            <button
              type="button"
              className="speak-btn"
              style={{
                color: rapportText.trim() ? "var(--textMuted)" : "var(--textMuted)",
                opacity: rapportText.trim() ? 1 : 0.4,
                fontSize: "0.8em",
              }}
              disabled={!rapportText.trim()}
              onClick={handleSubmitRapport}
            >
              Envoyer
            </button>
          )}
        </>
      )}

      {!answer && pendingAnswers[index] && (
        <p className="muted" style={{ fontStyle: "italic", fontSize: "0.8em" }}>
          Réponse enregistrée — sera évaluée à la fin de l'examen.{" "}
          <button
            type="button"
            className="link-btn"
            style={{ fontSize: "1em", fontStyle: "italic" }}
            onClick={() => {
              setPendingAnswers((prev) => {
                const next = { ...prev };
                delete next[index];
                return next;
              });
            }}
          >
            Modifier
          </button>
        </p>
      )}

      {answer && q.type === "rapport" && (
        <>
          <p style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
            <span style={{ color: "var(--text)" }}>Rapport de l'étudiant : </span>
            <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{answer.rapport}</span>
          </p>

          <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />

          <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>Résumé</td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.score_summary} />
                </td>
              </tr>
              {answer.justification_summary.length > 0 && (
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
                      {answer.justification_summary.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>Détails</td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.score_details} />
                </td>
              </tr>
              {answer.justification_details.length > 0 && (
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
                      {answer.justification_details.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ padding: "8px 0", border: "1px solid transparent" }}>
                  <hr
                    style={{
                      width: "100%",
                      border: "none",
                      borderTop: "1px solid var(--border)",
                      margin: 0,
                    }}
                  />
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Note Globale
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={Math.round(reportNote.average)} />
                </td>
              </tr>
              <tr>
                <td
                  colSpan={2}
                  style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}
                >
                  <ul style={{ margin: 0, paddingInlineStart: "1.2em", fontSize: "0.75em" }}>
                    <li style={{ color: "var(--text)" }}>
                      {reportNote.comment}{" "}
                      <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>
                        La note Résumé compte deux fois plus que la note Détails dans le calcul de la note globale.
                      </span>
                    </li>
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {answer && q.type !== "rapport" && (
        <>
          <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
            <span style={{ color: "var(--text)" }}>Réponse de l'étudiant : </span>
            <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{answer.verbatim}</span>
          </p>

          <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />

          <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Complétude
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.rating_completeness} />
                </td>
              </tr>
              {answer.errors_rating_completeness?.length > 0 && (
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
                      {answer.errors_rating_completeness.map((e, i) => (
                        <li key={i}>{renderWithHebrewHighlight(e)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Grammaire
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.rating_hebrew} />
                </td>
              </tr>
              {answer.errors_rating_hebrew.length > 0 && (
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
                      {answer.errors_rating_hebrew.map((e, i) => (
                        <li key={i}>{renderWithHebrewHighlight(e)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Compréhension
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.rating_comprehension} />
                </td>
              </tr>
              {answer.errors_rating_comprehension.length > 0 && (
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
                      {answer.errors_rating_comprehension.map((e, i) => (
                        <li key={i}>{renderWithHebrewHighlight(e)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td colSpan={2} style={{ padding: "8px 0", border: "1px solid transparent" }}>
                  <hr
                    style={{
                      width: "100%",
                      border: "none",
                      borderTop: "1px solid var(--border)",
                      margin: 0,
                    }}
                  />
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Note Globale
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={Math.round(globalNote.average)} />
                </td>
              </tr>
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
                    <li>{capitalize(globalNote.comment)}</li>
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
        </>
      )}
    </section>
  );
}
