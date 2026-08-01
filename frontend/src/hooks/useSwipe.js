import { useRef } from "react";

// Geste swipe gauche/droite via pointer events (fonctionne au doigt sur mobile
// et à la souris en dev). onSwipeLeft/onSwipeRight sont appelés au relâchement
// si le déplacement horizontal dépasse le seuil et domine le déplacement vertical.
//
// Le relâchement est écouté sur window plutôt que sur l'élément lui-même : le
// conteneur du swipe épouse la taille de son contenu (image/texte), donc un
// relâchement en dehors de cette zone ne remonterait pas jusqu'à un handler
// posé uniquement sur l'élément.
export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 60 } = {}) {
  const startRef = useRef(null);

  function handleWindowPointerUp(e) {
    window.removeEventListener("pointerup", handleWindowPointerUp);
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  }

  function onPointerDown(e) {
    startRef.current = { x: e.clientX, y: e.clientY };
    window.addEventListener("pointerup", handleWindowPointerUp);
  }

  return { onPointerDown };
}
