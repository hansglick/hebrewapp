import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getRandomQuestionOrale } from "../api/content";
import { getNiveau } from "../api/user";
import { evaluateOral } from "../api/gemini";
import { mediaUrl } from "../api/media";
import { blobToWavBlob } from "../utils/audioEncode";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import "./screens.css";

export default function QuestionOraleScreen({ defaultMode = "exploration" }) {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const navigate = useNavigate();
  const [niveau, setNiveau] = useState(null);
  const [mode, setMode] = useState(defaultMode);
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [geminiResult, setGeminiResult] = useState(null);
  const [geminiError, setGeminiError] = useState(null);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = mode === "exploration" ? code ?? niveau?.level : niveau?.level;

  const { current: question, next, back } = useRandomBrowser(
    () => (lessonCode ? getRandomQuestionOrale(lessonCode, mode) : Promise.resolve(null)),
    [lessonCode, mode]
  );

  useEffect(() => {
    setAudioBlob(null);
    setGeminiResult(null);
    setGeminiError(null);
    setIsRecording(false);
  }, [question]);

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
    setLoadingGemini(true);
    setGeminiError(null);
    try {
      const result = await evaluateOral({
        textCode: question.text_code,
        questionIndex: question.question_index,
        audioBlob,
      });
      setGeminiResult(result);
    } catch (e) {
      setGeminiError(e.message);
    } finally {
      setLoadingGemini(false);
    }
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (!back()) navigate(-1);
    },
    onSwipeRight: () => next(),
  });

  if (!question) return null;

  return (
    <section className="screen" {...swipeHandlers}>
      <div className="toggle-group">
        <button
          type="button"
          className={mode === "exploration" ? "active" : ""}
          onClick={() => setMode("exploration")}
        >
          Exploration
        </button>
        <button
          type="button"
          className={mode === "revision" ? "active" : ""}
          onClick={() => setMode("revision")}
        >
          Révision
        </button>
      </div>

      <button
        type="button"
        className="link-btn"
        onClick={() => new Audio(mediaUrl(question.voicepath)).play()}
      >
        🔊 Écouter le texte
      </button>
      <p className="hebrew-large">{question.question_hebrew}</p>

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
          <button type="button" className="link-btn" onClick={next}>
            Question suivante
          </button>
        </>
      )}
    </section>
  );
}
