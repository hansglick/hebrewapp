import { Link } from "react-router-dom";
import { mediaUrl } from "../../api/media";
import { TileImageTitle } from "../../components/TileImageTitle";
import "../screens.css";

export default function FunChoiceScreen() {
  return (
    <section className="screen">
      {/* -33% (2em * 0.67 = 1.34em), non gras — cf. demande explicite du
          user. Retour à la ligne après "la" — cf. demande explicite du
          user. */}
      <h1 style={{ fontSize: "1.34em", fontWeight: 400 }}>Portail de la<br />culture judéo-israélienne</h1>
      {/* .card partage déjà width:100%/max-width:320px avec .tile-list
          (screens.css) — même largeur que les tuiles ci-dessous ; fond/
          bordure rendus invisibles — cf. demande explicite du user. */}
      {/* marginTop:-28 : rapproche encore plus le titre et cet encadré —
          cf. demande explicite du user. */}
      <div className="card" style={{ background: "transparent", border: "none", textAlign: "center", marginTop: -28 }}>
        <p style={{ margin: 0, color: "var(--textSecondary)", fontStyle: "italic", fontSize: "0.75em" }}>
          Retrouve tous les items débloqués<br />du coin culture des leçons précédentes
        </p>
      </div>
      <div className="tile-list">
        {/* Chansons en premier (déplacée depuis sa position précédente,
            après Presse) — cf. demande explicite du user. */}
        <Link to="/fun/chansons" className="card-link">
          <div className="card">
            <TileImageTitle src={mediaUrl("logos/chanson.png")}>N'oubliez pas les paroles</TileImageTitle>
          </div>
        </Link>
        <Link to="/fun/expressions" className="card-link">
          <div className="card">
            <TileImageTitle src={mediaUrl("logos/expression.png")}>Expressions</TileImageTitle>
          </div>
        </Link>
        <Link to="/fun/presse" className="card-link">
          <div className="card">
            <TileImageTitle src={mediaUrl("logos/presse.png")}>Presse</TileImageTitle>
          </div>
        </Link>
        <Link to="/fun/bible" className="card-link">
          <div className="card">
            <TileImageTitle src={mediaUrl("logos/bible.png")}>Bible</TileImageTitle>
          </div>
        </Link>
        <Link to="/fun/blagues" className="card-link">
          <div className="card">
            <TileImageTitle src={mediaUrl("logos/joke.png")}>Blagues</TileImageTitle>
          </div>
        </Link>
        <Link to="/fun/israel" className="card-link">
          <div className="card">
            <TileImageTitle src={mediaUrl("logos/visit.png")}>Visitez Israël</TileImageTitle>
          </div>
        </Link>
        <Link to="/fun/mots-origine-hebraique" className="card-link">
          <div className="card">
            <TileImageTitle src={mediaUrl("logos/alefletter.png")}>Mot d'origine hébraïque</TileImageTitle>
          </div>
        </Link>
      </div>
    </section>
  );
}
