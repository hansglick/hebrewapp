import { useCallback, useEffect, useRef, useState } from "react";
import { getChapitres, getLecons } from "../../api/content";
import { getCompletionLessons, getRevisionTexts } from "../../api/revisionAgent";
import { useConfig } from "../../config/ConfigContext";
import { BillCloseContext, BillContext } from "./revisionAgent/billContext";
import CompletionBoard from "./revisionAgent/CompletionBoard";
import ComprehensionBoard from "./revisionAgent/ComprehensionBoard";
import LanguageSwitch from "./revisionAgent/LanguageSwitch";
import DeclensionBoard from "./revisionAgent/DeclensionBoard";
import ExpressionBoard from "./revisionAgent/ExpressionBoard";
import QuestionBoard from "./revisionAgent/QuestionBoard";
import ReadingBoard from "./revisionAgent/ReadingBoard";
import { extractText } from "./revisionAgent/readingText";
import WordBoard from "./revisionAgent/WordBoard";
import SessionClock from "./revisionAgent/SessionClock";
import { Recorder } from "./revisionAgent/audio";
import StudentAnswer from "./revisionAgent/StudentAnswer";
import { useRevisionSession } from "./revisionAgent/useRevisionSession";
import "../screens.css";
import "./RevisionAgentScreen.css";

// Bulle d'explication du mode de langue : quand elle apparaît après la première prise de parole du prof, combien de
// temps elle reste affichée (hors fondus), et la durée de chaque fondu (cf. .ra-language-hint-in / -out).
const LANGUAGE_HINT_DELAY_MS = 300;
const LANGUAGE_HINT_FADE_MS = 1000;
const LANGUAGE_HINT_SHOWN_MS = 4000;
// La facture reste affichée 10 s une fois déroulée (départ des fenêtres et déroulé compris), puis quitte l'écran en
// BILL_LEAVE_MS (cf. .ra-bill-leaving).
const BILL_SHOWN_MS = 1000 + 500 + 10000;
const BILL_LEAVE_MS = 500;

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
// Seule tâche accessible pour le moment, et celle par défaut : les autres sont grisées dans le menu (cf. demande
// explicite du user ; pour les rouvrir, les ajouter ici).
const ENABLED_TASKS = ["lecture"];
// En plus, sur la page texte seulement (/dev/revision-agent-texte, cf. demande explicite du user).
const TEXT_MODE_ENABLED_TASKS = ["comprehension", "declinaison", "completion"];
const DEFAULT_TASK = "lecture";
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

// Mode texte : les menus du modèle du prof et de sa voix, masqués pour le moment (cf. demande explicite du user) : le
// premier de chaque liste, fixé (gemini-3.5-flash-lite, gemini-3.8-flash-lite-tts). true : les menus reviennent.
const MODEL_MENUS = false;

// Mode texte : modèles possibles du prof (cf. config.TEXT_TEACHER_MODELS), le
// plus rapide par défaut (cf. demande explicite du user).
const TEACHER_MODELS = [
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
];

// Mode texte : modèles de la voix du prof (cf. config.TTS_MODELS), le plus
// économique par défaut (cf. demande explicite du user).
const TTS_MODELS = [
  { id: "gemini-3.8-flash-lite-tts", label: "Gemini 3.8 Flash-Lite TTS" },
  { id: "gemini-3.8-flash-tts", label: "Gemini 3.8 Flash TTS" },
  { id: "gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS (preview)" },
];

