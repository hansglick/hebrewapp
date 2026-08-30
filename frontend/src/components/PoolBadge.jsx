const POOL_LABELS = {
  difficulty: "Items difficiles (50%)",
  recency: "Récence dans le cours (50%)",
};

// Indique en révision d'où vient l'objet tiré (quelle branche du tirage
// pondéré) et sa provenance (chapitre.leçon), pour transparence sur le
// fonctionnement du tirage.
export function PoolBadge({ pool, chapter, lesson }) {
  if (!pool) return null;
  return (
    <p className="muted" style={{ fontSize: "0.7em", margin: 0 }}>
      {POOL_LABELS[pool] ?? pool}
      {chapter && lesson ? ` — ${chapter}.${lesson}` : ""}
    </p>
  );
}
