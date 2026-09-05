import { useEffect } from "react";

// Empêche l'écran de se verrouiller/mettre en veille tant que `active` est
// vrai (conversation JDR/révision en cours) — via l'API Screen Wake Lock,
// supportée par les navigateurs mobiles modernes (Chrome/Android, Safari iOS
// 16.4+). Le verrou est automatiquement relâché par le navigateur si l'app
// passe en arrière-plan (changement d'onglet, écran éteint manuellement) :
// on le redemande donc aussi au retour au premier plan (`visibilitychange`),
// tant que `active` est toujours vrai à ce moment-là. Silencieusement
// ignoré si l'API n'est pas disponible (navigateur trop ancien) — aucune
// erreur ne doit interrompre la conversation elle-même pour ça.
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return undefined;

    let sentinel = null;
    let cancelled = false;

    async function acquire() {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Refusé (ex: onglet déjà en arrière-plan au moment de la demande) —
        // tant pis, pas d'erreur utilisateur pour un simple confort d'écran.
      }
    }

    function handleVisibilityChange() {
      if (!cancelled && document.visibilityState === "visible" && !sentinel) acquire();
    }

    acquire();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sentinel?.release().catch(() => {});
    };
  }, [active]);
}
