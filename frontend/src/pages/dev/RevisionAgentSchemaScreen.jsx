import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getSchema, getSchemaTasks } from "../../api/revisionAgent";
import "./RevisionAgentSchemaScreen.css";

// Schéma d'une tâche de l'agent de révision (cf. demande explicite du user) : ses étapes, de la voix de l'élève au
// verdict, lues dans le code du backend à chaque affichage (cf. app.revision_agent.schema) ; un clic sur un modèle
// montre son instruction système, et un exemple de son entrée et de sa sortie. Une modification d'un prompt ou d'un modèle s'y voit donc dès
// que le backend est relancé, sans rien recopier ici.

const KIND_CLASS = { student: "plain", model: "model", code: "code", bad: "bad", good: "good" };

function Arrows({ count }) {
  return (
    <div className="ras-arrows" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} viewBox="0 0 18 34">
          <path d="M9 0V26" />
          <path className="ras-arrow-tip" d="M3 24h12l-6 9z" />
        </svg>
      ))}
    </div>
  );
}

function Step({ step, onOpen }) {
  const clickable = step.prompts.length > 0;
  const className = `ras-box ras-${KIND_CLASS[step.kind]} ${step.small ? "ras-small" : ""}`;
  const content = (
    <>
      <span className="ras-head">
        <span className="ras-role">{step.role}</span>
        {clickable && <span className="ras-see">voir le détail</span>}
      </span>
      {step.model && (
        <span className="ras-tag">
          {step.model}
          {step.model_note && <small> · {step.model_note}</small>}
        </span>
      )}
      {!step.model && step.kind === "code" && step.source && <span className="ras-tag ras-tag-code">{step.source}</span>}
      {step.title && <strong className="ras-title">{step.title}</strong>}
      {step.text && <span className="ras-text">{step.text}</span>}
      {step.items.length > 0 && (
        <ul>
          {step.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {step.when && <span className="ras-when">{step.when}</span>}
      {step.hint && <span className="ras-hint">{step.hint}</span>}
    </>
  );
  return clickable ? (
    <button type="button" className={className} onClick={(event) => onOpen(step, event.currentTarget)}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function PromptPart({ label, text }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  return (
    <div className="ras-part">
      <div className="ras-part-label">
        <span>{label}</span>
        <button type="button" className="ras-copy" onClick={copy}>
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

function PromptPanel({ step, onClose }) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ras-scrim" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="ras-panel" role="dialog" aria-modal="true" aria-labelledby="ras-panel-title">
        <div className="ras-panel-head">
          <div>
            <h2 id="ras-panel-title">{step.title || step.role}</h2>
            <p>{[step.model, step.source].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" className="ras-close" onClick={onClose} autoFocus>
            Fermer
          </button>
        </div>
        <div className="ras-panel-body">
          {step.prompts.map((part) => (
            <PromptPart key={part.label} label={part.label} text={part.text} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RevisionAgentSchemaScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const task = searchParams.get("tache") ?? "lecture";
  const [tasks, setTasks] = useState([]);
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState(null);
  const [opened, setOpened] = useState(null); // {step, opener}

  useEffect(() => {
    getSchemaTasks().then(setTasks, (err) => setError(err.message));
  }, []);

  useEffect(() => {
    setSchema(null);
    setError(null);
    getSchema(task).then(setSchema, (err) => setError(err.message));
  }, [task]);

  const close = () => {
    opened?.opener.focus();
    setOpened(null);
  };

  return (
    <section className="ras-page">
      <header className="ras-header">
        <h1>Schéma : {schema?.title ?? "…"}</h1>
        <label className="ras-picker">
          Tâche
          <select value={task} onChange={(event) => setSearchParams({ tache: event.target.value })}>
            {tasks.map((t) => (
              <option key={t.task} value={t.task} disabled={!t.ready}>
                {t.label}
                {t.ready ? "" : " (à venir)"}
              </option>
            ))}
          </select>
        </label>
      </header>
      {error && <p className="ras-error">Impossible de charger le schéma : {error}</p>}
      {schema && (
        <>
          <p className="ras-lede">
            {schema.intro} Clique sur un modèle pour lire son instruction, et un exemple de ce qu'il reçoit et de ce
            qu'il répond.
          </p>
          <div className="ras-legend">
            <span>
              <i className="ras-swatch ras-model" />
              un modèle (cliquable)
            </span>
            <span>
              <i className="ras-swatch ras-code" />
              du code de l'application (pas un modèle)
            </span>
          </div>
          <div className="ras-flow">
            {schema.flow.map((row, i) => (
              <div key={i} className="ras-row-wrap">
                {i > 0 && <Arrows count={Math.max(row.length, schema.flow[i - 1].length)} />}
                <div className="ras-row" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                  {row.map((column, j) => (
                    <div key={j} className="ras-column">
                      {column.map((step) => (
                        <Step key={step.role} step={step} onOpen={(s, opener) => setOpened({ step: s, opener })} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="ras-notes">
            {schema.notes.map((note, i) =>
              typeof note === "string" ? (
                <p key={i}>{note}</p>
              ) : (
                <Step key={i} step={note} onOpen={(s, opener) => setOpened({ step: s, opener })} />
              ),
            )}
          </div>
        </>
      )}
      {opened && <PromptPanel step={opened.step} onClose={close} />}
    </section>
  );
}
