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
import { WaitingVideo } from "../components/WaitingVideo";
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
        <span key={i} style={{ color: i <= rating ? "#f5b301" : "var(--textSecondary)" }}>
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

  // Numéro de la question affichée en titre ("Question X") : position de
  // cette question parmi les tirages sans remise de la session (1 pour la
  // première tirée), remis à 1 au même moment que l'historique de
  // useRandomBrowser (changement de leçon/mode) — cf. demande explicite du
  // user. Repasse à 1 si le pool entier (question.total) a été épuisé et
  // qu'un tirage recommence à répéter, pour rester dans 1..n.
  const [questionSeq, setQuestionSeq] = useState(1);
  useEffect(() => {
    setQuestionSeq(1);
  }, [lessonCode, mode]);

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
    // Un seul bouton micro pour enregistrer ET ré-enregistrer (plus de
    // bouton "Recommencer" séparé, cf. OralAnswerCapture) : l'ancien blob
    // doit disparaître dès le début du nouvel enregistrement, pas seulement
    // à la fin, cf. demande explicite du user.
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
    if (back()) setQuestionSeq((n) => Math.max(1, n - 1));
  }
  function goNext() {
    next();
    setQuestionSeq((n) => n + 1);
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
  });

  if (!question) return null;

  const globalNote = geminiResult ? computeGlobalNote(geminiResult) : null;
  // Repasse dans 1..total (cf. question.total, renvoyé par le backend) au
  // cas où la session a fini par tirer plus de questions distinctes que le
  // pool n'en contient (répétitions après épuisement).
  const questionNumber = question.total ? ((questionSeq - 1) % question.total) + 1 : questionSeq;

  return (
    <section
      className="screen question-orale-screen"
      style={{ flex: 1, paddingBottom: "calc(var(--bottom-nav-height) * 2)" }}
      onPointerDown={swipeHandlers.onPointerDown}
    >
      {loadingGemini ? (
        <WaitingVideo />
      ) : (
        <>
      <ActionHints {...swipeHandlers.hints} />
      <BottomNavBar onPrevious={goPrevious} onNext={goNext} />

      {/* Numéro de la question dans la session (1..total, cf. questionSeq),
          pour que le user comprenne où il en est — même couleur que les
          titres de bloc audio (var(--tileAccent)), taille +200% de la
          leur (0.84em -> 1.68em), centré — cf. demande explicite du user.
          marginTop: saute une ligne par rapport à la barre de contrôle
          (trop proche sinon, cf. bug rapporté par le user). L'espace avec
          le premier titre de bloc audio ("Ecoute le contenu") vient lui du
          marginTop déjà porté par ce premier bloc (cf. OralAnswerCapture,
          BLOCK_GAP), pas besoin de marge supplémentaire en dessous. */}
      <h1
        style={{
          color: "var(--tileAccent)",
          fontSize: "1.176em",
          fontWeight: 700,
          textAlign: "center",
          margin: "1em 0 -19.2px",
          width: "100%",
        }}
      >
        Question {questionNumber}
      </h1>

      {/* Même habillage pour les deux modes (leçon/oral et révisions/oral) —
          cf. OralAnswerCapture, inspiré de l'écran des questions écrites
          avec pré-remplissage vocal, demande explicite du user. */}
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
        onEnvoyer={handleSubmit}
      />

      {!geminiResult && (
        <>
          {geminiError && (
            <p className="muted" style={{ color: "var(--annulationPleine)" }}>
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
            <span style={{ color: "var(--textPrimary)" }}>Réponse de l'étudiant : </span>
            <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>
              {geminiResult.verbatim}
            </span>
          </p>

          <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0" }} />

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
                        color: "var(--textSecondary)",
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
                        color: "var(--textSecondary)",
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
                        color: "var(--textSecondary)",
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
