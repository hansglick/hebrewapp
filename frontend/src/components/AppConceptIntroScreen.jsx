import { MaskIcon } from "./MaskIcon";

// Écran "tu es de niveau X" qui présente le concept de l'application
// (Apprendre/Parler/Renforcer/Examen) — affiché après CHAQUE façon
// d'estimer/fixer le niveau initial d'un étudiant (test conversationnel
// RÉUSSI, cf. ConversationTestScreen.jsx, OU "commencer à la première
// leçon" pendant l'onboarding, cf. OnboardingScreen.jsx) : cf. demande
// explicite du user ("la même page... qui s'affiche après l'estimation du
// niveau"), extrait ici en composant partagé pour ne pas dupliquer ce
// contenu entre les deux écrans.
export function AppConceptIntroScreen({ pseudo, levelLabel, onStart }) {
  return (
    <section className="screen">
      <h1 style={{ fontSize: "1.4em", fontWeight: 400, textAlign: "center" }}>
        {pseudo},<br />
        tu es de niveau <strong style={{ fontWeight: 600 }}>{levelLabel}</strong>
      </h1>

      <div className="card" style={{ textAlign: "left", fontSize: "0.85em" }}>
        <p style={{ margin: 0 }}>
          D'après les résultats du test, tu serais de niveau <strong>{levelLabel}</strong>. Commence dès à
          présent à apprendre l'hébreu. À chaque leçon, ton objectif est de réussir l'examen afin de
          débloquer la leçon suivante. Pour réussir ce challenge, tu peux explorer les 4 options qui
          s'offrent à toi dans ton écran d'accueil :
        </p>

        <ul style={{ margin: "12px 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <MaskIcon src="/openbook.png" size={20} style={{ marginTop: 2 }} />
            <span>
              <strong>Apprendre : </strong>
              Apprends l'hébreu à travers un texte, puis retrouve les mots de vocabulaire, les tournures de
              phrases et même quelques informations culturelles sur Israël pour te détendre.
            </span>
          </li>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <MaskIcon src="/speak.png" size={20} style={{ marginTop: 2 }} />
            <span>
              <strong>Parler : </strong>
              Immerge-toi réellement dans la langue hébreu à travers quelques exercices et autres jeux de
              rôle pour te mettre en situation.
            </span>
          </li>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <MaskIcon src="/revision.png" size={20} style={{ marginTop: 2 }} />
            <span>
              <strong>Renforcer : </strong>
              Révise le vocabulaire et la conjugaison des nouveaux verbes de la leçon.
            </span>
          </li>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <MaskIcon src="/examhat.png" size={20} style={{ marginTop: 2 }} />
            <span>
              <strong>Examen blanc : </strong>
              Entraîne-toi à passer l'examen à travers des exercices de même niveau d'exigeance que l'examen
              final.
            </span>
          </li>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <MaskIcon src="/examhat.png" size={20} style={{ marginTop: 2 }} />
            <span>
              <strong>Examen : </strong>
              Le moment tant redouté. Evalue ta progression en acceptant ce challenge qui passera en revue
              tout ce que tu es censé avoir appris pendant ta leçon. L'examen se décompose en deux formats :
              le format écrit et le format oral. Il te faut réussir les deux pour débloquer la leçon
              suivante. Si tel est le cas, tu recevras des shekels que tu pourras échanger contre des lots de
              cartes à collectioner. Ces cartes représentent des figures incontournables de la renaissance
              de la langue hébreu et de l'état d'Israël.
            </span>
          </li>
        </ul>

        <p style={{ margin: 0 }}>
          La route est longue avant d'atteindre le niveau "Sabra". Mais en persévérant, tout arrive !{" "}
          <strong>בהצלחה {pseudo}!</strong>
        </p>
      </div>

      <button type="button" className="exam-tile green" style={{ cursor: "pointer" }} onClick={onStart}>
        Commencer l'aventure!
      </button>
    </section>
  );
}
