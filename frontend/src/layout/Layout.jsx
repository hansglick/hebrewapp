import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { abandonExamen, abandonExamenHard, getActiveLockdown, getNiveau } from "../api/user";
import { getOnboardingStatus } from "../api/onboarding";
import { clearIdentity, getIdentity } from "../api/identity";
import OnboardingScreen from "../pages/onboarding/OnboardingScreen";
import SignInScreen from "../pages/onboarding/SignInScreen";
import { useWallet } from "../context/WalletContext";
import { getUnreadNotificationCount } from "../api/content";
import { DictionaryIcon } from "../components/DictionaryIcon";
import { HouseIcon } from "../components/HouseIcon";
import { DreidelIcon } from "../components/DreidelIcon";
import { NotificationIcon } from "../components/NotificationIcon";
import { ShekelIcon } from "../components/ShekelIcon";
import { MagenDavidIcon } from "../components/MagenDavidIcon";
import { GearIcon } from "../components/GearIcon";
import { ConfigModal } from "../components/ConfigModal";
import { SunIcon, MoonIcon } from "../components/SunMoonIcons";
import { SignOutIcon } from "../components/SignOutIcon";
import { useConfig } from "../config/ConfigContext";
import { useExamTimer } from "../context/ExamTimerContext";
import { displayLessonNumber } from "../utils/lessonDisplay";
import { ChapitreLogo } from "../components/ChapitreLogo";
import { displayChapitreLabel } from "../utils/chapitreDisplay";
import "../components/ConfigModal.css";
import "../pages/screens.css";
import "./Layout.css";

