import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getRandomMot, getRacine } from "../api/content";
import { getNiveau, createEvaluation, markObjectSeen } from "../api/user";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import { ActionHints } from "../components/ActionHints";
import { NextPrevButtons } from "../components/NextPrevButtons";
import { SpeakerIcon } from "../components/SpeakerIcon";
import { RacineCard } from "../components/RacineCard";
import { PoolBadge } from "../components/PoolBadge";
import "./screens.css";

export default function MotScreen() {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const navigate = useNavigate();
  const location = useLocation();
  const [niveau, setNiveau] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [racineDetails, setRacineDetails] = useState(null);
  const [pulse, setPulse] = useState(null); // "success" | "danger" | null

  // Le mode découle du chemin d'accès : apprentissage (code présent) parcourt
  // simplement la liste ordonnée de la leçon ; révisions (code absent) tire
  // selon la difficulté/récence. Ce n'est plus un choix utilisateur — le
  // raccourci "révisions" existe justement pour réviser sans dépendre d'une
  // leçon précise.
  const mode = code ? "exploration" : "revision";

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = code ?? niveau?.reference_lesson;

  // Si on revient d'un écran racine (flèche gauche), location.state.restoreMot
  // contient le mot exact quitté — évite de retomber sur un tirage aléatoire.
  // Tant qu'on restaure, on fige lessonCode dans les deps : sinon la
  // résolution asynchrone de `niveau` (undefined -> valeur réelle, juste
  // après le montage) déclenche un second effet qui écraserait la
  // restauration par un tirage aléatoire. `mode` reste réactif : un
  // changement manuel de mode doit toujours déclencher un nouveau tirage.
  const restoreMot = location.state?.restoreMot;
  const browserDeps = restoreMot ? ["__restore__", mode] : [lessonCode, mode];

  const { current: mot, next, back } = useRandomBrowser(
    (prevMot) => (lessonCode ? getRandomMot(lessonCode, mode, prevMot?.key) : Promise.resolve(null)),
    browserDeps,
    restoreMot
  );

  // La fiche racine s'affiche directement sous la paire de mots (exploration
  // et révision) plutôt que de naviguer vers un écran séparé.
  function toggleRacineInline() {
    if (racineDetails) {
      setRacineDetails(null);
      return;
    }
    if (mot.racine) getRacine(mot.racine).then(setRacineDetails);
  }

  useEffect(() => {
    setRevealed(false);
    setRacineDetails(null);
    setPulse(null);
  }, [mot]);

  // Progression d'exploration de la leçon (cf. GET /api/lecons/{code}/
  // exploration) : "vu" quel que soit le mode, indépendant du useEffect
  // ci-dessus.
  useEffect(() => {
    if (mot) markObjectSeen({ objectType: "mot", objectKey: mot.key });
  }, [mot]);

  // Anime brièvement le bouton choisi avant de passer au mot suivant, pour
  // que le user perçoive bien son choix (surtout via les raccourcis clavier
  // 1/0 qui n'ont pas de retour visuel de "clic").
  function handleEvaluate(success) {
    setPulse(success ? "success" : "danger");
    createEvaluation({ objectType: "mot", objectKey: `${mot.key}|${mot.langue}`, success }).then(() => {
      setTimeout(() => {
        setPulse(null);
        next();
      }, 350);
    });
  }

  useEffect(() => {
    if (mode !== "revision" || !revealed) return;
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "1") handleEvaluate(true);
      else if (e.key === "0") handleEvaluate(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, revealed, mot]);

  function goPrevious() {
    if (!back()) navigate(-1);
  }
  function goNext() {
    next();
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
    onSpace:
      mode === "exploration"
        ? toggleRacineInline
        : !revealed
        ? () => setRevealed(true)
        : undefined,
  });

  if (!mot) return null;

  return (
    <section className="screen" style={{ paddingBottom: 80, flex: 1 }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} digits={mode === "revision" && revealed} />
      <NextPrevButtons onPrevious={goPrevious} onNext={goNext} />

      {mode === "revision" && (
        <div style={{ marginTop: -20 }}>
          <PoolBadge pool={mot.pool} chapter={mot.chapter} lesson={mot.lesson} />
        </div>
      )}

      {mode === "exploration" && (
        <div
          style={{
            minHeight: "60vh",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* position:relative isole ce groupe (mot hébreu/français, logos,
              trait) de la RacineCard ci-dessous : son apparition/disparition
              ne doit jamais faire bouger ces éléments, cf. demande
              explicite du user. */}
          {/* width:"100%" : sans elle, ce conteneur (position:relative)
              n'a que la largeur de son contenu (mot hébreu/français), donc
              le wrapper absolu de la RacineCard ci-dessous (width:"100%"
              relatif à CE conteneur) hériterait de cette même largeur
              étriquée au lieu de la pleine largeur d'écran dont elle
              disposait avant ce changement — cf. bug rapporté par le
              user. */}
          <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <span className="hebrew" style={{ fontWeight: 700, fontSize: "2.4375em" }}>
              {mot.original}
            </span>

            <span className="hebrew-word-row" style={{ justifyContent: "center" }}>
              <button type="button" className="speak-btn" onClick={() => speak(mot.original)}>
                <SpeakerIcon color="var(--text)" size={27} />
              </button>
              <button type="button" className="speak-btn" onClick={toggleRacineInline}>
                <span className="racine-badge" style={{ background: "#64748b", fontWeight: 700 }}>
                  ש
                </span>
              </button>
            </span>

            <hr
              style={{
                width: "70%",
                maxWidth: 400,
                border: "none",
                borderTop: "1px solid var(--border)",
                margin: 0,
              }}
            />

            <span style={{ fontStyle: "italic", fontSize: "1.625em", color: "var(--textMuted)" }}>{mot.french}</span>

            {/* position:absolute (au lieu d'un enfant normal du flex
                column) : n'affecte donc jamais la position des éléments
                ci-dessus. marginTop:14 restitue l'espace du gap perdu (les
                éléments absolus ne comptent pas dans le gap du flex
                parent) au-dessus du marginTop:40 propre à RacineCard, pour
                garder le même espacement qu'avant ce changement — cf.
                demande explicite du user ("espace nécessaire... une
                certaine harmonie"). */}
            {racineDetails && (
              <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: "100%", marginTop: 14 }}>
                <RacineCard racine={racineDetails} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Le zoom est posé sur un enfant interne (non flex:1) plutôt que sur
          ce conteneur lui-même : zoom perturbe le calcul flex-grow d'un
          item qui le porte directement (la boîte ne remplit alors plus
          l'espace disponible), d'où un bloc mal centré malgré
          justifyContent:center — cf. demande explicite du user ("encore
          une fois centre"). Séparer centrage (ici, sans zoom) et
          agrandissement (zoom, enfant) contourne le problème. */}
      {mode === "revision" && (
        <div
          style={{
            flex: 1,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
        <div
          style={{
            zoom: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            position: "relative",
          }}
        >
          {/* L'hébreu (mot.original) est toujours au-dessus du trait, le
              français (cible à deviner) toujours en dessous — cf. demande
              explicite du user. `mot.langue` reste sans effet sur la mise en
              page, seul handleEvaluate le garde pour le suivi de difficulté
              côté backend. */}
          <div style={{ zoom: 0.6, color: "var(--textMuted)" }}>
            <HebrewWordRow word={mot.original} onToggleRacine={toggleRacineInline} onSpeak={() => speak(mot.original)} />
          </div>

          <hr style={{ width: "70%", maxWidth: 400, border: "none", borderTop: "1px solid var(--border)", margin: 0 }} />

          {/* Zone de révélation à hauteur fixe (cf. même technique que
              QuestionEcriteScreen) : le "?" et la réponse occupent la même
              cellule de grille (l'un en visibility:hidden), donc la
              hauteur de la cellule ne varie jamais selon `revealed` — le
              mot hébreu et le trait au-dessus ne bougent ainsi jamais lors
              de la révélation, cf. demande explicite du user. Le "?"
              (aligné en haut de la cellule, alignItems:flex-start) reste au
              gap par défaut (equidistant du trait, comme l'hébreu au-dessus
              du trait) ; le marginTop négatif n'est appliqué qu'au bloc
              "révélé" : à distance de boîte égale, la police latine (mot
              français) laisse plus d'espace de ligne visible au-dessus du
              texte que la police hébraïque ou que le badge "?" — sans ce
              correctif le trait paraîtrait plus proche de l'hébreu/"?" que
              du mot français, cf. demandes explicites du user. */}
          <div style={{ display: "grid", justifyItems: "center" }}>
            <div
              style={{
                gridArea: "1 / 1",
                visibility: revealed ? "hidden" : "visible",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
              }}
            >
              <button type="button" className="speak-btn" onClick={() => setRevealed(true)} disabled={revealed}>
                <span
                  className="racine-badge"
                  style={{ background: "#000", fontWeight: 700, fontSize: "0.7em", padding: "5px 12px" }}
                >
                  ?
                </span>
              </button>
            </div>

            <div
              style={{
                gridArea: "1 / 1",
                visibility: revealed ? "visible" : "hidden",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                marginTop: -7,
              }}
            >
              <span style={{ fontWeight: 400, fontSize: "20px" }}>{mot.french}</span>
              <div style={{ display: "flex", gap: 0 }}>
                <button
                  type="button"
                  className={`eval-btn danger${pulse === "danger" ? " pulse" : ""}`}
                  onClick={() => handleEvaluate(false)}
                >
                  ✗
                </button>
                <button
                  type="button"
                  className={`eval-btn success${pulse === "success" ? " pulse" : ""}`}
                  onClick={() => handleEvaluate(true)}
                >
                  ✓
                </button>
              </div>
            </div>
          </div>

          {/* position:absolute (plutôt qu'un simple enfant du flex column) :
              son apparition/disparition ne doit jamais faire bouger le mot
              hébreu, le mot français ni le trait au-dessus — cf. demande
              explicite du user. Positionné juste sous cette boîte (top:100%,
              qui elle ne contient plus la RacineCard donc ne change jamais
              de hauteur). RacineCard fixe elle-même marginTop:40 sur sa
              racine — vu à travers le zoom:2 ambiant, l'annuler nécessite un
              zoom:1/2 imbriqué (net 1x, taille naturelle identique à l'écran
              d'exploration) ; marginTop:-10 sur le wrapper intermédiaire
              (donc vu à travers le zoom:2 ambiant, soit -20px réels) réduit
              de moitié l'espace au-dessus (40px -> 20px), cf. demande
              explicite du user précédente. */}
          {/* width fixée en CSS (cf. .mot-revision-racine, screens.css) et
              non ici : un style inline gagnerait toujours face à la règle
              @media, empêchant l'override mobile de jamais s'appliquer. */}
          {racineDetails && (
            <div
              className="mot-revision-racine"
              style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)" }}
            >
              <div style={{ marginTop: -10 }}>
                <div style={{ zoom: 1 / 2 }}>
                  <RacineCard racine={racineDetails} />
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      )}
    </section>
  );
}

function HebrewWordRow({ word, onToggleRacine, onSpeak, speakerSize = 27 }) {
  return (
    <span className="hebrew-word-row" style={{ fontSize: "var(--font-size-hebrew-large)" }}>
      <button type="button" className="speak-btn" onClick={onToggleRacine}>
        <span className="racine-badge" style={{ background: "#64748b", fontWeight: 700, fontSize: "0.506em" }}>
          ש
        </span>
      </button>
      <span style={{ color: "var(--textMuted)", fontWeight: 300, fontSize: "0.75em" }}>|</span>
      <span className="hebrew" style={{ fontWeight: 400 }}>{word}</span>
      <span style={{ color: "var(--textMuted)", fontWeight: 300, fontSize: "0.75em" }}>|</span>
      <button type="button" className="speak-btn" onClick={onSpeak}>
        <SpeakerIcon color="#64748b" size={speakerSize} />
      </button>
    </span>
  );
}
