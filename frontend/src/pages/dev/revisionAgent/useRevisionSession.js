import { useCallback, useEffect, useRef, useState } from "react";
import { revisionAgentWebSocketUrl } from "../../../api/revisionAgent";
import { AudioLink } from "./audio";

// Séance avec le prof (cf. app.revision_agent.session pour le protocole) :
// status "idle" | "connecting" | "live". Lecture : text (le texte de la
// leçon), extract (l'extrait à lire : numéro, phrases), evaluation (lecture,
// erreurs commentées) et closing ; phase "done" à la fin.
// Compréhension : text (texte de la leçon), highlight (phrases surlignées)
// et excerpts (extraits qui répondent à la question, [phrase, début, fin]),
// question (servie par l'app), evaluation (réponse, fautes commentées, notes
// de langue et de compréhension) et paused ; phase "done" à la fin.
// Expression libre : topics (sujets révisés de la séance, celui en cours),
// question (servie par l'app), hints (indices donnés), evaluation (réponse,
// fautes, notes de langue et de plausibilité, solution), declension (phrase
// à décliner) et declensionEvaluation ; closing pendant que les fenêtres de
// la question se ferment ; phase "done" à la fin. Déclinaison : comme la
// déclinaison de l'expression libre (topics, declension, declensionEvaluation,
// closing, score). Complétion : exercise
// (début de phrase, indice), answer et solution (phrase d'origine, mots du
// concept). Mot : exercise (mot, traduction, indice), answer et solution.
// Question : exercise (phrase, indice), answer et solution (question modèle).
// paused : après un échec en déclinaison ou une évaluation (compréhension,
// expression libre),
// l'exercice suivant attend next().
// Page sans Gemini Live (params.mode === "texte") : pas de micro en continu (la
// voix du prof, avec params.ttsModel, est jouée comme en Live) ; l'élève
// enregistre ses réponses (sendAudio) ou les écrit (sendText), et transcript
// donne la transcription de la dernière réponse enregistrée ({seq, text, phonetic}, phonetic : sa prononciation
// entendue, double route voyelle) ;
// exchange, ce que le prof fait de la dernière réponse envoyée : {kind:
// "evaluation", evaluation (null tant qu'elle n'est pas jugée)} ou {kind:
// "conversation"} (null en attendant).

// Les remarques (kind « note » : le ו « ve » / « u », pas une faute importante)
// ne s'affichent pas : l'évaluation reste légère (cf. demande explicite du
// user) ; le prof peut en parler.
function withoutNotes(evaluation) {
  if (!evaluation?.errors) return evaluation;
  return { ...evaluation, errors: evaluation.errors.filter((error) => error.kind !== "note") };
}

