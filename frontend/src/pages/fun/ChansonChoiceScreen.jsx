import { Link } from "react-router-dom";
import { mediaUrl } from "../../api/media";
import { TileImageTitle } from "../../components/TileImageTitle";
import "../screens.css";

export default function ChansonChoiceScreen() {
  return (
    <section className="screen">
      {/* -33% (2em * 0.67 = 1.34em), non gras — cf. demande explicite du
          user. Retour à la ligne après "chansons" — cf. demande explicite
          du user. */}
      <h1 style={{ fontSize: "0.938em", fontWeight: 400, fontStyle: "italic" }}>Chantez vos chansons<br />israéliennes préférées!</h1>
      <div className="tile-list">
        <Link to="/fun/chansons/exploration" className="card-link">
          <div className="card">
            <TileImageTitle src={mediaUrl("logos/paroles.png")} scale={2.25}>Player</TileImageTitle>
          </div>
        </Link>
        <Link to="/fun/chansons/recherche" className="card-link">
          <div className="card">
            <TileImageTitle src={mediaUrl("logos/lyrics.svg")}>Rechercher les paroles!</TileImageTitle>
          </div>
        </Link>
      </div>
    </section>
  );
}
