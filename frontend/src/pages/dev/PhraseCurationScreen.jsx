import { useEffect, useMemo, useState } from "react";
import { getPhraseCurationSets, togglePhraseSelection } from "../../api/phraseCuration";
import "../screens.css";

const SET_INDICES = Array.from({ length: 11 }, (_, i) => i + 1);

// Outil de curation manuelle (dev uniquement, cf. demande explicite du
// user) : les sets du test conversationnel contiennent des phrases
// "poubelles" à écarter à la main. Parcourt le même pool dédupliqué que
// app.phrase_sampling.phrases_by_set (celui réellement tiré par le test),
// set par set, avec compteur de sélection en temps réel par set — la
// sélection est persistée côté serveur à chaque coche (pas de bouton
// "sauvegarder").
export default function PhraseCurationScreen() {
  const [setsData, setSetsData] = useState(null);
  const [currentSet, setCurrentSet] = useState(1);
  const [error, setError] = useState(null);
  // Tirage au hasard d'une phrase marquée par set, pour un contrôle qualité
  // rapide sans avoir à parcourir chaque set un par un — cf. demande
  // explicite du user. Purement côté client : setsData contient déjà le
  // statut `selected` de chaque phrase.
  const [randomPicks, setRandomPicks] = useState(null);

  useEffect(() => {
    getPhraseCurationSets()
      .then(setSetsData)
      .catch((e) => setError(e.message));
  }, []);

  const phrases = setsData?.[String(currentSet)] ?? [];
  const selectedCount = useMemo(() => phrases.filter((p) => p.selected).length, [phrases]);

  function handleToggle(phrase) {
    const nextSelected = !phrase.selected;
    setSetsData((prev) => ({
      ...prev,
      [String(currentSet)]: prev[String(currentSet)].map((p) =>
        p.id === phrase.id ? { ...p, selected: nextSelected } : p
      ),
    }));
    togglePhraseSelection(currentSet, phrase.id, nextSelected).catch(() => {
      // Échec réseau : on annule le changement optimiste pour rester
      // cohérent avec l'état réellement persisté côté serveur.
      setSetsData((prev) => ({
        ...prev,
        [String(currentSet)]: prev[String(currentSet)].map((p) =>
          p.id === phrase.id ? { ...p, selected: !nextSelected } : p
        ),
      }));
    });
  }

  function drawRandomPicks() {
    setRandomPicks(
      SET_INDICES.map((idx) => {
        const marked = (setsData[String(idx)] ?? []).filter((p) => p.selected);
        const phrase = marked.length > 0 ? marked[Math.floor(Math.random() * marked.length)] : null;
        return { set: idx, phrase };
      })
    );
  }

  if (error) {
    return (
      <section className="screen">
        <h1 style={{ fontSize: "1.2em" }}>Curation des phrases</h1>
        <p className="muted">Erreur : {error}</p>
      </section>
    );
  }

  if (!setsData) {
    return (
      <section className="screen">
        <h1 style={{ fontSize: "1.2em" }}>Curation des phrases</h1>
        <p className="muted">Chargement...</p>
      </section>
    );
  }

  return (
    <section className="screen" style={{ alignItems: "stretch", maxWidth: 640 }}>
      <h1 style={{ fontSize: "1.2em" }}>Curation des phrases (dev)</h1>
      <p className="muted" style={{ fontSize: "0.8em", margin: 0 }}>
        Sélectionne les phrases à garder pour le test conversationnel, set par set.
      </p>

      <button
        type="button"
        onClick={drawRandomPicks}
        style={{
          alignSelf: "flex-start",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid var(--tileAccent)",
          background: "var(--cardBg)",
          color: "var(--tileAccent)",
          fontSize: "0.8em",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        🎲 Tirer une phrase marquée par set
      </button>

      {randomPicks && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
          {randomPicks.map(({ set, phrase }) => (
            <div
              key={set}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid var(--cardBorder)",
                borderRadius: 10,
                padding: "8px 12px",
                background: "var(--cardBg)",
              }}
            >
              <span style={{ flexShrink: 0, fontSize: "0.75em", color: "var(--textSecondary)", width: 42 }}>
                Set {set}
              </span>
              {phrase ? (
                <>
                  <span style={{ flex: 1, color: "var(--textPrimary)", fontSize: "0.85em" }}>{phrase.french}</span>
                  <span
                    className="hebrew"
                    style={{
                      flex: 1,
                      textAlign: "right",
                      direction: "rtl",
                      fontSize: "1.05em",
                      color: "var(--textPrimary)",
                    }}
                  >
                    {phrase.hebrew}
                  </span>
                </>
              ) : (
                <span className="muted" style={{ flex: 1, fontSize: "0.8em" }}>
                  (aucune phrase marquée dans ce set)
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, width: "100%" }}>
        {SET_INDICES.map((idx) => {
          const setPhrases = setsData[String(idx)] ?? [];
          const count = setPhrases.filter((p) => p.selected).length;
          const active = idx === currentSet;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentSet(idx)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${active ? "var(--tileAccent)" : "var(--cardBorder)"}`,
                background: active ? "var(--tileAccent)" : "var(--cardBg)",
                color: active ? "#fff" : "var(--textPrimary)",
                fontSize: "0.75em",
                fontWeight: active ? 600 : 400,
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              Set {idx}
              <br />
              {count}/{setPhrases.length}
            </button>
          );
        })}
      </div>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        <p className="muted" style={{ fontSize: "0.8em", margin: 0 }}>
          Set {currentSet} — {selectedCount}/{phrases.length} sélectionnée{selectedCount > 1 ? "s" : ""}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
          {phrases.map((phrase) => (
            <label
              key={phrase.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                maxWidth: "none",
                boxSizing: "border-box",
                border: "1px solid var(--cardBorder)",
                borderRadius: 10,
                padding: "8px 12px",
                cursor: "pointer",
                background: phrase.selected ? "var(--validationGrisee)" : "var(--cardBg)",
              }}
            >
              <input
                type="checkbox"
                checked={phrase.selected}
                onChange={() => handleToggle(phrase)}
                style={{ flexShrink: 0, width: 18, height: 18 }}
              />
              <span style={{ flex: 1, color: "var(--textPrimary)", fontSize: "0.85em" }}>{phrase.french}</span>
              <span
                className="hebrew"
                style={{ flex: 1, textAlign: "right", direction: "rtl", fontSize: "1.05em", color: "var(--textPrimary)" }}
              >
                {phrase.hebrew}
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
