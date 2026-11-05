import { useEffect, useRef, useState } from "react";
import HebrewInput from "../../../components/HebrewInput";
import { Answer, Evaluation } from "./Assessment";
import { Recorder } from "./audio";
import FlapLabel from "./FlapLabel";
import { graphemes, withoutNikkud } from "./hebrew";
import RecordButton from "./RecordButton";
import { SPEECH_STEP_MS } from "./TeacherSpeech";
import CleanReading from "./CleanReading";
import "../../../components/ConfigModal.css";

// Page sans Gemini Live (cf. demande explicite du user) : la réponse de
// l'élève, sous les fenêtres de l'exercice, et ce que le prof en fait, dans
// une seule fenêtre. En bas, centrés : l'ampoule de l'antisèche (lamp, cf.
// ExpressionBoard), le bouton d'enregistrement (cf. RecordButton : on le
// touche pour parler, on touche son carré pour arrêter, la corbeille annule).
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

// Transcription en direct : si sa connexion ne se dit pas prête (live_ready) dans ce délai, l'élève parle quand même
// (son audio est gardé par le serveur, et transcrit d'un bloc si le direct échoue).
const LIVE_READY_TIMEOUT_MS = 4000;

// « Orthographe déjà correcte » (cf. respellNote) : le temps de le lire.
const RESPELL_NOTE_MS = 2500;

