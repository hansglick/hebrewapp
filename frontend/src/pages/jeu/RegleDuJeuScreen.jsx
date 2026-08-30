import { ShekelIcon } from "../../components/ShekelIcon";
import "../screens.css";

export default function RegleDuJeuScreen() {
  return (
    <section className="screen">
      <h1>Règle du jeu</h1>
      <div className="card" style={{ fontSize: "0.85em", display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ margin: 0 }}>
          Chaque examen réussi vous rapporte des{" "}
          <strong>
            <ShekelIcon size={13} style={{ verticalAlign: -2 }} />
          </strong>
          . Ces{" "}
          <ShekelIcon size={13} style={{ verticalAlign: -2 }} /> s'échangent contre un{" "}
          <strong>lot</strong> (bronze, argent,
          or), ouvert aussitôt acheté, qui révèle des{" "}
          <strong>cartes</strong> représentant de grandes figures de la
          langue hébraïque, du sionisme et de la culture israélienne — ainsi
          que des <strong>gems</strong>.
        </p>
        <p style={{ margin: 0 }}>
          Attention : vous commencez à perdre des cartes de votre
          collection dès qu'une période d'inactivité de plus de 24h est
          détectée. Ce n'est pas un caprice — c'est pour vous donner une
          bonne raison de revenir souvent et de rester immergé dans
          l'hébreu, seul vrai moyen de progresser vite.
        </p>
        <p style={{ margin: 0 }}>
          Le nombre total de cartes à collectionner reste volontairement
          secret. À vous de vous lancer un défi : comparez votre collection
          à celle de vos amis et voyez qui ira le plus loin !
        </p>
      </div>
    </section>
  );
}
