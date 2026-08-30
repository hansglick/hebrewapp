import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { extractChansonLyrics } from "../../api/gemini";
import { WaitingVideo } from "../../components/WaitingVideo";
import { YoutubeIcon } from "../../components/YoutubeIcon";
import "../screens.css";

export default function ChansonRechercheScreen() {
  const navigate = useNavigate();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleExtract() {
    setLoading(true);
    setError(null);
    try {
      const chanson = await extractChansonLyrics(youtubeUrl.trim());
      navigate("/fun/chansons/exploration", { state: { initialChanson: chanson } });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="screen">
      {!loading && (
        <button
          type="button"
          className="speak-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: "1em",
            fontSize: "0.85em",
            color: "var(--text)",
          }}
          disabled={!youtubeUrl.trim()}
          onClick={handleExtract}
        >
          <YoutubeIcon size={24} />
          Extraire les paroles
        </button>
      )}

      <input
        type="text"
        value={youtubeUrl}
        onChange={(e) => setYoutubeUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && youtubeUrl.trim() && !loading) handleExtract();
        }}
        placeholder="https://www.youtube.com/watch?v=..."
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "8px 10px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--surface)",
          color: "var(--text)",
        }}
      />

      <p
        className="muted"
        style={{
          width: "100%",
          maxWidth: 320,
          marginTop: -8,
          fontStyle: "italic",
          fontSize: "0.7em",
          color: "var(--textMuted)",
          textAlign: "center",
        }}
      >
        Assurez-vous que la description de la vidéo YouTube contienne les paroles de la chanson en hébreu.
      </p>

      {loading && <WaitingVideo />}

      {error && (
        <p className="muted" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
