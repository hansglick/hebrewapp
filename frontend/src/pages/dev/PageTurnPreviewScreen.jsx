import { useEffect, useRef, useState } from "react";
import { getCuriositePool, getCuriositeItem } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { BottomNavBar } from "../../components/BottomNavBar";
import { PageTurnCurl, PAGE_TURN_TOTAL_DURATION_MS } from "../../components/PageTurnCurl";
import { useSwipe } from "../../hooks/useSwipe";
import "../screens.css";

const SEQUENCE_LENGTH = 5;

// Remplit tout le fond principal (var(--bg), blanc en thème clair) DU HAUT
// EN BAS de l'écran (hors barres de contrôle) — y compris la zone où se
// trouvait le petit texte d'aide, qui restait fixe pendant la rotation
// (cf. demande explicite du user) : ce texte fait maintenant partie du
// contenu qui tourne (ci-dessous, dans la carte elle-même), rien ne reste
// figé au-dessus.
function LandmarkCard({ item, position }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--bg)",
        overflowY: "auto",
        backfaceVisibility: "hidden",
        padding: "16px 16px 32px",
        boxSizing: "border-box",
      }}
    >
      <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.85em", textAlign: "center" }}>
        {position}
      </p>
      <img
        src={mediaUrl(item.image_url)}
        alt=""
        draggable={false}
        style={{ width: "100%", maxWidth: 420, borderRadius: 8, display: "block", margin: "0 auto 12px" }}
      />
      <div className="hebrew" style={{ fontSize: "1.6em", fontWeight: 700, textAlign: "center", direction: "rtl" }}>
        {item.landmark_hebrew}
      </div>
      <hr style={{ border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0" }} />
      <div style={{ fontSize: "0.85em", color: "var(--textSecondary)", maxWidth: 420, margin: "0 auto" }}>
        <div style={{ fontWeight: 600, color: "var(--textPrimary)" }}>{item.landmark_english}</div>
        <div style={{ marginTop: 8 }}>{item.description}</div>
      </div>
    </div>
  );
}

// Écran de développement : prototype isolé de l'animation "tourner la
// page" (cf. PageTurnCurl, rotation façon page de livre découpée en
// bandes pour simuler une courbure) envisagée pour la navigation suivant/
// précédent entre objets, PARTOUT dans l'app (mot, verbe, texte,
// question...). Volontairement séparé de tout écran réel tant que
// l'animation elle-même n'est pas validée — cf. demande explicite du
// user. Une fois validé ici, cf. CuriositeScreen (type "landmark") pour
// une première application réelle.
// - deux calques superposés, chacun grand comme tout l'écran (pas un
//   encadré) : la page "au repos" (déjà mise à jour au nouvel index dès le
//   clic) et, par-dessus, la page "sortante" (cf. PageTurnCurl) qui
//   affiche l'ANCIENNE page et pivote pour disparaître.
// - double requestAnimationFrame avant de lancer la rotation : sans ça,
//   React appliquerait directement l'état final (0° -> angle cible) en un
//   seul paint, sans transition visible.
//
// Séquence testée : les 5 premiers landmarks débloqués (cf.
// getCuriositePool/getCuriositeItem, même API que l'écran Culture) — objet
// réel avec image + texte, plutôt que des mots fictifs, cf. demande
// explicite du user.
export default function PageTurnPreviewScreen() {
  const [items, setItems] = useState(null); // null tant que non chargé
  const [index, setIndex] = useState(0);
  const [flip, setFlip] = useState(null); // { dir, item, index, phase: "start" | "animating" }
  const timeoutRef = useRef(null);

  useEffect(() => {
    getCuriositePool("landmark").then((data) => {
      const keys = (data.pool || []).slice(0, SEQUENCE_LENGTH);
      Promise.all(keys.map((k) => getCuriositeItem("landmark", k))).then(setItems);
    });
  }, []);

  function go(dir) {
    if (flip || !items || items.length === 0) return; // ignore les clics pendant qu'une page tourne déjà
    const outgoingItem = items[index];
    const outgoingIndex = index;
    const nextIndex = dir === "next" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;

    setIndex(nextIndex);
    setFlip({ dir, item: outgoingItem, index: outgoingIndex, phase: "start" });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlip((f) => (f ? { ...f, phase: "animating" } : f));
      });
    });

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setFlip(null), PAGE_TURN_TOTAL_DURATION_MS);
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => go("prev"),
    onSwipeRight: () => go("next"),
  });

  if (!items) return null;
  if (items.length === 0) {
    return (
      <section className="screen">
        <p className="muted">Aucun landmark débloqué pour l'instant — impossible de tester la séquence.</p>
      </section>
    );
  }

  return (
    <section
      className="screen"
      style={{ flex: 1, width: "100%", alignItems: "stretch", padding: 0, gap: 0 }}
      onPointerDown={swipeHandlers.onPointerDown}
    >
      {/* Plus de bandeau de titre fixe au-dessus : ce conteneur occupe
          désormais tout l'espace entre les deux barres de contrôle
          (flex:1, aucun frère ne lui vole de hauteur), et le petit texte
          d'aide fait partie du contenu de la carte elle-même (cf.
          LandmarkCard) — donc il tourne avec elle plutôt que de rester
          figé, cf. demande explicite du user. */}
      <div style={{ position: "relative", flex: 1, width: "100%", perspective: 1600, overflow: "hidden" }}>
        <LandmarkCard item={items[index]} position={`Landmark ${index + 1} / ${items.length}`} />

        {flip && (
          <PageTurnCurl
            dir={flip.dir}
            phase={flip.phase}
            renderPage={() => (
              <LandmarkCard item={flip.item} position={`Landmark ${flip.index + 1} / ${items.length}`} />
            )}
          />
        )}
      </div>

      <BottomNavBar onPrevious={() => go("prev")} onNext={() => go("next")} />
    </section>
  );
}
