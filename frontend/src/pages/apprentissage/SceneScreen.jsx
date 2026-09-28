import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getLeconScene } from "../../api/content";
import { markObjectSeen } from "../../api/user";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { ActionHints } from "../../components/ActionHints";
import { SpeakerIcon } from "../../components/SpeakerIcon";
import { speak } from "../../utils/speech";
import "../screens.css";

function boxArea(box) {
  const [xmin, ymin, xmax, ymax] = box;
  return Math.max(0, xmax - xmin) * Math.max(0, ymax - ymin);
}

// Hors overlap explicitement accepté (cf. demande explicite du user) : le
// hotspot retenu est celui de plus petite surface parmi tous ceux qui
// contiennent le point cliqué/tapé.
function hotspotAt(hotspots, x, y) {
  const matches = hotspots.filter(
    (h) => x >= h.box[0] && x <= h.box[2] && y >= h.box[1] && y <= h.box[3]
  );
  if (matches.length === 0) return null;
  return matches.reduce((smallest, h) => (boxArea(h.box) < boxArea(smallest.box) ? h : smallest));
}

export default function SceneScreen() {
  const { chapId, code } = useParams();
  const navigate = useNavigate();
  const [scene, setScene] = useState(null);
  const [active, setActive] = useState(null);

  useEffect(() => {
    getLeconScene(code).then(setScene);
    setActive(null);
    markObjectSeen({ objectType: "scene", objectKey: code });
  }, [code]);

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => navigate(`/apprentissage/${chapId}/${code}`),
  });

  if (!scene) return null;

  function handleImageClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setActive(hotspotAt(scene.hotspots, x, y));
  }

  return (
    <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />

      <h1 style={{ margin: 0, fontSize: "1.2em", fontWeight: 700, textAlign: "center" }}>
        {scene.scene_title}
      </h1>

      <div style={{ position: "relative", width: "100%", maxWidth: 420 }}>
        <img
          src={mediaUrl(scene.image)}
          alt=""
          draggable={false}
          style={{ width: "100%", display: "block", borderRadius: 12 }}
        />

        {/* Contours discrets des hotspots (blanc, opacité 50%, trait fin),
            avec une lueur au survol/à la sélection — cf. demande explicite
            du user. pointerEvents:none : purement visuel, la détection du
            clic reste gérée par coordonnées sur le calque ci-dessous. */}
        {scene.hotspots.map((h, i) => {
          const isActive = h === active;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${h.box[0] * 100}%`,
                top: `${h.box[1] * 100}%`,
                width: `${(h.box[2] - h.box[0]) * 100}%`,
                height: `${(h.box[3] - h.box[1]) * 100}%`,
                border: isActive ? "1px solid #ffffff" : "1px solid rgba(255,255,255,0.5)",
                borderRadius: 4,
                pointerEvents: "none",
                boxShadow: isActive ? "0 0 10px 3px rgba(255,255,255,0.85)" : "none",
                transition: "box-shadow 0.15s ease, border-color 0.15s ease",
              }}
            />
          );
        })}

        {/* Bandeau d'indication incrusté en haut de l'image, cf. demande
            explicite du user — pointerEvents:none pour ne jamais intercepter
            le clic d'un hotspot situé dans cette bande. */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 12,
            right: 12,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,0.85)",
              color: "var(--sceneMutedFg)",
              padding: "4px 10px",
              borderRadius: 8,
              fontSize: "0.85em",
            }}
          >
            Enrichis ton vocabulaire en explorant l'image (clics)
          </span>
        </div>

        {/* Capte tous les clics/taps sur l'image (recalcule à chaque clic,
            y compris pour passer d'un hotspot à un autre directement, ou
            fermer la popup en cliquant une zone sans hotspot) — cf. demande
            explicite du user. */}
        <div
          onClick={handleImageClick}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
            cursor: "pointer",
            background: active ? "rgba(0,0,0,0.25)" : "transparent",
          }}
        />

        {active && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#ffffff",
              borderRadius: 12,
              padding: "18px 24px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              minWidth: 180,
            }}
          >
            <span className="hebrew-word-row">
              <button type="button" className="speak-btn" onClick={() => speak(active.hebrew)}>
                <SpeakerIcon color="var(--sceneAccentFg)" size={24} />
              </button>
              <span
                className="hebrew"
                style={{ fontWeight: 700, fontSize: "1.6em", color: "var(--sceneAccentFg)" }}
              >
                {active.hebrew}
              </span>
            </span>
            <span style={{ color: "var(--sceneMutedFg)", fontSize: "1.1em" }}>{active.french}</span>
          </div>
        )}
      </div>
    </section>
  );
}
