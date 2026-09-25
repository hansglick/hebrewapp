import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getChansons } from "../../api/content";
import { useSwipe } from "../../hooks/useSwipe";
import { ActionHints } from "../../components/ActionHints";
import HebrewInput from "../../components/HebrewInput";
import "../../components/HebrewInput.css";
import "../screens.css";

// Catalogue des chansons déjà connues de l'app (contrairement à "Rechercher
// les paroles !", qui EXTRAIT une nouvelle chanson depuis une URL YouTube) :
// recherche par titre hébreu uniquement, parmi les chansons déjà chargées
// (cf. getChansons, même liste complète que /chansons/random) — cf. demande
// explicite du user, sur le modèle de DictionnaireScreen.
export default function ChansonCatalogueScreen() {
  const navigate = useNavigate();
  const [chansons, setChansons] = useState([]);
  const [query, setQuery] = useState("");

  const swipeHandlers = useSwipe({ onSwipeLeft: () => navigate(-1) });

  useEffect(() => {
    getChansons().then(setChansons).catch(() => setChansons([]));
  }, []);

  const trimmedQuery = query.trim();
  const results = trimmedQuery
    ? chansons.filter((c) => c.title_he?.includes(trimmedQuery))
    : [];

  return (
    <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
      <h1>Catalogue</h1>

      {/* showVoicePrefill=false : seul le toggle "Clavier hébreu" doit
          apparaître sous le champ, pas "Pré-remplir avec la voix" — cf.
          demande explicite du user. */}
      <HebrewInput
        value={query}
        onChange={setQuery}
        rows={1}
        placeholder="Rechercher un titre en hébreu..."
        showVoicePrefill={false}
      />

      {trimmedQuery && results.length === 0 && <p className="muted">Aucun résultat</p>}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
        {results.map((c, i) => (
          <button
            key={`${c.title_he}-${i}`}
            type="button"
            className="card"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => navigate("/fun/chansons/exploration", { state: { initialChanson: c } })}
          >
            <p className="hebrew" style={{ margin: 0, fontSize: "1.1em", direction: "rtl", textAlign: "right", color: "var(--textPrimary)" }}>
              {c.title_he}
            </p>
            {c.title_fr && (
              <p className="muted" style={{ margin: "4px 0 0", fontStyle: "italic" }}>
                {c.title_fr}
              </p>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
