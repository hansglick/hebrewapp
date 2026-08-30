import { useEffect, useRef } from "react";

// Geste swipe gauche/droite via pointer events (fonctionne au doigt sur mobile
// et à la souris en dev). onSwipeLeft/onSwipeRight sont appelés au relâchement
// si le déplacement horizontal dépasse le seuil et domine le déplacement vertical.
//
// Le relâchement est écouté sur window plutôt que sur l'élément lui-même : le
// conteneur du swipe épouse la taille de son contenu (image/texte), donc un
// relâchement en dehors de cette zone ne remonterait pas jusqu'à un handler
// posé uniquement sur l'élément.
//
// Les flèches gauche/droite du clavier miment le même geste, pour tester
// facilement sans souris/doigt (ex: navigateur desktop). La touche espace
// mime un clic sur l'image (onSpace), quand l'écran en a une.
export function useSwipe({ onSwipeLeft, onSwipeRight, onSpace, threshold = 60 } = {}) {
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

  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "ArrowLeft") onSwipeLeft?.();
      else if (e.key === "ArrowRight") onSwipeRight?.();
      else if (e.key === " " && onSpace) {
        e.preventDefault(); // évite le scroll de page déclenché par défaut
        onSpace();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSwipeLeft, onSwipeRight, onSpace]);

  // Reflète quelles actions sont câblées sur cet écran, pour afficher un
  // indicateur discret (ActionHints) — pas de spread direct sur le DOM,
  // `hints` doit être extrait à part de `onPointerDown`.
  return {
    onPointerDown,
    hints: { left: !!onSwipeLeft, right: !!onSwipeRight, space: !!onSpace },
  };
}
