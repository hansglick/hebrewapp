import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { applyConversationEvalPlacement, conversationEvalWebSocketUrl } from "../../api/conversationEval";
import { getIdentity } from "../../api/identity";
import { MaskIcon } from "../../components/MaskIcon";
import { MicrophoneIcon } from "../../components/MicrophoneIcon";
import { useWakeLock } from "../../hooks/useWakeLock";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { displayLessonNumber } from "../../utils/lessonDisplay";
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

// --- Algorithme de placement (outil de conception, cf. demande explicite
// du user) : cherche, parmi les 11 scores obtenus (les questions jamais
// posées faute d'arrêt anticipé comptent comme score=1), la découpe entre
// un groupe "gauche" (sets déjà maîtrisés) et un groupe "droite" (sets pas
// encore atteints) qui égalise au mieux une estimation de maîtrise à
// gauche et une estimation d'échec à droite — chacune modélisée par une loi
// Beta dont on prend la médiane (x tel que P(X<x)=50%), calculée ici par
// bissection sur la fonction bêta incomplète régularisée (implémentation
// classique de Numerical Recipes : pas de lib de stats native en JS).

const SETS_COUNT = 11;

function logGamma(x) {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betaContinuedFraction(x, a, b) {
  const MAXIT = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (bt * betaContinuedFraction(1 - x, b, a)) / b;
}

// Médiane de Beta(a,b) par bissection sur betainc(x,a,b) = 0.5.
function betaMedian(a, b) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (regularizedIncompleteBeta(mid, a, b) < 0.5) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function estimateLevelPlacement(rawScores) {
  const padded = rawScores.slice(0, SETS_COUNT);
  while (padded.length < SETS_COUNT) padded.push(1);

  let best = null;
  for (let k = 1; k <= SETS_COUNT - 1; k++) {
    const left = padded.slice(0, k);
    const right = padded.slice(k);

    let alphaLeft = 0;
    for (const s of left) {
      if (s === 3) alphaLeft += 1;
      else if (s === 2) alphaLeft += 0.33;
    }
    let betaLeft = left.length - alphaLeft;
    if (alphaLeft === 0 || betaLeft === 0) {
      alphaLeft += 0.1;
      betaLeft += 0.1;
    }

    let alphaRight = 0;
    for (const s of right) {
      if (s === 1) alphaRight += 1;
      else if (s === 2) alphaRight += 0.66;
    }
    let betaRight = right.length - alphaRight;
    if (alphaRight === 0 || betaRight === 0) {
      alphaRight += 0.1;
      betaRight += 0.1;
    }

    const medianLeft = betaMedian(alphaLeft, betaLeft);
    const medianRight = betaMedian(alphaRight, betaRight);
    const diff = Math.abs(medianRight - medianLeft);

    // `<` strict (pas `<=`) : en cas d'égalité, garde le plus petit k déjà
    // trouvé — cf. demande explicite du user.
    if (best === null || diff < best.diff) {
      best = { k, alphaLeft, alphaRight, medianLeft, medianRight, diff };
    }
  }
  return best;
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
  const navigate = useNavigate();
  const pseudo = getIdentity()?.pseudo ?? "";
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [aiBuffer, setAiBuffer] = useState("");
  const [lastCompletedAi, setLastCompletedAi] = useState("");
  const [history, setHistory] = useState([]); // [{speaker, text, ts}]
  const [scores, setScores] = useState([]);
  const [ended, setEnded] = useState(false);
  const [placement, setPlacement] = useState(null);

  const aiBufferRef = useRef("");
  const setStartsRef = useRef([]);

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
      } else if (msg.type === "set_starts") {
        setStartsRef.current = msg.codes;
      } else if (msg.type === "score") {
        setScores((prev) => [...prev, msg.score]);
      } else if (msg.type === "conversation_ended") {
        setScores(msg.scores);
        // Règle en dur (cas particulier signalé par le user : un étudiant
        // qui cartonne partout se voyait renvoyé au tout début par
        // l'algorithme de découpe, faute de variation entre les sets) —
        // court-circuite la découpe Beta au-delà de 8 réponses notées 3.
        const countThrees = msg.scores.filter((s) => s === 3).length;
        if (countThrees > 8) {
          setPlacement({ override: true, startLesson: setStartsRef.current[8] });
        } else {
          const best = estimateLevelPlacement(msg.scores);
          setPlacement({ ...best, startLesson: setStartsRef.current[best.k - 1] });
        }
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
    const startLesson = placement?.startLesson;
    const chapId = startLesson ? startLesson.split(".")[0] : null;
    const levelLabel = chapId ? `${displayChapitreLabel(chapId)}.${displayLessonNumber(startLesson)}` : "?";

    async function handleStartAdventure() {
      if (startLesson) {
        try {
          await applyConversationEvalPlacement(startLesson);
        } catch {
          // best-effort : on navigue quand même vers l'accueil même si
          // l'application du niveau échoue côté serveur.
        }
      }
      navigate("/");
    }

    return (
      <section className="screen">
        <h1 style={{ fontSize: "1.4em", textAlign: "center" }}>
          {pseudo}, tu es de niveau <strong>{levelLabel}</strong>
        </h1>

        <div className="card" style={{ textAlign: "left", fontSize: "0.85em" }}>
          <p style={{ margin: 0 }}>
            D'après les résultats du test, tu serais de niveau <strong>{levelLabel}</strong>. Commence dès
            à présent à apprendre l'hébreu. À chaque leçon, ton objectif est de réussir l'examen afin de
            débloquer la leçon suivante. Pour réussir ce challenge, tu peux explorer les 4 options qui
            s'offrent à toi dans ton écran d'accueil :
          </p>

          <ul style={{ margin: "12px 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <MaskIcon src="/openbook.png" size={20} style={{ marginTop: 2 }} />
              <span>
                <strong>Apprendre : </strong>
                Apprends l'hébreu à travers un texte, puis retrouve les mots de vocabulaire, les tournures
                de phrases et même quelques informations culturelles sur Israël pour te détendre.
              </span>
            </li>
            <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <MaskIcon src="/speak.png" size={20} style={{ marginTop: 2 }} />
              <span>
                <strong>Parler : </strong>
                Immerge-toi réellement dans la langue hébreu à travers quelques exercices et autres jeux
                de rôle pour te mettre en situation.
              </span>
            </li>
            <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <MaskIcon src="/revision.png" size={20} style={{ marginTop: 2 }} />
              <span>
                <strong>Renforcer : </strong>
                Révise le vocabulaire et la conjugaison des nouveaux verbes de la leçon.
              </span>
            </li>
            <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <MaskIcon src="/examhat.png" size={20} style={{ marginTop: 2 }} />
              <span>
                <strong>Examen blanc : </strong>
                Entraîne-toi à passer l'examen à travers des exercices de même niveau d'exigeance que
                l'examen final.
              </span>
            </li>
            <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <MaskIcon src="/examhat.png" size={20} style={{ marginTop: 2 }} />
              <span>
                <strong>Examen : </strong>
                Le moment tant redouté. Evalue ta progression en acceptant ce challenge qui passera en
                revue tout ce que tu es censé avoir appris pendant ta leçon. L'examen se décompose en deux
                formats : le format écrit et le format oral. Il te faut réussir les deux pour débloquer la
                leçon suivante. Si tel est le cas, tu recevras des shekels que tu pourras échanger contre
                des lots de cartes à collectioner. Ces cartes représentent des figures incontournables de
                la renaissance de la langue hébreu et de l'état d'Israël.
              </span>
            </li>
          </ul>

          <p style={{ margin: 0 }}>
            La route est longue avant d'atteindre le niveau "Sabra". Mais en persévérant, tout arrive !
            בהצלחה {pseudo}!
          </p>
        </div>

        <button type="button" className="exam-tile green" style={{ cursor: "pointer" }} onClick={handleStartAdventure}>
          Commencer l'aventure!
        </button>

        {/* Vérification temporaire de l'algorithme de placement — cf.
            demande explicite du user ("par souci de contrôle"). */}
        <p className="muted" style={{ fontSize: "0.85em", marginTop: 24 }}>
          {scores.length} question{scores.length > 1 ? "s" : ""} évaluée{scores.length > 1 ? "s" : ""}.
        </p>
        <ScoresChart scores={scores} />

        {placement && placement.override && (
          <div className="card" style={{ marginTop: 16, textAlign: "left", fontSize: "0.8em" }}>
            <p className="muted" style={{ margin: 0 }}>
              Placement (contrôle temporaire) — règle spéciale : plus de 8 réponses notées 3, départ forcé
              au set n°9.
            </p>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              1ère leçon du set n°9 : {placement.startLesson ?? "?"}
            </p>
          </div>
        )}

        {placement && !placement.override && (
          <div className="card" style={{ marginTop: 16, textAlign: "left", fontSize: "0.8em" }}>
            <p className="muted" style={{ margin: 0 }}>
              Placement (contrôle temporaire) — découpe retenue : k = {placement.k}
            </p>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Somme pondérée gauche : {placement.alphaLeft.toFixed(2)} · droite :{" "}
              {placement.alphaRight.toFixed(2)}
            </p>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Médiane Beta gauche (x, P(X&lt;x)=50%) : {placement.medianLeft.toFixed(3)} · droite :{" "}
              {placement.medianRight.toFixed(3)}
            </p>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              1ère leçon du dernier set à gauche : {placement.startLesson ?? "?"}
            </p>
          </div>
        )}
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
