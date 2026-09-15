import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { extractChansonLyrics } from "../../api/gemini";
import { WaitingVideo } from "../../components/WaitingVideo";
import "../screens.css";

// Au-delà de ce délai, on considère que Gemini met anormalement longtemps à
// répondre (pas de timeout côté SDK, cf. app.gemini._client) — on prévient
// le user sans annuler la requête, qui continue de tourner en arrière-plan
// (le serveur persistera le résultat de toute façon) — cf. demande
// explicite du user.
const BUSY_AFTER_MS = 2 * 60 * 1000;

export default function ChansonRechercheScreen() {
  const navigate = useNavigate();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const busyTimeoutRef = useRef(null);

  async function handleExtract() {
    setLoading(true);
    setBusy(false);
    setError(null);
    busyTimeoutRef.current = setTimeout(() => setBusy(true), BUSY_AFTER_MS);
    try {
      const chanson = await extractChansonLyrics(youtubeUrl.trim());
      navigate("/fun/chansons/exploration", { state: { initialChanson: chanson } });
    } catch (e) {
      setError(e.message);
    } finally {
      clearTimeout(busyTimeoutRef.current);
      setLoading(false);
    }
  }

  return (
    <section className="screen">
      <input
        type="text"
        value={youtubeUrl}
        onChange={(e) => setYoutubeUrl(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=..."
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "8px 10px",
          marginBottom: 8,
          border: "1px solid var(--cardBorder)",
          borderRadius: 8,
          background: "var(--cardBg)",
          color: "var(--textPrimary)",
        }}
      />

      {!loading && (
        <button
          type="button"
          className="exam-tile green"
          style={{ cursor: youtubeUrl.trim() ? "pointer" : "default" }}
          disabled={!youtubeUrl.trim()}
          onClick={handleExtract}
        >
          Extraire les paroles
        </button>
      )}

      <p
        className="muted"
        style={{
          width: "100%",
          maxWidth: 320,
          marginTop: -8,
          fontStyle: "italic",
          fontSize: "0.7em",
          color: "var(--textSecondary)",
          textAlign: "center",
        }}
      >
        Assurez-vous que la description de la vidéo YouTube contienne les paroles de la chanson en hébreu.
      </p>

      {loading && (
        <WaitingVideo
          label={busy ? "Le service de traduction est encombré, repasser dans une heure." : undefined}
          urgent={busy}
        />
      )}

      {error && (
        <p className="muted" style={{ color: "var(--annulationPleine)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
