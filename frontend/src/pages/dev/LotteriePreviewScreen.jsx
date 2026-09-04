import { useRef, useState } from "react";
import { playLotAnimation } from "../jeu/giftBoxAnimation";
import "../screens.css";
import "../jeu/Jeu.css";

const TICKETS = [
  { nom: "gold", label: "Or", prix: 100, color: "#f3b93b" },
  { nom: "silver", label: "Argent", prix: 50, color: "#c9d2e0" },
  { nom: "bronze", label: "Bronze", prix: 25, color: "#c97a3e" },
];

// Écran de développement : reproduit l'écran d'achat de lots (LotterieScreen)
// avec un portefeuille fictif (500 ₪, jamais débité) et une ouverture de lot
// simulée localement (résultat aléatoire fictif, sans image de carte réelle)
// — le vrai écran dépense de vrais shekels via une confirmation navigateur
// (window.confirm) et un appel réel à openLot, pas adapté à de l'itération de
// design. Accessible uniquement en tapant l'URL (/dev/lotterie-preview), cf.
// demande explicite du user.
export default function LotteriePreviewScreen() {
  const [busy, setBusy] = useState(false);
  const [lastReveal, setLastReveal] = useState(null);
  const stageRef = useRef(null);

  async function handleOpen(nom, label) {
    if (busy) return;
    setBusy(true);
    setLastReveal(null);
    const fakeCount = 1 + Math.floor(Math.random() * 3);
    const fakeGems = Math.floor(Math.random() * 5);
    await playLotAnimation(
      stageRef.current,
      nom,
      { count: fakeCount, gems: fakeGems, imageUrls: Array(fakeCount).fill(null) },
      () => {}
    );
    setLastReveal({ label, count: fakeCount, gems: fakeGems });
    setBusy(false);
  }

  return (
    <section className="screen">
      <p className="muted" style={{ fontSize: "0.8em" }}>
        Aperçu — portefeuille fictif (500 ₪, jamais débité), aucun achat réel.
      </p>
      <div className="lot-tiles">
        {TICKETS.map(({ nom, label, prix, color }) => (
          <button
            key={nom}
            type="button"
            className="lot-tile"
            disabled={busy}
            onClick={() => handleOpen(nom, label)}
            title={`${prix} ₪`}
          >
            <span className="lot-dot" style={{ background: color }} />
            {label}
          </button>
        ))}
      </div>

      <div className="jeu-stage" ref={stageRef} />

      {lastReveal && !busy && (
        <p className="muted" style={{ fontSize: "0.85em" }}>
          Lot {lastReveal.label} : {lastReveal.count} carte(s), {lastReveal.gems} gem(s) (fictif)
        </p>
      )}
    </section>
  );
}
