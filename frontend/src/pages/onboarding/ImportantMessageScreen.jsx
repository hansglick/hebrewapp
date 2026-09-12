import { mediaUrl } from "../../api/media";
import "../screens.css";

// Écran inséré entre le choix "Non" (AccountChoiceScreen) et l'inscription
// (RegisterScreen) — prévient le user, avant même de créer son compte,
// qu'il aura besoin d'un moyen de saisir l'hébreu (clavier PC intégré à
// l'app, ou clavier hébreu installé sur son téléphone) — cf. demande
// explicite du user.
//
// Encadrés forcés en blanc/noir quel que soit le thème (pas les tokens
// --cardBg/--textPrimary qui suivent le mode sombre) : ce message doit
// rester lisible et identique peu importe le thème du user, qui n'a même
// pas encore de compte à ce stade — cf. demande explicite du user.
const BOX_WIDTH = { width: "100%", maxWidth: 320, margin: "0 auto" };

export default function ImportantMessageScreen({ onContinue }) {
  return (
    <section className="screen">
      <div className="exam-tile red" style={{ ...BOX_WIDTH, cursor: "default" }}>
        MESSAGE IMPORTANT
      </div>

      <hr style={{ ...BOX_WIDTH, border: "none", borderTop: "1px solid #999", margin: "4px auto" }} />

      <div style={{ ...BOX_WIDTH, background: "#fff", borderRadius: 10, padding: 14 }}>
        <p style={{ margin: 0, color: "#000", textAlign: "start" }}>
          Tu t'apprêtes à lire, parler et bien sûr écrire en hébreu.
        </p>
        <p style={{ margin: "12px 0 0", color: "#000", textAlign: "start" }}>
          • <strong>Pour écrire depuis ton PC</strong>, un petit toggle "Clavier hébreu" sera disponible sous le
          champ de saisie comme l'indique l'image ci-dessous. Pense à l'activer.
        </p>

        {/* Démo statique (pas interactive) du vrai toggle "Clavier hébreu"
            (mêmes classes .switch/.switch-knob que HebrewInput.jsx, mais
            SANS son wrapper .hebrew-input-toggle-row — celui-ci vaut
            display:contents et dépend du parent grid .hebrew-input-toggles,
            absent ici, cf. HebrewInput.css) — loquet en position "activé",
            avec une lueur pulsante pour attirer l'oeil dessus, cf.
            .onboarding-toggle-demo (screens.css) — cf. demande explicite
            du user. */}
        <div className="onboarding-toggle-demo" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 32 }}>
          <span style={{ color: "var(--accent)" }}>Clavier hébreu</span>
          <button type="button" className="switch on" tabIndex={-1} aria-hidden="true" style={{ cursor: "default" }}>
            <span className="switch-knob" />
          </button>
        </div>
      </div>

      <hr style={{ ...BOX_WIDTH, border: "none", borderTop: "1px solid #999", margin: "4px auto" }} />

      <div style={{ ...BOX_WIDTH, background: "#fff", borderRadius: 10, padding: 14 }}>
        <p style={{ margin: 0, color: "#000", textAlign: "start" }}>
          • <strong>Si tu es sur mobile</strong>, il te sera plus confortable d'installer le clavier hébreu. Cela se
          fait en trois clics comme l'indiquent les instructions suivantes :
        </p>
        <img
          src={mediaUrl("logos/install_hebrew_keyboard.png")}
          alt="Instructions pour installer le clavier hébreu sur mobile"
          style={{ width: "110%", marginLeft: "-5%", marginTop: 12, borderRadius: 8, display: "block" }}
          draggable={false}
        />
      </div>

      <hr style={{ ...BOX_WIDTH, border: "none", borderTop: "1px solid #999", margin: "4px auto" }} />

      <button type="button" className="exam-tile purple" onClick={onContinue}>
        Crée ton compte
      </button>
    </section>
  );
}
