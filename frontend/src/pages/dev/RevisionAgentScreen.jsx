import { useEffect, useState } from "react";
import { getChapitres, getLecons } from "../../api/content";
import { getRevisionTexts, getRevisionVocabulary } from "../../api/revisionAgent";
import CompletionBoard from "./revisionAgent/CompletionBoard";
import ComprehensionBoard from "./revisionAgent/ComprehensionBoard";
import DeclensionBoard from "./revisionAgent/DeclensionBoard";
import ExpressionBoard from "./revisionAgent/ExpressionBoard";
import QuestionBoard from "./revisionAgent/QuestionBoard";
import ReadingBoard from "./revisionAgent/ReadingBoard";
import WordBoard from "./revisionAgent/WordBoard";
import SessionSteps from "./revisionAgent/SessionSteps";
import { useRevisionSession } from "./revisionAgent/useRevisionSession";
import "../screens.css";
import "./RevisionAgentScreen.css";

// Tâches que l'agent fera réviser à l'étudiant (cf. demande explicite du
// user) — toutes sont branchées.
const LIVE_TASKS = ["lecture", "comprehension", "expression", "declinaison", "completion", "mot", "question"];
// Phrases tirées des leçons cochées : toutes les leçons en ont.
const PHRASE_TASKS = ["declinaison", "completion", "mot", "question"];
// Leçons dont toutes les phrases sont déjà des questions : rien à faire questionner.
const QUESTIONLESS_LESSONS = ["0.15"];
// Leçons dont le texte n'a pas de questions de compréhension.
const TEXT_WITHOUT_QUESTIONS = ["0.11"];
const TEXT_TASKS = ["lecture", "comprehension"]; // n'ont de sens que pour une leçon qui a un texte
const TASKS = [
  { id: "lecture", label: "Lecture" },
  { id: "comprehension", label: "Compréhension de texte" },
  { id: "expression", label: "Expression libre" },
  { id: "declinaison", label: "Déclinaison" },
  { id: "completion", label: "Complétion" },
  { id: "mot", label: "Mot" },
  { id: "question", label: "Question" },
];

// Voix du prof, fixée (cf. demande explicite du user) : une des voix prédéfinies de Gemini Live.
const VOICE = "Enceladus";

// Périmètre de l'agent : les 20 premières leçons, 0.01 → 0.20 (cf. demande
// explicite du user).
const LESSON_CHAPTER = "0";
const LAST_LESSON = 20;