// « Double route voyelle » : le modèle de la transcription phonétique de la réponse enregistrée (cf.
// config.PHONETIC_MODELS) et celui du juge de la prononciation, qui compare la phonétique au mot transcrit ou au texte
// lu (cf. config.PRONUNCIATION_MODELS), choisis ensemble (cf. demande explicite du user) : rapide, ou précis, par
// défaut. « wo assistance » (lecture seulement) : sans le tri lecture / question au prof (cf. reading.to_teacher),
// tout envoi est une lecture, sa phrase cible affichée (cf. demande explicite du user). « wo prononciation »
// (compréhension seulement) : ni phonétique ni juge de la prononciation, le prof ne juge que la langue et le sens (cf.
// prompts.text_mode, demande explicite du user). tasks : les seules tâches de la config ; except : celles sans elle.
const MODEL_CONFIGS = [
  {
    id: "fast",
    label: "FAST",
    phonetic: "gemini-3.5-flash",
    pronunciation: "gemini-3.5-flash-lite",
    // Déclinaison : ni phonétique ni prononciation, FAST et SHARP y seraient identiques (SHARP seul). Lecture et
    // complétion : plus de FAST (cf. demande explicite du user).
    except: ["lecture", "comprehension", "declinaison", "completion"],
  },
  { id: "precise", label: "SHARP", phonetic: "gemini-3.8-flash", pronunciation: "gemini-3.5-flash" },
  {
    id: "precise_wo_assistance",
    label: "SHARP wo assistance",
    phonetic: "gemini-3.8-flash",
    pronunciation: "gemini-3.5-flash",
    noTriage: true,
    tasks: ["lecture"],
  },
  { id: "precise_wo_pronunciation", label: "SHARP wo prononciation", phonetic: null, pronunciation: null,
    tasks: ["comprehension", "completion"] },
];

// Tâches où les cases « Double route voyelle » et « Phonétique » sont masquées, cochées, part entière de l'application
// (cf. demande explicite du user) ; les retirer d'ici pour qu'elles reviennent. En compréhension, la config choisit :
// SHARP avec la double route, SHARP wo prononciation sans phonétique (cf. MODEL_CONFIGS).
const HIDDEN_VOWEL_BOXES = ["lecture", "comprehension", "completion"];

// Tâches où la case « Double route voyelle » s'affiche (cf. config.VOWEL_ROUTE_TASKS), et si elle est cochée par
// défaut : toujours (cf. demande explicite du user).
const VOWEL_ROUTE_DEFAULTS = { lecture: true, expression: true, comprehension: true, completion: true };

// Voix du prof, fixée (cf. demande explicite du user) : une des voix prédéfinies de Gemini Live.
const VOICE = "Enceladus";

