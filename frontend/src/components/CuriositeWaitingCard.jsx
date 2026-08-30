import { useEffect, useState } from "react";
import { getRandomAnyCuriosite } from "../api/content";
import { mediaUrl } from "../api/media";
import { CURIOSITE_CONFIG } from "../pages/fun/curiositeConfig";

// Affiche un objet "curiosité" aléatoire (tous types confondus, y compris
// non encore débloqués par le user — cf. random-any) pendant l'attente
// d'une correction Gemini, en alternative à WaitingVideo (cf. GeminiWaiting).
export function CuriositeWaitingCard({ label = "Patientez quelques instants ..." }) {
  const [item, setItem] = useState(null);

  useEffect(() => {
    getRandomAnyCuriosite()
      .then(setItem)
      .catch(() => {});
  }, []);

  if (!item) return null;
  const config = CURIOSITE_CONFIG[item.curiosite_type];
  if (!config) return null;

  const heroFontVar = config.heroFont === "biblical" ? "var(--font-hebrew-biblical)" : "var(--font-hebrew)";

  return (
    <>
      <p className="muted" style={{ fontStyle: "italic", fontSize: "0.75em" }}>
        {label}
      </p>
      <div className="card card-illustration" style={{ textAlign: "center" }}>
        <p className="muted" style={{ fontStyle: "italic", fontSize: "0.7em", margin: "0 0 8px" }}>
          Le saviez-vous ?
        </p>
        {config.hasImage && item.image_url && (
          <img
            className="screen-image"
            style={{ width: "100%", maxWidth: 330, maxHeight: "none", marginBottom: 10 }}
            src={mediaUrl(item.image_url)}
            alt=""
            draggable={false}
          />
        )}
        <div
          className="hebrew"
          style={{
            fontFamily: heroFontVar,
            fontSize: config.heroFontScale
              ? `calc(var(--font-size-hebrew-large) * ${config.heroFontScale})`
              : "var(--font-size-hebrew-large)",
            direction: "rtl",
          }}
        >
          {item[config.heroField]}
        </div>
      </div>
    </>
  );
}
