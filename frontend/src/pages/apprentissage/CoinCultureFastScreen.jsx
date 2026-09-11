import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getLessonCuriosites } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { COIN_CULTURE_ZONES, CULTURE_IMAGE_SIZE } from "./coinCultureZones";
import "../screens.css";

// "Coin culture fast" : image map interactive sur culturehomepage.png à la
// place de la liste de tuiles (cf. CuriositeListScreen) — chaque objet de
// la photo est une zone cliquable vers un type de curiosité. Les zones
// disponibles pour la leçon restent en couleur, les autres en noir et
// blanc (masque grayscale posé UNIQUEMENT sur ces zones, cf.
// COIN_CULTURE_ZONES pour les polygones) — cf. demande explicite du user.
//
// Desktop (survol possible) : le survol affiche le message, un clic
// navigue directement si la zone est disponible (rien ne se passe sur une
// zone en noir et blanc). Mobile/tactile (pas de survol) : un premier tap
// affiche le message, un second tap sur la MÊME zone navigue si elle est
// disponible — cf. demande explicite du user ("double tap pour
// sélectionner un type d'objets").
export default function CoinCultureFastScreen() {
  const { chapId, code } = useParams();
  const navigate = useNavigate();
  const [availableRawTypes, setAvailableRawTypes] = useState(null);
  const [activeZoneKey, setActiveZoneKey] = useState(null);
  // Zone dont le 2e tap (mobile, segment indisponible) vient d'être
  // refusé — bascule le message affiché vers "Pas d'item ... présent dans
  // cette leçon" au lieu du message descriptif habituel, cf. demande
  // explicite du user.
  const [deniedZoneKey, setDeniedZoneKey] = useState(null);
  // Calculé une fois (pas besoin de suivre un éventuel changement de
  // souris/tactile en cours de session) — détermine desktop (survol) vs
  // mobile/tactile (double tap), cf. demande explicite du user.
  const [isHoverCapable] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );

  useEffect(() => {
    getLessonCuriosites(code).then((data) => setAvailableRawTypes(data.types));
  }, [code]);

  if (!availableRawTypes) return null;

  const zones = COIN_CULTURE_ZONES.map((zone) => ({
    ...zone,
    available: zone.rawTypes.some((t) => availableRawTypes.includes(t)),
  }));
  const activeZone = zones.find((z) => z.key === activeZoneKey) ?? null;

  function handleZoneClick(zone) {
    if (isHoverCapable) {
      if (zone.available) navigate(zone.route(chapId, code));
      return;
    }
    if (activeZoneKey !== zone.key) {
      setActiveZoneKey(zone.key);
      setDeniedZoneKey(null);
      return;
    }
    if (zone.available) {
      navigate(zone.route(chapId, code));
    } else {
      setDeniedZoneKey(zone.key);
    }
  }

  const imageUrl = mediaUrl("logos/culturehomepage.png");

  return (
    <section className="screen">
      {/* Titre + sous-titre dans le même encadré, de même largeur que
          l'image map (width:100%/maxWidth:420, cf. le conteneur de
          l'image juste en dessous) — cf. demande explicite du user. */}
      <div className="card" style={{ width: "100%", maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
        {/* fontSize:"1.4em" (2em par défaut * 0.7, -30%) + fontWeight:400
            (pas gras) — cf. demande explicite du user. */}
        <h1 style={{ margin: 0, fontSize: "1.4em", fontWeight: 400 }}>Explore la culture israélienne!</h1>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Explorez la culture israélienne en cliquant les objets posés sur la table!
        </p>
      </div>
      <div style={{ position: "relative", width: "100%", maxWidth: 420, margin: "0 auto" }}>
        <svg
          viewBox={`0 0 ${CULTURE_IMAGE_SIZE} ${CULTURE_IMAGE_SIZE}`}
          style={{ width: "100%", display: "block", borderRadius: 12 }}
        >
          <defs>
            <clipPath id="coin-culture-grayscale-mask">
              {zones
                .filter((z) => !z.available)
                .map((z) => (
                  <polygon key={z.key} points={z.points} />
                ))}
            </clipPath>
          </defs>

          {/* Fond transparent cliquable : un tap/clic hors de tout segment
              referme le message affiché (mobile). */}
          <rect
            x={0}
            y={0}
            width={CULTURE_IMAGE_SIZE}
            height={CULTURE_IMAGE_SIZE}
            fill="transparent"
            onClick={() => {
              setActiveZoneKey(null);
              setDeniedZoneKey(null);
            }}
          />

          {/* pointerEvents:"none" sur les deux images : sans ça, elles
              interceptent le clic avant qu'il n'atteigne le rect de fond
              en dessous — le tap "ailleurs" pour refermer le message ne
              fonctionnait jamais en dehors des zones (bug constaté en
              test). Les zones (polygones, au-dessus) restent cliquables
              normalement, elles ne sont pas concernées. */}
          <image
            href={imageUrl}
            x={0}
            y={0}
            width={CULTURE_IMAGE_SIZE}
            height={CULTURE_IMAGE_SIZE}
            style={{ pointerEvents: "none" }}
          />
          <image
            href={imageUrl}
            x={0}
            y={0}
            width={CULTURE_IMAGE_SIZE}
            height={CULTURE_IMAGE_SIZE}
            clipPath="url(#coin-culture-grayscale-mask)"
            style={{ filter: "grayscale(1) contrast(0.92)", pointerEvents: "none" }}
          />

          {/* Pas de surbrillance/bordure au tap ou au survol (fill/stroke
              toujours transparents) : seul le message/tooltip signale la
              zone active — cf. demande explicite du user. */}
          {zones.map((zone) => (
            <polygon
              key={zone.key}
              points={zone.points}
              fill="transparent"
              stroke="transparent"
              strokeWidth={4}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => isHoverCapable && setActiveZoneKey(zone.key)}
              onMouseLeave={() => isHoverCapable && setActiveZoneKey((k) => (k === zone.key ? null : k))}
              onClick={(e) => {
                e.stopPropagation();
                handleZoneClick(zone);
              }}
            />
          ))}
        </svg>

        {activeZone && (
          <div
            style={{
              position: "absolute",
              left: `${(activeZone.anchor.x / CULTURE_IMAGE_SIZE) * 100}%`,
              top: `${(activeZone.anchor.y / CULTURE_IMAGE_SIZE) * 100}%`,
              transform: "translate(-50%, -100%)",
              maxWidth: 220,
              background: "var(--cardBg)",
              border: "1px solid var(--cardBorder)",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: "0.8em",
              color: "var(--textPrimary)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              pointerEvents: "none",
              textAlign: "center",
            }}
          >
            {deniedZoneKey === activeZone.key ? (
              <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>
                Pas d'item {activeZone.itemLabel} présent dans cette leçon
              </span>
            ) : (
              activeZone.message
            )}
          </div>
        )}
      </div>
    </section>
  );
}
