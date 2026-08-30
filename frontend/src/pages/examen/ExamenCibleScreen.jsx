import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getExamenStatus, getNiveau } from "../../api/user";
import { useConfig } from "../../config/ConfigContext";
import { displayLessonCode, displayLessonNumber } from "../../utils/lessonDisplay";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { ShekelIcon } from "../../components/ShekelIcon";
import "../screens.css";

const MAX_ATTEMPTS_PER_DAY = 3;

// Une pastille par tentative (rouge/verte), du plus ancien au plus récent,
// limité aux 5 dernières côté backend (cf. _full_history) — pas de gris de
// remplissage ici (contrairement à l'écran de résultat, capé à 3).
function FullHistoryPastilles({ history }) {
  if (history.length === 0) return <span className="muted">Aucune tentative</span>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, verticalAlign: "middle" }}>
      {history.map((passed, i) => (
        <span
          key={i}
          className="binyan-pill"
          style={{ margin: 0, backgroundColor: passed ? "var(--success)" : "var(--danger)" }}
        />
      ))}
    </span>
  );
}

function FormatTile({ label, passed, unlocked, attemptsToday, lastScore, joursBloque, godMode, onClick }) {
  let colorClass = "grey";
  let tooltip = `Il est temps de passer l'examen — ça fait ${joursBloque} jour(s) que tu attends.`;
  let disabled = false;

  if (passed) {
    colorClass = "green";
    tooltip = unlocked
      ? "Repasser cet examen (tu risques de perdre cette certification si tu échoues)."
      : `Déjà réussi — note obtenue : ${Math.round(lastScore * 100)}%`;
    disabled = !unlocked;
  } else if (attemptsToday > 0) {
    colorClass = "red";
    const remaining = MAX_ATTEMPTS_PER_DAY - attemptsToday;
    tooltip = godMode
      ? "Mode dieu : tentatives illimitées."
      : remaining > 0
        ? `Il te reste ${remaining} tentative(s) aujourd'hui.`
        : "Plus de tentative aujourd'hui, reviens demain.";
    disabled = godMode ? false : remaining <= 0;
  }

  return (
    <button
      type="button"
      className={`exam-tile ${colorClass}`}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      {label}
      <span className="exam-tile-tooltip">{tooltip}</span>
    </button>
  );
}

