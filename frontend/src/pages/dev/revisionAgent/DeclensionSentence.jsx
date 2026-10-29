// Phrase à décliner, commune à l'expression libre et à la déclinaison : le mot
// à changer surligné, ce qu'il doit devenir en français, en gras, juste en
// dessous (cf. demande explicite du user).
export default function DeclensionSentence({ declension }) {
  const [start, end] = declension.span;
  return (
    <p className="ra-declension-sentence" dir="rtl" lang="he">
      {declension.sentence.slice(0, start)}
      <span className="ra-declension-target">
        <mark>{declension.sentence.slice(start, end)}</mark>
        <span className="ra-declension-replacement" dir="ltr" lang="fr">
          {declension.replacement}
        </span>
      </span>
      {declension.sentence.slice(end)}
    </p>
  );
}
