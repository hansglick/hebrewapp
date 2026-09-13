import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { estimateQcmNiveauProbabilities, getQcmNiveauQuestions } from "../../api/content";
import "../screens.css";

// Outil de conception (PAS encore l'algorithme final de placement) : fait
// passer les 22 questions de item_qcm.json (fr -> he, QCM à 4 choix) une par
// une, chronométrées, et affiche en fin de parcours un graphique
// points/question — cf. demande explicite du user. Aucune sauvegarde
// serveur pour l'instant : tout est éphémère (perdu au rechargement), le
// temps de concevoir l'algorithme qui exploitera ce graphique.
const QUESTION_SECONDS = 30;
const STOP_STREAK = 4;

const POINTS = { correct: 4, level3: 3, level2: 2, level1: 1 };

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Score obtenu à chaque question (bleu, échelle gauche 0-4) : abscisses =
// index de la question. Probabilité de niveau (rouge, échelle droite 0-1,
// cf. app.level_bayesian/estimate_level_probabilities) : abscisses = clé
// du dictionnaire renvoyé (K = dernier set maîtrisé, castée en entier),
// partageant le même axe horizontal — cf. demande explicite du user. Fait
// main (pas de librairie), sert de base à la conception de l'algorithme.
const SCORE_COLOR = "#2563eb";
const PROB_COLOR = "#dc2626";

function ResultsChart({ history, probabilities }) {
  const width = 320;
  const height = 230;
  const padding = { top: 12, right: 32, bottom: 40, left: 28 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const n = history.length;

  const probEntries = probabilities
    ? Object.entries(probabilities)
        .map(([k, p]) => [Number(k), p])
        .sort((a, b) => a[0] - b[0])
    : [];
  const maxK = probEntries.length ? Math.max(...probEntries.map(([k]) => k)) : 11;
  const domainMax = Math.max(n - 1, maxK, 1);

  function x(value) {
    return padding.left + (value / domainMax) * plotWidth;
  }
  function yScore(points) {
    return padding.top + plotHeight - (points / 4) * plotHeight;
  }
  function yProb(p) {
    return padding.top + plotHeight - p * plotHeight;
  }

  const scoreLinePoints = history.map((h, i) => `${x(i)},${yScore(h.points)}`).join(" ");
  const probLinePoints = probEntries.map(([k, p]) => `${x(k)},${yProb(p)}`).join(" ");

  return (
    <svg width={width} height={height} role="img" aria-label="Points par question et probabilités de niveau">
      {/* Échelle gauche (score 0-4, bleu) avec grille. */}
      {[0, 1, 2, 3, 4].map((v) => (
        <g key={v}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={yScore(v)}
            y2={yScore(v)}
            stroke="var(--cardBorder)"
            strokeWidth="1"
          />
          <text x={padding.left - 6} y={yScore(v)} dy="0.32em" textAnchor="end" fontSize="10" fill={SCORE_COLOR}>
            {v}
          </text>
        </g>
      ))}
      {/* Échelle droite (probabilité 0-1, rouge), sans grille propre (pour
          ne pas surcharger visuellement) — juste les graduations. */}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <text
          key={v}
          x={width - padding.right + 6}
          y={yProb(v)}
          dy="0.32em"
          textAnchor="start"
          fontSize="10"
          fill={PROB_COLOR}
        >
          {v}
        </text>
      ))}

      {n > 0 && <polyline points={scoreLinePoints} fill="none" stroke={SCORE_COLOR} strokeWidth="2" />}
      {history.map((h, i) => (
        <circle key={h.questionId} cx={x(i)} cy={yScore(h.points)} r="4" fill={SCORE_COLOR} />
      ))}
      {history.map((h, i) => (
        <text
          key={h.questionId}
          x={x(i)}
          y={height - padding.bottom + 14}
          textAnchor="middle"
          fontSize="9"
          fill={SCORE_COLOR}
        >
          {h.questionId}
        </text>
      ))}

      {probEntries.length > 0 && <polyline points={probLinePoints} fill="none" stroke={PROB_COLOR} strokeWidth="2" />}
      {probEntries.map(([k, p]) => (
        <circle key={`k-${k}`} cx={x(k)} cy={yProb(p)} r="4" fill={PROB_COLOR} />
      ))}
      {probEntries.map(([k]) => (
        <text
          key={`k-label-${k}`}
          x={x(k)}
          y={height - padding.bottom + 28}
          textAnchor="middle"
          fontSize="9"
          fill={PROB_COLOR}
        >
          {k}
        </text>
      ))}
    </svg>
  );
}

