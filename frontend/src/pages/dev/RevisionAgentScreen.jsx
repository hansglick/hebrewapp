import { useEffect, useState } from "react";
import { getChapitres, getLecons } from "../../api/content";
import { getCompletionLessons, getRevisionTexts } from "../../api/revisionAgent";
import CompletionBoard from "./revisionAgent/CompletionBoard";
import ComprehensionBoard from "./revisionAgent/ComprehensionBoard";
import LanguageSwitch from "./revisionAgent/LanguageSwitch";
import DeclensionBoard from "./revisionAgent/DeclensionBoard";
import ExpressionBoard from "./revisionAgent/ExpressionBoard";
import QuestionBoard from "./revisionAgent/QuestionBoard";
import ReadingBoard from "./revisionAgent/ReadingBoard";
import WordBoard from "./revisionAgent/WordBoard";
import SessionClock from "./revisionAgent/SessionClock";
import { useRevisionSession } from "./revisionAgent/useRevisionSession";
import "../screens.css";
import "./RevisionAgentScreen.css";

// Bulle d'explication du mode de langue : quand elle apparaît après la première prise de parole du prof, combien de
// temps elle reste affichée (hors fondus), et la durée de chaque fondu (cf. .ra-language-hint-in / -out).
const LANGUAGE_HINT_DELAY_MS = 300;
const LANGUAGE_HINT_FADE_MS = 1000;
const LANGUAGE_HINT_SHOWN_MS = 4000;

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
// Tâches grisées dans le menu pour le moment (cf. demande explicite du user).
const DISABLED_TASKS = ["mot"];
// « Lecture » en premier (cf. demande explicite du user).
const TASKS = [
  { id: "lecture", label: "Lecture" },
  { id: "comprehension", label: "Compréhension de texte" },
  { id: "expression", label: "Expression libre" },
  { id: "declinaison", label: "Déclinaison" },
  { id: "completion", label: "Complétion" },
  { id: "mot", label: "Mot" },
  { id: "question", label: "Question" },
];

// Lecture : répliques à lire par tour, au plus (cf. passages.MAX_PHRASES_PER_READING).
const MAX_PER_READING = 3;

// Voix du prof, fixée (cf. demande explicite du user) : une des voix prédéfinies de Gemini Live.
const VOICE = "Enceladus";

// Périmètre de l'agent : les 20 premières leçons, 0.01 → 0.20 (cf. demande
// explicite du user).
const LESSON_CHAPTER = "0";
const LAST_LESSON = 20;

