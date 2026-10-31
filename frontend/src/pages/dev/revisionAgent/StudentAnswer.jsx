import { useEffect, useRef, useState } from "react";
import HebrewInput from "../../../components/HebrewInput";
import { Answer, Evaluation } from "./Assessment";
import { Recorder } from "./audio";
import FlapLabel from "./FlapLabel";
import RecordSlider from "./RecordSlider";
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

const WRITTEN = false;

const FINAL_FORMS = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };
// HebrewInput ne finalise un mot qu'à l'espace : le dernier mot du message
// prend ici sa forme finale.
const finalized = (text) => text.replace(/[כמנפצ](?=[\s.,!?;:]|$)/g, (letter) => FINAL_FORMS[letter]);

const LABELS = { evaluation: "Évaluation", conversation: "Conversation" };

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

const base64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export default function StudentAnswer({ onSend, onSendAudio, transcript, exchange, disabled, lamp }) {
  // Dernière réponse envoyée : {id, kind: "text", text} ou {id, kind: "audio", url, afterSeq} (sa transcription est
  // la première arrivée après afterSeq).
  const [sent, setSent] = useState(null);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState(null);
  const [writing, setWriting] = useState(false); // « Répondre par écrit »
  const [text, setText] = useState("");
  const recorderRef = useRef(null);

  const replaceSent = (message) => {
    if (sent?.kind === "audio") URL.revokeObjectURL(sent.url);
    setSent({ ...message, id: (sent?.id ?? 0) + 1 });
  };

  const startRecording = async () => {
    setMicError(null);
    const recorder = new Recorder();
    try {
      await recorder.start();
    } catch {
      setMicError("Micro inaccessible : autorise l’accès au micro.");
      return;
    }
    recorderRef.current = recorder;
    setRecording(true);
  };

  const stopRecording = async () => {
    const blob = await recorderRef.current.stop();
    recorderRef.current = null;
    setRecording(false);
    return blob;
  };

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

  const heard = sent?.kind === "audio" && transcript && transcript.seq > sent.afterSeq ? transcript.text : null;
  const said = sent?.kind === "text" ? sent.text : heard;
  const evaluation = exchange?.kind === "evaluation" ? exchange.evaluation : null;
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

  return (
    // La bordure de la fenêtre prend la couleur du mode (cf. .ra-zone-composer:has(.ra-composer-evaluation)).
    <div className={`ra-composer ${shown && exchange ? `ra-composer-${exchange.kind}` : ""}`} onKeyDown={onKeyDown}>
      <div className="ra-panel-head">
        <FlapLabel text={(shown && LABELS[exchange?.kind]) || "Ta réponse"} />
      </div>
      {/* La fenêtre s'agrandit vers le bas à la première réponse, et se referme après une réponse sans faute (cf.
          .ra-fold). */}
      <div className={`ra-fold ra-exchange-fold ${shown && stage !== "folding" ? "" : "ra-fold-closed"}`}>
        <div className="ra-fold-inner">
          {shown && (
            <div className={`ra-exchange ${stage ? "ra-exchange-erased" : ""}`}>
              <div className="ra-exchange-said">
                {sent.kind === "audio" && (
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
                <div className="ra-exchange-text">
                  {said === null ? (
                    <p className="muted">Transcription…</p>
                  ) : said ? (
                    // Les fautes se surlignent une fois la réponse écrite (cf. Answer).
                    <Answer
                      key={sent.id}
                      evaluation={{ answer: said, errors: evaluation?.errors ?? [] }}
                      perfect={perfect}
                    />
                  ) : (
                    <p className="muted">(rien entendu)</p>
                  )}
                </div>
              </div>
              {exchange?.kind === "evaluation" &&
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
          {shown && (
            <hr
              key={shown.id}
              className={`ra-exchange-rule ${stage && stage !== "erasing" ? "ra-exchange-rule-out" : ""}`}
            />
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
