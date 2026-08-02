import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useConfig } from "../config/ConfigContext";
import { getNiveau } from "../api/user";
import "./Layout.css";

export default function Layout() {
  const { themeMode, setThemeMode } = useConfig();
  const [niveau, setNiveau] = useState(null);
  const location = useLocation();

  // Layout reste monté d'une route à l'autre (Outlet), donc on recharge le
  // niveau à chaque changement de page plutôt qu'une seule fois au montage —
  // sinon un examen réussi ailleurs ne se reflèterait jamais ici sans reload.
  useEffect(() => {
    getNiveau().then(setNiveau);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="header-btn header-home">
          Accueil
        </Link>
        <Link to="/niveau" className="header-niveau">
          Niveau {niveau?.level ?? "…"}
        </Link>
        <button
          type="button"
          className="header-btn header-config"
          onClick={() => setThemeMode(themeMode === "light" ? "dark" : "light")}
          title="Configuration (placeholder Phase 9)"
        >
          {themeMode === "light" ? "🌙" : "☀️"}
        </button>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
