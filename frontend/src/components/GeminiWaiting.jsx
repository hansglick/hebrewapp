import { useMemo } from "react";
import { WaitingVideo } from "./WaitingVideo";
import { CuriositeWaitingCard } from "./CuriositeWaitingCard";

// Pendant l'attente d'une correction Gemini sur un examen long/très long
// (`showCuriosite`), alterne aléatoirement entre la vidéo d'attente
// habituelle et un objet "curiosité" aléatoire — un tirage indépendant à
// chaque remount, donc à chaque nouvelle question en mode "chaque
// question", ou chaque étape en mode "évaluation globale" (cf. la prop
// `key` passée par l'appelant, identique à celle déjà utilisée pour
// WaitingVideo). Hors examen long/très long, se comporte comme
// WaitingVideo seul (jamais de curiosité).
export function GeminiWaiting({ label, showCuriosite }) {
  const showVideo = useMemo(() => !showCuriosite || Math.random() < 0.5, [showCuriosite]);
  return showVideo ? <WaitingVideo label={label} /> : <CuriositeWaitingCard label={label} />;
}
