import { useEffect, useMemo, useRef, useState } from "react";
import { AudioProgressBlock } from "./AudioProgressBlock";
import { LabeledTile } from "./LabeledTile";
import { MicrophoneIcon } from "./MicrophoneIcon";
import { ttsUrl } from "../utils/speech";
import "./AudioProgressBlock.css";

// Icônes UI statiques servies depuis frontend/public/, cf. AudioProgressBlock.jsx.
const LECTURE_ICON_URL = "/lecture.png";
const PAUSE_ICON_URL = "/pause.png";
const VOICE_ICON_URL = "/voice.png";

// Les 3 briques "capture de réponse orale" (Contenu / Question / Réponse),
// communes aux écrans qui font répondre oralement à une question sur un
// texte (révisions, examen classique, hard exam). Chacune est un
// <LabeledTile> à bordure + ombre (même style que "Traduire la phrase" en
// révisions/traduction) — cf. demande explicite du user, qui remplace
// l'ancien empilement de tuiles à bordures fusionnées. La brique "Réponse"
// reprend le langage visuel de VoicePrefill (écrit, pré-remplissage vocal,
// "l'écran des questions avec pré-remplissage de la voix") : micro, puis
// juste à côté un bouton lecture + une onde, grisés et inertes tant
// qu'aucun enregistrement n'existe ; un seul bouton micro pour enregistrer
// ET ré-enregistrer (pas de bouton "Recommencer" séparé). Le logo d'envoi
// "avion en papier" est remplacé par le même bouton "Envoyer ma réponse"
// (vert pastel désactivé / vert plein activé) que les questions écrites
// avec pré-remplissage — cf. demande explicite du user. L'enregistrement
// lui-même (MediaRecorder, conversion WAV) reste géré par l'écran appelant,
// ce composant ne fait que l'affichage et relaie les actions
// (onStart/onStop/onEnvoyer).
export function OralAnswerCapture({
  contentSrc,
  questionText,
  showRecorder = true,
  isRecording,
  isConverting,
  audioBlob,
  audioUrl,
  onStart,
  onStop,
  onEnvoyer,
}) {
  const questionSrc = useMemo(() => ttsUrl(questionText), [questionText]);

  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const hasRecording = !!audioBlob && !isConverting;

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
  }, [audioUrl]);

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
    // La boucle requestAnimationFrame ne tourne que pendant la lecture — cf.
    // AudioProgressBlock, même remarque : sans ce setProgress explicite, un
    // seek en pause ne bougerait pas l'onde visuellement.
    setProgress(ratio);
  }

  const inertClass = hasRecording ? "" : " audio-progress-block-inert";

  // Même format/taille/espacement que révisions/traduction (toggle
  // "Teacher") : pas de largeur particulière (LabeledTile fixe déjà
  // width:100%/maxWidth:320 et l'espacement entre tuiles), bordure + ombre
  // directement sur chaque LabeledTile plutôt que sur le contenu, cf.
  // demande explicite du user.
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <LabeledTile label="Contenu" border borderColor="var(--border)" marginTop={40}>
        <AudioProgressBlock src={contentSrc} />
      </LabeledTile>
      <LabeledTile label="Question" border borderColor="var(--border)" marginTop={40}>
        <AudioProgressBlock src={questionSrc} />
      </LabeledTile>

      {showRecorder && (
        <LabeledTile label="Réponse" border borderColor="var(--border)" marginTop={40}>
          <div className="audio-progress-block">
            <MicrophoneIcon
              size={64}
              badgeColor="var(--danger)"
              pulsing={isRecording}
              onClick={isRecording ? onStop : onStart}
              ariaLabel={
                isRecording ? "Arrêter l'enregistrement" : hasRecording ? "Réenregistrer" : "Enregistrer une réponse"
              }
            />

            <button
              type="button"
              className={`audio-progress-block-toggle${inertClass}`}
              onClick={hasRecording ? togglePlay : undefined}
              disabled={!hasRecording}
              aria-label={isPlaying ? "Pause" : "Lecture"}
            >
              <span
                className="audio-progress-block-icon"
                style={{
                  WebkitMaskImage: `url(${isPlaying ? PAUSE_ICON_URL : LECTURE_ICON_URL})`,
                  maskImage: `url(${isPlaying ? PAUSE_ICON_URL : LECTURE_ICON_URL})`,
                }}
              />
            </button>

            <div className={`audio-progress-block-wave${inertClass}`} onClick={hasRecording ? handleSeek : undefined}>
              <span
                className="audio-progress-block-wave-icon audio-progress-block-wave-bg"
                style={{ WebkitMaskImage: `url(${VOICE_ICON_URL})`, maskImage: `url(${VOICE_ICON_URL})` }}
              />
              <span
                className="audio-progress-block-wave-icon audio-progress-block-wave-fill"
                style={{
                  WebkitMaskImage: `url(${VOICE_ICON_URL})`,
                  maskImage: `url(${VOICE_ICON_URL})`,
                  clipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
                  WebkitClipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
                }}
              />
            </div>

            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              ref={audioRef}
              src={audioUrl ?? undefined}
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                setProgress(1);
              }}
            />
          </div>
        </LabeledTile>
      )}

      {showRecorder && isConverting && (
        <p className="muted" style={{ margin: "12px 0 0", textAlign: "center" }}>
          Traitement de l'enregistrement...
        </p>
      )}

      {/* Toujours affiché (pas seulement une fois enregistré) : grisé en
          vert pastel tant qu'aucun enregistrement n'existe, vert plein une
          fois prêt — même bouton que "Envoyer ma réponse" des questions
          écrites avec pré-remplissage. Espace visible avec l'encadré du
          dessus, cf. demande explicite du user. */}
      {showRecorder && !isConverting && (
        <button
          type="button"
          className="exam-tile green"
          style={{ marginTop: 40, cursor: hasRecording ? "pointer" : "default" }}
          disabled={!hasRecording}
          onClick={onEnvoyer}
        >
          Envoyer ma réponse
        </button>
      )}
    </div>
  );
}
