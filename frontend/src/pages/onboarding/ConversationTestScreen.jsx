import { useEffect, useRef, useState } from "react";
import { conversationEvalWebSocketUrl } from "../../api/conversationEval";
import { MicrophoneIcon } from "../../components/MicrophoneIcon";
import { useWakeLock } from "../../hooks/useWakeLock";
import "../screens.css";

// Troisième test d'évaluation de niveau : conversation en direct (même
// pipeline audio que RevisionScreen — cf. ce fichier pour les commentaires
// détaillés sur chaque piège) avec un professeur IA qui fait passer 11
// exercices de traduction fr->he et note chaque réponse via un outil côté
// serveur (cf. app.conversation_eval) — outil de conception, pas encore
// l'algorithme final de placement, cf. demande explicite du user. Aucune
// sauvegarde côté serveur : les scores arrivent en direct sur le WebSocket
// et sont accumulés ici, affichés en graphique une fois la conversation
// terminée.

function renderWithAsteriskBold(text) {
  return text.split(/\*([^*]+)\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

function floatTo16kPCM(float32, inRate) {
  const outRate = 16000;
  const ratio = inRate / outRate;
  const outLength = Math.floor(float32.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = Math.floor(i * ratio);
    let sample = float32[srcIndex];
    sample = Math.max(-1, Math.min(1, sample));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function int16ToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToInt16(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

// Plus long que RevisionScreen (5 min) : jusqu'à 11 exercices + 3 questions
// de warm-up peuvent prendre bien plus de temps — évite qu'une session
// oubliée ouverte ne consomme du quota Gemini Live/Whisper indéfiniment.
const MAX_DURATION_MS = 20 * 60 * 1000;

function isErrorStatus(status) {
  return status.startsWith("Micro refusé") || status.startsWith("Erreur") || status.startsWith("Connexion fermée");
}

const SCORE_COLOR = "#2563eb";

// Petit graphique SVG fait main (pas de librairie), même esprit que
// QcmNiveauScreen::ResultsChart — score (1-3) en ordonnée, index de la
// question en abscisse.
function ScoresChart({ scores }) {
  const width = 320;
  const height = 200;
  const padding = { top: 12, right: 12, bottom: 24, left: 28 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const n = scores.length;

  function x(i) {
    return n <= 1 ? padding.left + plotWidth / 2 : padding.left + (i / (n - 1)) * plotWidth;
  }
  function y(score) {
    return padding.top + plotHeight - ((score - 1) / 2) * plotHeight;
  }

  const linePoints = scores.map((s, i) => `${x(i)},${y(s)}`).join(" ");

  return (
    <svg width={width} height={height} role="img" aria-label="Scores obtenus par question">
      {[1, 2, 3].map((v) => (
        <g key={v}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--cardBorder)"
            strokeWidth="1"
          />
          <text x={padding.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--textSecondary)">
            {v}
          </text>
        </g>
      ))}
      {n > 0 && <polyline points={linePoints} fill="none" stroke={SCORE_COLOR} strokeWidth="2" />}
      {scores.map((s, i) => (
        <circle key={i} cx={x(i)} cy={y(s)} r="4" fill={SCORE_COLOR} />
      ))}
      {scores.map((s, i) => (
        <text
          key={`label-${i}`}
          x={x(i)}
          y={height - padding.bottom + 14}
          textAnchor="middle"
          fontSize="9"
          fill="var(--textSecondary)"
        >
          {i + 1}
        </text>
      ))}
    </svg>
  );
}

export default function ConversationTestScreen() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [aiBuffer, setAiBuffer] = useState("");
  const [lastCompletedAi, setLastCompletedAi] = useState("");
  const [history, setHistory] = useState([]); // [{speaker, text, ts}]
  const [scores, setScores] = useState([]);
  const [ended, setEnded] = useState(false);

  const aiBufferRef = useRef("");

  const wsRef = useRef(null);
  const micContextRef = useRef(null);
  const micStreamRef = useRef(null);
  const processorRef = useRef(null);
  const playbackContextRef = useRef(null);
  const nextPlaybackTimeRef = useRef(0);
  const autoStopTimeoutRef = useRef(null);
  const intentionalStopRef = useRef(false);
  const serverErrorRef = useRef(false);

  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

  useWakeLock(running);

  function addToHistory(speaker, text, ts) {
    setHistory((prev) => [...prev, { speaker, text, ts }].sort((a, b) => a.ts - b.ts));
  }

  function playChunk(int16) {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000,
      });
      nextPlaybackTimeRef.current = playbackContextRef.current.currentTime;
    }
    const ctx = playbackContextRef.current;
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(nextPlaybackTimeRef.current, ctx.currentTime);
    source.start(startAt);
    nextPlaybackTimeRef.current = startAt + buffer.duration;
  }

  async function start() {
    intentionalStopRef.current = false;
    serverErrorRef.current = false;
    setRunning(true);
    setStatus("Demande d'accès au micro...");

    let micStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const hint =
        e.name === "NotAllowedError" || /permission denied/i.test(e.message)
          ? " — rends-toi dans Paramètres > Applications > Chrome > Autorisations, et autorise l'utilisation du microphone."
          : "";
      setStatus("Micro refusé : " + e.message + hint);
      setRunning(false);
      return;
    }
    micStreamRef.current = micStream;

    setStatus("Connexion...");

    autoStopTimeoutRef.current = setTimeout(() => {
      stop();
      setStatus("Conversation terminée (durée maximale de 20 minutes atteinte).");
    }, MAX_DURATION_MS);

    const ws = new WebSocket(conversationEvalWebSocketUrl());
    wsRef.current = ws;

    const micContext = new (window.AudioContext || window.webkitAudioContext)();
    micContextRef.current = micContext;
    const source = micContext.createMediaStreamSource(micStream);
    const processor = micContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm16k = floatTo16kPCM(input, micContext.sampleRate);
      ws.send(JSON.stringify({ type: "audio", data: int16ToBase64(pcm16k) }));
    };
    source.connect(processor);
    processor.connect(micContext.destination);

    ws.onopen = () => {
      setStatus("Connecté — parle en hébreu !");
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "audio") {
        playChunk(base64ToInt16(msg.data));
      } else if (msg.type === "ai_transcript") {
        aiBufferRef.current += msg.text;
        setAiBuffer(aiBufferRef.current);
      } else if (msg.type === "turn_complete") {
        const finished = aiBufferRef.current;
        aiBufferRef.current = "";
        setAiBuffer("");
        if (finished) {
          addToHistory("ai", finished, msg.ts);
          setLastCompletedAi(finished);
        }
      } else if (msg.type === "user_transcript_final") {
        addToHistory("user", msg.text, msg.ts);
      } else if (msg.type === "score") {
        setScores((prev) => [...prev, msg.score]);
      } else if (msg.type === "conversation_ended") {
        setScores(msg.scores);
        intentionalStopRef.current = true;
        setEnded(true);
        stopMediaOnly();
      } else if (msg.type === "error") {
        serverErrorRef.current = true;
        setStatus("Erreur : " + msg.message);
        addToHistory("error", msg.message, Date.now() / 1000);
      }
    };

    ws.onerror = () => setStatus("Erreur de connexion.");
    ws.onclose = (event) => {
      if (intentionalStopRef.current || serverErrorRef.current) return;
      setStatus(`Connexion fermée (code ${event.code}${event.reason ? " — " + event.reason : ""}).`);
    };
  }

  // Coupe micro/lecture/websocket SANS toucher à `ended`/`scores` — utilisé
  // quand le SERVEUR met fin à la conversation de lui-même (cf. demande
  // explicite du user, "si la communication se coupe d'elle même"),
  // contrairement à `stop()` (arrêt manuel par le user).
  function stopMediaOnly() {
    clearTimeout(autoStopTimeoutRef.current);
    setRunning(false);
    aiBufferRef.current = "";
    setAiBuffer("");
    processorRef.current?.disconnect();
    processorRef.current = null;
    micContextRef.current?.close();
    micContextRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    wsRef.current = null;
    playbackContextRef.current?.close();
    playbackContextRef.current = null;
  }

  function stop() {
    intentionalStopRef.current = true;
    setStatus("");
    stopMediaOnly();
    wsRef.current?.close();
  }

  if (ended) {
    return (
      <section className="screen">
        <h1 style={{ fontSize: "1.4em" }}>Résultats du test conversationnel</h1>
        <p className="muted" style={{ fontSize: "0.85em" }}>
          {scores.length} question{scores.length > 1 ? "s" : ""} évaluée{scores.length > 1 ? "s" : ""}.
        </p>
        <ScoresChart scores={scores} />
      </section>
    );
  }

  return (
    <section className="screen" style={{ justifyContent: "flex-start", marginTop: 24, marginBottom: "auto" }}>
      {scores.length > 0 && (
        <div
          style={{
            marginBottom: 8,
            fontSize: "0.75em",
            color: "var(--textSecondary)",
            textAlign: "center",
          }}
        >
          Scores (contrôle temporaire) : {scores.map((s, i) => `Q${i + 1}=${s}`).join(" · ")}
        </div>
      )}
      <div className="card card-illustration" style={{ textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
          <div style={{ flexShrink: 0, paddingInlineEnd: 12, borderInlineEnd: "1px solid var(--cardBorder)" }}>
            <MicrophoneIcon
              size={48}
              badgeColor={running ? "var(--annulationPleine)" : "var(--validationPleine)"}
              pulsing={running}
              onClick={running ? stop : start}
            />
          </div>
          <p
            style={{
              flex: 1,
              minWidth: 0,
              margin: 0,
              fontSize: "0.8em",
              fontStyle: "italic",
              textAlign: "start",
              color: "var(--textSecondary)",
            }}
          >
            <strong style={{ fontStyle: "normal", color: "var(--textPrimary)" }}>Test conversationnel : </strong>
            un professeur IA va te faire passer 11 exercices de traduction à l'oral pour évaluer ton niveau.
          </p>
        </div>

        {status && (
          <p
            className="muted"
            style={{
              margin: "8px 0 0",
              fontSize: "0.8em",
              color: isErrorStatus(status) ? "var(--annulationPleine)" : undefined,
            }}
          >
            {status}
          </p>
        )}

        {scores.length > 0 && (
          <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.75em" }}>
            {scores.length} / 11 exercices évalués.
          </p>
        )}

        <div
          style={{
            marginTop: 12,
            textAlign: "left",
            direction: "ltr",
            background: running ? "var(--annulationPleine)" : "var(--validationPleine)",
            color: "#fff",
            borderRadius: 8,
            padding: "10px 14px",
            minHeight: "1.4em",
            transition: "background-color 0.2s",
          }}
        >
          {renderWithAsteriskBold(aiBuffer || lastCompletedAi || "…")}
        </div>

        <div
          style={{
            marginTop: 12,
            border: "1px solid var(--cardBorder)",
            background: "var(--bg)",
            borderRadius: 8,
            padding: "12px 14px",
            minHeight: 60,
            fontSize: "0.85em",
            color: "var(--textSecondary)",
            whiteSpace: "pre-wrap",
          }}
        >
          {history.map((entry, i) => (
            <div
              key={i}
              style={{
                textAlign: entry.speaker === "user" ? "right" : "left",
                direction: entry.speaker === "user" ? "rtl" : "ltr",
              }}
            >
              {entry.speaker === "user" ? "🧑" : entry.speaker === "ai" ? "🤖" : "⚠️"}{" "}
              {entry.speaker === "ai" ? renderWithAsteriskBold(entry.text) : entry.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
