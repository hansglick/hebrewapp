import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getRandomQuestionOrale } from "../api/content";
import { getNiveau } from "../api/user";
import { evaluateOral } from "../api/gemini";
import { mediaUrl } from "../api/media";
import { blobToWavBlob } from "../utils/audioEncode";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { ActionHints } from "../components/ActionHints";
import { BottomNavBar } from "../components/BottomNavBar";
import { OralAnswerCapture } from "../components/OralAnswerCapture";
import { AudioProgressBlock } from "../components/AudioProgressBlock";
import { MicrophoneIcon } from "../components/MicrophoneIcon";
import { LabeledTile } from "../components/LabeledTile";
import { WaitingVideo } from "../components/WaitingVideo";
import { ttsUrl } from "../utils/speech";
import "./screens.css";

const GEMINI_TIMEOUT_MS = 30000;

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

export default function QuestionOraleScreen() {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const [niveau, setNiveau] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [geminiResult, setGeminiResult] = useState(null);
  const [geminiError, setGeminiError] = useState(null);
  const [timeoutMessage, setTimeoutMessage] = useState(null);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const mediaRecorderRef = useRef(null);
  const timedOutRef = useRef(false);
  const chunksRef = useRef([]);

  // Sans ce useMemo, URL.createObjectURL recréerait une nouvelle URL à
  // chaque re-render (ex: tout état local qui change ailleurs sur l'écran),
  // ce qui force le <audio> à recharger et interrompt la lecture en cours.
  const audioUrl = useMemo(() => (audioBlob ? URL.createObjectURL(audioBlob) : null), [audioBlob]);

  // Le mode découle du chemin d'accès, cf. MotScreen.
  const mode = code ? "exploration" : "revision";

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = code ?? niveau?.reference_lesson;

  const { current: question, next, back } = useRandomBrowser(
    (prevQuestion, seen) =>
      lessonCode
        ? getRandomQuestionOrale(
            lessonCode,
            mode,
            prevQuestion ? `${prevQuestion.text_code}|${prevQuestion.question_index}` : undefined,
            seen
          )
        : Promise.resolve(null),
    [lessonCode, mode]
  );

  useEffect(() => {
    setAudioBlob(null);
    setGeminiResult(null);
    setGeminiError(null);
    setTimeoutMessage(null);
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
    setTimeoutMessage(null);
    timedOutRef.current = false;

    const timeoutId = setTimeout(() => {
      timedOutRef.current = true;
      setLoadingGemini(false);
      setTimeoutMessage("Le professeur Gemini est surbooké en ce moment, essayez à un autre moment");
    }, GEMINI_TIMEOUT_MS);

    try {
      const result = await evaluateOral({
        textCode: question.text_code,
        questionIndex: question.question_index,
        audioBlob,
      });
      if (!timedOutRef.current) {
        clearTimeout(timeoutId);
        setGeminiResult(result);
        setLoadingGemini(false);
      }
    } catch (e) {
      if (!timedOutRef.current) {
        clearTimeout(timeoutId);
        setGeminiError(e.message);
        setLoadingGemini(false);
      }
    }
  }

  // Sur la toute première question de la session (pas encore d'historique),
  // back() ne fait rien plutôt que de sortir de l'écran (navigate(-1)) :
  // previous/next ne doivent jamais faire quitter le type d'objet
  // parcouru, cf. demande explicite du user.
  function goPrevious() {
    back();
  }
  function goNext() {
    next();
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
  });

  if (!question) return null;

  const globalNote = geminiResult ? computeGlobalNote(geminiResult) : null;

  return (
    <section className="screen" style={{ flex: 1, paddingBottom: "calc(var(--bottom-nav-height) * 2)" }} onPointerDown={swipeHandlers.onPointerDown}>
      {loadingGemini ? (
        <WaitingVideo />
      ) : (
        <>
      <ActionHints {...swipeHandlers.hints} />
      <BottomNavBar onPrevious={goPrevious} onNext={goNext} />


      {/* leçon/oral : même design que révisions/traduction (toggle
          "Teacher") — encadrés blancs à étiquette grise pour
          Contenu/Question/Réponse, bouton "Envoyer ma réponse" blanc sur
          fond vert au lieu du simple logo d'envoi. révisions/oral (mode
          "revision") garde l'habillage OralAnswerCapture existant, cf.
          demande explicite du user (scope limité à leçon/oral). */}
      {mode === "exploration" ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
          {/* bodyPadding:0 : la bordure de la brique audio (AudioProgressBlock,
              cf. .audio-progress-block) doit toucher directement la bordure
              de la tuile, sans marge entre les deux, cf. demande explicite
              du user. */}
          <LabeledTile label="Contenu" bodyPadding={0}>
            <AudioProgressBlock src={mediaUrl(question.voicepath)} />
          </LabeledTile>
          <LabeledTile label="Question" bodyPadding={0}>
            <AudioProgressBlock src={ttsUrl(question.question_hebrew)} />
          </LabeledTile>

          {!geminiResult && (
            <>
              <LabeledTile label="Réponse" bodyPadding={0}>
                {audioBlob && !isConverting ? (
                  <AudioProgressBlock src={audioUrl} />
                ) : isConverting ? (
                  <p className="muted" style={{ margin: "18px 14px", textAlign: "center" }}>
                    Traitement de l'enregistrement...
                  </p>
                ) : (
                  // Même brique que Contenu/Question (classes
                  // .audio-progress-block partagées) mais avec le micro à la
                  // place du bouton lecture, et l'onde toujours affichée —
                  // grisée (aucun calque de couleur/progression) tant
                  // qu'aucun enregistrement n'existe, cf. demande explicite
                  // du user.
                  <div className="audio-progress-block">
                    <MicrophoneIcon
                      size={80}
                      badgeColor="var(--danger)"
                      pulsing={isRecording}
                      onClick={isRecording ? stopRecording : startRecording}
                    />
                    <div className="audio-progress-block-wave" style={{ cursor: "default" }}>
                      <span
                        className="audio-progress-block-wave-icon audio-progress-block-wave-bg"
                        style={{ WebkitMaskImage: "url(/voice.png)", maskImage: "url(/voice.png)" }}
                      />
                    </div>
                  </div>
                )}
              </LabeledTile>

              {audioBlob && !isConverting && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 24, marginTop: 20 }}>
                  <MicrophoneIcon
                    size={60}
                    badgeColor="var(--danger)"
                    pulsing={false}
                    onClick={() => setAudioBlob(null)}
                    ariaLabel="Recommencer"
                  />
                  <button
                    type="button"
                    className="exam-tile green"
                    style={{ width: "auto", maxWidth: "none", padding: "14px 20px" }}
                    onClick={handleSubmit}
                  >
                    Envoyer ma réponse
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <OralAnswerCapture
          contentSrc={mediaUrl(question.voicepath)}
          questionText={question.question_hebrew}
          showRecorder={!geminiResult}
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

      {!geminiResult && (
        <>
          {geminiError && (
            <p className="muted" style={{ color: "var(--danger)" }}>
              {geminiError}
            </p>
          )}
          {timeoutMessage && (
            <p
              className="muted"
              style={{ fontStyle: "italic", fontSize: "0.8em", textAlign: "center" }}
            >
              {timeoutMessage}
            </p>
          )}
        </>
      )}

      {geminiResult && (
        <>
          <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
            <span style={{ color: "var(--text)" }}>Réponse de l'étudiant : </span>
            <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>
              {geminiResult.verbatim}
            </span>
          </p>

          <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />

          <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Complétude
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={geminiResult.rating_completeness} />
                </td>
              </tr>
              {geminiResult.errors_rating_completeness?.length > 0 && (
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
                      {geminiResult.errors_rating_completeness.map((e, i) => (
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
                  <StarRating rating={geminiResult.rating_hebrew} />
                </td>
              </tr>
              {geminiResult.errors_rating_hebrew.length > 0 && (
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
                      {geminiResult.errors_rating_hebrew.map((e, i) => (
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
                  <StarRating rating={geminiResult.rating_comprehension} />
                </td>
              </tr>
              {geminiResult.errors_rating_comprehension.length > 0 && (
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
                      {geminiResult.errors_rating_comprehension.map((e, i) => (
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
