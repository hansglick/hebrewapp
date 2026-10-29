import { useEffect, useRef, useState } from "react";
import { Answer, Evaluation } from "./Assessment";
import Followup from "./Followup";
import TaskLayout from "./TaskLayout";
import TeacherSpeech from "./TeacherSpeech";

const EXERCISE_NAMES = { comprehension: "Compréhension" };

// Nom du personnage qui prend la parole, en tête d'une réplique de dialogue
// (« דוד: שלום רוני… »).
const SPEAKER = /^[^:.?!,]{1,20}:\s*/;

// Phrase du texte : le nom du personnage qui parle en italique, plus clair (cf.
// demande explicite du user), les extraits qui répondent à la question
// ([début, fin]) mis en évidence.
function Phrase({ phrase, spans }) {
  const speaker = phrase.match(SPEAKER)?.[0] ?? "";
  const parts = speaker
    ? [
        <span key="speaker" className="ra-text-speaker">
          {speaker}
        </span>,
      ]
    : [];
  let at = speaker.length;
  [...spans]
    .sort((a, b) => a[0] - b[0])
    .forEach(([start, end], i) => {
      if (start < at) return;
      parts.push(
        phrase.slice(at, start),
        <mark key={i} className="ra-text-excerpt">
          {phrase.slice(start, end)}
        </mark>,
      );
      at = end;
    });
  parts.push(phrase.slice(at));
  return parts;
}

// Tâche « Compréhension de texte », dans le gabarit commun (cf. TaskLayout) :
// conversation avec le prof, question servie par l'application, réponse de
// l'élève (fautes en rouge), évaluation (puis bouton « Question suivante »)
// et, à droite, le texte de la leçon — à l'évaluation, la ou les phrases qui
// contiennent la solution y sont surlignées, et l'extrait exact qui répond à
// la question mis en évidence ; le texte peut être réduit (une nouvelle
// solution surlignée le rouvre). La question n'apparaît que
// lorsque le prof la pose, la réponse et l'évaluation que lorsque le prof a
// évalué.
export default function ComprehensionBoard({
  teacher,
  text,
  highlight,
  excerpts,
  question,
  evaluation,
  done,
  notice,
  paused,
  answering,
  languageSwitch,
  closing,
  score,
  onNext,
  clock,
}) {
  const phraseRefs = useRef([]);
  // Surlignage en cours au moment où le texte a été réduit : une nouvelle solution surlignée le rouvre.
  const [collapsedFor, setCollapsedFor] = useState(null);
  const collapsed =
    collapsedFor !== null &&
    (highlight.length === 0 || collapsedFor === highlight);

  // Dernière question posée : elle reste au tableau, effacée, entre deux
  // questions (cf. .ra-slate).
  const [lastQuestion, setLastQuestion] = useState(null);
  if (question && question !== lastQuestion) setLastQuestion(question);

  // La phrase surlignée peut être hors de vue : on la fait défiler jusqu'à elle.
  useEffect(() => {
    phraseRefs.current[highlight[0]]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [highlight]);

  if (!teacher && !text && !notice && !clock) return null;

  const speech = (notice || teacher) && (
    <>
      {notice && <p className="ra-alert">{notice}</p>}
      {teacher && (
        <TeacherSpeech key={teacher.id} line={teacher} mode={languageSwitch} />
      )}
    </>
  );

  // Évaluation orale : le mode de langue du prof, à la place des drapeaux de la
  // réplique (cf. TeacherSpeech), et déjà là avant que le prof parle.
  const conversation =
    languageSwitch && !teacher ? (
      <div className="ra-conversation-row">
        {languageSwitch}
        <div className="ra-conversation-main">
          {speech || <p className="muted">Le prof va prendre la parole…</p>}
        </div>
      </div>
    ) : (
      speech
    );

  // Comme en expression libre (cf. demande explicite du user) : dès la
  // première question, la fenêtre reste en place jusqu'à la fin ; son contenu
  // s'écrit sur un tableau, qui s'efface à chaque bonne réponse et avant la
  // question suivante.
  const shownQuestion = question ?? lastQuestion;
  const erased =
    !done &&
    (closing || !question || (evaluation && evaluation.errors.length === 0));
  const exercise = (shownQuestion || done) && (
    <div
      key={done ? "done" : `question-${shownQuestion.number}`}
      className={`ra-slate ${erased ? "ra-slate-erased" : ""}`}
    >
      {done ? (
        <p className="ra-done">Toutes les questions ont été posées.</p>
      ) : (
        <div className="ra-instruction">
          <p className="ra-instruction-he" dir="rtl" lang="he">
            {shownQuestion.hebrew}
          </p>
          {/* Évaluation orale : ce que l'élève dit maintenant est sa réponse ;
              le reste du temps, c'est la conversation. */}
          {answering && <p className="ra-answering">À toi de répondre</p>}
        </div>
      )}
    </div>
  );

  // Comme en expression libre (cf. demande explicite du user) : une seule
  // fenêtre, la réponse, un trait, puis le commentaire de chaque faute
  // surlignée (cf. .ra-assessment) ; réponse juste, seulement la réponse.
  const assessment = evaluation && (
    <div className="ra-assessment">
      <Answer evaluation={evaluation} />
      {evaluation.errors.length > 0 && (
        <>
          <hr className="ra-assessment-rule" />
          <Evaluation evaluation={evaluation} />
        </>
      )}
    </div>
  );

  // Comme en expression libre : « Question suivante » à droite, accolée à
  // « Arrêter la séance », grisée tant qu'il n'y a pas de réponse évaluée.
  const canGoOn = !done && !closing && Boolean(evaluation && paused);
  const controls = clock && (
    <>
      <button
        type="button"
        className="ra-next ra-next-side"
        onClick={onNext}
        disabled={!canGoOn}
      >
        Question suivante
      </button>
      {clock}
    </>
  );

  // Réduit, le texte se replie vers le haut comme un volet qu'on remonte (cf.
  // demande explicite du user) ; il se déroule à nouveau quand on le rouvre.
  // La poignée du bas du volet, en double trait, le remonte ou le tire.
  const material = text && (
    <>
      <div className={`ra-fold ${collapsed ? "ra-fold-closed" : ""}`}>
        <div className="ra-fold-inner">
          <div className="ra-fold-content">
            {text.title && (
              <h3 className="ra-text-title" dir="rtl" lang="he">
                {text.title}
              </h3>
            )}
            <div className="ra-text" dir="rtl" lang="he">
              {text.phrases.map((phrase, i) => (
                <p
                  key={i}
                  ref={(el) => (phraseRefs.current[i] = el)}
                  className={
                    highlight.includes(i) ? "ra-text-solution" : undefined
                  }
                >
                  <Phrase
                    phrase={phrase}
                    spans={excerpts
                      .filter(([p]) => p === i)
                      .map(([, start, end]) => [start, end])}
                  />
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="ra-fold-handle"
        onClick={() => setCollapsedFor(collapsed ? null : highlight)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Afficher le texte" : "Réduire le texte"}
        title={collapsed ? "Afficher le texte" : "Réduire le texte"}
      />
    </>
  );

  return (
    <TaskLayout
      conversation={conversation || null}
      exercise={exercise || null}
      exerciseKey="board"
      exercisePersistent
      exerciseLabel="Réponds à la question à propos du texte"
      answer={assessment || null}
      closing={closing}
      clock={controls || null}
      material={material || null}
      materialLabel="Texte"
      followup={text && <Followup history={score?.history ?? []} names={EXERCISE_NAMES} />}
      followupLabel="Suivi"
    />
  );
}
