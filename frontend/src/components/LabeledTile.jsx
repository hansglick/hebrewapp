// Encadré fond blanc avec une petite étiquette grise (texte blanc) posée à
// cheval sur son bord supérieur gauche, façon légende — cf. révisions/
// traduction (toggle "Teacher") et leçon/oral, cf. demandes explicites du
// user.
// `bodyPadding` : personnalisable (ex: 0 pour un enfant qui a déjà sa
// propre bordure, comme AudioProgressBlock en leçon/oral — la bordure
// inférieure de la tuile doit alors toucher la bordure supérieure de la
// piste audio, sans marge entre les deux, cf. demande explicite du user).
export function LabeledTile({ label, children, bodyPadding = "18px 14px 14px" }) {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 320, marginTop: 20 }}>
      <span
        style={{
          position: "absolute",
          top: -12,
          left: 12,
          zIndex: 1,
          background: "#6b7280",
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.7em",
          padding: "4px 10px",
          borderRadius: 6,
        }}
      >
        {label}
      </span>
      {/* Plus de bordure sur l'encadré lui-même — seule l'étiquette (le
          titre) reste visible, cf. demande explicite du user. */}
      <div
        style={{
          borderRadius: 10,
          background: "#fff",
          padding: bodyPadding,
        }}
      >
        {children}
      </div>
    </div>
  );
}
