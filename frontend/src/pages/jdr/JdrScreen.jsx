import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getJdr, jdrWebSocketUrl } from "../../api/jdr";
import { mediaUrl } from "../../api/media";
import { MicrophoneIcon } from "../../components/MicrophoneIcon";
import "../screens.css";

// L'IA entoure d'astérisques les mots hors du vocabulaire connu de
// l'étudiant (cf. item_jdr.json::instruction) — on les affiche en gras
// plutôt que de montrer les astérisques littéralement. `split` avec un
// groupe capturant alterne texte normal / mot capturé dans le tableau
// résultat (même technique que renderWithHebrewHighlight ailleurs dans
// l'app) : un "*" resté seul (mot en cours de streaming, fermant pas
// encore reçu) n'a pas de paire et reste donc affiché tel quel jusqu'au
// prochain delta.
function renderWithAsteriskBold(text) {
  return text.split(/\*([^*]+)\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

// Downsample Float32 (taux natif du micro) vers 16kHz PCM16 — format
// attendu par Gemini Live (audio/pcm), même logique que le prototype
// instructions/testlive/webapp_whisper/static/index.html.
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

// Coupe la conversation au bout de 2 minutes — évite qu'une session oubliée
// ouverte ne consomme du quota Gemini Live/Whisper indéfiniment.
const MAX_DURATION_MS = 2 * 60 * 1000;

export default function JdrScreen() {
  const { code } = useParams();
  const [jdr, setJdr] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Prêt.");
  const [aiBuffer, setAiBuffer] = useState("");
  // Reste affichée après turn_complete, jusqu'à ce que la prochaine réplique
  // de l'IA commence à arriver (aiBuffer redevient non-vide) — sans ça,
  // l'encadré retombe à "…" dès la fin de chaque tour, ce qui laisse
  // l'écran vide la plupart du temps entre deux répliques.
  const [lastCompletedAi, setLastCompletedAi] = useState("");
  const [history, setHistory] = useState([]); // [{speaker, text, ts}], retrié à chaque ajout

  // Source de vérité synchrone pour le texte IA en cours d'accumulation —
  // `aiBuffer` (state) n'est là que pour déclencher le re-render. Nécessaire
  // pour éviter d'appeler addToHistory() depuis l'intérieur d'une fonction
  // updater de setState : en StrictMode (dev), React invoque ces fonctions
  // deux fois pour détecter les impuretés, ce qui doublait chaque réplique
  // de l'IA dans le journal (cf. l'ancien code qui le faisait).
  const aiBufferRef = useRef("");

  const wsRef = useRef(null);
  const micContextRef = useRef(null);
  const micStreamRef = useRef(null);
  const processorRef = useRef(null);
  const playbackContextRef = useRef(null);
  const nextPlaybackTimeRef = useRef(0);
  const autoStopTimeoutRef = useRef(null);
  // Distingue un arrêt volontaire (bouton, minuteur) d'une vraie coupure —
  // sans ça, ws.onclose (déclenché de façon asynchrone par wsRef.current?.close()
  // dans stop()) écraserait le statut qu'on vient de positionner.
  const intentionalStopRef = useRef(false);

  useEffect(() => {
    setJdr(null);
    setLoadError(null);
    getJdr(code)
      .then(setJdr)
      .catch((e) => setLoadError(e.message));
  }, [code]);

  // Coupe proprement micro/websocket/lecture audio si on quitte l'écran en
  // pleine conversation (changement de route, retour en arrière...).
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setRunning(true);
    setStatus("Connexion...");

    autoStopTimeoutRef.current = setTimeout(() => {
      stop();
      setStatus("Conversation terminée (durée maximale de 2 minutes atteinte).");
    }, MAX_DURATION_MS);

    const ws = new WebSocket(jdrWebSocketUrl(code));
    wsRef.current = ws;

    ws.onopen = async () => {
      setStatus("Connecté — parle en hébreu !");
      let micStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        setStatus("Micro refusé : " + e.message);
        stop();
        return;
      }
      micStreamRef.current = micStream;
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
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "audio") {
        playChunk(base64ToInt16(msg.data));
      } else if (msg.type === "ai_transcript") {
        aiBufferRef.current += msg.text;
        setAiBuffer(aiBufferRef.current);
      } else if (msg.type === "turn_complete") {
        // addToHistory() est appelé ici, en dehors de toute fonction
        // updater de setState — jamais à l'intérieur d'un setAiBuffer(prev
        // => ...), sans quoi StrictMode l'appellerait deux fois (cf.
        // commentaire sur aiBufferRef) et doublerait la réplique dans le
        // journal.
        const finished = aiBufferRef.current;
        aiBufferRef.current = "";
        setAiBuffer("");
        if (finished) {
          addToHistory("ai", finished, msg.ts);
          setLastCompletedAi(finished);
        }
      } else if (msg.type === "user_transcript_final") {
        // Whisper renvoie le tour complet d'un coup, avec un léger retard
        // sur le flux Gemini — msg.ts (horodaté au début du tour, pas à la
        // réception) le replace à sa vraie place chronologique.
        addToHistory("user", msg.text, msg.ts);
      } else if (msg.type === "error") {
        setStatus("Erreur : " + msg.message);
        addToHistory("error", msg.message, Date.now() / 1000);
      }
    };

    // L'événement "error" d'un WebSocket navigateur ne transporte jamais de
    // détail (ni code, ni raison — restriction volontaire du spec pour ne
    // rien révéler d'un réseau tiers) : impossible de savoir ici pourquoi.
    // "close", juste après, porte le vrai diagnostic (event.code/reason) —
    // on l'affiche pour ne plus être aveugle sur un "échec de connexion".
    ws.onerror = () => setStatus("Erreur de connexion.");
    ws.onclose = (event) => {
      if (intentionalStopRef.current) return;
      setStatus((s) =>
        s.startsWith("Erreur")
          ? s
          : `Connexion fermée (code ${event.code}${event.reason ? " — " + event.reason : ""}).`
      );
    };
  }

  function stop() {
    intentionalStopRef.current = true;
    clearTimeout(autoStopTimeoutRef.current);
    setRunning(false);
    setStatus("");
    aiBufferRef.current = "";
    setAiBuffer("");
    processorRef.current?.disconnect();
    processorRef.current = null;
    micContextRef.current?.close();
    micContextRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    playbackContextRef.current?.close();
    playbackContextRef.current = null;
  }

  if (loadError) {
    return (
      <section className="screen">
        <p className="muted" style={{ color: "var(--danger)" }}>
          {loadError}
        </p>
      </section>
    );
  }

  if (!jdr) return null;

  return (
    <section className="screen">
      <div className="card card-illustration" style={{ textAlign: "center" }}>
        <img
          className="screen-image"
          style={{ width: "100%", maxHeight: "none" }}
          src={mediaUrl(jdr.image_url)}
          alt=""
          draggable={false}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, width: "100%" }}>
          <div style={{ flexShrink: 0, paddingInlineEnd: 12, borderInlineEnd: "1px solid var(--border)" }}>
            <MicrophoneIcon
              size={48}
              badgeColor={running ? "var(--danger)" : "var(--success)"}
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
              color: "var(--textMuted)",
            }}
          >
            {jdr.objectif_etudiant}
          </p>
        </div>

        {status && (
          <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.8em" }}>
            {status}
          </p>
        )}

        <div
          style={{
            marginTop: 12,
            textAlign: "right",
            direction: "rtl",
            background: running ? "var(--danger)" : "var(--success)",
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
            textAlign: "right",
            direction: "rtl",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            borderRadius: 8,
            padding: "12px 14px",
            minHeight: 60,
            fontSize: "0.85em",
            color: "var(--textMuted)",
            whiteSpace: "pre-wrap",
          }}
        >
          {history.map((entry, i) => (
            <div key={i}>
              {entry.speaker === "user" ? "🧑" : entry.speaker === "ai" ? "🤖" : "⚠️"}{" "}
              {entry.speaker === "ai" ? renderWithAsteriskBold(entry.text) : entry.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