export default function ExamenCibleScreen() {
  const { code } = useParams();
  const chapId = code.split(".")[0];
  const navigate = useNavigate();
  const { godMode } = useConfig();
  const [status, setStatus] = useState(null);
  const [joursBloque, setJoursBloque] = useState(0);
  const [niveau, setNiveau] = useState(null);
  const [retryUnlocked, setRetryUnlocked] = useState(false);

  useEffect(() => {
    getExamenStatus(code).then(setStatus);
    getNiveau().then((n) => {
      setNiveau(n);
      if (n.next_lesson_code === code) setJoursBloque(n.jours_bloque);
    });
    setRetryUnlocked(false);
  }, [code]);

  if (!status || !niveau) return null;

  // La dernière leçon du chapitre précédent ("très long", cf.
  // lesson_order.exam_type_for) sert de porte d'entrée au chapitre de
  // `code` : impossible de sauter à une leçon de ce chapitre (y compris sa
  // propre première leçon) tant qu'elle n'est pas réussie dans les deux
  // formats — cf. status.entry_gate_passed (backend, basé sur exam_progress,
  // pas une simple comparaison de numéro de chapitre).
  if (status.entry_gate != null && !status.entry_gate_passed) {
    return (
      <section className="screen">
        <h1>
          Examen {displayLessonNumber(code)} - {displayChapitreLabel(chapId)}
        </h1>
        <p className="muted">
          Pour accéder à cet examen, tu dois d'abord réussir l'examen{" "}
          <span style={{ color: "var(--text)", fontStyle: "normal" }}>
            {displayLessonCode(status.entry_gate)}
          </span>{" "}
          (dernière leçon du chapitre précédent), dans les deux formats écrit et oral.
        </p>
        <button
          type="button"
          className="link-btn"
          onClick={() => navigate(`/examen/cible/${status.entry_gate}`)}
        >
          Passer l'examen {displayLessonCode(status.entry_gate)}
        </button>
      </section>
    );
  }

  return (
    <section className="screen">
      <h1 style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <span className="binyan-pill" style={{ backgroundColor: "var(--success)", marginInlineStart: 0 }} />
        Examen {displayLessonNumber(code)} - {displayChapitreLabel(chapId)}
      </h1>
      <div className="card" style={{ textAlign: "start", width: "100%", maxWidth: 320, fontSize: "0.85em" }}>
        <p style={{ margin: 0, fontWeight: 600, color: "var(--text)" }}>Modalités de l'examen :</p>
        <ul
          style={{
            margin: "4px 0 0",
            paddingInlineStart: "1.2em",
            color: "var(--textMuted)",
            fontStyle: "italic",
          }}
        >
          <li>{status.exam_ecrit_questions} questions de compréhensions écrite</li>
          <li>{status.exam_oral_questions} questions de compréhensions orales</li>
          <li>
            Épreuve chronométrée :{" "}
            {status.exam_timer_minutes ? `Oui (${status.exam_timer_minutes} minutes)` : "Non"}
          </li>
          {(!status.ecrit_passed || !status.oral_passed) && (
            <li>
              Fréquence de passage : {MAX_ATTEMPTS_PER_DAY} essais toutes les 24h pour l'examen écrit et
              oral (il vous reste{" "}
              {!status.ecrit_passed &&
                `${Math.max(0, MAX_ATTEMPTS_PER_DAY - status.attempts_today_ecrit)} essai(s) pour l'écrit`}
              {!status.ecrit_passed && !status.oral_passed && " et "}
              {!status.oral_passed &&
                `${Math.max(0, MAX_ATTEMPTS_PER_DAY - status.attempts_today_oral)} essai(s) pour l'oral`}{" "}
              aujourd'hui)
            </li>
          )}
          <li>Pendant l'épreuve, tu n'auras plus accès aux autres pages du site, pour éviter la triche.</li>
          <li>
            Tu pourras abandonner l'épreuve : les questions sans réponse seront alors notées 1/5, et la
            correction te sera tout de même rendue.
          </li>
          <li>
            Tu peux repasser cet examen même s'il a déjà été réussi, pour accumuler davantage de{" "}
            <ShekelIcon size={12} style={{ verticalAlign: -1 }} /> —
            la récompense est divisée par deux à chaque nouvelle réussite.
          </li>
          <li>
            Récompense initiale : {status.recompense_initiale}{" "}
            <ShekelIcon size={12} style={{ verticalAlign: -1 }} />
          </li>
          <li>Déjà réussi : {status.deja_reussi ? "Oui" : "Non"}</li>
          {status.deja_reussi && (
            <li>
              Récompense actuelle : {status.recompense_actuelle}{" "}
              <ShekelIcon size={12} style={{ verticalAlign: -1 }} /> (Examens réussis{" "}
              {status.nombre_reussites} fois)
            </li>
          )}
        </ul>

        <p style={{ margin: "1.5em 0 0", fontWeight: 600, color: "var(--text)" }}>
          Porte sur la leçon {code.split(".")[1]} du chapitre {code.split(".")[0]} ainsi que les leçons
          antérieures. Soit :
        </p>
        <ul
          style={{
            margin: "4px 0 0",
            paddingInlineStart: "1.2em",
            color: "var(--textMuted)",
            fontStyle: "italic",
          }}
        >
          <li>{status.words_count} mots</li>
          <li>{status.verbs_count} verbes</li>
          <li>{status.phrases_count} phrases</li>
          <li>
            {status.oral_questions_count} questions à propos de {status.texts_count} textes
          </li>
        </ul>
      </div>

      {status.ecrit_passed && status.oral_passed && (
        <div className="card" style={{ textAlign: "start", width: "100%", maxWidth: 320, fontSize: "0.85em" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "var(--text)" }}>Examen déjà réussi :</p>
          <ul style={{ margin: "4px 0 0", paddingInlineStart: "1.2em" }}>
            <li>
              Écrit — dernière note réussie :{" "}
              {status.last_passed_average_note_ecrit != null
                ? `${status.last_passed_average_note_ecrit.toFixed(1)} / 5 (${Math.round(
                    status.last_passed_success_ratio_ecrit * 100
                  )}% ≥4★)`
                : "–"}
            </li>
            <li>
              Oral — dernière note réussie :{" "}
              {status.last_passed_average_note_oral != null
                ? `${status.last_passed_average_note_oral.toFixed(1)} / 5 (${Math.round(
                    status.last_passed_success_ratio_oral * 100
                  )}% ≥4★)`
                : "–"}
            </li>
            <li>
              Écrit : <FullHistoryPastilles history={status.full_history_ecrit} />
            </li>
            <li>
              Oral : <FullHistoryPastilles history={status.full_history_oral} />
            </li>
          </ul>

          {!retryUnlocked && (
            <p style={{ margin: "1em 0 0" }}>
              <button type="button" className="link-btn" onClick={() => setRetryUnlocked(true)}>
                Repasser l'examen
              </button>{" "}
              <span style={{ fontSize: "0.85em", color: "var(--textMuted)", fontStyle: "italic" }}>
                Attention : en cas d'échec, tu retomberais au niveau {displayLessonCode(status.fallback_level)}.
              </span>
            </p>
          )}
        </div>
      )}

      <FormatTile
        label="Écrit"
        passed={status.ecrit_passed}
        unlocked={retryUnlocked}
        attemptsToday={status.attempts_today_ecrit}
        lastScore={status.last_score_ecrit}
        joursBloque={joursBloque}
        godMode={godMode}
        onClick={() => navigate(`/examen/ecrite/${code}`)}
      />
      <FormatTile
        label="Oral"
        passed={status.oral_passed}
        unlocked={retryUnlocked}
        attemptsToday={status.attempts_today_oral}
        lastScore={status.last_score_oral}
        joursBloque={joursBloque}
        godMode={godMode}
        onClick={() => navigate(`/examen/orale/${code}`)}
      />
    </section>
  );
}
