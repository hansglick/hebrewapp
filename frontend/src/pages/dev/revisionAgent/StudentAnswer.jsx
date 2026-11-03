import { useEffect, useRef, useState } from "react";
import HebrewInput from "../../../components/HebrewInput";
import { Answer, Evaluation } from "./Assessment";
import { Recorder } from "./audio";
import FlapLabel from "./FlapLabel";
import { graphemes, withoutNikkud } from "./hebrew";
import RecordSlider from "./RecordSlider";
import { SPEECH_STEP_MS } from "./TeacherSpeech";
import "../../../components/ConfigModal.css";

// Page sans Gemini Live (cf. demande explicite du user) : la réponse de
// l'élève, sous les fenêtres de l'exercice, et ce que le prof en fait, dans
// une seule fenêtre. En bas, centrés : l'ampoule de l'antisèche (lamp, cf.
// ExpressionBoard), la piste d'enregistrement (cf. RecordSlider : on pousse
// le loquet pour enregistrer, l'avion en papier envoie, la corbeille annule).
// Le serveur transcrit la réponse envoyée (transcript) et la donne au prof.
// À la première réponse envoyée, la fenêtre s'agrandit vers le bas : un trait
// se trace de gauche à droite au-dessus de la piste, et la réponse s'écrit
// au-dessus du trait (enregistrée : sa transcription, avec un bouton pour la
// réécouter), de droite à gauche en hébreu, de gauche à droite en français.
// L'intitulé de la fenêtre (cf. FlapLabel) et sa bordure disent ce que le
// prof en fait (exchange) : « Évaluation », ses fautes surlignées puis
// commentées dessous, ou, sans faute, la réponse soulignée en vert puis
// cochée ; « Conversation », il lui répond, sans rien surligner.
// Une réponse sans faute reste affichée 4 s après sa coche, puis s'efface
// comme au tableau ; le trait se retire, et la fenêtre se referme : la piste
// remonte à sa place (cf. FADE_STEPS).
// La réponse écrite (interrupteur « Répondre par écrit », champ HebrewInput)
// est retirée pour le moment (cf. demande explicite du user) : WRITTEN.
// Le crayon, à côté de la réponse affichée, permet de corriger à la main sa
// transcription (un mot bien prononcé mais mal orthographié…) : un champ
// texte la remplace, prérempli, et « Envoyer » renvoie la réponse corrigée au
// prof, qui l'évalue à nouveau (cf. demande explicite du user).
// taskEvaluation : les autres tâches que l'expression libre gardent leur propre
// fenêtre d'évaluation (cf. RevisionAgentScreen) ; celle-ci ne montre alors que
// ce que l'élève a dit, sous l'intitulé « Ta réponse », et se referme quand
// l'évaluation de cette réponse arrive (une autre que celle d'avant l'envoi).

const WRITTEN = false;

const FINAL_FORMS = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };
// HebrewInput ne finalise un mot qu'à l'espace : le dernier mot du message
// prend ici sa forme finale.
const finalized = (text) => text.replace(/[כמנפצ](?=[\s.,!?;:]|$)/g, (letter) => FINAL_FORMS[letter]);

const LABELS = { evaluation: "Évaluation", conversation: "Conversation" };

// Volumes gardés pour l'onde de la piste (cf. RecordSlider, WAVE_BARS), un par bloc de 100 ms.
const MAX_LEVELS = 32;

// Lecture : le texte lu commence à s'écrire ce temps-là après l'envoi, à la vitesse habituelle (cf. Answer), pour que
// ses mots fautifs se surlignent peu après qu'il est écrit (cf. demande explicite du user).
const READING_DELAY_MS = 1000;

// Après une réponse sans faute : soulignement et coche (cf. Answer), 4 s
// d'affichage, puis chaque étape après la précédente — l'effacement (cf.
// .ra-exchange-erased), le retrait du trait, la fenêtre qui se referme (cf.
// .ra-exchange-fold) ; « gone » : plus de réponse affichée.
const FADE_STEPS = [
  ["erasing", 650 + 700 + 4000],
  ["unruling", 600],
  ["folding", 400],
  ["gone", 500],
];

