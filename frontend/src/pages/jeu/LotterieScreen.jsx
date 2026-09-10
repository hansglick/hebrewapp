import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { openLot } from "../../api/user";
import { mediaUrl } from "../../api/media";
import { useWallet } from "../../context/WalletContext";
import { ShekelIcon } from "../../components/ShekelIcon";
import { SectionTitle } from "../../components/QuoteBlock";
import { playLotAnimation } from "./giftBoxAnimation";
import "../screens.css";
import "./Jeu.css";

// Même pastille numérotée qu'ailleurs dans l'app (cf. StepBadge des écrans
// onboarding/révision) — dupliquée ici, cf. demande explicite du user.
const STEP_BADGE_SIZE = 25;
function StepBadge({ number, background, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: STEP_BADGE_SIZE,
        height: STEP_BADGE_SIZE,
        borderRadius: "50%",
        background,
        color,
        fontSize: "0.9375em",
        fontWeight: 700,
        marginRight: 12,
        flexShrink: 0,
      }}
    >
      {number}
    </span>
  );
}

const sectionHr = (
  <hr style={{ width: "100%", maxWidth: 480, border: "none", borderTop: "1px solid var(--cardBorder)", margin: "20px 0" }} />
);

const TICKETS = [
  { nom: "gold", label: "Or", prix: 100, color: "#d4af37", textColor: "#fff3b0" },
  { nom: "silver", label: "Argent", prix: 50, color: "#c9d2e0", textColor: "#ffffff" },
  { nom: "bronze", label: "Bronze", prix: 25, color: "#c97a3e", textColor: "#ffedd5" },
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
        <p className="muted" style={{ color: "var(--annulationPleine)" }}>
          {error}
        </p>
      )}

      {/* Bloc 1 (pastille bleu pastel) : achat du lot — tuiles au fond
          métallique (couleur pleine tuile, plus de pastille "lot-dot"), prix
          en shekels au lieu du nom du métal, grisées si le user n'a pas
          assez de points — cf. demande explicite du user. */}
      <div style={{ width: "100%", maxWidth: 480 }}>
        <SectionTitle>
          <StepBadge number={1} background="#dbeafe" color="#1d4ed8" />
          Achète un lot
        </SectionTitle>
      </div>
      <div className="lot-tiles">
        {TICKETS.map(({ nom, label, prix, color, textColor }) => {
          const canAfford = wallet.points >= prix;
          return (
            <button
              key={nom}
              type="button"
              className="lot-tile"
              style={{ background: color, color: textColor }}
              disabled={!canAfford || busy}
              onClick={() => handleOpen(nom, prix, label)}
              title={`${prix} ₪`}
            >
              {prix} <ShekelIcon size={14} color={textColor} style={{ verticalAlign: -1 }} />
            </button>
          );
        })}
      </div>

      {sectionHr}

      {/* Bloc 2 (pastille vert pastel) : ouverture/découverte du lot — cf.
          demande explicite du user. */}
      <div style={{ width: "100%", maxWidth: 480 }}>
        <SectionTitle>
          <StepBadge number={2} background="var(--validationGrisee)" color="var(--validationPleine)" />
          Découvre le contenu du lot
        </SectionTitle>
      </div>
      <div className="jeu-stage" ref={stageRef} style={{ marginTop: 0 }} />

      {lastReveal && !busy && (
        <div className="card" style={{ width: "100%", maxWidth: 320, textAlign: "start" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "var(--textPrimary)" }}>Dans le lot</p>
          <p style={{ margin: "4px 0 0", fontSize: "0.9em" }}>
            Nombre de cartes : <strong>{lastReveal.cartes_obtenues.length}</strong>
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "0.9em" }}>
            Nombre de gems : <strong>{lastReveal.gems_obtenues}</strong>
          </p>
          {lastReveal.cartes_obtenues.length > 0 && (
            <Link to="/jeu/cartes" className="link-btn" style={{ marginTop: 6, display: "inline-block" }}>
              Voir dans ma collection
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