// Agent conversationnel (Gemini Live 3.8, gemini-3.8-live) qui fait réviser
// une leçon à l'étudiant (cf. app.revision_agent). Tâche « Lecture » :
// reprise du prototype livecoach (prof Gemini Live, verbatim par Gemini 3.5
// Flash-Lite, évaluation par gpt-6.1-sol) — le passage est tiré de la leçon
// choisie et/ou des leçons antérieures selon les cases cochées. Tâche
// « Compréhension de texte » : le prof seul pose des questions en boucle sur
// le texte de la leçon choisie (les cases cochées n'y changent rien). Ces
// deux tâches ne sont proposées que pour les leçons qui ont un texte. Tâche
// « Expression libre » : le prof seul pose des questions de mise en
// situation, avec pour matière les mots et verbes des leçons cochées. Tâche
// « Déclinaison » : l'application tire une phrase des leçons cochées et une
// transformation, le prof la fait faire et corrige. Tâche « Complétion » :
// l'application tire une phrase et un de ses concepts et la tronque, l'élève
// la complète en suivant l'indice. Tâche « Mot » : l'application tire une
// phrase et un mot du vocabulaire qu'elle contient, l'élève construit une
// phrase avec ce mot en suivant l'indice. Tâche « Question » : l'application
// tire une affirmation et un indice (groupe interrogatif), l'élève pose la
// question qui y mène. Accessible uniquement via /dev.
export default function RevisionAgentScreen() {
  const [lessons, setLessons] = useState([]);
  const [lessonCode, setLessonCode] = useState("");
  const [task, setTask] = useState(TASKS[0].id);
  const [currentLesson, setCurrentLesson] = useState(true);
  const [previousLessons, setPreviousLessons] = useState(false);
  const [texts, setTexts] = useState(null); // leçons qui ont un texte de lecture
  const [vocabularyLessons, setVocabularyLessons] = useState(null); // leçons qui apportent des mots ou des verbes
  const [sessionTask, setSessionTask] = useState(null); // tâche de la dernière séance lancée (son affichage reste après l'arrêt)
  const [error, setError] = useState("");
  const session = useRevisionSession();
  const active = session.status !== "idle";

  useEffect(() => {
    getChapitres()
      .then((chapitres) => {
        const chapitre = chapitres.find((c) => c.id === LESSON_CHAPTER);
        return getLecons(LESSON_CHAPTER).then((lecons) => [
          { chapitre, lecons: lecons.filter((l) => Number(l.code.split(".")[1]) <= LAST_LESSON) },
        ]);
      })
      .then((groups) => {
        setLessons(groups);
        setLessonCode(groups[0]?.lecons[0]?.code ?? "");
      })
      .catch((e) => setError(e.message ?? String(e)));
    getRevisionTexts()
      .then(setTexts)
      .catch((e) => setError(e.message ?? String(e)));
    getRevisionVocabulary()
      .then(setVocabularyLessons)
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  // Lecture et compréhension n'ont pas de sens pour une leçon sans texte (cf. demande explicite du user).
  const hasText = texts?.includes(lessonCode) ?? false;
  const needsText = (id) => TEXT_TASKS.includes(id) && !hasText;
  const needsQuestions = (id) => id === "comprehension" && TEXT_WITHOUT_QUESTIONS.includes(lessonCode);
  // L'expression libre a besoin de mots ou de verbes dans les leçons cochées (codes « 0.NN » : l'ordre
  // alphabétique est celui des leçons).
  const hasVocabulary = (vocabularyLessons ?? []).some(
    (code) => (currentLesson && code === lessonCode) || (previousLessons && code < lessonCode),
  );
  const needsVocabulary = (id) => id === "expression" && !hasVocabulary;
  // Toutes les leçons ont des phrases d'exercice (cf. les deux pools de app.revision_agent.utterances) : seule
  // la toute première leçon n'a pas de leçon antérieure.
  const firstLesson = lessons[0]?.lecons[0]?.code;
  const needsPhrases = (id) => PHRASE_TASKS.includes(id) && !currentLesson && lessonCode === firstLesson;
  const needsAnswers = (id) =>
    id === "question" && currentLesson && !previousLessons && QUESTIONLESS_LESSONS.includes(lessonCode);
  const taskAvailable = (id) =>
    LIVE_TASKS.includes(id) && !needsText(id) && !needsQuestions(id) && !needsVocabulary(id) && !needsPhrases(id) && !needsAnswers(id);
  const scopeChosen = currentLesson || previousLessons;
  const ready = Boolean(lessonCode && taskAvailable(task) && scopeChosen);

  const toggleSession = () => {
    if (active) session.stop();
    else {
      setSessionTask(task);
      session.start({ lesson: lessonCode, voice: VOICE, task, current: currentLesson, previous: previousLessons });
    }
  };

  return (
    <section className="screen revision-agent">
      <aside className="revision-agent-controls">
        <h1 style={{ fontSize: "1.4em" }}>LiveCoach</h1>
        {error && <p className="muted">Impossible de charger les leçons : {error}</p>}

        <fieldset className="card revision-agent-form" disabled={active}>
          <label className="revision-agent-field">
            Leçon
            <select value={lessonCode} onChange={(e) => setLessonCode(e.target.value)}>
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
            <select value={task} onChange={(e) => setTask(e.target.value)}>
              {TASKS.map((t) => (
                <option
                  key={t.id}
                  value={t.id}
                  disabled={needsText(t.id) || needsQuestions(t.id) || needsVocabulary(t.id)}
                >
                  {t.label}
                  {needsText(t.id) ? " (pas de texte dans cette leçon)" : ""}
                  {needsQuestions(t.id) ? " (pas de questions sur ce texte)" : ""}
                  {needsVocabulary(t.id) ? " (aucun mot dans les leçons cochées)" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="revision-agent-field">
            Contenu révisé
            <div className="revision-agent-scope">
              <label>
                <input type="checkbox" checked={currentLesson} onChange={(e) => setCurrentLesson(e.target.checked)} />
                Leçon en cours
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={previousLessons}
                  onChange={(e) => setPreviousLessons(e.target.checked)}
                />
                Leçons antérieures
              </label>
            </div>
          </div>

          {!scopeChosen && <p className="muted revision-agent-note">Coche au moins un contenu à réviser.</p>}
          {scopeChosen && !taskAvailable(task) && (
            <p className="muted revision-agent-note">
              {needsText(task)
                ? "Cette leçon n'a pas de texte."
                : needsQuestions(task)
                  ? "Le texte de cette leçon n'a pas de questions."
                  : needsVocabulary(task)
                  ? "Aucun mot ni verbe dans les leçons cochées."
                  : needsPhrases(task)
                    ? "Aucune leçon antérieure à la première leçon."
                    : needsAnswers(task)
                      ? "Cette leçon ne contient que des questions."
                      : "Cette tâche n'est pas encore disponible."}
            </p>
          )}
        </fieldset>

        <button
          type="button"
          className={`revision-agent-start ${active ? "revision-agent-stop" : ""}`}
          onClick={toggleSession}
          disabled={!active && !ready}
        >
          {active ? "Arrêter la séance" : "Lancer la révision"}
        </button>
      </aside>

      <div className="revision-agent-session">
        {active && (
          <SessionSteps
            status={session.status}
            phase={session.phase}
            seconds={session.seconds}
            showSteps={sessionTask === "lecture"}
          />
        )}
        {sessionTask === "comprehension" ? (
          <ComprehensionBoard
            teacher={session.teacher}
            text={session.text}
            highlight={session.highlight}
            question={session.question}
            evaluation={session.evaluation}
            done={session.phase === "done"}
            notice={session.notice}
            paused={session.paused}
            onNext={session.next}
          />
        ) : sessionTask === "expression" ? (
          <ExpressionBoard teacher={session.teacher} hint={session.hint} answer={session.answer} notice={session.notice} />
        ) : sessionTask === "question" ? (
          <QuestionBoard
            teacher={session.teacher}
            exercise={session.exercise}
            answer={session.answer}
            solution={session.solution}
            notice={session.notice}
          />
        ) : sessionTask === "mot" ? (
          <WordBoard
            teacher={session.teacher}
            exercise={session.exercise}
            answer={session.answer}
            solution={session.solution}
            notice={session.notice}
          />
        ) : sessionTask === "completion" ? (
          <CompletionBoard
            teacher={session.teacher}
            exercise={session.exercise}
            answer={session.answer}
            solution={session.solution}
            notice={session.notice}
          />
        ) : sessionTask === "declinaison" ? (
          <DeclensionBoard
            teacher={session.teacher}
            exercise={session.exercise}
            answer={session.answer}
            notice={session.notice}
            paused={session.paused}
            onNext={session.next}
          />
        ) : (
          <ReadingBoard
            teacher={session.teacher}
            passage={session.passage}
            verdict={session.verdict}
            notice={session.notice}
          />
        )}
      </div>
    </section>
  );
}
