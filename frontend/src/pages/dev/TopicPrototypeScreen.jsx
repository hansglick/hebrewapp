import { useEffect, useState } from "react";
import { getChapitres, getLecons } from "../../api/content";
import { getRevisionTopics } from "../../api/revisionAgent";
import "../screens.css";
import "./RevisionAgentScreen.css";
import "./TopicPrototypeScreen.css";

// Prototype sans agent (cf. demande explicite du user) : l'app tire au hasard les sujets qualifiés de la tâche au
// niveau choisi, chacun une seule fois, et affiche leurs exercices un à un ; l'étudiant passe à l'exercice suivant
// d'un clic. Même périmètre que LiveCoach (leçons 0.01 → 0.20), toutes les tâches sauf « Mot ».
const LESSON_CHAPTER = "0";
const LAST_LESSON = 20;
const TASKS = [
  { id: "lecture", label: "Lecture" },
  { id: "comprehension", label: "Compréhension de texte" },
  { id: "expression", label: "Expression libre" },
  { id: "declinaison", label: "Déclinaison" },
  { id: "completion", label: "Complétion" },
  { id: "question", label: "Question" },
];

// Personnes vers lesquelles décliner (pronom sujet, forme de ל) ; le genre compte aussi à la 1re personne, pour
// l'accord du verbe.
const PERSONS = [
  { person: 1, gender: "m", number: "sg", fr: "je (masc.)", he: "אני", l: "לי" },
  { person: 1, gender: "f", number: "sg", fr: "je (fém.)", he: "אני", l: "לי" },
  { person: 2, gender: "m", number: "sg", fr: "tu (masc.)", he: "אתה", l: "לך" },
  { person: 2, gender: "f", number: "sg", fr: "tu (fém.)", he: "את", l: "לך" },
  { person: 3, gender: "m", number: "sg", fr: "il", he: "הוא", l: "לו" },
  { person: 3, gender: "f", number: "sg", fr: "elle", he: "היא", l: "לה" },
  { person: 1, gender: "m", number: "pl", fr: "nous (masc.)", he: "אנחנו", l: "לנו" },
  { person: 1, gender: "f", number: "pl", fr: "nous (fém.)", he: "אנחנו", l: "לנו" },
  { person: 2, gender: "m", number: "pl", fr: "vous (masc.)", he: "אתם", l: "לכם" },
  { person: 2, gender: "f", number: "pl", fr: "vous (fém.)", he: "אתן", l: "לכן" },
  { person: 3, gender: "m", number: "pl", fr: "ils", he: "הם", l: "להם" },
  { person: 3, gender: "f", number: "pl", fr: "elles", he: "הן", l: "להן" },
];

const shuffle = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// Une personne différente de celle de l'énoncé, tirée au hasard.
const drawTarget = ({ person, gender, number }) =>
  shuffle(PERSONS.filter((p) => p.person !== person || p.gender !== gender || p.number !== number))[0];

// Compréhension : un texte tiré au hasard parmi ceux qui ont des questions, puis jusqu'à 3 de ses questions, une par
// exercice, dans l'ordre du texte.
const COMPREHENSION_QUESTIONS = 3;
const drawComprehension = (topic) => {
  const text = shuffle(topic.exercises.filter((e) => e.questions.length))[0];
  if (!text) return [];
  const kept = shuffle(text.questions).slice(0, COMPREHENSION_QUESTIONS);
  return text.questions
    .filter((q) => kept.includes(q))
    .map((question) => ({ lesson: text.lesson, title: text.title, question }));
};

