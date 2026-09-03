import { useEffect, useMemo, useRef, useState } from "react";
import { extractVerbatim } from "../api/gemini";
import { blobToWavBlob } from "../utils/audioEncode";
import { MicrophoneIcon } from "./MicrophoneIcon";
import "./VoicePrefill.css";

// Icônes UI statiques servies depuis frontend/public/ (pas via mediaUrl/le
// backend) : backend/results/ est gitignored et jamais déployé, un chemin
// mediaUrl() y renverrait donc un 404 silencieux en production.
const LECTURE_ICON_URL = "/lecture.png";
const PAUSE_ICON_URL = "/pause.png";
const VOICE_ICON_URL = "/voice.png";
const SEND_ICON_URL = "/sendvocal.png";
const ICON_SIZE = 40;

// Pré-remplissage vocal générique : idle -> recording -> recorded ->
// sending -> idle (le champ appelant est alors rempli avec le verbatim
// renvoyé par l'API de transcription). Même langage visuel que la capture
// de réponse orale (OralAnswerCapture/AudioProgressBlock), y compris le
// même mécanisme lecture/pause et le seek au clic sur l'onde — cf. demande
// explicite du user. Les 3 contrôles (lecture, onde, envoyer) sont
// toujours affichés, à droite du micro, mais grisés et inertes tant
// qu'aucun enregistrement n'existe (au lieu de n'apparaître qu'après),
// cf. demande explicite du user.
export function VoicePrefill({ onChange, lang = "he", context }) {
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceBlob, setVoiceBlob] = useState(null);
  const [voiceError, setVoiceError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const voiceRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const audioRef = useRef(null);

  const voiceUrl = useMemo(() => (voiceBlob ? URL.createObjectURL(voiceBlob) : null), [voiceBlob]);
  useEffect(() => () => voiceUrl && URL.revokeObjectURL(voiceUrl), [voiceUrl]);

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
  }, [voiceUrl]);

  // Boucle requestAnimationFrame pour une progression fluide, cf.
  // AudioProgressBlock (onTimeUpdate est trop peu fréquent).
  useEffect(() => {
    if (!isPlaying) return undefined;
    let rafId;
    function tick() {
      const audio = audioRef.current;
      if (audio && audio.duration) setProgress(audio.currentTime / audio.duration);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

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

  // Un seul bouton micro pour enregistrer ET ré-enregistrer : idle/recorded
  // -> démarre un nouvel enregistrement (écrase l'ancien), recording ->
  // arrête. Cf. demande explicite du user.
  function handleMicClick() {
    if (voiceState === "recording") voiceRecorderRef.current?.stop();
    else startVoiceRecording();
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play();
  }

  function handleSeek(e) {
    const audio = audioRef.current;
    const duration = audio?.duration;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setProgress(ratio);
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

  const hasRecording = voiceState === "recorded" || voiceState === "sending";
  const inertClass = hasRecording ? "" : " voice-prefill-inert";

  return (
    <div className="voice-prefill-block">
      <div className="voice-prefill-row">
        <MicrophoneIcon
          size={ICON_SIZE}
          badgeColor="var(--danger)"
          pulsing={voiceState === "recording"}
          onClick={handleMicClick}
          ariaLabel={
            voiceState === "recording"
              ? "Arrêter l'enregistrement"
              : hasRecording
              ? "Réenregistrer"
              : "Enregistrer une réponse vocale"
          }
        />

        <button
          type="button"
          className={`voice-prefill-toggle${inertClass}`}
          onClick={hasRecording ? togglePlay : undefined}
          disabled={!hasRecording}
          aria-label={isPlaying ? "Pause" : "Lecture"}
        >
          <span
            className="voice-prefill-icon"
            style={{
              WebkitMaskImage: `url(${isPlaying ? PAUSE_ICON_URL : LECTURE_ICON_URL})`,
              maskImage: `url(${isPlaying ? PAUSE_ICON_URL : LECTURE_ICON_URL})`,
            }}
          />
        </button>

        <div
          className={`voice-prefill-wave${inertClass}`}
          onClick={hasRecording ? handleSeek : undefined}
        >
          <span
            className="voice-prefill-wave-icon voice-prefill-wave-bg"
            style={{ WebkitMaskImage: `url(${VOICE_ICON_URL})`, maskImage: `url(${VOICE_ICON_URL})` }}
          />
          <span
            className="voice-prefill-wave-icon voice-prefill-wave-fill"
            style={{
              WebkitMaskImage: `url(${VOICE_ICON_URL})`,
              maskImage: `url(${VOICE_ICON_URL})`,
              clipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
              WebkitClipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
            }}
          />
        </div>

        <button
          type="button"
          className={`voice-prefill-send${inertClass}`}
          onClick={handleSendVoice}
          disabled={voiceState !== "recorded"}
          aria-label="Envoyer"
        >
          <img src={SEND_ICON_URL} alt="" style={{ width: ICON_SIZE * 0.78, height: ICON_SIZE * 0.78 }} />
        </button>

        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          ref={audioRef}
          src={voiceUrl ?? undefined}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setProgress(1);
          }}
        />
      </div>

      {voiceState === "recording" && (
        <p className="muted voice-prefill-hint">Enregistrement en cours...</p>
      )}

      {voiceState === "sending" && (
        <p className="muted" style={{ fontStyle: "italic", fontSize: "0.75em", margin: 0 }}>
          Envoi en cours ...
        </p>
      )}

      {voiceError && (
        <p className="muted" style={{ color: "var(--danger)", fontSize: "0.75em", margin: 0 }}>
          {voiceError}
        </p>
      )}
    </div>
  );
}
