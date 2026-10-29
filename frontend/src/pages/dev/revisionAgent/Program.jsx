// Programme de la séance, commun à l'expression libre et à la déclinaison (cf.
// demande explicite du user) : un sujet par tuile, celui de l'exercice en cours
// en bleu (avec sa légende), ceux déjà vus estompés. La pastille d'une tuile
// déroule sous la rangée, comme un volet qu'on baisse, le petit cours qui
// rappelle le sujet ; elle le remonte aussi.

// Texte français qui cite de l'hébreu (« התפעל : מתרחץ ») : chaque passage
// hébreu est isolé, pour que l'ensemble se lise de gauche à droite.
const HEBREW_RUN = /([֐-׿][֐-׿\s'"״׳־]*[֐-׿])/;

function Mixed({ text }) {
  return text
    .split(HEBREW_RUN)
    .map((part, i) => (i % 2 ? <bdi key={i}>{part}</bdi> : part));
}

// Petit cours d'un sujet (cf. scripts/format_topic_texts.py) : une phrase
// d'introduction, une puce par règle ou par forme — le terme en gras, sa
// traduction, la règle, puis les exemples « hébreu — traduction » —, et une
// remarque finale. À défaut, le texte rédigé (details).
function Course({ topic }) {
  const course = topic.course;
  if (!course) return <Mixed text={topic.details} />;
  return (
    <>
      {course.intro && (
        <p className="ra-course-intro">
          <Mixed text={course.intro} />
        </p>
      )}
      <ul className="ra-course-points">
        {course.points.map((point, i) => (
          <li key={i}>
            <strong>
              <Mixed text={point.term} />
            </strong>
            {point.meaning && <> ({point.meaning})</>}
            {point.rule && (
              <>
                {" : "}
                <Mixed text={point.rule} />
              </>
            )}
            {point.examples.length > 0 && (
              <ul className="ra-course-examples">
                {point.examples.map((example, j) => (
                  <li key={j}>
                    <bdi lang="he">{example.he}</bdi> — <em>{example.fr}</em>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {course.note && (
        <p className="ra-course-note">
          <Mixed text={course.note} />
        </p>
      )}
    </>
  );
}

// topics : {list, current, covered} ; active : un exercice est à l'écran (son
// sujet est en bleu) ; openCourse : index du cours déroulé (null : aucun),
// onToggle(i) l'ouvre ou le referme ; legend : la légende de la tuile bleue.
export default function Program({ topics, active, done, openCourse, onToggle, legend }) {
  if (!topics) {
    return <p className="muted">Le programme de la séance va s’afficher…</p>;
  }
  return (
    <>
      <ol className="ra-program">
        {topics.list.map((topic, i) => (
          <li
            key={i}
            className={`ra-program-tile ${
              active && i === topics.current
                ? "ra-program-tile-current"
                : topics.covered.includes(i) || done
                  ? "ra-program-tile-done"
                  : ""
            }`}
            title={topic.label}
          >
            <Mixed text={topic.short} />
            <button
              type="button"
              className={`ra-program-info ${openCourse === i ? "ra-program-info-open" : ""}`}
              onClick={() => onToggle(i)}
              aria-expanded={openCourse === i}
              aria-label={`Rappel du cours : ${topic.short}`}
              title="Rappel du cours"
            />
          </li>
        ))}
      </ol>
      {/* Sous la rangée de tuiles, le cours de chacune : même volet que le texte
          de la compréhension (cf. ComprehensionBoard), sans poignée — la
          pastille de la tuile le remonte. */}
      {topics.list.map((topic, i) => (
        <div
          key={i}
          className={`ra-fold ra-course-fold ${openCourse === i ? "" : "ra-fold-closed"}`}
        >
          <div className="ra-fold-inner">
            <blockquote className="ra-course-text">
              <Course topic={topic} />
            </blockquote>
          </div>
        </div>
      ))}
      {active && topics.current >= 0 && (
        <p className="ra-program-legend">
          <span className="ra-program-swatch" aria-hidden="true" />
          {legend}
        </p>
      )}
    </>
  );
}
