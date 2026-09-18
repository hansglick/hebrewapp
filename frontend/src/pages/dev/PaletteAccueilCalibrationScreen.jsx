import { useEffect, useRef, useState } from "react";
import { appConfig } from "../../config/appConfig";
import "../screens.css";

const STORAGE_KEY = "dev-palette-accueil-v1";

// 10 emplacements de couleur groupés en 3 parties (control barre / main
// space / tuile), cf. demande explicite du user. Chaque slot porte :
// - `cssVar` : le nom de la variable CSS (--xxx) déjà utilisée aujourd'hui
//   par les éléments listés dans `items` (juste pour s'y retrouver, ces
//   éléments n'apparaissent pas forcément sur l'écran d'accueil).
// - `target` : où appliquer l'override dans l'iframe d'aperçu — "root"
//   (document.documentElement, la grande majorité des cas) ou un sélecteur
//   CSS plus spécifique quand DEUX slots différents partagent aujourd'hui
//   la MÊME variable CSS mais doivent rester calibrables indépendamment
//   (cf. "tuile / elements" ci-dessous, qui repose sur --textPrimary comme
//   "main space / police", mais scopé à .accueil-columns pour ne pas
//   changer aussi le titre) — la cascade CSS naturelle des custom
//   properties fait le reste (un override posé sur un descendant l'emporte
//   sur celui du :root pour ce sous-arbre). `null` = pas d'effet visuel
//   possible sur l'écran d'accueil (cf. demande explicite du user :
//   champ éditable et sauvegardé, mais sans aperçu).
const SLOTS = [
  {
    group: "Control barre",
    key: "cbBg",
    label: "Background",
    items: [],
    cssVar: "chromeBg",
    target: "root",
  },
  {
    group: "Control barre",
    key: "cbFirst",
    label: "First element",
    items: [
      "Chapter label",
      "House logo",
      "Culture logo",
      "Notification logo",
      "Archives logo",
      "Dictionnaire logo",
      "Thème (icône active)",
      "Police des options affichées dans config",
    ],
    cssVar: "chromeTextPrimary",
    target: "root",
    note: "La police des options du config modal n'est pas prévisualisable ici (modal non ouvert dans l'aperçu).",
  },
  {
    group: "Control barre",
    key: "cbSecond",
    label: "Second element",
    items: ["Roue config", "Liseret horizontaux", "Shekels logo", "Magen David logo"],
    cssVar: "logoAccent",
    target: "root",
  },
  {
    group: "Control barre",
    key: "cbSecondLight",
    label: "Second element light",
    items: ["Lesson index"],
    cssVar: "chromeTextSecondary",
    target: "root",
  },
  {
    group: "Main space",
    key: "msBg",
    label: "Background",
    items: [],
    cssVar: "bg",
    target: "root",
  },
  {
    group: "Main space",
    key: "msPolice",
    label: "Police",
    items: ["Titre"],
    cssVar: "textPrimary",
    target: "root",
  },
  {
    group: "Main space",
    key: "msSecondPolice",
    label: "Second police",
    items: ["Sous-titre"],
    cssVar: "textSecondary",
    target: "root",
  },
  {
    group: "Main space",
    key: "msElementsClair",
    label: "Elements clair",
    items: ["Trait horizontal", "Logo haut-parleur", "Logo shinletter"],
    cssVar: null,
    target: "none",
    note: "Aucun de ces éléments n'apparaît sur l'écran d'accueil — pas d'aperçu visuel possible ici.",
  },
  {
    group: "Tuile",
    key: "tlBg",
    label: "Background",
    items: [],
    cssVar: "cardBg",
    target: "root",
  },
  {
    group: "Tuile",
    key: "tlElements",
    label: "Elements",
    items: ["Police", "Logos"],
    cssVar: "textPrimary",
    target: ".accueil-columns",
  },
];

function getCurrentAppValues() {
  const light = appConfig.theme.light;
  return {
    cbBg: light.chromeBg,
    cbFirst: light.chromeTextPrimary,
    cbSecond: light.logoAccent,
    cbSecondLight: light.chromeTextSecondary,
    msBg: light.bg,
    msPolice: light.textPrimary,
    msSecondPolice: light.textSecondary,
    // Représente aujourd'hui 3 variables différentes (cardBorder,
    // speakerIcon, accent) — choix arbitraire de cardBorder ("trait
    // horizontal", premier élément cité) faute de valeur unique existante.
    msElementsClair: light.cardBorder,
    tlBg: light.cardBg,
    tlElements: light.textPrimary,
  };
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function loadInitialColors() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && SLOTS.every((s) => typeof saved[s.key] === "string")) return saved;
  } catch {
    // ignore, retombe sur les valeurs actuelles de l'app
  }
  return getCurrentAppValues();
}

