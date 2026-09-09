import { useEffect, useMemo, useRef, useState } from "react";
import { AudioProgressBlock } from "./AudioProgressBlock";
import { SectionTitle } from "./QuoteBlock";
import { MicrophoneIcon } from "./MicrophoneIcon";
import { AudioTrackFooter, PLAYBACK_RATE_CYCLE } from "./AudioTrackFooter";
import { ttsUrl } from "../utils/speech";
import "./AudioProgressBlock.css";
import "./OralAnswerCapture.css";

// Icônes UI statiques servies depuis frontend/public/, cf. AudioProgressBlock.jsx.
const LECTURE_ICON_URL = "/lecture.png";
const PAUSE_ICON_URL = "/pause.png";
const VOICE_ICON_URL = "/voice.png";

// Taille de la pastille numérotée : 20 -> 25 (+25%, cf. demande explicite du
// user). Constante partagée avec le calcul d'alignement sur l'axe du logo
// (cf. titleAxisStyle) pour que les deux restent synchronisés.
const STEP_BADGE_SIZE = 25;

// Pastille numérotée avant le titre de chaque bloc audio, pour indiquer
// clairement les étapes du processus (1: Écoute le contenu, 2: Écoute la
// question, 3: Enregistre ta réponse) — couleurs fixes (pas des tokens de
// thème), cohérent avec le fond blanc fixe des panneaux audio eux-mêmes,
// cf. demande explicite du user.
function StepBadge({ number, background, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: STEP_BADGE_SIZE,
        height: STEP_BADGE_SIZE,
        borderRadius: "50%",
        background,
        color,
        fontSize: "0.9375em",
        fontWeight: 700,
        marginRight: 12,
        flexShrink: 0,
      }}
    >
      {number}
    </span>
  );
}

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
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const hasRecording = !!audioBlob && !isConverting;

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
    setRate(1);
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

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

  // Plus de mini tuile (étiquette posée sur la bordure) : un titre en gras
  // au-dessus de l'encadré (cf. SectionTitle, même format que "Traduis"/
  // "Réponse" des questions écrites), dans la couleur de fond de l'ancienne
  // mini tuile (var(--tileAccent)). Plus de bordure sur l'encadré lui-même,
  // fond blanc (cf. .audio-progress-block) — cf. demande explicite du user.
  // Axe (centre) du logo lecture/micro juste en dessous : padding-left du
  // panneau (14) + moitié de la largeur du bouton rond (64/2=32), cf.
  // .audio-progress-block/-toggle. C'est la PASTILLE numérotée (premier
  // élément du titre, cf. StepBadge) qui doit tomber sur cet axe, pas le
  // titre entier — marginLeft = axe - moitié de la largeur de la pastille
  // (20/2=10), cf. demande explicite du user.
  const TITLE_AXIS_OFFSET = 46;
  const titleAxisStyle = { marginLeft: TITLE_AXIS_OFFSET - STEP_BADGE_SIZE / 2 };

  return (
    <div className="oral-answer-capture">
      <div className="oral-answer-capture-block">
        <div style={titleAxisStyle}>
          <SectionTitle fontSize="0.84em">
            <StepBadge number={1} background="#dbeafe" color="#1d4ed8" />
            Ecoute le contenu
          </SectionTitle>
        </div>
        <AudioProgressBlock src={contentSrc} />
      </div>

      <div className="oral-answer-capture-divider" />
      <div className="oral-answer-capture-block">
        <div style={titleAxisStyle}>
          <SectionTitle fontSize="0.84em">
            <StepBadge number={2} background="#dbeafe" color="#1d4ed8" />
            Ecoute la question
          </SectionTitle>
        </div>
        <AudioProgressBlock src={questionSrc} />
      </div>

      {showRecorder && (
        <>
          <div className="oral-answer-capture-divider" />
          <div className="oral-answer-capture-block">
            <div style={titleAxisStyle}>
              <SectionTitle fontSize="0.84em">
                <StepBadge number={3} background="var(--validationGrisee)" color="var(--validationPleine)" />
                Enregistre ta réponse
              </SectionTitle>
            </div>
            <div className="audio-progress-block-panel">
              <div className="audio-progress-block">
                <MicrophoneIcon
                  size={64}
                  badgeColor={isRecording ? "var(--annulationPleine)" : "var(--validationPleine)"}
                  pulsing={isRecording}
                  onClick={isRecording ? onStop : onStart}
                  ariaLabel={
                    isRecording
                      ? "Arrêter l'enregistrement"
                      : hasRecording
                      ? "Réenregistrer"
                      : "Enregistrer une réponse"
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

                <div
                  className={`audio-progress-block-wave${inertClass}`}
                  onClick={hasRecording ? handleSeek : undefined}
                >
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
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => {
                    setIsPlaying(false);
                    setProgress(1);
                  }}
                />
              </div>
              <div className={inertClass.trim()}>
                <AudioTrackFooter
                  currentTime={progress * duration}
                  duration={duration}
                  rate={rate}
                  onCycleRate={() => setRate(PLAYBACK_RATE_CYCLE)}
                />
              </div>
            </div>

            {/* À l'intérieur du bloc 3 (Réponse) — pas un élément séparé
                après toute la ligne : sur desktop (blocs alignés
                horizontalement), ce bouton doit visuellement appartenir au
                bloc "Réponse", pas s'étaler sous toute la rangée — cf.
                demande explicite du user. En mobile (empilement vertical),
                le rendu reste identique puisque ce bloc est déjà le
                dernier. */}
            {isConverting && (
              <p className="muted" style={{ margin: "12px 0 0", textAlign: "center" }}>
                Traitement de l'enregistrement...
              </p>
            )}

            {!isConverting && (
              <button
                type="button"
                className="exam-tile green"
                // 11.9 (au lieu de 23.8) : espace trait -> bouton "vitesse
                // de lecture" -> bouton "Envoyer ma réponse" réduit de 50%,
                // cf. demande explicite du user.
                style={{ marginTop: 11.9, cursor: hasRecording ? "pointer" : "default" }}
                disabled={!hasRecording}
                onClick={onEnvoyer}
              >
                Envoyer ma réponse
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
