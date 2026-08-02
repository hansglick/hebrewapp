import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getExamenOral } from "../../api/content";
import { passExamen } from "../../api/user";
import { evaluateOral } from "../../api/gemini";
import { mediaUrl } from "../../api/media";
import { blobToWavBlob } from "../../utils/audioEncode";
import "../screens.css";

export default function ExamenOralScreen() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [geminiResult, setGeminiResult] = useState(null);
  const [geminiError, setGeminiError] = useState(null);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const [finalResult, setFinalResult] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    getExamenOral(code).then(setExam);
  }, [code]);

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
    const q = exam.questions[index];
    setLoadingGemini(true);
    setGeminiError(null);
    try {
      const result = await evaluateOral({
        textCode: q.text_code,
        questionIndex: q.question_index,
        audioBlob,
      });
      setGeminiResult(result);
    } catch (e) {
      setGeminiError(e.message);
    } finally {
      setLoadingGemini(false);
    }
  }

  async function handleNext() {
    const success =
      geminiResult.rating_completeness >= exam.rating_threshold &&
      geminiResult.rating_hebrew >= exam.rating_threshold &&
      geminiResult.rating_comprehension >= exam.rating_threshold;

    const newResults = [...results, success];
    setAudioBlob(null);
    setGeminiResult(null);
    setGeminiError(null);

    if (index + 1 < exam.questions.length) {
      setResults(newResults);
      setIndex(index + 1);
      return;
    }

    const scoreCount = newResults.filter(Boolean).length;
    const ratio = scoreCount / exam.total_questions;
    const passed = ratio >= exam.pass_threshold;

    let passResult = null;
    if (passed) {
      passResult = await passExamen(code, { examType: "oral" });
    }
    setFinalResult({ passed, scoreCount, total: exam.total_questions, ratio, passResult });
  }

  if (!exam) return null;

  if (finalResult) {
    const { passed, passResult } = finalResult;
    return (
      <section className="screen">
        <h1>
          {passed
            ? passResult?.niveau_updated
              ? "Examen réussi !"
              : "Oral validé"
            : "Examen non validé"}
        </h1>
        <p>
          Score : {finalResult.scoreCount} / {finalResult.total} (
          {Math.round(finalResult.ratio * 100)}%)
        </p>
        {passed && passResult?.niveau_updated && <p>Niveau {code} atteint.</p>}
        {passed && !passResult?.niveau_updated && (
          <>
            <p>Il reste l'examen écrit de cette leçon pour valider le niveau.</p>
            <button
              type="button"
              className="link-btn"
              onClick={() => navigate(`/examen/ecrite/${code}`)}
            >
              Passer l'écrit
            </button>
          </>
        )}
        {!passed && (
          <p>Seuil requis : {Math.round(exam.pass_threshold * 100)}%. Retente quand tu veux.</p>
        )}
        <button type="button" className="link-btn" onClick={() => navigate("/examen/orale")}>
          Retour aux examens
        </button>
      </section>
    );
  }

  const q = exam.questions[index];

  return (
    <section className="screen">
      <p className="muted">
        Examen oral {code} — Question {index + 1} / {exam.questions.length}
        {exam.is_special ? " (examen spécial)" : ""}
      </p>

      <button
        type="button"
        className="link-btn"
        onClick={() => new Audio(mediaUrl(q.voicepath)).play()}
      >
        🔊 Écouter le texte
      </button>
      <p className="hebrew-large">{q.question_hebrew}</p>

      {!geminiResult && (
        <>
          {!audioBlob && !isRecording && !isConverting && (
            <button type="button" className="link-btn" onClick={startRecording}>
              🎙️ Enregistrer
            </button>
          )}
          {isRecording && (
            <button type="button" className="link-btn" onClick={stopRecording}>
              ⏹️ Arrêter
            </button>
          )}
          {isConverting && <p className="muted">Traitement de l'enregistrement...</p>}
          {audioBlob && !isRecording && (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={URL.createObjectURL(audioBlob)} />
              <div style={{ display: "flex", gap: 12 }}>
                <button type="button" className="link-btn" onClick={() => setAudioBlob(null)}>
                  Recommencer
                </button>
                <button
                  type="button"
                  className="link-btn"
                  disabled={loadingGemini}
                  onClick={handleSubmit}
                >
                  {loadingGemini ? "Envoi..." : "Envoyer"}
                </button>
              </div>
            </>
          )}
          {geminiError && (
            <p className="muted" style={{ color: "var(--danger)" }}>
              {geminiError}
            </p>
          )}
        </>
      )}

      {geminiResult && (
        <>
          <p className="muted hebrew">Verbatim : {geminiResult.verbatim}</p>
          <p className="muted hebrew">Solution possible : {geminiResult.solution}</p>
          <p>Structure/complétude : {geminiResult.rating_completeness} / 5</p>
          <p>Hébreu (grammaire/orthographe) : {geminiResult.rating_hebrew} / 5</p>
          <ul className="words-list">
            {geminiResult.errors_rating_hebrew.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <p>Compréhension : {geminiResult.rating_comprehension} / 5</p>
          <ul className="words-list">
            {geminiResult.errors_rating_comprehension.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <button type="button" className="link-btn" onClick={handleNext}>
            Question suivante
          </button>
        </>
      )}
    </section>
  );
}
