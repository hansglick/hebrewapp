import { useRef, useState } from "react";
import { playLotAnimation } from "../jeu/giftBoxAnimation";
import { ShekelIcon } from "../../components/ShekelIcon";
import { SectionTitle } from "../../components/QuoteBlock";
import "../screens.css";
import "../jeu/Jeu.css";

// Même pastille numérotée qu'ailleurs dans l'app (cf. LotterieScreen.jsx) —
// dupliquée ici pour cet écran de dev autonome, cf. demande explicite du user.
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

// Écran de développement : reproduit l'écran d'achat de lots (LotterieScreen)
// avec un portefeuille fictif (500 ₪, jamais débité) et une ouverture de lot
// simulée localement (résultat aléatoire fictif, sans image de carte réelle)
// — le vrai écran dépense de vrais shekels via une confirmation navigateur
// (window.confirm) et un appel réel à openLot, pas adapté à de l'itération de
// design. Accessible uniquement en tapant l'URL (/dev/lotterie-preview), cf.
// demande explicite du user.
export default function LotteriePreviewScreen() {
  const [busy, setBusy] = useState(false);
  const stageRef = useRef(null);

  async function handleOpen(nom) {
    if (busy) return;
    setBusy(true);
    const fakeCount = 1 + Math.floor(Math.random() * 3);
    const fakeGems = Math.floor(Math.random() * 5);
    await playLotAnimation(
      stageRef.current,
      nom,
      { count: fakeCount, gems: fakeGems, imageUrls: Array(fakeCount).fill(null) },
      () => {}
    );
    setBusy(false);
  }

  // Portefeuille fictif (500 ₪, jamais débité) — cf. demande explicite du
  // user.
  const walletPoints = 100;

  return (
    <section className="screen">
      <div style={{ width: "100%", maxWidth: 480 }}>
        <SectionTitle>
          <StepBadge number={1} background="#dbeafe" color="#1d4ed8" />
          Achète un lot
        </SectionTitle>
      </div>
      <div className="lot-tiles">
        {TICKETS.map(({ nom, prix, color, textColor }) => {
          const canAfford = walletPoints >= prix;
          return (
            <button
              key={nom}
              type="button"
              className="lot-tile"
              style={{ background: color, color: textColor }}
              disabled={!canAfford || busy}
              onClick={() => handleOpen(nom)}
              title={`${prix} ₪`}
            >
              {prix} <ShekelIcon size={14} color={textColor} style={{ verticalAlign: -1 }} />
            </button>
          );
        })}
      </div>

      {sectionHr}

      <div style={{ width: "100%", maxWidth: 480 }}>
        <SectionTitle>
          <StepBadge number={2} background="var(--validationGrisee)" color="var(--validationPleine)" />
          Découvre le contenu du lot
        </SectionTitle>
      </div>
      <div className="jeu-stage" ref={stageRef} style={{ marginTop: 0 }} />
    </section>
  );
}
