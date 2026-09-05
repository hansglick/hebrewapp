import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getNotifications } from "../api/user";
import { retryOralGroupedBatch } from "../api/gemini";
import "./screens.css";

function formatDate(sqliteDatetime) {
  // Cf. WaitingVideo/ExamenEcritScreen : SQLite renvoie une heure UTC sans
  // indicateur de fuseau, le "Z" est nécessaire pour un affichage local correct.
  const date = new Date(`${sqliteDatetime.replace(" ", "T")}Z`);
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState(null);
  // Id de notification -> "sending" | "queued" | erreur (string) — état du
  // bouton "Relancer" inline, cf. demande explicite du user (bouton
  // directement sur la notification, pas un écran séparé).
  const [retryState, setRetryState] = useState({});

  useEffect(() => {
    getNotifications().then(setNotifications);
  }, []);

  async function handleRetry(notification) {
    const { batch_id } = notification.action_payload;
    setRetryState((s) => ({ ...s, [notification.id]: "sending" }));
    try {
      await retryOralGroupedBatch(batch_id);
      setRetryState((s) => ({ ...s, [notification.id]: "queued" }));
    } catch (e) {
      setRetryState((s) => ({ ...s, [notification.id]: e.message }));
    }
  }

  return (
    <section className="screen">
      <h1>Notifications</h1>

      {notifications === null && <p className="muted">Chargement...</p>}

      {notifications && notifications.length === 0 && <p className="muted">Aucune notification pour l'instant.</p>}

      {notifications && notifications.length > 0 && (
        <div className="tile-list">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="card"
              style={{
                textAlign: "start",
                ...(n.pinned ? { border: "2px solid var(--danger)" } : {}),
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontWeight: n.pinned || !n.read ? 700 : 400,
                  color: n.pinned ? "var(--danger)" : "var(--text)",
                }}
              >
                {n.message}
              </p>
              {n.created_at && (
                <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.75em" }}>
                  {formatDate(n.created_at)}
                </p>
              )}
              {n.link && (
                <Link to={n.link} className="link-btn" style={{ display: "inline-block", marginTop: 6 }}>
                  Voir →
                </Link>
              )}
              {n.action === "retry_oral_grouped" && (
                <>
                  {retryState[n.id] === "queued" ? (
                    <p className="muted" style={{ margin: "6px 0 0", fontStyle: "italic", fontSize: "0.85em" }}>
                      Relance lancée — tu seras notifié du résultat.
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="exam-tile green"
                      style={{ marginTop: 6, width: "auto", cursor: "pointer" }}
                      disabled={retryState[n.id] === "sending"}
                      onClick={() => handleRetry(n)}
                    >
                      {retryState[n.id] === "sending" ? "Relance en cours..." : "Relancer l'évaluation"}
                    </button>
                  )}
                  {retryState[n.id] && retryState[n.id] !== "sending" && retryState[n.id] !== "queued" && (
                    <p className="muted" style={{ margin: "6px 0 0", color: "var(--danger)", fontSize: "0.85em" }}>
                      {retryState[n.id]}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