// Périmètre de l'agent : les 30 premières leçons, 0.01 → 0.30 (cf. demande
// explicite du user).
const LESSON_CHAPTER = "0";
const LAST_LESSON = 30;

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
// textMode : la page sans Gemini Live (/dev/revision-agent-texte, cf. demande
// explicite du user), toutes les tâches, la lecture par défaut (cf. DEFAULT_TASK) : le
// prof est un modèle texte (cf. app.revision_agent.text_teacher) dont chaque
// prise de parole est dite par un modèle TTS ; l'élève répond à voix haute,
// transcrit, ou par écrit en cas de souci (cf. StudentAnswer).
export default function RevisionAgentScreen({ textMode = false }) {
  // Toujours le skin « Kindle » sur cette page, quel que soit celui choisi (cf. demande explicite du user).
  const { setForcedSkin } = useConfig();
  useEffect(() => {
    setForcedSkin("kindle");
    return () => setForcedSkin(null);
  }, [setForcedSkin]);
  const [lessons, setLessons] = useState([]);
  const [lessonCode, setLessonCode] = useState("");
  const tasks = TASKS;
  const [task, setTask] = useState(DEFAULT_TASK);
  const [teacherModel, setTeacherModel] = useState(TEACHER_MODELS[0].id);
  const [ttsModel, setTtsModel] = useState(TTS_MODELS[0].id);
  const [currentLesson, setCurrentLesson] = useState(true);
  const [previousLessons, setPreviousLessons] = useState(false);
  // Mode texte, lecture, expression libre et compréhension : la réponse enregistrée est aussi transcrite en lettres
  // latines, voyelles comprises, par phoneticModel (cf. transcribe.heard_phonetic), seulement si la case de la tâche
  // est cochée, ce qu'elle est par défaut (cf. demande explicite du user).
  const [vowelRoutes, setVowelRoutes] = useState(VOWEL_ROUTE_DEFAULTS);
  const vowelBoxesHidden = HIDDEN_VOWEL_BOXES.includes(task); // masquées : toujours cochées
  const vowelRoute = vowelBoxesHidden || (vowelRoutes[task] ?? false);
  // Double route voyelle : la prononciation entendue s'affiche sous la réponse de l'élève (cf. StudentAnswer, demande
  // explicite du user) ; case cochée par défaut.
  const [phoneticShown, setShowPhonetic] = useState(true);
  const showPhonetic = vowelBoxesHidden || phoneticShown;
  const [modelConfig, setModelConfig] = useState("precise");
  const availableModels = MODEL_CONFIGS.filter(
    (config) => (!config.tasks || config.tasks.includes(task)) && !config.except?.includes(task),
  );
  const models =
    availableModels.find((config) => config.id === modelConfig) ??
    MODEL_CONFIGS.find((config) => config.id === "precise");
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
  // La facture (cf. TaskLayout) : affichée seule à la fin de la connexion, elle s'en va au bout de BILL_SHOWN_MS ou
  // par sa croix, et les réglages reprennent sa place (cf. demande explicite du user). null, « leaving » (elle quitte
  // l'écran, cf. .ra-bill-leaving), « closed ».
  const [billPhase, setBillPhase] = useState(null);
  const billTimer = useRef(null);
  const closeBill = useCallback(() => {
    setBillPhase((phase) => phase ?? "leaving");
    clearTimeout(billTimer.current);
    billTimer.current = setTimeout(() => setBillPhase("closed"), BILL_LEAVE_MS);
  }, []);
  useEffect(() => {
    if (!session.bill) return undefined;
    const timer = setTimeout(closeBill, BILL_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [session.bill, closeBill]);
  useEffect(() => () => clearTimeout(billTimer.current), []);

  // Mode texte : le micro de l'élève, ouvert dès le lancement de la séance, pendant l'accueil du prof (cf. demande
  // explicite du user) : le bouton d'enregistrement capte aussitôt (cf. StudentAnswer, Recorder). Fermé à la fin de
  // la séance.
  const [mic, setMic] = useState(null);
  useEffect(() => {
    if (!active) mic?.close();
  }, [active, mic]);
  useEffect(() => () => mic?.close(), [mic]);
  const billOpen = Boolean(session.bill) && billPhase !== "closed";
  const controlsHidden = (live && !showControls) || billOpen;
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
  const taskEnabled = (id) => ENABLED_TASKS.includes(id) || (textMode && TEXT_MODE_ENABLED_TASKS.includes(id));
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
    taskEnabled(id) &&
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
      clearTimeout(billTimer.current);
      setBillPhase(null);
      setShowControls(false);
      session.start({
        lesson: lessonCode,
        voice: VOICE,
        task,
        current: lessonOnly || currentLesson,
        previous: !lessonOnly && previousLessons,
        perReading,
        mode: textMode ? "texte" : "voix",
        teacherModel: textMode ? teacherModel : undefined,
        ttsModel: textMode ? ttsModel : undefined,
        phoneticModel: textMode && vowelRoute ? (models.phonetic ?? undefined) : undefined,
        pronunciationModel: textMode && vowelRoute ? (models.pronunciation ?? undefined) : undefined,
        triage: !(textMode && vowelRoute && task === "lecture" && models.noTriage),
      });
      // Après session.start, qui déclare la page en lecture (iPhone, cf. AudioLink.unlock) ; pendant le clic.
      if (textMode) {
        const recorder = new Recorder();
        recorder.open().catch(() => {}); // refusé : redemandé au premier enregistrement (cf. StudentAnswer)
        setMic(recorder);
      }
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

  // Sans Gemini Live, toutes les tâches : la réponse enregistrée de l'élève (cf. StudentAnswer), qui reste à l'écran
  // jusqu'à la fin de la connexion, puis s'en va avec les autres fenêtres. taskEvaluation : l'évaluation qu'affiche la
  // tâche elle-même (toutes sauf l'expression libre, la compréhension et la lecture, dont la fenêtre de la réponse
  // montre l'évaluation). readingText : en lecture, le texte à lire, affiché à la place de la transcription.
  const composer = (taskEvaluation, readingText) =>
    textMode &&
    (live || session.bill) &&
    ((lamp) => (
      <StudentAnswer
        onSend={session.sendText}
        onSendAudio={session.sendAudio}
        transcript={session.transcript}
        intent={session.intent}
        exchange={session.exchange}
        disabled={!live || session.phase === "done"}
        lamp={lamp}
        taskEvaluation={taskEvaluation}
        showPhonetic={showPhonetic}
        readingText={readingText}
        readingDelay={Boolean(models.noTriage)}
        recorder={mic}
        respelled={session.respelled}
        // Bouton « orthographe » retiré de toutes les tâches (cf. demande explicite du user) : l'élève corrige sa
        // réponse à la main (crayon) et la renvoie. Pour le remettre, lui repasser session.respell.
        onRespell={undefined}
        liveText={session.liveText}
        liveReady={session.liveReady}
        onAudioStart={session.startAudio}
        onAudioChunk={session.sendAudioChunk}
        onAudioCancel={session.cancelAudio}
      />
    ));

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
                {tasks.map((t) => (
                  <option
                    key={t.id}
                    value={t.id}
                    disabled={!taskEnabled(t.id) || needsText(t.id) || needsQuestions(t.id)}
                  >
                    {t.label}
                    {needsText(t.id) ? " (pas de texte dans cette leçon)" : ""}
                    {needsQuestions(t.id) ? " (pas de questions sur ce texte)" : ""}
                  </option>
                ))}
              </select>
            </label>

            {textMode && MODEL_MENUS && (
              <label className="revision-agent-field">
                Modèle du prof
                <select value={teacherModel} onChange={(e) => setTeacherModel(e.target.value)}>
                  {TEACHER_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {textMode && MODEL_MENUS && (
              <label className="revision-agent-field">
                Voix du prof
                <select value={ttsModel} onChange={(e) => setTtsModel(e.target.value)}>
                  {TTS_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {/* Choisis au lancement : le formulaire se grise pendant la séance. */}
            {textMode && task in VOWEL_ROUTE_DEFAULTS && (
              <div className="revision-agent-field">
                {!HIDDEN_VOWEL_BOXES.includes(task) && (
                  <label className="revision-agent-vowel-route">
                    <input
                      type="checkbox"
                      checked={vowelRoute}
                      onChange={(e) => setVowelRoutes((routes) => ({ ...routes, [task]: e.target.checked }))}
                    />
                    Double route voyelle
                  </label>
                )}
                {vowelRoute && !HIDDEN_VOWEL_BOXES.includes(task) && (
                  <label className="revision-agent-vowel-route">
                    <input type="checkbox" checked={showPhonetic} onChange={(e) => setShowPhonetic(e.target.checked)} />
                    Phonétique
                  </label>
                )}
                {vowelRoute && (
                  <div className="revision-agent-field" role="radiogroup" aria-label="Modèles de la prononciation">
                    Modèles de la prononciation
                    <div className="revision-agent-scope">
                      {availableModels.map((config) => (
                        <label
                          key={config.id}
                          title={
                            config.phonetic
                              ? `Phonétique : ${config.phonetic} · juge : ${config.pronunciation}${
                                  config.noTriage ? " · sans tri lecture / question" : ""
                                }`
                              : "Sans phonétique ni juge de prononciation"
                          }
                        >
                          <input
                            type="radio"
                            name="revision-agent-model-config"
                            checked={models.id === config.id}
                            onChange={() => setModelConfig(config.id)}
                          />
                          {config.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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
      <div className={`revision-agent-session ${billPhase === "leaving" ? "ra-bill-leaving" : ""}`}>
        <BillContext.Provider value={session.bill}>
        <BillCloseContext.Provider value={closeBill}>
          {billPhase === "closed" ? null : sessionTask === "comprehension" ? (
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
              composer={composer()}
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
              keepOnDone={textMode}
              composer={composer()}
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
              keepOnDone={textMode}
              composer={composer(session.evaluation)}
            />
          ) : sessionTask === "mot" ? (
            <WordBoard
              teacher={session.teacher}
              exercise={session.exercise}
              answer={session.answer}
              solution={session.solution}
              notice={session.notice}
              composer={composer(session.answer)}
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
              keepOnDone={textMode}
              // Sans Gemini Live, comme en compréhension : l'évaluation s'affiche dans la fenêtre de la réponse.
              composer={composer()}
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
              keepOnDone={textMode}
              // Sans Gemini Live, comme en compréhension : l'évaluation s'affiche dans la fenêtre de la réponse.
              composer={composer()}
            />
          ) : (
            <ReadingBoard
              key={sessionRun}
              teacher={session.teacher}
              text={session.text}
              extract={session.extract}
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
              // Comme en expression libre, la fenêtre de la réponse montre l'évaluation de la lecture (cf. reading.py).
              composer={composer(undefined, extractText(session.text, session.extract))}
            />
          )}
        </BillCloseContext.Provider>
        </BillContext.Provider>
      </div>
    </section>
  );
}
