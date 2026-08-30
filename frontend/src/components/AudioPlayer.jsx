import { useEffect, useRef, useState } from "react";
import "./AudioPlayer.css";

export function AudioPlayer({ src, barMaxWidth = 117, toggleSize = 36 }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
  }, [src]);

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
    <div className="audio-player" style={{ width: toggleSize + 10 + barMaxWidth }}>
      <button
        type="button"
        className="audio-player-toggle"
        style={{ width: toggleSize, height: toggleSize }}
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Lecture"}
      >
        <span className={isPlaying ? "icon-pause" : "icon-play"} />
      </button>
      <div className="audio-player-bar" style={{ maxWidth: barMaxWidth }} onClick={handleSeek}>
        <div className="audio-player-progress" style={{ width: `${progress * 100}%` }} />
      </div>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(e) => {
          const { currentTime, duration } = e.currentTarget;
          if (duration) setProgress(currentTime / duration);
        }}
      />
    </div>
  );
}