// Agent conversationnel (Gemini Live 3.8, gemini-3.8-live) qui fait réviser
// une leçon à l'étudiant (cf. app.revision_agent). Tâche « Lecture » : le
// texte d'une leçon cochée s'affiche, l'élève en lit à voix haute les extraits
// surlignés ; sa lecture, transcrite par Gemini Live, est comparée au texte
// par Gemini Flash (cf. ReadingBoard). Tâche
// « Compréhension de texte » : le prof seul pose des questions en boucle sur
// le texte de la leçon choisie (les cases cochées n'y changent rien). Ces
// deux tâches ne sont proposées que pour les leçons qui ont un texte. Tâche
// « Expression libre » : l'application tire trois questions qui couvrent les
// sujets d'expression du niveau choisi (concepts, conjugaisons, ל décliné),
// le prof les pose, donne des indices et, après une réponse parfaite, fait
// décliner la phrase. Tâche
// « Déclinaison » : l'application tire une phrase des leçons cochées et une
// transformation, le prof la fait faire et corrige. Tâche « Complétion » :
// l'application tire des débuts de phrase, chacun avec un concept déjà vu, l'élève
// la complète en suivant la consigne (cf. CompletionBoard). Tâche « Mot » : l'application tire une
// phrase et un mot du vocabulaire qu'elle contient, l'élève construit une
// phrase avec ce mot en suivant l'indice. Tâche « Question » : l'application
// tire des phrases dont une partie est surlignée, l'élève pose la question
// dont c'est la réponse (cf. QuestionBoard). Accessible uniquement via /dev.
export default function RevisionAgentScreen() {
  const [lessons, setLessons] = useState([]);
  const [lessonCode, setLessonCode] = useState("");
  const [task, setTask] = useState(TASKS[0].id);
  const [currentLesson, setCurrentLesson] = useState(true);
  const [previousLessons, setPreviousLessons] = useState(false);
  // Lecture : affiche la phonétique de chaque lecture (contrôle, cf. ReadingBoard).
  const [showPhonetic, setShowPhonetic] = useState(false);
  // Lecture : nombre de répliques à lire par tour (cf. passages.MAX_PHRASES_PER_READING), réglable pendant la séance.
  const [perReading, setPerReading] = useState(1);
  const changePerReading = (count) => {
    setPerReading(count);
    session.setPerReading(count);
  };
  // Le prof commente l'évaluation à voix haute, en français (compréhension, expression libre).
  const [texts, setTexts] = useState(null); // leçons qui ont un texte de lecture
  const [completions, setCompletions] = useState(null); // complétions de chaque leçon, par case
  const [sessionTask, setSessionTask] = useState(null); // tâche de la dernière séance lancée (son affichage reste après l'arrêt)
  // Numéro de la séance : chaque séance repart d'un affichage vierge (sinon le tableau gardait la dernière phrase de
  // la séance précédente et s'affichait dès la connexion, cf. demande explicite du user).
  const [sessionRun, setSessionRun] = useState(0);
  const [error, setError] = useState("");
  const session = useRevisionSession();
  const active = session.status !== "idle";
  // Pendant la séance, les réglages sont masqués (la bande bleue les réaffiche) pour laisser la place à la séance.
  const [showControls, setShowControls] = useState(true);
  const live = session.status === "live";
  const controlsHidden = live && !showControls;
  // Compréhension, expression libre, déclinaison et question : pendant la séance, le bouton « Arrêter » et le chrono
  // s'affichent dans la séance, en bas à droite, et non dans les réglages (cf. demande explicite du user).
  const clockInSession = ["lecture", "comprehension", "expression", "declinaison", "question", "completion"].includes(
    sessionTask,
  );
  const clock = active && <SessionClock status={session.status} seconds={session.seconds} />;
  // Compréhension : à la fin de la première prise de parole du prof, une bulle explique le logo du mode de langue,
  // puis disparaît (cf. demande explicite du user).
  const [languageHint, setLanguageHint] = useState(null);
  const languageLive = live && session.language !== null && session.firstTurnDone;

  useEffect(() => {
    if (!languageLive) return;
    const timers = [
      setTimeout(() => setLanguageHint("in"), LANGUAGE_HINT_DELAY_MS),
      setTimeout(() => setLanguageHint("out"), LANGUAGE_HINT_DELAY_MS + LANGUAGE_HINT_FADE_MS + LANGUAGE_HINT_SHOWN_MS),
      setTimeout(
        () => setLanguageHint(null),
        LANGUAGE_HINT_DELAY_MS + 2 * LANGUAGE_HINT_FADE_MS + LANGUAGE_HINT_SHOWN_MS,
      ),
    ];
    return () => {
      timers.forEach(clearTimeout);
      setLanguageHint(null);
    };
  }, [languageLive]);

  useEffect(() => {
    getChapitres()
      .then((chapitres) => {
        const chapitre = chapitres.find((c) => c.id === LESSON_CHAPTER);
        return getLecons(LESSON_CHAPTER).then((lecons) => [
          {
            chapitre,
            lecons: lecons.filter((l) => Number(l.code.split(".")[1]) <= LAST_LESSON),
          },
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
    getCompletionLessons()
      .then(setCompletions)
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  // Lecture et compréhension n'ont pas de sens pour une leçon sans texte (cf. demande explicite du user).
  const hasText = texts?.includes(lessonCode) ?? false;
  const needsText = (id) => TEXT_TASKS.includes(id) && !hasText;
  const needsQuestions = (id) => id === "comprehension" && TEXT_WITHOUT_QUESTIONS.includes(lessonCode);
  // Toutes les leçons ont des phrases d'exercice (cf. les deux pools de app.revision_agent.utterances) : seule
  // la toute première leçon n'a pas de leçon antérieure.
  const firstLesson = lessons[0]?.lecons[0]?.code;
  const needsPhrases = (id) => PHRASE_TASKS.includes(id) && !currentLesson && lessonCode === firstLesson;
  const needsAnswers = (id) =>
    id === "question" && currentLesson && !previousLessons && QUESTIONLESS_LESSONS.includes(lessonCode);
  // Complétion : seulement les concepts déjà vus (cf. app.revision_agent.completion) ; une leçon où aucun ne l'est
  // encore est grisée (cf. demande explicite du user).
  const completionsOf = (code) => completions?.[code] ?? { current: 0, previous: 0 };
  const conceptSeen = (code) => completionsOf(code).current + completionsOf(code).previous > 0;
  const needsConcepts = (id) =>
    id === "completion" &&
    completions !== null &&
    !((currentLesson && completionsOf(lessonCode).current) || (previousLessons && completionsOf(lessonCode).previous));
  const taskAvailable = (id) =>
    LIVE_TASKS.includes(id) &&
    !DISABLED_TASKS.includes(id) &&
    !needsText(id) &&
    !needsQuestions(id) &&
    !needsPhrases(id) &&
    !needsAnswers(id) &&
    !needsConcepts(id);
  // Lecture : toujours le texte de la leçon en cours (cf. demande explicite du user), les cases n'y changent rien.
  const lessonOnly = task === "lecture";
  const scopeChosen = lessonOnly || currentLesson || previousLessons;
  const ready = Boolean(lessonCode && taskAvailable(task) && scopeChosen);

  const toggleSession = () => {
    if (active) session.stop();
    else {
      setSessionTask(task);
      setSessionRun((run) => run + 1);
      setShowControls(false);
      session.start({
        lesson: lessonCode,
        voice: VOICE,
        task,
        current: lessonOnly || currentLesson,
        previous: !lessonOnly && previousLessons,
        perReading,
      });
    }
  };

  const sessionControls = active && clockInSession && (
    <>
      <button type="button" className="revision-agent-start revision-agent-stop" onClick={toggleSession}>
        Arrêter la séance
      </button>
      {clock}
    </>
  );

  return (
    <section className="screen revision-agent">
      <aside className={`revision-agent-controls ${controlsHidden ? "revision-agent-controls-hidden" : ""}`}>
        {error && <p className="muted">Impossible de charger les leçons : {error}</p>}

        {/* La carte « Configuration » : les réglages se grisent pendant la séance (fieldset), sauf le nombre de
            répliques par lecture, qui reste réglable. */}
        <div className="card revision-agent-form">
          <fieldset className="revision-agent-fields" disabled={active}>
            {/* Même intitulé que les zones de la séance (« Conversation », « Texte »). */}
            <div className="ra-panel-head">
              <span className="ra-label revision-agent-title">Configuration</span>
            </div>
            <label className="revision-agent-field">
              Leçon
              <select value={lessonCode} onChange={(e) => setLessonCode(e.target.value)}>
                {lessons.map(({ chapitre, lecons }) => (
                  <optgroup key={chapitre.id} label={`Chapitre ${chapitre.id} — ${chapitre.titre}`}>
                    {lecons.map((l) => (
                      <option key={l.code} value={l.code} disabled={task === "completion" && !conceptSeen(l.code)}>
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
                    disabled={DISABLED_TASKS.includes(t.id) || needsText(t.id) || needsQuestions(t.id)}
                  >
                    {t.label}
                    {needsText(t.id) ? " (pas de texte dans cette leçon)" : ""}
                    {needsQuestions(t.id) ? " (pas de questions sur ce texte)" : ""}
                  </option>
                ))}
              </select>
            </label>

            {/* Lecture : toujours le texte de la leçon choisie, rien à choisir (cf. demande explicite du user). */}
            {!lessonOnly && (
              <div className="revision-agent-field">
                Contenu révisé
                <div className="revision-agent-scope">
                  <label>
                    <input
                      type="checkbox"
                      checked={currentLesson}
                      onChange={(e) => setCurrentLesson(e.target.checked)}
                    />
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
            )}

            {!scopeChosen && <p className="muted revision-agent-note">Coche au moins un contenu à réviser.</p>}
            {scopeChosen && !taskAvailable(task) && (
              <p className="muted revision-agent-note">
                {needsText(task)
                  ? "Cette leçon n'a pas de texte."
                  : needsQuestions(task)
                    ? "Le texte de cette leçon n'a pas de questions."
                    : needsPhrases(task)
                      ? "Aucune leçon antérieure à la première leçon."
                      : needsAnswers(task)
                        ? "Cette leçon ne contient que des questions."
                        : needsConcepts(task)
                          ? !conceptSeen(lessonCode)
                            ? "Aucun concept n'a encore été vu à cette leçon."
                            : currentLesson
                              ? "Cette leçon n'introduit pas de concept : coche « Leçons antérieures »."
                              : "Aucun concept dans les leçons antérieures : coche « Leçon en cours »."
                          : "Cette tâche n'est pas encore disponible."}
              </p>
            )}
          </fieldset>
          {task === "lecture" && (
            <div className="revision-agent-field revision-agent-per-reading">
              Répliques par lecture
              <div className="ra-stepper">
                <button
                  type="button"
                  onClick={() => changePerReading(perReading - 1)}
                  disabled={perReading <= 1}
                  aria-label="Une réplique de moins"
                >
                  −
                </button>
                <span className="ra-stepper-value">{perReading}</span>
                <button
                  type="button"
                  onClick={() => changePerReading(perReading + 1)}
                  disabled={perReading >= MAX_PER_READING}
                  aria-label="Une réplique de plus"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Hors du formulaire, qui se grise pendant la séance : la case reste utilisable. */}
        {task === "lecture" && (
          <div className="card revision-agent-reading">
            <label className="revision-agent-phonetic">
              <input type="checkbox" checked={showPhonetic} onChange={(e) => setShowPhonetic(e.target.checked)} />
              Afficher la phonétique (contrôle)
            </label>
          </div>
        )}

        <div className={`revision-agent-actions ${active && !clockInSession ? "revision-agent-actions-live" : ""}`}>
          {!(active && clockInSession) && (
            <button
              type="button"
              className={`revision-agent-start ${active ? "revision-agent-stop" : ""}`}
              onClick={toggleSession}
              disabled={!active && !ready}
            >
              {active ? "Arrêter la séance" : "Lancer la révision"}
            </button>
          )}
          {!clockInSession && clock}
        </div>
      </aside>

      {live && (
        <button
          type="button"
          className="revision-agent-rail"
          onClick={() => setShowControls((shown) => !shown)}
          aria-expanded={!controlsHidden}
          aria-label={controlsHidden ? "Afficher les réglages" : "Masquer les réglages"}
          title={controlsHidden ? "Afficher les réglages" : "Masquer les réglages"}
        />
      )}
      <div className="revision-agent-session">
        {sessionTask === "comprehension" ? (
          <ComprehensionBoard
            key={sessionRun}
            teacher={session.teacher}
            text={session.text}
            highlight={session.highlight}
            excerpts={session.excerpts}
            question={session.question}
            evaluation={session.evaluation}
            done={session.phase === "done"}
            notice={session.notice}
            paused={session.paused}
            answering={session.answering}
            languageSwitch={
              session.language && (
                <LanguageSwitch language={session.language} onChange={session.switchLanguage} hint={languageHint} />
              )
            }
            closing={session.closing}
            score={session.score}
            onNext={session.next}
            clock={sessionControls || null}
          />
        ) : sessionTask === "expression" ? (
          <ExpressionBoard
            key={sessionRun}
            teacher={session.teacher}
            topics={session.topics}
            question={session.question}
            hints={session.hints}
            evaluation={session.evaluation}
            declension={session.declension}
            declensionEvaluation={session.declensionEvaluation}
            closing={session.closing}
            score={session.score}
            done={session.phase === "done"}
            notice={session.notice}
            answering={session.answering}
            languageSwitch={
              session.language && (
                <LanguageSwitch language={session.language} onChange={session.switchLanguage} hint={languageHint} />
              )
            }
            onNext={session.next}
            clock={sessionControls || null}
          />
        ) : sessionTask === "question" ? (
          <QuestionBoard
            key={sessionRun}
            teacher={session.teacher}
            exercise={session.exercise}
            evaluation={session.evaluation}
            hint={session.hint}
            answerFrame={session.answerFrame}
            closing={session.closing}
            score={session.score}
            done={session.phase === "done"}
            notice={session.notice}
            languageSwitch={
              session.language && (
                <LanguageSwitch language={session.language} onChange={session.switchLanguage} hint={languageHint} />
              )
            }
            onHint={session.requestHint}
            onNext={session.next}
            clock={sessionControls || null}
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
            key={sessionRun}
            teacher={session.teacher}
            topics={session.topics}
            exercise={session.exercise}
            evaluation={session.evaluation}
            hint={session.hint}
            answerFrame={session.answerFrame}
            closing={session.closing}
            score={session.score}
            done={session.phase === "done"}
            notice={session.notice}
            languageSwitch={
              session.language && (
                <LanguageSwitch language={session.language} onChange={session.switchLanguage} hint={languageHint} />
              )
            }
            onHint={session.requestHint}
            onNext={session.next}
            clock={sessionControls || null}
          />
        ) : sessionTask === "declinaison" ? (
          <DeclensionBoard
            key={sessionRun}
            teacher={session.teacher}
            topics={session.topics}
            declension={session.declension}
            evaluation={session.declensionEvaluation}
            closing={session.closing}
            score={session.score}
            done={session.phase === "done"}
            notice={session.notice}
            languageSwitch={
              session.language && (
                <LanguageSwitch language={session.language} onChange={session.switchLanguage} hint={languageHint} />
              )
            }
            onNext={session.next}
            clock={sessionControls || null}
          />
        ) : (
          <ReadingBoard
            key={sessionRun}
            teacher={session.teacher}
            text={session.text}
            extract={session.extract}
            control={session.readingControl}
            showPhonetic={showPhonetic}
            onListen={session.listen}
            evaluation={session.evaluation}
            closing={session.closing}
            done={session.phase === "done"}
            notice={session.notice}
            languageSwitch={
              session.language && (
                <LanguageSwitch language={session.language} onChange={session.switchLanguage} hint={languageHint} />
              )
            }
            onNext={session.next}
            clock={sessionControls || null}
          />
        )}
      </div>
    </section>
  );
}
