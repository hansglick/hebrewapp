import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { openLot } from "../../api/user";
import { mediaUrl } from "../../api/media";
import { useWallet } from "../../context/WalletContext";
import { playLotAnimation } from "./giftBoxAnimation";
import "../screens.css";
import "./Jeu.css";

const TICKETS = [
  { nom: "gold", label: "Or", prix: 100, color: "#f3b93b" },
  { nom: "silver", label: "Argent", prix: 50, color: "#c9d2e0" },
  { nom: "bronze", label: "Bronze", prix: 25, color: "#c97a3e" },
];

export default function LotterieScreen() {
  const { wallet, setWallet } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastReveal, setLastReveal] = useState(null);
  const stageRef = useRef(null);

  async function handleOpen(nom, prix, label) {
    if (busy || !wallet) return;
    if (!window.confirm(`Confirmer l'achat d'un lot ${label} pour ${prix} ₪ ?`)) return;
    setBusy(true);
    setError(null);
    setLastReveal(null);
    try {
      const result = await openLot(nom);
      const imageUrls = result.cartes_obtenues.map((index) => {
        const path = result.cartes_images?.[index];
        return path ? mediaUrl(path) : null;
      });
      await playLotAnimation(
        stageRef.current,
        nom,
        { count: result.cartes_obtenues.length, gems: result.gems_obtenues, imageUrls },
        () => setWallet(result.wallet)
      );
      setLastReveal(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) return null;

  return (
    <section className="screen">
      {error && (
        <p className="muted" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <div className="lot-tiles">
        {TICKETS.map(({ nom, label, prix, color }) => {
          const canAfford = wallet.points >= prix;
          return (
            <button
              key={nom}
              type="button"
              className="lot-tile"
              disabled={!canAfford || busy}
              onClick={() => handleOpen(nom, prix, label)}
              title={`${prix} ₪`}
            >
              <span className="lot-dot" style={{ background: color }} />
              {label}
            </button>
          );
        })}
      </div>

      <div className="jeu-stage" ref={stageRef} />

      {lastReveal && !busy && lastReveal.cartes_obtenues.length > 0 && (
        <Link to="/jeu/cartes" className="link-btn">
          Voir dans ma collection
        </Link>
      )}
    </section>
  );
}