export default function QcmNiveauScreen() {
  const navigate = useNavigate();
  // Écran de transition avant le QCM (mêmes deux boutons que l'écran
  // "test-intro" de l'onboarding classique) — cf. demande explicite du
  // user.
  const [intro, setIntro] = useState(true);
  const [questions, setQuestions] = useState(null);
  const [index, setIndex] = useState(0);
  const [selectedKey, setSelectedKey] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_SECONDS);
  const [history, setHistory] = useState([]);
  const [streak, setStreak] = useState(0);
  const [finished, setFinished] = useState(false);
  const [probabilities, setProbabilities] = useState(null);
  // Lu depuis le décompte (setTimeout) au moment du timeout : un simple
  // state serait périmé dans cette closure (le tap de sélection ne
  // redéclenche pas l'effet du minuteur) — cf. demande explicite du user
  // (la sélection doit être retenue même sans second tap de confirmation).
  const selectedKeyRef = useRef(null);

  useEffect(() => {
    getQcmNiveauQuestions().then(setQuestions);
  }, []);

  const question = questions?.[index];

  const options = useMemo(() => {
    if (!question) return [];
    return shuffle([
      { key: "correct", text: question.correct_answer },
      { key: "level3", text: question.level3_answer },
      { key: "level2", text: question.level2_answer },
      { key: "level1", text: question.level1_answer },
    ]);
  }, [question]);

  useEffect(() => {
    selectedKeyRef.current = null;
    setSelectedKey(null);
    setSecondsLeft(QUESTION_SECONDS);
  }, [index]);

  function advance() {
    const points = selectedKeyRef.current ? POINTS[selectedKeyRef.current] : 0;
    setHistory((h) => [...h, { questionId: question.id, points }]);
    const newStreak = points < 3 ? streak + 1 : 0;
    setStreak(newStreak);
    if (newStreak >= STOP_STREAK || index >= questions.length - 1) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
  }

  useEffect(() => {
    if (!question || finished || intro) return undefined;
    if (secondsLeft <= 0) {
      advance();
      return undefined;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
    // `intro` manquait ici (présent seulement dans la garde ci-dessus) :
    // l'effet ne se redéclenchait donc jamais quand on quittait l'écran de
    // transition (intro passant à false), le décompte ne démarrait jamais
    // — cf. bug rapporté par le user ("chronomètre cassé").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, question, finished, intro]);

  function handleTapOption(key) {
    if (selectedKeyRef.current === key) {
      advance();
      return;
    }
    selectedKeyRef.current = key;
    setSelectedKey(key);
  }

  useEffect(() => {
    if (!finished || history.length === 0) return;
    estimateQcmNiveauProbabilities(history.map((h) => h.points)).then(setProbabilities);
  }, [finished, history]);

  if (intro) {
    return (
      <section className="screen">
        <h1 style={{ fontSize: "1.4em" }}>Évaluation de ton niveau d'hébreu</h1>
        <div className="card">
          <p className="muted" style={{ fontSize: "0.765em", margin: 0 }}>
            Afin d'évaluer ton niveau en hébreu, nous t'avons préparé un Questionnaire à Choix Multiples. Il
            s'agit d'exercice de traduction du français vers l'hébreu. Tu auras à chaque question seulement 30
            secondes pour sélectionner ta réponse. Tu peux double taper sur la réponse pour passer directement à
            la question suivante ou bien taper une fois sur la réponse choisie et attendre la fin des 30
            secondes.
          </p>
          <p className="muted" style={{ fontSize: "0.765em", margin: "8px 0 0" }}>
            À l'issue du test, te sera assigné ton niveau qui correspondra au point de départ dans le cours. Pas
            de panique, si l'estimation s'avère trop sévère (ou pas assez), tu pourras toujours monter ou
            descendre de niveau en cliquant sur ton niveau affiché au centre de la barre de contrôle supérieure.
          </p>
        </div>
        <button type="button" className="exam-tile green" style={{ cursor: "pointer" }} onClick={() => setIntro(false)}>
          Prêt? Commencez le QCM !
        </button>
        <button
          type="button"
          className="exam-tile green pastel"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("/")}
        >
          Je préfère commencer à la première leçon
        </button>
      </section>
    );
  }

  if (finished) {
    return (
      <section className="screen">
        <h1 style={{ fontSize: "1.4em" }}>Résultats du QCM</h1>
        <p className="muted" style={{ fontSize: "0.85em" }}>
          {history.length} question{history.length > 1 ? "s" : ""} répondue{history.length > 1 ? "s" : ""}.
        </p>
        <ResultsChart history={history} probabilities={probabilities} />
      </section>
    );
  }

  if (!question) return null;

  return (
    <section className="screen">
      <h1 style={{ fontSize: "1.2em" }}>Traduire la phrase ci-dessous en hébreu</h1>

      <div className="card" style={{ width: "100%", maxWidth: 320 }}>
        <p style={{ margin: 0, color: "var(--textPrimary)" }}>{question.fr}</p>
      </div>

      {/* Barre de décompte (20s) : se vide au fil du temps, cf. demande
          explicite du user. */}
      <div style={{ width: "100%", maxWidth: 320, height: 6, background: "var(--cardBorder)", borderRadius: 3 }}>
        <div
          style={{
            width: `${(secondsLeft / QUESTION_SECONDS) * 100}%`,
            height: "100%",
            background: "var(--accent)",
            borderRadius: 3,
            transition: "width 1s linear",
          }}
        />
      </div>
      <p className="muted" style={{ fontSize: "0.7em", margin: 0 }}>
        {secondsLeft}s
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 320 }}>
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className="hebrew"
            onClick={() => handleTapOption(opt.key)}
            style={{
              width: "100%",
              textAlign: "right",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--cardBorder)",
              background: selectedKey === opt.key ? "var(--validationGrisee)" : "var(--cardBg)",
              color: "var(--textPrimary)",
              fontWeight: selectedKey === opt.key ? 600 : 400,
              // +75% (cf. demande explicite du user).
              fontSize: "1.75em",
              cursor: "pointer",
            }}
          >
            {opt.text}
          </button>
        ))}
      </div>
    </section>
  );
}