export default function PaletteAccueilCalibrationScreen() {
  const [colors, setColors] = useState(loadInitialColors);
  const [panelOpen, setPanelOpen] = useState(true);
  const iframeRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  }, [colors]);

  function applyAll() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    for (const slot of SLOTS) {
      if (!slot.cssVar || !HEX_RE.test(colors[slot.key])) continue;
      const el = slot.target === "root" ? doc.documentElement : doc.querySelector(slot.target);
      el?.style.setProperty(`--${slot.cssVar}`, colors[slot.key]);
    }
  }

  // Ré-applique à chaque changement de couleur, et aussi via un
  // MutationObserver sur le document de l'iframe : l'écran d'accueil réel
  // (getNiveau/getOnboardingStatus) met un instant à se monter après le
  // chargement de l'iframe (retourne null tant que les données ne sont pas
  // là), donc .accueil-columns n'existe pas forcément encore au moment du
  // "load" — l'observer réapplique dès qu'il apparaît.
  useEffect(() => {
    applyAll();
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const observer = new MutationObserver(applyAll);
    observer.observe(doc.body, { childList: true, subtree: true });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors]);

  function setColor(key, value) {
    setColors((prev) => ({ ...prev, [key]: value }));
  }

  function resetToCurrentAppValues() {
    setColors(getCurrentAppValues());
  }

  const groups = ["Control barre", "Main space", "Tuile"];

  return (
    <section className="screen" style={{ maxWidth: "none", width: "100%", alignItems: "stretch" }}>
      <h1>Calibration palette — Accueil</h1>
      <p className="muted" style={{ margin: "-8px 0 8px", textAlign: "center" }}>
        Les changements ci-dessous ne s'appliquent qu'à l'aperçu de l'écran d'accueil affiché dans cette page —
        jamais au reste de l'application.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, width: "100%", justifyContent: "center", alignItems: "flex-start" }}>
        <iframe
          ref={iframeRef}
          src="/"
          title="Aperçu écran d'accueil"
          onLoad={applyAll}
          style={{ width: 480, height: 760, border: "1px solid var(--cardBorder)", borderRadius: 10, flexShrink: 0 }}
        />

        <div style={{ width: "100%", maxWidth: 420, flexShrink: 0 }}>
          <button type="button" className="exam-tile green" style={{ cursor: "pointer", marginBottom: 12 }} onClick={resetToCurrentAppValues}>
            Assigner les couleurs actuelles de l'app
          </button>
          <button
            type="button"
            className="link-btn"
            style={{ display: "block", marginBottom: 16 }}
            onClick={() => setPanelOpen((o) => !o)}
          >
            {panelOpen ? "Replier la palette" : "Ouvrir la palette"}
          </button>

          {panelOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {groups.map((group) => (
                <div key={group} className="card" style={{ width: "100%", maxWidth: "none", textAlign: "start" }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{group}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                    {SLOTS.filter((s) => s.group === group).map((slot) => (
                      <div key={slot.key}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <input
                            type="color"
                            value={HEX_RE.test(colors[slot.key]) ? colors[slot.key] : "#000000"}
                            onChange={(e) => setColor(slot.key, e.target.value)}
                            style={{ width: 32, height: 32, padding: 0, border: "1px solid var(--cardBorder)", borderRadius: 6, cursor: "pointer" }}
                          />
                          <input
                            type="text"
                            value={colors[slot.key]}
                            onChange={(e) => setColor(slot.key, e.target.value)}
                            style={{ width: 100, fontSize: "0.9em" }}
                          />
                          <span style={{ fontSize: "0.9em" }}>{slot.label}</span>
                        </div>
                        {slot.items.length > 0 && (
                          <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.75em" }}>
                            {slot.items.join(" · ")}
                          </p>
                        )}
                        {slot.note && (
                          <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.75em", fontStyle: "italic" }}>
                            {slot.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
