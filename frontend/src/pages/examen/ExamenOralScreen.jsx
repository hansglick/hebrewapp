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
        <span key={i} style={{ color: i <= rating ? "#f5b301" : "var(--textSecondary)" }}>
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
  const { godMode, evalWaitMode, oralBackgroundEval, setOralBackgroundEval } = useConfig();
  const [exam, setExam] = useState(null);
  const [index, setIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [geminiError, setGeminiError] = useState(null);
  // Distinct de geminiError : surcharge Gemini détectée (cf.
  // app.oral_retry), l'écran affiché est alors très différent d'un simple
  // message d'erreur — cf. demande explicite du user.
  const [geminiOverloaded, setGeminiOverloaded] = useState(false);
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

  // Mode "évaluation en arrière-plan" (case à cocher indépendante,
  // cf. oralBackgroundEval) : {[index]: "pending" | { error }} — dès
  // l'envoi, la réponse est verrouillée (plus de ré-enregistrement) et
  // notée par Gemini sans bloquer la navigation vers la question suivante.
  // Distinct de pendingAnswers (mode "global", qui lui diffère l'ENVOI à
  // la fin) : ici l'envoi est immédiat, seule l'ATTENTE de la note ne
  // bloque plus le user — cf. demande explicite du user.
  const [backgroundStatus, setBackgroundStatus] = useState({});
  // Garde la réponse déjà envoyée (blob audio ou texte du rapport) par
  // index, pour permettre un "Réessayer" identique en cas d'échec — sans
  // repasser par un nouvel enregistrement, puisque la réponse est
  // verrouillée dès l'envoi.
  const submittedAnswerRef = useRef({});

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
  // après 2s — le user n'a pas à cliquer "▶" lui-même. Exclut
  // oralBackgroundEval (case à cocher indépendante) : sinon, une fois une
  // réponse notée en arrière-plan, revenir la consulter via ◀ relançait
  // cet effet (qui ne regarde que exam.answers[index], sans savoir PAR
  // QUEL mode elle a été notée) et renvoyait aussitôt en avant — cf. bug
  // constaté en test.
  useEffect(() => {
    if (evalWaitMode !== "global" || oralBackgroundEval || finalResult || !exam) return undefined;
    const isAnswered = exam.answers[index] !== null || pendingAnswers[index] !== undefined;
    if (!isAnswered || index >= exam.questions.length - 1) return undefined;
    const id = setTimeout(() => setIndex((i) => i + 1), 2000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.answers[index], pendingAnswers[index], evalWaitMode, oralBackgroundEval, index, finalResult]);

  // Mode "évaluation en arrière-plan" : avance automatiquement à la
  // question suivante juste après l'envoi (pas d'attente de la note) —
  // déclenché UNE SEULE FOIS depuis handleSubmit/handleSubmitRapport (pas
  // via un effect réagissant à l'état), pour ne pas se redéclencher si le
  // user revient ensuite consulter une question déjà envoyée via ◀ — cf.
  // bug constaté en test (retour en arrière renvoyé en avant tout seul).
  function scheduleBackgroundAdvance(submittedIndex) {
    if (submittedIndex >= exam.questions.length - 1) return;
    setTimeout(() => setIndex((i) => (i === submittedIndex ? i + 1 : i)), 1200);
  }

  async function startRecording() {
    // Un seul bouton micro pour enregistrer ET ré-enregistrer (plus de
    // bouton "Recommencer" séparé, cf. OralAnswerCapture) : l'ancien blob
    // doit disparaître dès le début du nouvel enregistrement, pas
    // seulement à la fin, cf. demande explicite du user.
    setAudioBlob(null);
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

  // Envoie une réponse (orale ou rapport) à Gemini sans bloquer l'écran —
  // `idx` est figé au moment de l'appel (pas `index`, qui peut avoir changé
  // le temps que la promesse résolve, le user ayant déjà navigué ailleurs).
  // `response.completed` reste la SEULE source de vérité pour afficher le
  // bilan (même signal serveur qu'en mode "each"/"global", cf.
  // answerExamen) : comme il ne devient vrai que lorsque TOUTES les
  // questions ont une réponse NOTÉE, le bilan reste naturellement bloqué
  // jusqu'à ce que toutes les évaluations en arrière-plan soient revenues —
  // cf. demande explicite du user ("faisons les choses simplement").
  async function submitInBackground(idx, kind, payload) {
    submittedAnswerRef.current[idx] = { kind, payload };
    setBackgroundStatus((prev) => ({ ...prev, [idx]: "pending" }));
    try {
      const result =
        kind === "oral"
          ? await evaluateOral(payload)
          : { ...(await evaluateReport(payload)), rapport: payload.rapport };
      const response = await answerExamen(code, { examType: "oral", questionIndex: idx, answer: result });
      setExam((prev) => ({ ...prev, answers: prev.answers.map((a, i) => (i === idx ? result : a)) }));
      setBackgroundStatus((prev) => {
        const next = { ...prev };
        delete next[idx];
        return next;
      });
      if (response.completed) setFinalResult(response);
    } catch (e) {
      setBackgroundStatus((prev) => ({ ...prev, [idx]: { error: e.message } }));
    }
  }

  function retryBackground(idx) {
    const submitted = submittedAnswerRef.current[idx];
    if (submitted) submitInBackground(idx, submitted.kind, submitted.payload);
  }

  async function handleSubmit() {
    if (oralBackgroundEval) {
      const q = exam.questions[index];
      submitInBackground(index, "oral", { textCode: q.text_code, questionIndex: q.question_index, audioBlob });
      scheduleBackgroundAdvance(index);
      return;
    }
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
    if (oralBackgroundEval) {
      const q = exam.questions[index];
      submitInBackground(index, "rapport", { textCode: q.text_code, rapport: rapportText });
      scheduleBackgroundAdvance(index);
      return;
    }
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
        const results = await evaluateOralsGrouped(items, code);
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
      // 503 = surcharge Gemini, le lot vient d'être mis en attente de
      // relance côté serveur (cf. app.oral_retry) — écran dédié plutôt
      // qu'un simple message d'erreur, cf. demande explicite du user.
      if (e.status === 503) setGeminiOverloaded(true);
      else setGeminiError(e.message);
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
        {/* Case à cocher indépendante du toggle each/global ci-dessus,
            propre à l'examen oral — cf. demande explicite du user. Cochée :
            chaque réponse est envoyée à Gemini en arrière-plan dès l'envoi
            (le user continue l'examen sans attendre), mais devient alors
            verrouillée (non modifiable) ; le bilan final reste bloqué
            jusqu'à ce que TOUTES les évaluations soient revenues. */}
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            width: "100%",
            maxWidth: 320,
            textAlign: "start",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={oralBackgroundEval}
            onChange={(e) => setOralBackgroundEval(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Évaluer chaque réponse en arrière-plan
            <br />
            <span className="muted" style={{ fontSize: "0.75em" }}>
              Continue l'examen sans attendre la note de chaque réponse — mais une fois envoyée, une réponse ne peut
              plus être modifiée. Le bilan final reste bloqué jusqu'à ce que toutes les évaluations soient revenues.
            </span>
          </span>
        </label>
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

  // Mode "évaluation en arrière-plan" : une fois la dernière réponse
  // envoyée, il n'y avait plus aucun écran d'attente (juste une phrase en
  // italique au milieu de la question figée) pendant que les dernières
  // évaluations reviennent avant le bilan — même écran GeminiWaiting que les
  // autres modes (vidéo + options musique/courrier), cf. demande explicite
  // du user.
  const awaitingBackgroundCompletion =
    oralBackgroundEval && exam.questions.every((_, i) => exam.answers[i] !== null || backgroundStatus[i] === "pending");

  return (
    <section
      className="screen"
      // paddingBottom en plus pendant l'attente (le mode "chansons" de
      // GeminiWaiting/WaitingVideo y affiche sa propre barre de contrôle
      // inférieure next/previous) — cf. demande explicite du user. zoom:0.9
      // (écran entièrement dédié aux questions orales) : réduit de 10%
      // l'ensemble des éléments de l'écran, cf. demande explicite du user.
      style={
        loadingGemini || awaitingBackgroundCompletion
          ? { flex: 1, paddingBottom: "calc(var(--bottom-nav-height) * 2)", zoom: 0.9 }
          : { flex: 1, zoom: 0.9 }
      }
    >
      {/* Le header "Question N/25" (navigation ◀▶) n'a de sens que pendant
          la saisie des réponses — pendant l'évaluation (groupée ou non),
          il restait affiché figé sur la dernière question, ce qui donnait
          l'impression trompeuse d'une évaluation question par question
          alors que l'appel Gemini groupé est bien unique — cf. bug
          rapporté par le user. Masqué pendant loadingGemini. */}
      {geminiOverloaded ? (
        // Écran dédié (pas juste un message d'erreur) : le service de
        // correction est surchargé, mais rien n'est perdu — les réponses
        // du user ont été mises en attente côté serveur pour une relance
        // ultérieure, déclenchée depuis une notification épinglée — cf.
        // demande explicite du user.
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
          <h2 style={{ margin: 0 }}>Système de correction surchargé</h2>
          <p className="muted" style={{ margin: 0 }}>
            Le service de correction est actuellement surchargé et n'a pas pu évaluer tes réponses orales pour
            l'instant.
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Pas d'inquiétude : tes enregistrements sont conservés. Une notification épinglée va t'être envoyée avec
            un bouton pour relancer l'évaluation dès que tu le souhaites.
          </p>
          <button type="button" className="exam-tile green" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
            Retour à l'accueil
          </button>
        </div>
      ) : loadingGemini || awaitingBackgroundCompletion ? (
        <GeminiWaiting
          key={batchProgress ? "batch" : awaitingBackgroundCompletion ? "background" : "single"}
          showCuriosite={exam.exam_type === "long" || exam.exam_type === "tres_long"}
          allowChansons={!!batchProgress || awaitingBackgroundCompletion}
          label={
            batchProgress ? (
              <>
                Patientez quelques instants, votre professeur évalue votre copie
                <br />
                ({batchProgress.label})
              </>
            ) : awaitingBackgroundCompletion ? (
              "Toutes tes réponses ont été envoyées — en attente des dernières évaluations avant l'affichage du bilan..."
            ) : undefined
          }
        />
      ) : (
        <>
          <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", width: "25%", textAlign: "start" }}>
                  <button
                    type="button"
                    className="link-btn"
                    style={{ textDecoration: "none", color: "var(--textPrimary)" }}
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
                    style={{ textDecoration: "none", color: "var(--textPrimary)" }}
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
              borderTop: "1px solid var(--cardBorder)",
              margin: "1em 0 0",
            }}
          />
      <p className="muted" style={{ fontSize: "0.7em", margin: 0 }}>
        {q.text_code}
      </p>

      {attemptError && (
        <p className="muted" style={{ color: "var(--annulationPleine)" }}>
          {attemptError}
        </p>
      )}

      {geminiError && (
        <>
          <p className="muted" style={{ color: "var(--annulationPleine)" }}>
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
          showRecorder={!answer && !pendingAnswers[index] && !backgroundStatus[index]}
          isRecording={isRecording}
          isConverting={isConverting}
          audioBlob={audioBlob}
          audioUrl={audioUrl}
          onStart={startRecording}
          onStop={stopRecording}
          onEnvoyer={handleSubmit}
        />
      )}

      {/* Avertissement avant envoi (mode arrière-plan uniquement) : la
          réponse va être verrouillée dès qu'elle sera envoyée — cf. demande
          explicite du user. */}
      {oralBackgroundEval && !answer && !backgroundStatus[index] && (
        <p className="muted" style={{ fontStyle: "italic", fontSize: "0.75em" }}>
          Une fois envoyée, cette réponse ne pourra plus être modifiée.
        </p>
      )}

      {!answer && q.type === "rapport" && !pendingAnswers[index] && !backgroundStatus[index] && (
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
              className="exam-tile green"
              style={{ cursor: rapportText.trim() ? "pointer" : "default" }}
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

      {/* Mode "évaluation en arrière-plan" : réponse déjà envoyée,
          verrouillée — plus aucune modification possible, cf. demande
          explicite du user. */}
      {!answer && backgroundStatus[index] === "pending" && (
        <p className="muted" style={{ fontStyle: "italic", fontSize: "0.8em" }}>
          Réponse envoyée et prise en compte — évaluation en cours en arrière-plan. Elle ne peut plus être modifiée.
        </p>
      )}

      {!answer && backgroundStatus[index]?.error && (
        <>
          <p className="muted" style={{ color: "var(--annulationPleine)", fontSize: "0.85em" }}>
            {backgroundStatus[index].error}
          </p>
          <p className="muted" style={{ fontStyle: "italic", fontSize: "0.8em" }}>
            Cette réponse a déjà été prise en compte et ne peut plus être modifiée, mais son évaluation a échoué.{" "}
            <button type="button" className="link-btn" style={{ fontSize: "1em" }} onClick={() => retryBackground(index)}>
              Réessayer
            </button>
          </p>
        </>
      )}

      {answer && q.type === "rapport" && (
        <>
          <p style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
            <span style={{ color: "var(--textPrimary)" }}>Rapport de l'étudiant : </span>
            <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>{answer.rapport}</span>
          </p>

          <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0" }} />

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
                        color: "var(--textSecondary)",
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
                        color: "var(--textSecondary)",
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
                      borderTop: "1px solid var(--cardBorder)",
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
                    <li style={{ color: "var(--textPrimary)" }}>
                      {reportNote.comment}{" "}
                      <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>
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
            <span style={{ color: "var(--textPrimary)" }}>Réponse de l'étudiant : </span>
            <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>{answer.verbatim}</span>
          </p>

          <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0" }} />

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
                        color: "var(--textSecondary)",
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
                        color: "var(--textSecondary)",
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
                        color: "var(--textSecondary)",
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
                      borderTop: "1px solid var(--cardBorder)",
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
                      color: "var(--textSecondary)",
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
