import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRacine, getVerbe, searchDictionnaire } from "../api/content";
import { useSwipe } from "../hooks/useSwipe";
import { speak } from "../utils/speech";
import { ActionHints } from "../components/ActionHints";
import { SpeakerIcon } from "../components/SpeakerIcon";
import { FlagIsrael, FlagFrance } from "../components/Flag";
import { VoicePrefill } from "../components/VoicePrefill";
import { RacineCard } from "../components/RacineCard";
import { VerbeCard } from "../components/VerbeCard";
import HebrewInput from "../components/HebrewInput";
import "../components/HebrewInput.css";
import "./screens.css";

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function DictionnaireScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("he_fr");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  // Fiche inline (verbe ou racine) ouverte sous un résultat — une seule à la
  // fois (même principe que VerbeScreen/MotScreen), identifiée par sa ligne
  // (rowKey) pour savoir sous quel résultat l'afficher.
  const [openPanel, setOpenPanel] = useState(null);

  const swipeHandlers = useSwipe({ onSwipeLeft: () => navigate(-1) });

  function handleModeChange(newMode) {
    setMode(newMode);
    setQuery("");
    setResults([]);
    setOpenPanel(null);
  }

  // La fiche ouverte disparaît dès qu'une nouvelle recherche est lancée
  // (changement de texte ou de mode), pas seulement quand de nouveaux
  // résultats arrivent — sinon elle resterait affichée pendant les 300ms de
  // debounce, collée à une ligne qui n'existe peut-être plus.
  useEffect(() => {
    setOpenPanel(null);
  }, [query, mode]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      searchDictionnaire(query.trim(), mode)
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, mode]);

  // Le "?" indique l'existence d'une fiche verbe consultable (toujours vraie,
  // quel que soit le niveau de l'étudiant — décision explicite du user).
  // L'objet complet (conjugaisons incluses) n'est récupéré qu'au clic, la
  // recherche elle-même reste légère (juste hebrew/french/verbe_key). La
  // fiche s'insère inline sous le résultat plutôt que de naviguer ailleurs
  // (même principe que le racine imbriquée dans une fiche verbe).
  async function toggleVerbeFiche(entry, rowKey) {
    if (openPanel?.rowKey === rowKey) {
      setOpenPanel(null);
      return;
    }
    const verbe = await getVerbe(entry.verbe_key);
    setOpenPanel({ rowKey, kind: "verbe", verbe });
  }

  async function toggleMotRacineFiche(entry, rowKey) {
    if (openPanel?.rowKey === rowKey) {
      setOpenPanel(null);
      return;
    }
    const racine = await getRacine(entry.racine);
    setOpenPanel({ rowKey, kind: "racine", racine });
  }

  return (
    <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
      <h1>Dictionnaire</h1>

      <div className="radio-group">
        <label>
          <input type="radio" name="dict-mode" checked={mode === "he_fr"} onChange={() => handleModeChange("he_fr")} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FlagIsrael size={22} /> → <FlagFrance size={22} />
          </span>
        </label>
        <label>
          <input type="radio" name="dict-mode" checked={mode === "fr_he"} onChange={() => handleModeChange("fr_he")} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FlagFrance size={22} /> → <FlagIsrael size={22} />
          </span>
        </label>
      </div>

      {mode === "he_fr" ? (
        <HebrewInput value={query} onChange={setQuery} rows={1} placeholder="Rechercher en hébreu..." />
      ) : (
        <div className="hebrew-input">
          <VoicePrefill lang="fr" context="dictionnaire" onChange={setQuery} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher en français..."
            className="hebrew-input-textarea"
            style={{ fontFamily: "var(--font-latin)" }}
          />
        </div>
      )}

      {query.trim() && results.length === 0 && <p className="muted">Aucun résultat</p>}

      <div className="tile-list">
        {results.map((r, i) => {
          const rowKey = `${r.hebrew}-${r.french}-${i}`;
          const panel = openPanel?.rowKey === rowKey ? openPanel : null;
          return (
            <div key={rowKey} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="card">
                <p
                  className="hebrew"
                  style={{ margin: 0, fontSize: "1.1em", direction: "rtl", textAlign: "right", color: "var(--text)" }}
                >
                  {r.hebrew_nikud ?? r.hebrew}
                  <button
                    type="button"
                    onClick={() => speak(r.hebrew)}
                    aria-label="Prononcer le mot"
                    style={{
                      marginInlineStart: 8,
                      display: "inline-flex",
                      alignItems: "center",
                      verticalAlign: "middle",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <SpeakerIcon color="#64748b" />
                  </button>
                  {r.type === "mot" && r.racine && (
                    <button
                      type="button"
                      onClick={() => toggleMotRacineFiche(r, rowKey)}
                      className="hebrew"
                      style={{
                        marginInlineStart: 8,
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: "var(--danger)",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: "1em",
                      }}
                    >
                      ש
                    </button>
                  )}
                </p>
                {r.type === "verbe" && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => toggleVerbeFiche(r, rowKey)}
                      aria-label="Voir la fiche verbe"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        width: 27,
                        height: 27,
                        borderRadius: "50%",
                        background: "#000",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "1.1em",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      ?
                    </button>
                  </div>
                )}
                <p className="muted" style={{ margin: "4px 0 0", fontStyle: "italic", textAlign: "left" }}>
                  {capitalize(r.french)}
                </p>
              </div>
              {panel?.kind === "verbe" && <VerbeCard verbe={panel.verbe} />}
              {panel?.kind === "racine" && <RacineCard racine={panel.racine} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