// Le trait au-dessus de la piste : droit, ses deux bouts arqués vers le bas, comme des cornes à l'envers (cf. demande
// explicite du user) ; épaisseur fixe, quelle que soit sa largeur.
function RuleShape({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1 9C1 4.5 3 2 8 2H92C97 2 99 4.5 99 9" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const base64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export default function StudentAnswer({
  onSend,
  onSendAudio,
  transcript,
  intent,
  exchange,
  disabled,
  lamp,
  taskEvaluation,
  showPhonetic = false,
  readingText = null,
}) {
  // Dernière réponse envoyée : {id, kind: "text", text} ou {id, kind: "audio", url, afterSeq} (sa transcription est
  // la première arrivée après afterSeq).
  const [sent, setSent] = useState(null);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState(null);
  const [writing, setWriting] = useState(false); // « Répondre par écrit »
  const [text, setText] = useState("");
  const recorderRef = useRef(null);

  // reading : en lecture, le texte lu, retenu à l'envoi (l'extrait suivant se surligne dès la lecture réussie).
  const replaceSent = (message) => {
    if (sent?.url && sent.url !== message.url) URL.revokeObjectURL(sent.url);
    setSent({
      reading: readingText,
      ...message,
      id: (sent?.id ?? 0) + 1,
      before: taskEvaluation,
      afterIntent: intent?.seq ?? 0,
    });
  };
  // Correction à la main de la réponse affichée : {id : la réponse corrigée, draft : le texte du champ}.
  const [editing, setEditing] = useState(null);

  // Le volume de chaque bloc capté depuis le début de l'enregistrement (cf. Recorder) : le premier dit que le micro
  // capte vraiment, l'onde de la piste les suit (cf. RecordSlider).
  const [levels, setLevels] = useState([]);
  const startRecording = async () => {
    setMicError(null);
    setLevels([]);
    // Le même micro pour toute la séance, ouvert au premier enregistrement (cf. Recorder).
    recorderRef.current ??= new Recorder();
    let first = true;
    try {
      await recorderRef.current.start((value) => {
        // Le micro capte : une petite vibration, sur Android (iOS ne le permet pas aux pages web).
        if (first) navigator.vibrate?.(30);
        first = false;
        setLevels((previous) => [...previous, value].slice(-MAX_LEVELS));
      });
    } catch {
      setMicError("Micro inaccessible : autorise l’accès au micro.");
      return;
    }
    setRecording(true);
  };

  const stopRecording = async () => {
    const blob = recorderRef.current.stop();
    setRecording(false);
    setLevels([]);
    return blob;
  };

  // Fin de la séance, ou départ de la page : le micro se ferme, le témoin du téléphone s'éteint.
  useEffect(() => {
    if (!disabled || recording) return;
    recorderRef.current?.close();
    recorderRef.current = null;
  }, [disabled, recording]);
  useEffect(() => () => recorderRef.current?.close(), []);

  const sendAudio = async (blob) => {
    if (disabled) return;
    onSendAudio(await base64(blob));
    replaceSent({ kind: "audio", url: URL.createObjectURL(blob), afterSeq: transcript?.seq ?? 0 });
  };

  const sendText = () => {
    const message = finalized(text).trim();
    if (!message || disabled) return;
    onSend(message);
    replaceSent({ kind: "text", text: message });
    setText("");
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && e.target.tagName === "TEXTAREA") {
      e.preventDefault();
      sendText();
    }
  };
  // La réponse corrigée remplace l'affichée (son enregistrement reste à réécouter).
  const sendCorrection = () => {
    const message = editing?.draft.trim();
    setEditing(null);
    if (!message || disabled || message === said) return;
    onSend(message, true);
    replaceSent({ kind: "text", text: message, url: sent?.url, reading: sent?.reading });
  };

  const heard = sent?.kind === "audio" && transcript && transcript.seq > sent.afterSeq ? transcript.text : null;
  const said = sent?.kind === "text" ? sent.text : heard;
  // En lecture, le texte lu s'écrit dès l'envoi, sans attendre la transcription ; ses mots mal lus se surlignent à
  // l'arrivée de l'évaluation, sans qu'il se réécrive (cf. demande explicite du user). Rien entendu : « (rien
  // entendu) », comme ailleurs.
  // Une lecture, seulement si le serveur l'a jugée telle (intent) : une question au prof s'écrit telle quelle, en
  // conversation (cf. demande explicite du user).
  const readingIntent = sent && intent && intent.seq > sent.afterIntent ? intent.reading : null;
  const reading = Boolean(sent?.reading) && said !== "" && readingIntent === true;
  const answer = reading ? sent.reading : said;
  // Double route voyelle, case « Phonétique » : la prononciation entendue de la réponse enregistrée, sous sa
  // transcription ; pas pour une réponse corrigée à la main.
  const phonetic = showPhonetic && heard ? transcript.phonetic : null;
  const ownEvaluation = taskEvaluation !== undefined;
  const evaluated = ownEvaluation && Boolean(sent) && Boolean(taskEvaluation) && taskEvaluation !== sent.before;
  const exchanged = ownEvaluation ? null : exchange;
  const evaluation = exchanged?.kind === "evaluation" ? exchanged.evaluation : null;
  const perfect = Boolean(evaluation) && evaluation.errors.length === 0;

  // Étape de la disparition d'une réponse sans faute ({id, stage}, id : la réponse concernée).
  const [fade, setFade] = useState(null);
  const sentId = sent?.id;
  useEffect(() => {
    if (!perfect || sentId === undefined) return undefined;
    let at = 0;
    const timers = FADE_STEPS.map(([stage, delay]) => {
      at += delay;
      return setTimeout(() => setFade({ id: sentId, stage }), at);
    });
    return () => timers.forEach(clearTimeout);
  }, [perfect, sentId]);
  const stage = fade && fade.id === sentId ? fade.stage : null;
  const shown = stage === "gone" ? null : sent;
  const correcting = editing && editing.id === sent?.id;
  const canCorrect = Boolean(said) && !disabled && !stage && !correcting;
  // Un chiffre dans la transcription : une fois la réponse écrite (cf. Answer, un caractère par SPEECH_STEP_MS), le
  // crayon explose deux fois, comme la coche du suivi, l'élève peut l'écrire en lettres à la main (cf. demande
  // explicite du user, .ra-composer-correct-digits) ; key : il réexplose à chaque nouvelle transcription.
  const digits = /\d/.test(said ?? "");
  const writtenMs = digits ? graphemes(withoutNikkud(said)).length * SPEECH_STEP_MS : 0;

  return (
    // La bordure de la fenêtre prend la couleur du mode (cf. .ra-zone-composer:has(.ra-composer-evaluation)).
    <div className={`ra-composer ${shown && exchanged ? `ra-composer-${exchanged.kind}` : ""}`} onKeyDown={onKeyDown}>
      <div className="ra-panel-head">
        <FlapLabel text={(shown && LABELS[exchanged?.kind]) || "Ta réponse"} />
      </div>
      {/* La fenêtre s'agrandit vers le bas à la première réponse, et se referme après une réponse sans faute (cf.
          .ra-fold). */}
      <div
        className={`ra-fold ra-exchange-fold ${shown && stage !== "folding" && !evaluated ? "" : "ra-fold-closed"}`}
      >
        <div className="ra-fold-inner">
          {shown && (
            <div className={`ra-exchange ${stage ? "ra-exchange-erased" : ""}`}>
              <div className="ra-exchange-said">
                {/* Le crayon, juste sous le bouton de réécoute (cf. demande explicite du user). */}
                {(sent.url || canCorrect) && (
                  <div className="ra-exchange-buttons">
                    {sent.url && (
                      <button
                        type="button"
                        className="ra-composer-play"
                        onClick={() => new Audio(sent.url).play()}
                        aria-label="Réécouter ma réponse"
                        title="Réécouter ma réponse"
                      >
                        ▶
                      </button>
                    )}
                    {canCorrect && (
                      <button
                        key={said}
                        type="button"
                        className={`ra-composer-play ra-composer-correct ${digits ? "ra-composer-correct-digits" : ""}`}
                        style={digits ? { "--burst-delay": `${writtenMs}ms` } : undefined}
                        onClick={() => setEditing({ id: sent.id, draft: said })}
                        aria-label="Corriger ma réponse à la main"
                        title="Corriger ma réponse à la main"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                <div className="ra-exchange-text">
                  {correcting ? (
                    <div className="ra-exchange-edit">
                      <input
                        type="text"
                        dir="auto"
                        lang="he"
                        value={editing.draft}
                        onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") sendCorrection();
                          if (e.key === "Escape") setEditing(null);
                        }}
                        aria-label="Ma réponse corrigée"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="ra-composer-send"
                        onClick={sendCorrection}
                        disabled={!editing.draft.trim()}
                      >
                        Envoyer
                      </button>
                    </div>
                  ) : answer === null ? (
                    <p className="muted">Transcription…</p>
                  ) : answer ? (
                    // Les fautes se surlignent une fois la réponse écrite (cf. Answer).
                    <Answer
                      key={sent.id}
                      evaluation={{ answer, errors: evaluation?.errors ?? [] }}
                      delayMs={reading ? READING_DELAY_MS : 0}
                      waiting={reading && !evaluation}
                      perfect={perfect}
                      below={phonetic && <p className="ra-exchange-phonetic">{phonetic}</p>}
                    />
                  ) : (
                    <p className="muted">(rien entendu)</p>
                  )}
                </div>
              </div>
              {exchanged?.kind === "evaluation" &&
                (!evaluation ? (
                  <p className="muted">Le prof évalue ta réponse…</p>
                ) : (
                  evaluation.errors.length > 0 && (
                    <>
                      <hr className="ra-assessment-rule" />
                      <Evaluation evaluation={evaluation} />
                    </>
                  )
                ))}
            </div>
          )}
          {/* Trait tracé de gauche à droite au-dessus de la piste, à chaque réponse envoyée. */}
          {/* Le mode change (« Évaluation », « Conversation ») : sa couleur balaie le trait de gauche à droite,
              par-dessus l'ancienne (key : le balayage, rejoué à chaque changement, cf. .ra-exchange-rule-sweep). */}
          {shown && (
            <div
              key={shown.id}
              className={`ra-exchange-rule ${stage && stage !== "erasing" ? "ra-exchange-rule-out" : ""}`}
              role="separator"
            >
              <RuleShape className="ra-exchange-rule-base" />
              <RuleShape key={exchanged?.kind ?? "none"} className="ra-exchange-rule-sweep" />
            </div>
          )}
        </div>
      </div>
      <div className="ra-composer-actions">
        {lamp}
        <RecordSlider
          recording={recording}
          onStart={startRecording}
          onSend={async () => sendAudio(await stopRecording())}
          onCancel={stopRecording}
          levels={levels}
          disabled={disabled}
        />
        {WRITTEN && (
          <label className="ra-composer-writing">
            <span>Répondre par écrit</span>
            <button
              type="button"
              className={`switch${writing ? " on" : ""}`}
              role="switch"
              aria-checked={writing}
              aria-label="Afficher/masquer la saisie écrite"
              onClick={() => setWriting((on) => !on)}
            >
              <span className="switch-knob" />
            </button>
          </label>
        )}
      </div>
      {micError && <p className="ra-alert">{micError}</p>}
      {WRITTEN && writing && (
        <>
          <HebrewInput
            value={text}
            onChange={setText}
            rows={2}
            showVoicePrefill={false}
            placeholder="כתוב כאן… (Entrée pour envoyer)"
          />
          <button
            type="button"
            className="ra-composer-send ra-composer-send-text"
            onClick={sendText}
            disabled={disabled || !text.trim()}
          >
            Envoyer
          </button>
        </>
      )}
    </div>
  );
}