// Tirage d'un sujet : jusqu'à per_round de ses exercices, au hasard, dans autant de familles de racines que possible
// (seuls les exercices du פעל en ont une), chacun avec sa cible de déclinaison.
const drawRound = (topic) => {
  if (topic.type === "comprehension") return drawComprehension(topic);
  const shuffled = shuffle(topic.exercises);
  const firsts = shuffled.filter((e, i) => shuffled.findIndex((o) => o.family === e.family) === i);
  return [...firsts, ...shuffled.filter((e) => !firsts.includes(e))]
    .slice(0, topic.per_round)
    .map((e) => ({ ...e, target: drawTarget(e.subject ?? e.preposition ?? PERSONS[0]) }));
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Met en évidence des mots hébreux entiers de l'énoncé.
function Highlighted({ text, words }) {
  const kept = words.filter(Boolean);
  if (!kept.length) return text;
  const pattern = new RegExp(`(?<![א-ת])(${kept.map(escape).join("|")})(?![א-ת])`, "g");
  return text.split(pattern).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

function Reveal({ label, children }) {
  const [shown, setShown] = useState(false);
  return shown ? (
    <div className="tp-answer">{children}</div>
  ) : (
    <button type="button" className="tp-reveal" onClick={() => setShown(true)}>
      {label}
    </button>
  );
}

function ConceptExercise({ exercise }) {
  const [easy, setEasy] = useState(false);
  const { text, truncated_one, truncated_two } = exercise;
  return (
    <>
      <p className="tp-hebrew" dir="rtl">
        {easy ? truncated_two : truncated_one}…
      </p>
      <label className="tp-toggle">
        <input type="checkbox" checked={easy} onChange={(e) => setEasy(e.target.checked)} />
        Version facile (coupée après le mot du concept)
      </label>
      <p className="tp-hint">{exercise.concept_tip}</p>
      <p className="tp-hint">Sens de la suite : {exercise.translation_tip}</p>
      <Reveal label="Voir la phrase complète">
        <p className="tp-hebrew" dir="rtl">
          {truncated_one}
          <mark>{text.slice(truncated_one.length, truncated_two.length)}</mark>
          {text.slice(truncated_two.length)}
        </p>
      </Reveal>
    </>
  );
}

function ConjugationExercise({ exercise }) {
  const { text, subject, target } = exercise;
  return (
    <>
      <p className="tp-hebrew" dir="rtl">
        <Highlighted text={text} words={[subject.he, ...subject.verbs.map((v) => v.he)]} />
      </p>
      <p className="tp-instruction">
        Redis la phrase en remplaçant « <span dir="rtl">{subject.he}</span> » ({subject.fr}) par «{" "}
        <span dir="rtl">{target.he}</span> » ({target.fr}).
      </p>
      <p className="tp-hint">
        Verbe{subject.verbs.length > 1 ? "s" : ""} à accorder :{" "}
        {subject.verbs.map((v) => (v.infinitive ? `${v.he} (${v.infinitive})` : v.he)).join(", ")}
      </p>
    </>
  );
}

function PrepositionExercise({ exercise }) {
  const { text, preposition, target } = exercise;
  return (
    <>
      <p className="tp-hebrew" dir="rtl">
        <Highlighted text={text} words={[preposition.he]} />
      </p>
      <p className="tp-instruction">
        Redis la phrase en déclinant « <span dir="rtl">{preposition.he}</span> » pour : {target.fr}.
      </p>
      <Reveal label="Voir la forme attendue">
        <p className="tp-hebrew" dir="rtl">
          {target.l}
        </p>
      </Reveal>
    </>
  );
}

function QuestionExercise({ exercise }) {
  return (
    <>
      <p className="tp-instruction">Pose la question qui a cette phrase pour réponse :</p>
      <p className="tp-hebrew" dir="rtl">
        {exercise.text}
      </p>
      <p className="tp-hint">Indice : {exercise.hint}</p>
      <Reveal label="Voir une question possible">
        <p className="tp-hebrew" dir="rtl">
          {exercise.question}
        </p>
      </Reveal>
    </>
  );
}

function Exercise({ type, exercise }) {
  switch (type) {
    case "concept":
      return <ConceptExercise exercise={exercise} />;
    case "conjugaison":
      return <ConjugationExercise exercise={exercise} />;
    case "preposition":
      return <PrepositionExercise exercise={exercise} />;
    case "question":
      return <QuestionExercise exercise={exercise} />;
    case "lecture":
      return (
        <>
          <p className="tp-instruction">Lis à voix haute le texte de la leçon {exercise.lesson} :</p>
          <p className="tp-hebrew" dir="rtl">
            {exercise.title}
          </p>
        </>
      );
    case "comprehension":
      return (
        <>
          <p className="tp-instruction">
            Texte de la leçon {exercise.lesson} : <span dir="rtl">{exercise.title}</span>
          </p>
          <p className="tp-instruction">Réponds à la question :</p>
          <p className="tp-hebrew" dir="rtl">
            {exercise.question.hebrew}
          </p>
          <p className="tp-hint">{exercise.question.french}</p>
        </>
      );
    case "expression":
      return (
        <>
          <p className="tp-instruction">Réponds par une phrase complète :</p>
          <p className="tp-hebrew" dir="rtl">
            {exercise.question.hebrew}
          </p>
          <p className="tp-hint">{exercise.question.french}</p>
        </>
      );
    default:
      return null;
  }
}

export default function TopicPrototypeScreen() {
  const [lessons, setLessons] = useState([]);
  const [lessonCode, setLessonCode] = useState("");
  const [task, setTask] = useState(TASKS[0].id);
  const [topics, setTopics] = useState(null); // sujets qualifiés de la tâche au niveau choisi
  const [error, setError] = useState("");
  // Séance : ordre de tirage des sujets, sujet en cours, ses exercices et l'exercice en cours.
  const [order, setOrder] = useState(null);
  const [topicIndex, setTopicIndex] = useState(0);
  const [round, setRound] = useState([]);
  const [exerciseIndex, setExerciseIndex] = useState(0);

  useEffect(() => {
    Promise.all([getChapitres(), getLecons(LESSON_CHAPTER)])
      .then(([chapitres, lecons]) => {
        const chapitre = chapitres.find((c) => c.id === LESSON_CHAPTER);
        const kept = lecons.filter((l) => Number(l.code.split(".")[1]) <= LAST_LESSON);
        setLessons([{ chapitre, lecons: kept }]);
        setLessonCode(kept[kept.length - 1]?.code ?? "");
      })
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  useEffect(() => {
    if (!lessonCode) return;
    getRevisionTopics(task, lessonCode)
      .then(setTopics)
      .catch((e) => setError(e.message ?? String(e)));
  }, [task, lessonCode]);

  // Un autre niveau ou une autre tâche : nouveaux sujets, séance abandonnée.
  const select = (setter) => (e) => {
    setter(e.target.value);
    setTopics(null);
    setOrder(null);
  };

  const startTopic = (drawn, index) => {
    setTopicIndex(index);
    setRound(drawRound(drawn[index]));
    setExerciseIndex(0);
  };

  const start = () => {
    const drawn = shuffle(topics);
    setOrder(drawn);
    startTopic(drawn, 0);
  };

  const finished = order && topicIndex >= order.length;
  const topic = order && !finished ? order[topicIndex] : null;
  const exercise = round[exerciseIndex];
  const lastExercise = exerciseIndex + 1 >= round.length;

  const next = () => {
    if (!lastExercise) setExerciseIndex(exerciseIndex + 1);
    else if (topicIndex + 1 < order.length) startTopic(order, topicIndex + 1);
    else setTopicIndex(order.length);
  };

  const tileState = (t) => {
    if (!order) return "";
    const index = order.indexOf(t);
    if (index === topicIndex) return "tp-tile-current";
    return index < topicIndex ? "tp-tile-done" : "";
  };

  return (
    <section className="screen revision-agent">
      <aside className="revision-agent-controls">
        <h1 style={{ fontSize: "1.4em" }}>Prototype sujets</h1>
        {error && <p className="muted">Erreur : {error}</p>}

        <div className="card revision-agent-form">
          <label className="revision-agent-field">
            Niveau
            <select value={lessonCode} onChange={select(setLessonCode)}>
              {lessons.map(({ chapitre, lecons }) => (
                <optgroup key={chapitre.id} label={`Chapitre ${chapitre.id} — ${chapitre.titre}`}>
                  {lecons.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.titre_texte ? `${l.code} — ${l.titre_texte}` : l.code}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="revision-agent-field">
            Tâche
            <select value={task} onChange={select(setTask)}>
              {TASKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <p className="muted revision-agent-note">
            Sujets introduits au plus tard à ce niveau ; exercices tirés des leçons de niveau inférieur ou égal.
          </p>
        </div>

        <button
          type="button"
          className="revision-agent-start"
          disabled={!topics?.length}
          onClick={start}
        >
          {order ? "Recommencer" : "Commencer"}
        </button>
      </aside>

      <div className="revision-agent-session">
        {topics && !topics.length && <p className="muted">Aucun sujet disponible pour cette tâche à ce niveau.</p>}
        {topics?.length > 0 && (
          <div className="tp-tiles">
            {topics.map((t) => (
              <div key={t.id} className={`tp-tile ${tileState(t)}`} title={t.rule}>
                <span className="tp-tile-label">{t.label}</span>
                <span className="tp-tile-count">
                  {t.exercises.length} ex. · dès {t.introduced_in}
                </span>
              </div>
            ))}
          </div>
        )}

        {topic && exercise && (
          <article className="card tp-board">
            <header className="tp-topic">
              <span className="tp-progress">
                Sujet {topicIndex + 1}/{order.length} · exercice {exerciseIndex + 1}/{round.length}
              </span>
              <h2>{topic.label}</h2>
              <p className="tp-rule">{topic.rule}</p>
            </header>
            <div className="tp-exercise" key={`${topicIndex}-${exerciseIndex}`}>
              <Exercise type={topic.type} exercise={exercise} />
              <p className="tp-source">
                Leçon {exercise.lesson}
                {exercise.family && <> · {exercise.family}</>}
              </p>
            </div>
            <button type="button" className="ra-next" onClick={next}>
              {!lastExercise ? "Exercice suivant" : topicIndex + 1 < order.length ? "Sujet suivant" : "Terminer"}
            </button>
          </article>
        )}

        {finished && (
          <p className="tp-finished">Séance terminée : tous les sujets de cette tâche ont été vus.</p>
        )}
      </div>
    </section>
  );
}
