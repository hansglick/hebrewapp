import { mediaUrl } from "../../api/media";
import { useConfig } from "../../config/ConfigContext";
import "../screens.css";

// Toute première page vue par un user inconnu : rien d'autre que cette
// question, cf. demande explicite du user.
export default function AccountChoiceScreen({ onYes, onNo }) {
  const { themeMode } = useConfig();

  return (
    <section className="screen">
      {/* Illustration au-dessus du titre, variante dédiée en dark mode (fond
          nocturne) — cf. demande explicite du user. width:100%/maxWidth:320 :
          même largeur RENDUE que le bouton "Oui" (.exam-tile, width:100% +
          max-width:320px) quel que soit le viewport — cf. demande explicite
          du user. */}
      <img
        className="screen-image"
        style={{ width: "100%", maxWidth: 320 }}
        src={mediaUrl(`logos/homepage_image${themeMode === "dark" ? "_dark" : ""}.png`)}
        alt=""
        draggable={false}
      />

      {/* 1.4em = 2em (taille par défaut d'un h1) * 0.7 : -30%, cf. demande
          explicite du user. */}
      <h1 style={{ fontSize: "1.4em", fontWeight: 400 }}>As-tu déjà un compte ?</h1>
      <button type="button" className="exam-tile green" style={{ cursor: "pointer" }} onClick={onYes}>
        Oui
      </button>
      {/* Violet à titre exceptionnel pour ce bouton précis (pas rouge comme
          d'habitude pour une réponse "non") — cf. demande explicite du user. */}
      <button type="button" className="exam-tile purple" onClick={onNo}>
        Non
      </button>
    </section>
  );
}