export function useRevisionSession() {
  const [status, setStatus] = useState("idle");
  const [phase, setPhase] = useState(null);
  const [seconds, setSeconds] = useState(0);
  // À l'écran : la dernière prise de parole du prof (chacune écrase la précédente).
  const [teacher, setTeacher] = useState(null);
  // Lecture : l'extrait surligné dans le texte, et le contrôle de la dernière lecture (ses deux verbatims, la
  // prononciation attendue).
  const [extract, setExtract] = useState(null);
  const [text, setText] = useState(null);
  const [highlight, setHighlight] = useState([]);
  const [excerpts, setExcerpts] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [exercise, setExercise] = useState(null);
  const [solution, setSolution] = useState(null);
  const [notice, setNotice] = useState(null);
  const [paused, setPaused] = useState(false);
  // Compréhension avec évaluation orale : phase de réponse ouverte (ce que dit l'élève sera évalué).
  const [answering, setAnswering] = useState(false);
  // Évaluation orale : mode de langue du prof ("he" | "fr"), null sans évaluation orale.
  const [language, setLanguage] = useState(null);
  // Compréhension : le prof a fini sa première prise de parole (la bulle du mode de langue peut s'afficher).
  const [firstTurnDone, setFirstTurnDone] = useState(false);
  const [question, setQuestion] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  // Expression libre.
  const [topics, setTopics] = useState(null);
  const [hints, setHints] = useState([]);
  const [declension, setDeclension] = useState(null);
  const [declensionEvaluation, setDeclensionEvaluation] = useState(null);
  const [closing, setClosing] = useState(false);
  // Expression libre : comptes, dernier essai évalué et suite de tous les essais (fenêtre Suivi).
  const [score, setScore] = useState(null);
  // Tâche « Question » : l'indice offert (pastille), puis affiché.
  const [hint, setHint] = useState(null);
  // Tâche « Question » : l'élève a pris la parole une première fois (la fenêtre « Réponse » apparaît).
  const [answerFrame, setAnswerFrame] = useState(false);
  // Facture de la séance (tokens et prix de chaque modèle, durée), envoyée à la fin de la conversation (cf. Bill).
  const [bill, setBill] = useState(null);
  const [transcript, setTranscript] = useState(null);
  // Lecture : la dernière réponse est-elle une lecture ({seq, reading}), ou une phrase pour le prof (cf. reading.py,
  // to_teacher) ; envoyé avant sa transcription.
  const [intent, setIntent] = useState(null);
  // Lecture avec le tri : la transcription en direct de l'enregistrement en cours (cf. live_transcribe.py).
  const [liveText, setLiveText] = useState("");
  // … et sa connexion est prête (cf. RecordButton, « Parlez »).
  const [liveReady, setLiveReady] = useState(false);
  const [exchange, setExchange] = useState(null);
  const wsRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (status !== "live") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const teardown = useCallback(() => {
    audioRef.current?.close();
    audioRef.current = null;
  }, []);

  useEffect(
    () => () => {
      wsRef.current?.close();
      teardown();
    },
    [teardown],
  );

  const start = useCallback(
    async (params) => {
      if (wsRef.current) return;
      setSeconds(0);
      setPhase(null);
      setTeacher(null);
      setExtract(null);
      setText(null);
      setHighlight([]);
      setExcerpts([]);
      setAnswer(null);
      setExercise(null);
      setSolution(null);
      setNotice(null);
      setPaused(false);
      setAnswering(false);
      setLanguage(null);
      setFirstTurnDone(false);
      setQuestion(null);
      setEvaluation(null);
      setTopics(null);
      setHints([]);
      setDeclension(null);
      setDeclensionEvaluation(null);
      setClosing(false);
      setScore(null);
      setHint(null);
      setAnswerFrame(false);
      setBill(null);
      setTranscript(null);
      setIntent(null);
      setLiveText("");
      setExchange(null);
      setStatus("connecting");

      const textMode = params.mode === "texte";
      const audio = textMode && !params.ttsModel ? null : new AudioLink();
      audioRef.current = audio;
      // Le contexte audio se débloque pendant le clic qui lance la séance (sans micro, rien d'autre ne le fait) ; sur
      // iPhone, la page passe aussi en lecture : le mode silencieux ne coupe pas le prof (cf. AudioLink.unlock).
      if (textMode) audio?.unlock();
      const ws = new WebSocket(revisionAgentWebSocketUrl(params));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          audioRef.current?.play(event.data);
          return;
        }
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "status":
            if (msg.state === "live") setStatus("live");
            break;
          case "phase":
            setPhase(msg.phase);
            break;
          case "teacher":
            // Une traduction arrivée en retard n'écrase pas un envoi plus récent.
            setTeacher((prev) =>
              prev && prev.seq > msg.seq ? prev : { id: msg.id, seq: msg.seq, hebrew: msg.hebrew, french: msg.french, spoken: msg.spoken },
            );
            break;
          case "extract":
            setExtract(msg.extract);
            break;
          case "text":
            setText({ lesson: msg.lesson, title: msg.title, phrases: msg.phrases });
            break;
          case "highlight":
            setHighlight(msg.phrases);
            setExcerpts(msg.excerpts ?? []);
            break;
          case "answer":
            setAnswer(msg.answer);
            break;
          case "exercise":
            setExercise(msg.exercise);
            break;
          case "solution":
            setSolution(msg.solution);
            break;
          case "question":
            setQuestion(msg.question);
            // Les fenêtres de la question précédente ont fini de se fermer.
            if (!msg.question) setClosing(false);
            break;
          case "topics":
            setTopics({ list: msg.topics, current: msg.current, covered: msg.covered ?? [] });
            break;
          case "hints":
            setHints(msg.hints);
            break;
          case "declension":
            setDeclension(msg.declension);
            break;
          case "declension_evaluation":
            setDeclensionEvaluation(withoutNotes(msg.evaluation));
            break;
          case "score":
            setScore((previous) => ({
              counts: msg.score,
              event: msg.event,
              history: msg.event ? [...(previous?.history ?? []), msg.event] : [],
            }));
            break;
          case "hint":
            setHint(msg.hint);
            break;
          case "answer_frame":
            setAnswerFrame(true);
            break;
          case "closing":
            setClosing(true);
            break;
          case "evaluation":
            setEvaluation(withoutNotes(msg.evaluation));
            break;
          case "pause":
            setPaused(msg.paused);
            break;
          case "answering":
            setAnswering(msg.answering);
            break;
          case "language":
            setLanguage(msg.language);
            break;
          case "first_turn_done":
            setFirstTurnDone(true);
            break;
          case "interrupt":
            audioRef.current?.flush();
            break;
          case "bill":
            setBill(msg.bill);
            break;
          case "live_ready":
            setLiveReady(true);
            break;
          case "live_transcript":
            setLiveText(msg.text ?? "");
            break;
          // Transcription en direct : la phonétique suit la transcription, à son arrivée.
          case "phonetic":
            setTranscript((previous) => previous && { ...previous, phonetic: msg.phonetic ?? "" });
            break;
          case "intent":
            setIntent((previous) => ({ seq: (previous?.seq ?? 0) + 1, reading: Boolean(msg.reading) }));
            break;
          case "transcript":
            setTranscript((previous) => ({
              seq: (previous?.seq ?? 0) + 1,
              text: msg.text,
              phonetic: msg.phonetic ?? "",
            }));
            break;
          case "exchange":
            setExchange({ kind: msg.kind, evaluation: withoutNotes(msg.evaluation ?? null) });
            break;
          case "error":
            setNotice(msg.text);
            break;
        }
      };
      ws.onerror = () => setNotice("Impossible de joindre le serveur.");
      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        teardown();
        setStatus("idle");
        setPhase(null);
        setPaused(false);
        setAnswering(false);
        setLanguage(null);
      };

      if (textMode) return;
      try {
        await audio.startMicrophone((pcm) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
        });
      } catch {
        setNotice("Micro inaccessible : autorise l’accès au micro puis relance.");
        ws.close();
      }
    },
    [teardown],
  );

  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
    else ws.close();
  }, []);

  const next = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "next" }));
  }, []);

  // Mode texte : la réponse écrite de l'élève ; corrected : la transcription de sa dernière réponse orale, corrigée
  // à la main (cf. StudentAnswer).
  const sendText = useCallback((text, corrected = false) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    setExchange(null);
    ws.send(JSON.stringify({ type: "student_text", text, corrected }));
  }, []);

  // Mode texte : la réponse enregistrée de l'élève (WAV en base64), transcrite par le serveur.
  const sendAudio = useCallback((audio) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    setExchange(null);
    ws.send(JSON.stringify({ type: "student_audio", audio }));
  }, []);

  // Transcription en direct : l'enregistrement commence, ses blocs PCM (binaires) suivent, ou il est abandonné.
  const startAudio = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    setExchange(null);
    setLiveText("");
    setLiveReady(false);
    ws.send(JSON.stringify({ type: "audio_start" }));
  }, []);
  const sendAudioChunk = useCallback((pcm) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(pcm);
  }, []);
  const cancelAudio = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "audio_cancel" }));
  }, []);

  // Lecture : le prof lit l'extrait (le haut-parleur) ; nombre de phrases par lecture.
  const listen = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "listen" }));
  }, []);

  const setPerReading = useCallback((count) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "per_reading", count }));
  }, []);

  // Compréhension : l'élève redonne sa réponse à la même question.
  const retry = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "retry" }));
  }, []);

  // Tâche « Question » : l'élève a cliqué sur la pastille de l'indice.
  const requestHint = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "hint" }));
  }, []);

  const switchLanguage = useCallback((code) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    setLanguage(code);
    ws.send(JSON.stringify({ type: "language", language: code }));
  }, []);

  return {
    status, phase, seconds, teacher, extract, text, highlight, excerpts, answer, exercise, solution, notice, paused, answering, language, firstTurnDone,
    question, evaluation, topics, hints, declension, declensionEvaluation, closing, score, hint, answerFrame, bill, transcript, intent, liveText, liveReady, exchange,
    start, stop, next, retry, requestHint, switchLanguage, listen, setPerReading, sendText, sendAudio,
    startAudio, sendAudioChunk, cancelAudio,
  };
}
