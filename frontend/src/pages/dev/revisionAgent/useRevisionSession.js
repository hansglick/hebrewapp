import { useCallback, useEffect, useRef, useState } from "react";
import { revisionAgentWebSocketUrl } from "../../../api/revisionAgent";
import { AudioLink } from "./audio";

// Séance avec le prof (cf. app.revision_agent.session pour le protocole) :
// status "idle" | "connecting" | "live". Lecture : phase "greeting" |
// "instruction" | "reading" | "verdict" | "done", passage, verdict.
// Compréhension : text (texte de la leçon), highlight (phrases surlignées)
// et excerpts (extraits qui répondent à la question, [phrase, début, fin]),
// question (servie par l'app), evaluation (réponse, fautes commentées, notes
// de langue et de compréhension) et paused ; phase "done" à la fin.
// Expression libre : question (posée par le prof, avec son indice),
// evaluation (réponse, fautes commentées, note de langue, solution) et
// paused ; phase "done" à la fin. Déclinaison : exercise
// (phrase à transformer, mot à modifier) et answer. Complétion : exercise
// (début de phrase, indice), answer et solution (phrase d'origine, mots du
// concept). Mot : exercise (mot, traduction, indice), answer et solution.
// Question : exercise (phrase, indice), answer et solution (question modèle).
// paused : après un échec en déclinaison ou une évaluation (compréhension,
// expression libre),
// l'exercice suivant attend next().
export function useRevisionSession() {
  const [status, setStatus] = useState("idle");
  const [phase, setPhase] = useState(null);
  const [seconds, setSeconds] = useState(0);
  // À l'écran : la dernière prise de parole du prof (chacune écrase la précédente), le texte à lire et le verdict.
  const [teacher, setTeacher] = useState(null);
  const [passage, setPassage] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [text, setText] = useState(null);
  const [highlight, setHighlight] = useState([]);
  const [excerpts, setExcerpts] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [exercise, setExercise] = useState(null);
  const [solution, setSolution] = useState(null);
  const [notice, setNotice] = useState(null);
  const [paused, setPaused] = useState(false);
  const [question, setQuestion] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
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
      setPassage(null);
      setVerdict(null);
      setText(null);
      setHighlight([]);
      setExcerpts([]);
      setAnswer(null);
      setExercise(null);
      setSolution(null);
      setNotice(null);
      setPaused(false);
      setQuestion(null);
      setEvaluation(null);
      setStatus("connecting");

      const audio = new AudioLink();
      audioRef.current = audio;
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
              prev && prev.seq > msg.seq ? prev : { id: msg.id, seq: msg.seq, hebrew: msg.hebrew, french: msg.french },
            );
            break;
          case "passage":
            setPassage({ lesson: msg.lesson, hebrew: msg.hebrew, french: msg.french });
            break;
          case "verdict":
            setVerdict(msg.verdict);
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
            break;
          case "evaluation":
            setEvaluation(msg.evaluation);
            break;
          case "pause":
            setPaused(msg.paused);
            break;
          case "interrupt":
            audioRef.current?.flush();
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
      };

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

  return {
    status, phase, seconds, teacher, passage, verdict, text, highlight, excerpts, answer, exercise, solution, notice, paused,
    question, evaluation, start, stop, next,
  };
}
