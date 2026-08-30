import { useEffect, useMemo, useRef, useState } from "react";
import { extractVerbatim } from "../api/gemini";
import { blobToWavBlob } from "../utils/audioEncode";
import "./HebrewInput.css";

// Pré-remplissage vocal générique : idle -> recording -> recorded ->
// sending -> idle (le champ appelant est alors rempli avec le verbatim
// renvoyé par l'API de transcription). Extrait de HebrewInput.jsx pour être
// réutilisable avec une langue différente (ex: "fr" pour un rapport écrit
// en français à propos d'un enregistrement hébreu).
export function VoicePrefill({ onChange, lang = "he", context }) {
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceBlob, setVoiceBlob] = useState(null);
  const [voiceError, setVoiceError] = useState(null);
  const voiceRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);

  const voiceUrl = useMemo(() => (voiceBlob ? URL.createObjectURL(voiceBlob) : null), [voiceBlob]);
  useEffect(() => () => voiceUrl && URL.revokeObjectURL(voiceUrl), [voiceUrl]);

  async function startVoiceRecording() {
    setVoiceError(null);
    setVoiceBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      voiceChunksRef.current = [];
      recorder.ondataavailable = (e) => voiceChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const rawBlob = new Blob(voiceChunksRef.current, { type: recorder.mimeType });
        try {
          setVoiceBlob(await blobToWavBlob(rawBlob));
          setVoiceState("recorded");
        } catch {
          setVoiceError("Impossible de traiter l'enregistrement audio. Réessaie.");
          setVoiceState("idle");
        }
      };
      recorder.start();
      voiceRecorderRef.current = recorder;
      setVoiceState("recording");
    } catch {
      setVoiceError("Micro indisponible ou accès refusé.");
    }
  }

  function handleVoiceDotClick() {
    if (voiceState === "recording") voiceRecorderRef.current?.stop();
    else if (voiceState === "idle" || voiceState === "recorded") startVoiceRecording();
  }

  async function handleSendVoice() {
    if (!voiceBlob) return;
    setVoiceState("sending");
    setVoiceError(null);
    try {
      const { verbatim } = await extractVerbatim({ audioBlob: voiceBlob, lang, context });
      onChange(verbatim);
      setVoiceBlob(null);
      setVoiceState("idle");
    } catch (e) {
      setVoiceError(e.message);
      setVoiceState("recorded");
    }
  }

  return (
    <div className="hebrew-voice-block">
      <p className="muted" style={{ fontStyle: "italic", fontSize: "0.75em", margin: 0 }}>
        <button
          type="button"
          onClick={handleVoiceDotClick}
          disabled={voiceState === "sending"}
          aria-label={voiceState === "recording" ? "Arrêter l'enregistrement" : "Enregistrer une réponse vocale"}
          style={{
            display: "inline-flex",
            verticalAlign: "middle",
            background: "none",
            border: "none",
            padding: 0,
            marginInlineEnd: 6,
            cursor: voiceState === "sending" ? "default" : "pointer",
          }}
        >
          <span
            className={`hebrew-voice-dot${voiceState === "recording" ? " recording" : ""}`}
            style={{ opacity: voiceState === "sending" ? 0.4 : 1 }}
          />
        </button>
        | Pré-remplir avec la voix |{" "}
        <button
          type="button"
          onClick={handleSendVoice}
          disabled={voiceState !== "recorded"}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            fontStyle: "normal",
            fontSize: "3em",
            lineHeight: 1,
            verticalAlign: "middle",
            color: voiceState === "recorded" ? "skyblue" : "var(--textMuted)",
            cursor: voiceState === "recorded" ? "pointer" : "default",
          }}
        >
          ▶
        </button>
      </p>

      {voiceState === "recording" && (
        <p className="muted" style={{ fontStyle: "italic", fontSize: "0.7em", margin: 0 }}>
          Enregistrement en cours... (touche le point rouge pour arrêter)
        </p>
      )}

      {voiceState === "recorded" && voiceUrl && (
        /* eslint-disable-next-line jsx-a11y/media-has-caption */
        <audio controls src={voiceUrl} style={{ height: 28 }} />
      )}

      {voiceState === "sending" && (
        <>
          <p className="muted" style={{ fontStyle: "italic", fontSize: "0.75em", margin: 0 }}>
            Envoi en cours ...
          </p>
          <img src="/sending-email.gif" alt="Envoi en cours" width="220" style={{ borderRadius: 8 }} />
        </>
      )}

      {voiceError && (
        <p className="muted" style={{ color: "var(--danger)", fontSize: "0.75em", margin: 0 }}>
          {voiceError}
        </p>
      )}
    </div>
  );
}
