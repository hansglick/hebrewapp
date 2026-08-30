import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getNotifications } from "../api/user";
import "./screens.css";

function formatDate(sqliteDatetime) {
  // Cf. WaitingVideo/ExamenEcritScreen : SQLite renvoie une heure UTC sans
  // indicateur de fuseau, le "Z" est nécessaire pour un affichage local correct.
  const date = new Date(`${sqliteDatetime.replace(" ", "T")}Z`);
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState(null);

  useEffect(() => {
    getNotifications().then(setNotifications);
  }, []);

  return (
    <section className="screen">
      <h1>Notifications</h1>

      {notifications === null && <p className="muted">Chargement...</p>}

      {notifications && notifications.length === 0 && <p className="muted">Aucune notification pour l'instant.</p>}

      {notifications && notifications.length > 0 && (
        <div className="tile-list">
          {notifications.map((n) => (
            <div key={n.id} className="card" style={{ textAlign: "start" }}>
              <p style={{ margin: 0, fontWeight: n.read ? 400 : 700, color: "var(--text)" }}>{n.message}</p>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.75em" }}>
                {formatDate(n.created_at)}
              </p>
              {n.link && (
                <Link to={n.link} className="link-btn" style={{ display: "inline-block", marginTop: 6 }}>
                  Collection
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