// Lecture : le texte lu commence à s'écrire ce temps-là après l'envoi, à la vitesse habituelle (cf. Answer), pour que
// ses mots fautifs se surlignent peu après qu'il est écrit (cf. demande explicite du user). Avec le tri lecture /
// question (readingDelay faux, cf. RevisionAgentScreen), il s'écrit dès qu'il est jugé une lecture, sans attendre.
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
      {/* Un Z couché, en escalier (cf. demande explicite du user) : à gauche, un petit trait descend vers la piste ;
          le trait horizontal, de sa largeur ; à droite, un trait de même longueur monte. */}
      <path d="M1 10V5H99V0" vectorEffect="non-scaling-stroke" />
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
  readingDelay = true,
  liveTranscription = false,
  recorder = null,
  respelled = null,
  onRespell,
  liveText = "",
  liveReady = false,
  onAudioStart,
  onAudioChunk,
  onAudioCancel,
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
      afterIntent: message.afterIntent ?? intent?.seq ?? 0,
    });
  };
  // Correction à la main de la réponse affichée : {id : la réponse corrigée, draft : le texte du champ}.
  const [editing, setEditing] = useState(null);

  // Bouton « orthographe » (lecture, cf. demande explicite du user) : la transcription affichée est relue d'après le
  // contexte, et la réponse relue repart au prof (cf. TeacherSession.respell). respelling : la demande en cours
  // ({id : la réponse, seq : la dernière relecture reçue, intentSeq : la dernière intention reçue}) ; respellNote : la
  // réponse que la relecture a laissée telle quelle (« Orthographe déjà correcte », un instant).
  const [respelling, setRespelling] = useState(null);
  const [respellNote, setRespellNote] = useState(null);
  if (respelling && respelled && respelled.seq > respelling.seq) {
    // La relecture est arrivée : traitée pendant le rendu, comme un état dérivé d'une prop.
    setRespelling(null);
    if (respelling.id === sent?.id) {
      if (respelled.changed) {
        // Comme une correction à la main (cf. sendCorrection) ; son intention est celle qui suit la demande.
        replaceSent({
          kind: "text",
          text: respelled.text,
          url: sent.url,
          reading: sent.reading,
          afterIntent: respelling.intentSeq,
        });
      } else {
        setRespellNote(sent.id);
      }
    }
  }
  useEffect(() => {
    if (respellNote === null) return undefined;
    const timer = setTimeout(() => setRespellNote(null), RESPELL_NOTE_MS);
    return () => clearTimeout(timer);
  }, [respellNote]);

  // Transcription en direct (lecture avec le tri, cf. live_transcribe.py, demande explicite du user) : la fenêtre
  // s'ouvre dès le début de l'enregistrement sur sa transcription, qui s'écrit pendant que l'élève parle (sent.live,
  // son enregistrement, url, arrive à l'envoi) ; abandonné, la réponse d'avant revient (previous).
  const previousRef = useRef(null);
  const openLive = () => {
    previousRef.current = sent;
    setSent({
      reading: readingText,
      kind: "audio",
      url: null,
      live: true,
      afterSeq: transcript?.seq ?? 0,
      id: (sent?.id ?? 0) + 1,
      before: taskEvaluation,
      afterIntent: intent?.seq ?? 0,
    });
  };
  // Lecture : le verbatim s'est nettoyé en la phrase à lire (cf. CleanReading), l'id de la réponse.
  const [cleaned, setCleaned] = useState(null);

  // Le micro capte vraiment (son premier bloc, cf. Recorder) ; en transcription en direct, il faut aussi sa
  // connexion (liveReady), ou ne plus l'attendre (stalled) : l'élève peut parler (ready, cf. RecordButton).
  const [capturing, setCapturing] = useState(false);
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!recording || !capturing || !liveTranscription || liveReady) return undefined;
    const timer = setTimeout(() => setStalled(true), LIVE_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [recording, capturing, liveTranscription, liveReady]);
  const ready = recording && capturing && (!liveTranscription || liveReady || stalled);

  const startRecording = async () => {
    setMicError(null);
    setCapturing(false);
    setStalled(false);
    // Le même micro pour toute la séance : celui ouvert au lancement (recorder, cf. RevisionAgentScreen), sinon un
    // micro ouvert à ce premier enregistrement (cf. Recorder).
    recorderRef.current ??= recorder ?? new Recorder();
    let first = true;
    // Le serveur prépare la transcription en direct avant les premiers blocs.
    const live = liveTranscription && !disabled;
    if (live) onAudioStart();
    try {
      await recorderRef.current.start(
        () => {
          if (!first) return;
          // Le micro capte : une petite vibration, sur Android (iOS ne le permet pas aux pages web).
          navigator.vibrate?.(30);
          first = false;
          setCapturing(true);
        },
        live ? onAudioChunk : null,
      );
    } catch {
      if (live) onAudioCancel();
      setMicError("Micro inaccessible : autorise l’accès au micro.");
      return;
    }
    if (live) openLive();
    setRecording(true);
  };

  const stopRecording = async () => {
    const blob = recorderRef.current.stop();
    setRecording(false);
    setCapturing(false);
    return blob;
  };
  const cancelRecording = async () => {
    await stopRecording();
    if (!sent?.live || sent.url) return;
    onAudioCancel();
    setSent(previousRef.current);
  };

  // Fin de la séance, ou départ de la page : le micro se ferme, le témoin du téléphone s'éteint.
  useEffect(() => {
    if (!disabled || recording) return;
    recorderRef.current?.close();
    recorderRef.current = null;
  }, [disabled, recording]);
  useEffect(() => () => recorderRef.current?.close(), []);

  const sendAudio = async (blob) => {
    if (sent?.live && !sent.url) {
      // Transcription en direct : la réponse, déjà ouverte, reçoit son enregistrement.
      if (disabled) {
        onAudioCancel();
        setSent(previousRef.current);
        return;
      }
      onSendAudio(await base64(blob));
      if (previousRef.current?.url) URL.revokeObjectURL(previousRef.current.url);
      const url = URL.createObjectURL(blob);
      setSent((current) => ({ ...current, url }));
      return;
    }
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
  const phonetic = showPhonetic && heard ? transcript.phonetic || null : null;
  // Transcription en direct : jugée une lecture, le verbatim se nettoie d'abord en la phrase à lire (cleaning) ; la
  // réponse, déjà écrite, ne se réécrit pas.
  const cleaning = Boolean(sent?.live) && reading && cleaned !== sent.id;
  const ownEvaluation = taskEvaluation !== undefined;
  const judged = ownEvaluation && Boolean(sent) && Boolean(taskEvaluation) && taskEvaluation !== sent.before;
  // Une fois évaluée, la réponse ne revient plus, même quand son évaluation s'efface avec l'exercice suivant (cf.
  // demande explicite du user : comme les autres tâches, le verbatim s'efface en passant à la suite).
  const [evaluatedId, setEvaluatedId] = useState(null);
  useEffect(() => {
    if (judged) setEvaluatedId(sent.id);
  }, [judged, sent?.id]);
  const evaluated = judged || (Boolean(sent) && evaluatedId === sent.id);
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
  const askRespell = () => {
    setRespellNote(null);
    setRespelling({ id: sent.id, seq: respelled?.seq ?? 0, intentSeq: intent?.seq ?? 0 });
    onRespell(said);
  };
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
                    {/* Le bouton « orthographe », sous le crayon : « abc » et une coche. */}
                    {canCorrect && onRespell && (
                      <button
                        type="button"
                        className={`ra-composer-play ra-composer-correct ra-composer-respell ${
                          respelling ? "ra-composer-respell-busy" : ""
                        }`}
                        onClick={askRespell}
                        disabled={Boolean(respelling)}
                        aria-label="Corriger l’orthographe de ma réponse"
                        title="Corriger l’orthographe de ma réponse"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <text x="12" y="10" textAnchor="middle">
                            abc
                          </text>
                          <path d="M7 16.5l3.5 3.5L17.5 13" />
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
                  ) : sent.live && heard === null ? (
                    // Ce que l'élève dit, transcrit pendant qu'il parle.
                    <p className="ra-answer ra-answer-live" dir="rtl" lang="he">
                      {liveText}
                      <span className="ra-caret" aria-hidden="true" />
                    </p>
                  ) : cleaning ? (
                    <CleanReading key={sent.id} from={said} to={sent.reading} onDone={() => setCleaned(sent.id)} />
                  ) : answer === null ? (
                    <p className="muted">Transcription…</p>
                  ) : answer ? (
                    // Les fautes se surlignent une fois la réponse écrite (cf. Answer).
                    <Answer
                      key={sent.id}
                      evaluation={{ answer, errors: evaluation?.errors ?? [] }}
                      delayMs={reading && readingDelay ? READING_DELAY_MS : 0}
                      waiting={reading && !evaluation}
                      instant={Boolean(sent.live)}
                      perfect={perfect}
                      below={phonetic && <p className="ra-exchange-phonetic">{phonetic}</p>}
                    />
                  ) : (
                    <p className="muted">(rien entendu)</p>
                  )}
                  {respellNote === sent.id && !correcting && (
                    <p className="ra-respell-note" role="status">
                      Orthographe déjà correcte
                    </p>
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
        <RecordButton
          recording={recording}
          ready={ready}
          onStart={startRecording}
          onStop={async () => sendAudio(await stopRecording())}
          onCancel={cancelRecording}
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
