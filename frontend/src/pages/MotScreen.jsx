import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { getRandomMot, getRacine } from "../api/content";
import { getNiveau, createEvaluation, markObjectSeen } from "../api/user";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import { ActionHints } from "../components/ActionHints";
import { BottomNavBar } from "../components/BottomNavBar";
import { SpeakerIcon } from "../components/SpeakerIcon";
import { RacineCard } from "../components/RacineCard";
import "./screens.css";

export default function MotScreen() {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
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
    (prevMot, seen) => (lessonCode ? getRandomMot(lessonCode, mode, prevMot?.key, seen) : Promise.resolve(null)),
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

  // Sur le tout premier mot de la session (pas encore d'historique), back()
  // ne fait rien plutôt que de sortir de l'écran (navigate(-1)) : previous/
  // next ne doivent jamais faire quitter le type d'objet parcouru, cf.
  // demande explicite du user.
  function goPrevious() {
    back();
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
    <section className="screen" style={{ paddingBottom: "calc(var(--bottom-nav-height) * 2)", flex: 1 }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} digits={mode === "revision" && revealed} />
      <BottomNavBar onPrevious={goPrevious} onNext={goNext} />


      {/* flex:1 (plutôt que minHeight:60vh, qui ne remplit pas forcément
          tout l'espace réellement disponible) : remplit toute la hauteur
          restante de .app-content — déjà sous le bandeau immuable, exclu
          par la mise en page flex parente — pour un centrage vertical
          exact sur cet espace, cf. demande explicite du user. */}
      {mode === "exploration" && (
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
            {/* Le mot hébreu est toujours au-dessus du trait, le mot
                français toujours en dessous — cf. demande explicite du
                user (retour à cette disposition). */}
            <span className="hebrew" style={{ fontWeight: 700, fontSize: "2.925em" }}>
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

            <span style={{ fontStyle: "italic", fontSize: "1.3em", color: "var(--textMuted)" }}>{mot.french}</span>

            {/* position:absolute (au lieu d'un enfant normal du flex
                column) : n'affecte donc jamais la position des éléments
                ci-dessus. marginTop:14 restitue l'espace du gap perdu (les
                éléments absolus ne comptent pas dans le gap du flex
                parent) au-dessus du marginTop:40 propre à RacineCard, pour
                garder le même espacement qu'avant ce changement — cf.
                demande explicite du user ("espace nécessaire... une
                certaine harmonie"). */}
            {/* paddingBottom (pas marginBottom) sur ce wrapper position:absolute
                lui-même — pas sur .screen — car un élément absolument
                positionné qui déborde de la hauteur "en flux" de ses
                ancêtres n'est rattrapé par la zone défilable du document
                QUE via son propre padding (sa marge de fin, elle, ne compte
                pas) : un paddingBottom ajouté ailleurs (.screen) ne repousse
                jamais la vraie fin de page au-delà de CE bloc, cf. bug
                rapporté par le user (encadré racine coupé par la barre). */}
            {racineDetails && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "100%",
                  marginTop: 14,
                  paddingBottom: "calc(var(--bottom-nav-height) * 2)",
                }}
              >
                <RacineCard racine={racineDetails} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reprend très exactement la structure/les tailles de l'écran
          d'exploration (leçon/mot) ci-dessus — mot hébreu, rangée d'icônes,
          trait, mot français — plutôt qu'un ancien habillage zoom:2 propre
          à cet écran : polices/logos/tailles doivent être strictement les
          mêmes une fois la solution affichée, cf. demande explicite du
          user. Seule différence : le mot français et le trait sont
          remplacés par un badge "?" tant que la solution n'est pas
          révélée. */}
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
          <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <span className="hebrew" style={{ fontWeight: 700, fontSize: "2.925em" }}>
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

            {/* Zone de révélation à hauteur fixe (même technique que
                QuestionEcriteScreen) : le "?" et la réponse occupent la même
                cellule de grille (l'un en visibility:hidden), donc la
                hauteur de la cellule ne varie jamais selon `revealed` — le
                mot hébreu et le trait au-dessus ne bougent ainsi jamais lors
                de la révélation, cf. demande explicite du user. `?` et
                boutons ✗/✓ n'ont pas d'équivalent en exploration : tailles
                reprises telles quelles de QuestionEcriteScreen (même
                mécanique de révélation, déjà calibrée sans zoom). Pas de
                marginTop ici : l'espace trait -> contenu révélé doit être
                le même que celui entre le badge "ש" et le trait au-dessus
                (le gap:14 du conteneur flex parent), cf. demande explicite
                du user. */}
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
                    style={{ background: "#000", fontWeight: 700, fontSize: "1.4em", padding: "10px 24px" }}
                  >
                    ?
                  </span>
                </button>
              </div>

              {/* gap:40 (au lieu de 14) : même espace mot français -> logos
                  que révisions/traduction (phrase traduite -> logos), cf.
                  demande explicite du user. */}
              <div
                style={{
                  gridArea: "1 / 1",
                  visibility: revealed ? "visible" : "hidden",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 40,
                }}
              >
                <span style={{ fontStyle: "italic", fontSize: "1.3em", color: "var(--textMuted)" }}>{mot.french}</span>
                {/* wrong.png/right.png (au lieu des glyphes ✗/✓ texte) —
                    cf. demande explicite du user. className danger/success
                    conservée (couleur du bouton lui-même, pas de l'image)
                    pour que le halo .pulse (box-shadow en currentColor)
                    continue de fonctionner sans changement. */}
                <div style={{ display: "flex", gap: 0 }}>
                  <button
                    type="button"
                    className={`eval-btn danger${pulse === "danger" ? " pulse" : ""}`}
                    onClick={() => handleEvaluate(false)}
                  >
                    <img src="/wrong.png" alt="Faux" width={36} height={36} draggable={false} />
                  </button>
                  <button
                    type="button"
                    className={`eval-btn success${pulse === "success" ? " pulse" : ""}`}
                    onClick={() => handleEvaluate(true)}
                  >
                    <img src="/right.png" alt="Vrai" width={36} height={36} draggable={false} />
                  </button>
                </div>
              </div>
            </div>

            {racineDetails && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "100%",
                  marginTop: 14,
                  paddingBottom: "calc(var(--bottom-nav-height) * 2)",
                }}
              >
                <RacineCard racine={racineDetails} />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
