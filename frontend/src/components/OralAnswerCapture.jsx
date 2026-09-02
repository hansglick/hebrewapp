import { useMemo } from "react";
import { AudioProgressBlock } from "./AudioProgressBlock";
import { MicrophoneIcon } from "./MicrophoneIcon";
import { ttsUrl } from "../utils/speech";
import { mediaUrl } from "../api/media";
import "./AudioProgressBlock.css";

const SEND_ICON_URL = mediaUrl("logos/sendvocal.png");

// Les 3 briques "capture de réponse orale" (Contenu / Question / Réponse),
// communes aux 3 écrans qui font répondre oralement à une question sur un
// texte (révisions, examen classique, hard exam) — cf. plan "refonte
// visuelle des questions orales". L'enregistrement lui-même (MediaRecorder,
// conversion WAV) reste géré par l'écran appelant, ce composant ne fait que
// l'affichage et relaie les actions (onStart/onStop/onRecommencer/onEnvoyer).
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
  onRecommencer,
  onEnvoyer,
}) {
  const questionSrc = useMemo(() => ttsUrl(questionText), [questionText]);

  // Même taille que le bouton lecture (80px) pour tous les logos de cette
  // brique — cf. demande explicite du user ("record et envoyer doivent
  // être de même taille que lecture").
  const LOGO_SIZE = 80;

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
      }}
    >
      {/* Les 3 tuiles (Contenu/Question/Réponse) sont empilées sans espace
          (cf. .audio-progress-stack) — la brique "Réponse" (micro ou lecture
          de l'enregistrement selon l'état) est un enfant direct de la même
          pile, pas un bloc séparé, pour ne jamais avoir de coupure entre
          elle et "Question". */}
      <div className="audio-progress-stack" style={{ width: "92%" }}>
        <AudioProgressBlock src={contentSrc} label="Contenu" />
        <AudioProgressBlock src={questionSrc} label="Question" />
        {showRecorder && !audioBlob && !isConverting && (
          <div className="audio-progress-block">
            <span className="audio-progress-block-label">Réponse</span>
            <div className="audio-progress-block-row">
              <MicrophoneIcon
                size={LOGO_SIZE}
                badgeColor="var(--danger)"
                pulsing={isRecording}
                onClick={isRecording ? onStop : onStart}
              />
            </div>
          </div>
        )}
        {showRecorder && audioBlob && !isConverting && <AudioProgressBlock src={audioUrl} label="Réponse" />}
      </div>

      {showRecorder && isConverting && (
        <p className="muted" style={{ margin: 0, textAlign: "center" }}>
          Traitement de l'enregistrement...
        </p>
      )}

      {showRecorder && audioBlob && !isConverting && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 24 }}>
          {/* Réutilise le micro rouge du bouton d'enregistrement plutôt
              qu'un lien texte "Recommencer" — cf. demande explicite du
              user. `onClick={onRecommencer}` (pas onStart) : ce clic ne
              fait que revenir à l'état "prêt à enregistrer" (efface
              audioBlob, ce qui révèle le VRAI micro de démarrage au
              même endroit dans l'arbre) — il ne déclenche pas
              lui-même un nouvel enregistrement. */}
          <MicrophoneIcon
            size={LOGO_SIZE}
            badgeColor="var(--danger)"
            pulsing={false}
            onClick={onRecommencer}
            ariaLabel="Recommencer"
          />
          <button
            type="button"
            onClick={onEnvoyer}
            aria-label="Envoyer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: LOGO_SIZE,
              height: LOGO_SIZE,
              border: "none",
              background: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <img src={SEND_ICON_URL} alt="" style={{ width: LOGO_SIZE * 0.78, height: LOGO_SIZE * 0.78 }} />
          </button>
        </div>
      )}
    </div>
  );
}
