import { mediaUrl } from "../api/media";
import { speak } from "../utils/speech";
import { SpeakerIcon } from "./SpeakerIcon";
import "../pages/screens.css";

// Le texte explicatif d'une racine (racine.sens) mentionne toujours la racine
// trilitère elle-même en clair (ex: "La racine ה-ל-כ ...") — on la met en
// évidence (gras) au sein du texte plutôt que de la répéter sur une ligne à part.
function highlightRacine(sens, shoresh) {
  const idx = sens.indexOf(shoresh);
  if (idx === -1) return sens;
  return (
    <>
      {sens.slice(0, idx)}
      <strong style={{ color: "var(--text)" }}>{shoresh}</strong>
      {sens.slice(idx + shoresh.length)}
    </>
  );
}

export function RacineCard({ racine }) {
  return (
    <div
      className="card card-illustration curiosite-split curiosite-split-racine-card"
      style={{ textAlign: "start", marginTop: 40 }}
    >
      <div className="curiosite-media">
        <img
          className="screen-image racine-image"
          src={mediaUrl(racine.path)}
          alt={racine.shoresh}
          draggable={false}
          style={{ width: "100%", maxHeight: 312 }}
        />
      </div>

      <div className="curiosite-content">
        <p className="muted" style={{ margin: "8px 0 0", textAlign: "center" }}>
          {highlightRacine(racine.sens, racine.shoresh)}
        </p>
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1.2em 0 0" }} />
        <ul className="words-list" style={{ marginTop: "1.5em", marginBottom: "1.5em" }}>
          {racine.words.map((w) => (
            <li key={w.hebrew} className="racine-word-row">
              <button type="button" className="speak-btn" onClick={() => speak(w.hebrew)}>
                <SpeakerIcon color="#64748b" />
              </button>
              <div>
                <p className="hebrew" style={{ margin: 0 }}>
                  {w.hebrew}
                </p>
                <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.7em", fontStyle: "italic" }}>
                  {w.french}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