function formatTimer(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function lockdownTarget(lockdown) {
  if (!lockdown) return null;
  if (lockdown.format === "hard") return "/examen/hard/passer";
  return lockdown.format === "ecrit" ? `/examen/ecrite/${lockdown.code}` : `/examen/orale/${lockdown.code}`;
}

export default function Layout() {
  const [niveau, setNiveau] = useState(null);
  const [lockdown, setLockdown] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(null); // null = pas encore su
  // Porte d'entrée avant même l'onboarding : sans identité stockée
  // localement, le backend n'a aucun moyen de savoir quel compte servir
  // (plus de fallback implicite, cf. app.auth.get_current_user_id) — tant
  // qu'elle est fausse, aucun appel API scopé par utilisateur ne doit
  // partir (voir les gardes `hasIdentity &&` ci-dessous).
  const [hasIdentity, setHasIdentity] = useState(() => !!getIdentity());
  const { wallet, refreshWallet } = useWallet();
  const { themeMode, setThemeMode } = useConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const { timer } = useExamTimer();

  useEffect(() => {
    if (hasIdentity) getOnboardingStatus().then((s) => setNeedsOnboarding(s.needs_onboarding));
  }, [hasIdentity]);

  // Layout reste monté d'une route à l'autre (Outlet), donc on recharge le
  // niveau à chaque changement de page plutôt qu'une seule fois au montage —
  // sinon un examen réussi ailleurs ne se reflèterait jamais ici sans reload.
  // `needsOnboarding` en dépendance aussi : sa bascule à false (onboarding
  // terminé) ne change pas le pathname (toujours "/"), donc sans ça le
  // niveau affiché resterait celui d'avant l'examen d'entrée.
  useEffect(() => {
    if (hasIdentity) getNiveau().then(setNiveau);
  }, [location.pathname, needsOnboarding, hasIdentity]);

  // Referme le panneau mobile (compteurs/notifications/dictionnaire/thème)
  // dès qu'on change de page, pour ne pas le laisser ouvert par inadvertance.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Rafraîchi à chaque changement de route (couvre le retour depuis l'écran
  // de résultat d'un examen, qui vient de générer une notification) et sur
  // l'écran /notifications lui-même après consultation (marque tout comme lu
  // côté serveur, cf. getNotifications) pour faire retomber le badge.
  useEffect(() => {
    if (hasIdentity) getUnreadNotificationCount().then((r) => setUnreadCount(r.count));
  }, [location.pathname, needsOnboarding, hasIdentity]);

  // Vérifie l'existence d'une tentative d'examen long/très long en cours à
  // chaque changement de route (couvre aussi un refresh, qui remonte Layout
  // depuis zéro) — et en plus à intervalle régulier, car la fin d'un examen
  // (normale ou par abandon) ne change pas forcément de route (l'écran
  // reste sur place pour afficher son récapitulatif) : sans ce polling, le
  // texte "Abandonner l'épreuve" resterait affiché après coup.
  useEffect(() => {
    if (hasIdentity) getActiveLockdown().then(setLockdown);
  }, [location.pathname, needsOnboarding, hasIdentity]);

  useEffect(() => {
    if (!hasIdentity) return;
    const id = setInterval(() => {
      getActiveLockdown().then(setLockdown);
    }, 5000);
    return () => clearInterval(id);
  }, [hasIdentity]);

  // Chaque appel déclenche aussi côté serveur le tick d'inactivité (perte de
  // cartes, notifications de palier) — cf. app.wallet.tick_inactivite_et_notifications.
  useEffect(() => {
    if (hasIdentity) refreshWallet();
  }, [location.pathname, needsOnboarding, hasIdentity, refreshWallet]);

  useEffect(() => {
    if (!hasIdentity) return;
    const id = setInterval(refreshWallet, 30000);
    return () => clearInterval(id);
  }, [hasIdentity, refreshWallet]);

  // Tant qu'une tentative long/très long est en cours, toute navigation
  // ailleurs (manuelle ou via refresh) ramène immédiatement sur sa question
  // — `replace: true` pour ne pas polluer l'historique de rebonds.
  useEffect(() => {
    if (!lockdown) return;
    const target = lockdownTarget(lockdown);
    if (location.pathname !== target) navigate(target, { replace: true });
  }, [lockdown, location.pathname, navigate]);

  function handleLogout() {
    clearIdentity();
    setConfigOpen(false);
    setMobileMenuOpen(false);
    setHasIdentity(false);
    setNeedsOnboarding(null);
  }

  async function handleAbandon() {
    if (!lockdown) return;
    if (
      !window.confirm(
        "Abandonner l'épreuve ? Toutes les questions sans réponse recevront la note minimale (1)."
      )
    ) {
      return;
    }
    const result =
      lockdown.format === "hard" ? await abandonExamenHard() : await abandonExamen(lockdown.code, lockdown.format);
    const target = lockdownTarget(lockdown);
    setLockdown(null);
    navigate(target, { replace: true, state: { abandonResult: result } });
  }

  if (!hasIdentity) {
    return (
      <div className="app-shell">
        <main className="app-content">
          <SignInScreen onSignedIn={() => setHasIdentity(true)} />
        </main>
      </div>
    );
  }

  if (needsOnboarding === null) return null;

  if (needsOnboarding) {
    return (
      <div className="app-shell">
        <main className="app-content">
          <OnboardingScreen onCompleted={() => setNeedsOnboarding(false)} />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
        <div className="header-left">
          <div className="header-left-row">
            <button
              type="button"
              className="header-btn persistent-icon persistent-icon-house"
              onClick={() => navigate("/")}
              title="Accueil"
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              <HouseIcon size={24} color="#f3f4f6" mobileFillColor="#a9d6f5" />
            </button>
            <span className="header-divider" />
            {wallet && (
              <div className="wallet-strip hide-on-mobile">
                <button type="button" className="wallet-strip-item" onClick={() => navigate("/jeu")} title="Jeu">
                  <ShekelIcon size={24} color="#7dd3fc" /> {Math.round(wallet.points)}
                  <span className="exam-tile-tooltip">
                    Vous avez récolté {Math.round(wallet.points)} shekels
                  </span>
                </button>
                <button
                  type="button"
                  className="wallet-strip-item"
                  onClick={() => navigate("/jeu/cartes")}
                  title="Ma collection"
                >
                  <MagenDavidIcon size={24} color="#7dd3fc" /> {wallet.nombre_cartes}
                  <span className="exam-tile-tooltip">
                    Vous avez {wallet.nombre_cartes} cartes dans votre collection
                  </span>
                </button>
                <button type="button" className="wallet-strip-item" onClick={() => navigate("/jeu")} title="Jeu">
                  <span style={{ fontSize: 21, lineHeight: 1 }}>💎</span> {wallet.gems}
                  <span className="exam-tile-tooltip">Vous avez récolté {wallet.gems} gems</span>
                </button>
              </div>
            )}
          </div>
          {lockdown && (
            <button
              type="button"
              onClick={handleAbandon}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "#ff6b6b",
                fontSize: "0.75em",
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "start",
              }}
            >
              Abandonner l'épreuve
            </button>
          )}
        </div>
        <div className="header-center">
          <Link to="/niveau" className="header-niveau" style={{ display: "inline-flex", alignItems: "center" }}>
            {niveau?.level ? (
              <>
                <span
                  className="header-niveau-lesson-code"
                  style={{
                    fontStyle: "italic",
                    fontSize: "0.5em",
                    color: "var(--textMuted)",
                    marginInlineEnd: "0.6em",
                  }}
                >
                  {displayLessonNumber(niveau.level)}
                </span>{" "}
                {displayChapitreLabel(niveau.level.split(".")[0])}
                <ChapitreLogo chapId={niveau.level.split(".")[0]} size="2.4em" style={{ marginInlineStart: "-0.6em" }} />
              </>
            ) : (
              "…"
            )}
          </Link>
          {timer && (
            <div className={`header-timer${timer.isRed ? " header-timer-red" : ""}`}>
              {formatTimer(timer.remainingSeconds)}
            </div>
          )}
        </div>
        <div className="header-icons">
          <button
            type="button"
            className="header-btn hide-on-mobile"
            onClick={() => navigate("/notifications")}
            title="Notifications"
            style={{ display: "inline-flex", alignItems: "center", position: "relative" }}
          >
            <NotificationIcon size={27} color="#f3f4f6" />
            <span className="exam-tile-tooltip">Notifications</span>
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -6,
                  minWidth: 16,
                  height: 16,
                  padding: "0 3px",
                  borderRadius: 999,
                  background: "var(--danger)",
                  color: "#fff",
                  fontSize: "0.6em",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="header-btn hide-on-mobile"
            onClick={() => navigate("/dictionnaire")}
            title="Dictionnaire"
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <DictionaryIcon size={27} color="#f3f4f6" />
            <span className="exam-tile-tooltip">Dictionnaire</span>
          </button>
          <button
            type="button"
            className="header-btn persistent-icon persistent-icon-culture"
            onClick={() => navigate("/fun")}
            title="Culture"
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <DreidelIcon size={27} color="#f3f4f6" />
            <span className="exam-tile-tooltip">Portail de la culture judéo-israélienne</span>
          </button>
          <span className="header-divider" />
          <button
            type="button"
            className="header-btn hide-on-mobile"
            onClick={() => setConfigOpen(true)}
            title="Configuration"
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <GearIcon size={24} color="#7dd3fc" />
            <span className="exam-tile-tooltip">Configuration</span>
          </button>
          <button
            type="button"
            className="header-btn mobile-menu-btn persistent-icon-gear"
            onClick={() => setMobileMenuOpen((o) => !o)}
            title="Plus d'options"
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <GearIcon size={24} color="#7dd3fc" />
          </button>
          {mobileMenuOpen && (
            <>
              <div className="header-mobile-panel">
                {wallet && (
                  <>
                    <button type="button" className="header-mobile-panel-row" onClick={() => navigate("/jeu")}>
                      <ShekelIcon size={20} color="#7dd3fc" />
                      <span>{Math.round(wallet.points)} shekels</span>
                    </button>
                    <button
                      type="button"
                      className="header-mobile-panel-row"
                      onClick={() => navigate("/jeu/cartes")}
                    >
                      <MagenDavidIcon size={20} color="#7dd3fc" />
                      <span>{wallet.nombre_cartes} cartes</span>
                    </button>
                    <button type="button" className="header-mobile-panel-row" onClick={() => navigate("/jeu")}>
                      <span style={{ fontSize: 20, lineHeight: 1 }}>💎</span>
                      <span>{wallet.gems} gems</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="header-mobile-panel-row"
                  onClick={() => navigate("/notifications")}
                >
                  <NotificationIcon size={20} color="#f3f4f6" />
                  <span>Notifications{unreadCount > 0 ? ` (${unreadCount})` : ""}</span>
                </button>
                <button
                  type="button"
                  className="header-mobile-panel-row"
                  onClick={() => navigate("/dictionnaire")}
                >
                  <DictionaryIcon size={20} color="#f3f4f6" />
                  <span>Dictionnaire</span>
                </button>
                <div className="header-mobile-panel-row" style={{ justifyContent: "space-between" }}>
                  <span>Thème</span>
                  <div className="switch-wrap">
                    <SunIcon size={14} color={themeMode === "light" ? "#f3f4f6" : "#9ca3af"} />
                    <button
                      type="button"
                      className={`switch${themeMode === "dark" ? " on" : ""}`}
                      role="switch"
                      aria-checked={themeMode === "dark"}
                      aria-label="Basculer clair / sombre"
                      onClick={() => setThemeMode(themeMode === "light" ? "dark" : "light")}
                    >
                      <span className="switch-knob" />
                    </button>
                    <MoonIcon size={14} color={themeMode === "dark" ? "#f3f4f6" : "#9ca3af"} />
                  </div>
                </div>
                <button
                  type="button"
                  className="header-mobile-panel-row"
                  onClick={handleLogout}
                  style={{ justifyContent: "space-between" }}
                >
                  <span>Déconnexion</span>
                  <SignOutIcon size={20} color="#f3f4f6" />
                </button>
              </div>
            </>
          )}
        </div>
        </div>
      </header>
      {/* Rendu hors de <header> (zoomé, cf. Layout.css) : position:fixed
          calculerait ses coordonnées dans le référentiel déformé par le
          zoom ambiant sinon, cf. commentaire sur .app-header. */}
      {mobileMenuOpen && (
        <div className="header-mobile-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}
      <ConfigModal
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        onLogout={handleLogout}
      />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
