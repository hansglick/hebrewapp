// Encadré fond blanc avec une petite étiquette (fond bleu nuit, police
// blanche) posée à cheval sur son bord supérieur gauche, façon légende —
// cf. révisions/traduction (toggle "Teacher") et questions orales, cf.
// demandes explicites du user.
// `bodyPadding` : personnalisable (ex: 0 pour un enfant qui a déjà sa
// propre bordure, comme AudioProgressBlock en leçon/oral, ou la tuile
// "Réponse" qui doit se poser directement sur l'encadré du champ de
// saisie — la bordure inférieure de la tuile touche alors la bordure
// supérieure de l'enfant, sans marge entre les deux, cf. demande explicite
// du user).
// `border` : par défaut aucune bordure sur l'encadré (seule l'étiquette
// reste visible, cf. demande explicite du user pour la plupart des
// tuiles) — activable au cas par cas (ex: la tuile "Traduire la phrase",
// bordure bleu nuit, sans ombre — cf. demande explicite du user).
// `borderColor` : bleu nuit par défaut (couleur de l'étiquette) ;
// surchargée en gris pour les tuiles "piste audio" (Contenu/Question/
// Réponse, cf. OralAnswerCapture), cf. demande explicite du user.
const NAVY = "#1e3a5f";

export function LabeledTile({
  label,
  children,
  bodyPadding = "18px 14px 14px",
  border = false,
  borderColor = NAVY,
  marginTop = 20,
}) {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 320, marginTop }}>
      <span
        style={{
          position: "absolute",
          top: -12,
          left: 12,
          zIndex: 1,
          background: NAVY,
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.7em",
          padding: "4px 10px",
          borderRadius: 6,
        }}
      >
        {label}
      </span>
      <div
        style={{
          borderRadius: 10,
          background: "#fff",
          padding: bodyPadding,
          border: border ? `1px solid ${borderColor}` : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
