import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getHealth } from "../api/client";

const CHOICES = [
  { to: "/apprentissage", label: "Apprentissage" },
  { to: "/revisions", label: "Révisions" },
  { to: "/examen", label: "Examen" },
  { to: "/fun", label: "Fun !" },
];

export default function Accueil() {
  const [backendStatus, setBackendStatus] = useState("…");

  useEffect(() => {
    getHealth()
      .then(() => setBackendStatus("connecté"))
      .catch(() => setBackendStatus("indisponible"));
  }, []);

  return (
    <section>
      <h1>Accueil</h1>
      <p style={{ fontSize: "0.8em", color: "var(--textMuted)" }}>
        Backend : {backendStatus}
      </p>
      <nav style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {CHOICES.map((choice) => (
          <Link key={choice.to} to={choice.to}>
            {choice.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
