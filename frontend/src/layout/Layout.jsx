import { Link, Outlet } from "react-router-dom";
import { useConfig } from "../config/ConfigContext";
import "./Layout.css";

// Niveau utilisateur : donnée statique en attendant la Phase 3 (persistance backend)
const MOCK_NIVEAU = "0.01";

export default function Layout() {
  const { themeMode, setThemeMode } = useConfig();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="header-btn header-home">
          Accueil
        </Link>
        <Link to="/niveau" className="header-niveau">
          Niveau {MOCK_NIVEAU}
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
