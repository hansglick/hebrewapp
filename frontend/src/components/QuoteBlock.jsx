// Titre au-dessus d'un encadré (ex: "Traduis" au-dessus de la phrase à
// traduire, "Réponse" au-dessus du champ de saisie) : factorisé pour que
// les deux restent visuellement identiques (gras, même taille que la mini
// tuile "Réponse" d'origine, couleur de la barre de citation, justifié à
// gauche) — cf. demande explicite du user.
export function SectionTitle({ children, fontSize = "0.7em", fontWeight = 700 }) {
  return (
    <div
      style={{
        fontWeight,
        fontSize,
        textAlign: "left",
        color: "var(--tileAccent)",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

// Remplace l'ancien habillage LabeledTile (étiquette + bordure pleine) pour
// la phrase à traduire (révisions/traduction, examens écrit/hard) : plus de
// bordure autour de l'encadré, fond identique au fond de l'écran (pas de
// boîte visuellement distincte). Pas de trait horizontal, pas de mini
// tuile — juste un titre en gras au-dessus de l'encadré (cf. SectionTitle)
// et la barre de citation verticale sur le bord gauche, dans la même
// couleur que la mini tuile "Réponse" (var(--tileAccent), cf. LabeledTile)
// et épaissie (+200%, cf. demande explicite du user).
export function QuoteBlock({ children, label = "Traduis", marginTop = 20 }) {
  return (
    <div style={{ width: "100%", maxWidth: 320, marginTop }}>
      <SectionTitle>{label}</SectionTitle>
      <div
        style={{
          position: "relative",
          background: "var(--bg)",
          padding: "14px 14px 14px 24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            transform: "translateY(-50%)",
            width: 6.3,
            height: "49%",
            background: "var(--tileAccent)",
          }}
        />
        {children}
      </div>
    </div>
  );
}
