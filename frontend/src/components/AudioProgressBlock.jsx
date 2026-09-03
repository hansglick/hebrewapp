import { useEffect, useRef, useState } from "react";
import "./AudioProgressBlock.css";

// Icônes UI statiques servies depuis frontend/public/ (pas via mediaUrl/le
// backend) : backend/results/ est gitignored et jamais déployé, un chemin
// mediaUrl() y renverrait donc un 404 silencieux en production (cf. bug
// rapporté par le user — icônes invisibles mais zone cliquable fonctionnelle).
const LECTURE_ICON_URL = "/lecture.png";
const VOICE_ICON_URL = "/voice.png";

// Brique "lecture d'un audio" pour les questions orales (révisions/examen/
// hard exam) : bouton rond utilisant lecture.png, à côté l'onde voice.png
// qui se colore progressivement de gauche à droite au fil de la lecture au
// lieu d'une barre fine — même mécanique de progression qu'AudioPlayer
// (un <audio> caché, isPlaying/progress via onPlay/onPause/onTimeUpdate,
// clic sur l'onde = seek), habillage différent. `label` : "Contenu" /
// "Question" / "Réponse" selon l'écran appelant (cf. OralAnswerCapture).
export function AudioProgressBlock({ src, label }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
  }, [src]);

  // onTimeUpdate (utilisé initialement) ne se déclenche que ~4x/seconde
  // selon les navigateurs — trop peu fréquent pour un remplissage fluide,
  // surtout sur un clip court (la question TTS ne dure que quelques
  // secondes) où chaque saut devient très visible. Une boucle
  // requestAnimationFrame relit `currentTime` à chaque frame (~60fps)
  // pendant la lecture, pour une progression bien plus continue.
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
  }

  return (
    <div className="audio-progress-block">
      {label && <span className="audio-progress-block-label">{label}</span>}
      <div className="audio-progress-block-row">
        <button
          type="button"
          className="audio-progress-block-toggle"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Lecture"}
        >
          <span
            className="audio-progress-block-icon"
            style={{ WebkitMaskImage: `url(${LECTURE_ICON_URL})`, maskImage: `url(${LECTURE_ICON_URL})` }}
          />
        </button>
        <div className="audio-progress-block-wave" onClick={handleSeek}>
          <span
            className="audio-progress-block-wave-icon audio-progress-block-wave-bg"
            style={{ WebkitMaskImage: `url(${VOICE_ICON_URL})`, maskImage: `url(${VOICE_ICON_URL})` }}
          />
          {/* Même image que le calque gris du dessous, révélée de gauche à
              droite via clip-path plutôt qu'un width+overflow (qui aurait
              nécessité que ce calque connaisse la largeur du conteneur
              grand-parent pour ne pas être écrasé plutôt que rogné). */}
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
      </div>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(1);
        }}
      />
    </div>
  );
}
