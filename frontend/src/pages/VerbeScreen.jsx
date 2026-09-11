import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getRandomVerbe, getBinyan, getRacine } from "../api/content";
import { getNiveau, createEvaluation, markObjectSeen } from "../api/user";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import { ActionHints } from "../components/ActionHints";
import { BottomNavBar } from "../components/BottomNavBar";
import { SpeakerIcon } from "../components/SpeakerIcon";
import { RacineCard } from "../components/RacineCard";
import { SectionTitle } from "../components/QuoteBlock";
import { PageTurnCurl, PAGE_TURN_TOTAL_DURATION_MS } from "../components/PageTurnCurl";
import { PerfStat } from "../components/PerfStat";
import { QuestionMarkIcon } from "../components/QuestionMarkIcon";
import "./screens.css";

const TEMPS_LABELS = [
  { key: "past", label: "passé" },
  { key: "present", label: "présent" },
  { key: "futur", label: "futur" },
];

// shinletter.png (backend/results/logos) est un pictogramme noir plein —
// même technique de masque CSS et même taille (22px) que MotScreen — /1.125
// annule le zoom ambiant à cet endroit (1.5 de .screen * 0.75 du wrapper
// hero) pour que la taille RENDUE soit identique à l'écran révision/mot
// (aucun zoom là-bas), cf. demande explicite du user.
// Gris (pas noir) — cf. demande explicite du user, les 3 logos (haut-
// parleur/bet/shin) du bloc 1 doivent être gris.
const ICONS_GRAY = "var(--textSecondary)";

// * 0.75 : réduit de 25% (cf. demande explicite du user).
const shinIconStyle = {
  display: "inline-block",
  width: "calc(22px * 0.75 / 1.125)",
  height: "calc(22px * 0.75 / 1.125)",
  backgroundColor: ICONS_GRAY,
  WebkitMaskImage: "url(/shinletter.png)",
  maskImage: "url(/shinletter.png)",
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
};

// betletter.png (backend/results/logos) : même technique que
// shinIconStyle, mais PAS la même taille de boîte — les deux images
// sources font 512x512, mais l'encre du "ב" y occupe une bbox de hauteur
// 472px contre 408px pour le "ש" (mesuré via Pillow) : à boîte égale, le
// bet rendait donc ~16% plus grand que le shin malgré un mask-size:contain
// identique — cf. bug rapporté par le user. width/height réduits dans le
// même rapport (408/472) pour rendre une encre de même hauteur ; comme les
// deux images partagent le même canevas 512x512, ce même rapport aligne
// aussi leurs coiffes (calculé puis vérifié en direct via Claude in
// Chrome).
const betIconStyle = {
  ...shinIconStyle,
  // * 0.75 : réduit de 25% (cf. demande explicite du user).
  width: "calc(19.02px * 0.75 / 1.125)",
  height: "calc(19.02px * 0.75 / 1.125)",
  WebkitMaskImage: "url(/betletter.png)",
  maskImage: "url(/betletter.png)",
};

// Même pastille numérotée que les titres des blocs audio des questions
// orales / de l'écran révision/mot (cf. MotScreen.jsx::StepBadge, même
// taille/police) — cf. demande explicite du user ("conserve le même
// format que dans l'écran révision/mot").
const STEP_BADGE_SIZE = 25;
function StepBadge({ number, background, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: STEP_BADGE_SIZE,
        height: STEP_BADGE_SIZE,
        borderRadius: "50%",
        background,
        color,
        fontSize: "0.9375em",
        fontWeight: 700,
        marginRight: 12,
        flexShrink: 0,
      }}
    >
      {number}
    </span>
  );
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function VerbeScreen() {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const [niveau, setNiveau] = useState(null);
  // Exploration : sélection manuelle du temps via les tuiles (inchangé).
  // Révision : tiré au hasard automatiquement à chaque nouveau verbe, cf.
  // demande explicite du user (plus de tuiles à choisir, comme l'écran Mot).
  const [temps, setTemps] = useState("present");
  const [personneKey, setPersonneKey] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [binyanOpen, setBinyanOpen] = useState(false); // pilote l'animation "tapis" (cf. toggleBinyanInline)
  const [binyanDetails, setBinyanDetails] = useState(null);
  const [racineOpen, setRacineOpen] = useState(false); // pilote l'animation "tapis" (cf. toggleRacineInline)
  const [racineDetails, setRacineDetails] = useState(null);
  const [pulse, setPulse] = useState(null); // "success" | "danger" | null
  const [flip, setFlip] = useState(null); // { dir, verbe, phase: "start" | "animating" }
  const flipTimeoutRef = useRef(null);
  const badge1Ref = useRef(null);
  // Force PerfBubble à recalculer son % juste après chaque évaluation
  // envoyée — cf. demande explicite du user ("en direct").
  const [perfVersion, setPerfVersion] = useState(0);

  // Le mode découle du chemin d'accès, cf. MotScreen.
  const mode = code ? "exploration" : "revision";

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = code ?? niveau?.reference_lesson;

  const { current: verbe, next, back } = useRandomBrowser(
    (prevVerbe, seen) =>
      lessonCode ? getRandomVerbe(lessonCode, mode, prevVerbe?.key, seen) : Promise.resolve(null),
    [lessonCode, mode]
  );

  // Remonte le bloc 1 de moitié par rapport à la bordure inférieure de la
  // barre de contrôle — cf. demande explicite du user. Un décalage fixe en
  // px (essayé d'abord) ne marche QUE pour la taille d'écran où il a été
  // mesuré : l'écart naturel (dû au centrage vertical "safe center" de
  // page-turn-card) dépend de la hauteur de fenêtre disponible, donc un
  // même nombre de px produit un écart bien trop petit — voire un
  // chevauchement avec le bandeau — sur un écran plus petit, ou un
  // rognage du haut du mot si posé directement sur le premier enfant (cf.
  // bug rapporté par le user). Mesurer l'écart NATUREL (marginTop remis à
  // 0) puis poser marginTop = -écart donne EXACTEMENT la moitié quelle que
  // soit la fenêtre (démonstration : avec ce choix, la nouvelle position
  // du premier enfant = écart_naturel/2, cf. la façon dont "safe center"
  // répartit un changement de hauteur totale pour moitié en haut/moitié
  // en bas). useLayoutEffect (pas useEffect) : le double set de style se
  // fait avant la peinture du navigateur, donc invisible (pas de flash).
  useLayoutEffect(() => {
    if (mode !== "revision") return;
    const el = badge1Ref.current;
    const header = document.querySelector(".app-header");
    if (!el || !header) return;
    // Mesurer sur la PASTILLE elle-même (le rond "1"), pas sur le div
    // englobant : ce dernier démarre plus haut que le rond visible (une
    // fois centré par SectionTitle), ce qui faussait le calcul (mesuré
    // via Claude in Chrome : ~34px d'écart entre les deux).
    function badgeCircle() {
      return (
        [...el.querySelectorAll("span")].find((s) => getComputedStyle(s).borderRadius === "50%") ||
        el.querySelector("span")
      );
    }
    function apply() {
      el.style.marginTop = "0px";
      const badge = badgeCircle();
      const card = el.closest(".page-turn-card");
      if (!badge || !card) return;
      const gap = badge.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
      if (gap <= 0) return; // déjà collé en haut ("safe"), rien à réduire
      el.style.marginTop = `${-gap}px`;
      // Garde-fou : le vrai risque de rognage n'est pas un chevauchement
      // avec le bandeau (mauvais test utilisé dans une version précédente,
      // cf. bug "pastille tronquée" avec Chrome DevTools ouvert — fenêtre
      // réduite, donc écart naturel plus petit) mais que la pastille se
      // retrouve rendue AU-DESSUS du propre haut de page-turn-card : ce
      // conteneur est en overflowY:auto avec scrollTop bloqué à 0, donc
      // tout ce qui dépasse par le haut devient invisible et inatteignable
      // au scroll. Vérifié après coup, annulé (retour à 0) si c'est le
      // cas plutôt que de deviner une autre valeur.
      if (badge.getBoundingClientRect().top < card.getBoundingClientRect().top) {
        el.style.marginTop = "0px";
      }
    }
    apply();
    // Repasse une fois après la peinture (requestAnimationFrame) : rattrape
    // un éventuel réagencement tardif (police système substituée puis
    // remplacée, image d'icône chargée après coup) que la mesure
    // synchrone du useLayoutEffect aurait pu manquer.
    const raf = requestAnimationFrame(apply);
    window.addEventListener("resize", apply);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", apply);
    };
    // temps/personneKey : cet effet tournait AVANT que l'effet séparé qui
    // les tire au hasard (même changement de verbe) n'ait eu le temps de
    // s'exécuter — mesuré via Claude in Chrome : la mise en page du bloc 2
    // change entre les deux, donc l'écart "naturel" mesuré ici était celui
    // de l'état transitoire (temps="present" par défaut, personne encore
    // vide), pas celui du rendu final — cf. bug rapporté par le user.
  }, [mode, verbe, temps, personneKey]);

  function pickRandomPersonne(t) {
    const keys = Object.keys(verbe.conjugaisons?.[t] ?? {});
    return keys.length ? keys[Math.floor(Math.random() * keys.length)] : null;
  }

  // Un temps au hasard parmi ceux qui ont réellement des conjugaisons pour
  // ce verbe (sinon on retomberait souvent sur "indisponible pour ce
  // verbe") — si aucun n'en a, retombe sur la liste complète plutôt que de
  // planter.
  function pickRandomTemps() {
    const disponibles = TEMPS_LABELS.filter(
      (t) => Object.keys(verbe.conjugaisons?.[t.key] ?? {}).length > 0
    );
    const pool = disponibles.length ? disponibles : TEMPS_LABELS;
    return pool[Math.floor(Math.random() * pool.length)].key;
  }

  useEffect(() => {
    if (!verbe) return;
    setRevealed(false);
    setBinyanDetails(null);
    setBinyanOpen(false);
    setRacineDetails(null);
    setRacineOpen(false);
    setPulse(null);
    if (mode === "revision") {
      const t = pickRandomTemps();
      setTemps(t);
      setPersonneKey(pickRandomPersonne(t));
    } else {
      setTemps("present");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verbe]);

  // Progression d'exploration de la leçon (cf. GET /api/lecons/{code}/
  // exploration) : "vu" quel que soit le mode.
  useEffect(() => {
    if (verbe) markObjectSeen({ objectType: "verbe", objectKey: verbe.key });
  }, [verbe]);

  // La fiche binyan/racine se déroule comme un tapis directement sous la
  // rangée d'icônes (même principe que MotScreen::toggleRacineInline) —
  // racineOpen/binyanOpen (booléens, pilotent l'animation) sont dissociés
  // des données elles-mêmes (gardées en mémoire même une fois refermées) :
  // sans cette séparation, refermer effacerait les données instantanément
  // et démonterait la fiche avant que l'animation de fermeture n'ait eu le
  // temps de jouer.
  function toggleBinyanInline() {
    if (binyanOpen) {
      setBinyanOpen(false);
      return;
    }
    getBinyan(verbe.binyan).then((data) => {
      setBinyanDetails(data);
      setBinyanOpen(true);
    });
  }

  function toggleRacineInline() {
    if (racineOpen) {
      setRacineOpen(false);
      return;
    }
    if (verbe.racine) getRacine(verbe.racine).then((data) => {
      setRacineDetails(data);
      setRacineOpen(true);
    });
  }

  // Sélection manuelle du temps — exploration seulement (cf. tuiles).
  function openTemps(t) {
    setTemps(t);
    setRevealed(false);
    setPulse(null);
  }

  // Anime brièvement le bouton choisi avant de passer au verbe suivant,
  // cf. MotScreen::handleEvaluate. startFlip("next") avant next() : même
  // animation "tourner la page" que le bouton next de la barre de
  // contrôle — cf. demande explicite du user.
  function handleEvaluate(success) {
    setPulse(success ? "success" : "danger");
    createEvaluation({
      objectType: "verbe",
      objectKey: `${verbe.key}|${temps}|${personneKey}`,
      success,
    }).then(() => {
      setPerfVersion((v) => v + 1);
      setTimeout(() => {
        setPulse(null);
        startFlip("next");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, revealed, personneKey]);

  // Animation "tourner la page" (cf. PageTurnCurl, déjà appliquée aux
  // mots/curiosités) — leçon ET révisions, cf. demande explicite du user
  // ("tous les objets présents dans révisions qui sont itérables") — et
  // uniquement quand on change vraiment de VERBE (pas quand "précédent" ne
  // fait que désélectionner le temps affiché en exploration).
  function startFlip(dir) {
    if (flip || !verbe) return;
    // Capture le marginTop ACTUELLEMENT appliqué à la pastille 1 (posé
    // dynamiquement par le useLayoutEffect plus haut) et le fige dans le
    // snapshot "page sortante" : ce rendu-là est un DOM tout neuf (isBase
    // à false, l'effet ne le touche jamais, cf. son commentaire), donc
    // sans ce figeage, il démarrerait sans le décalage, provoquant un saut
    // visible des éléments de la page de départ juste avant que
    // l'animation ne démarre — cf. bug rapporté par le user.
    const badge1MarginTop = mode === "revision" ? badge1Ref.current?.style.marginTop || undefined : undefined;
    setFlip({ dir, verbe, badge1MarginTop, phase: "start" });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlip((f) => (f ? { ...f, phase: "animating" } : f));
      });
    });
    clearTimeout(flipTimeoutRef.current);
    flipTimeoutRef.current = setTimeout(() => setFlip(null), PAGE_TURN_TOTAL_DURATION_MS);
  }

  // Sur le tout premier verbe de la session (pas encore d'historique), back()
  // ne fait rien plutôt que de sortir de l'écran (navigate(-1)) : previous/
  // next ne doivent jamais faire quitter le type d'objet parcouru, cf.
  // demande explicite du user. "Précédent" passe directement au verbe
  // précédent (plus d'étape intermédiaire de désélection du temps en
  // exploration) : le useEffect ci-dessus (déclenché par le changement de
  // `verbe`) retombe toujours sur "present" en exploration, jamais sur
  // aucun temps sélectionné — cf. demande explicite du user.
  function goPrevious() {
    if (flip) return;
    const moved = back();
    if (moved) startFlip("prev");
  }
  function goNext() {
    if (flip) return;
    startFlip("next");
    next();
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
    onSpace: mode === "revision" && temps && !revealed ? () => setRevealed(true) : undefined,
  });

  if (!verbe) return null;

  // Rendu du contenu d'un verbe donné — utilisé pour la page au repos et,
  // via PageTurnCurl, pour la page "sortante" pendant l'animation. Le hero
  // (verbe + haut-parleur/binyan/racine, fiches "tapis" incluses) est
  // partagé entre les deux modes ; la suite diverge : exploration garde
  // son sélecteur de temps par tuiles + liste complète des conjugaisons
  // (inchangé), révision adopte la structure "3 blocs" inspirée de
  // l'écran révision/mot (pastilles + titres + traits), cf. demande
  // explicite du user.
  function renderVerbeCard(cardVerbe, isBase = false, frozenBadge1MarginTop) {
    const conjugaisonsTemps = temps ? cardVerbe.conjugaisons?.[temps] : null;
    const tempsLabel = TEMPS_LABELS.find((t) => t.key === temps)?.label ?? "";
    const personneLabel = conjugaisonsTemps?.[personneKey]?.personne ?? "";

    return (
      <div
        className="page-turn-card"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--bg)",
          overflowY: "auto",
          backfaceVisibility: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          // flex-start (pas "safe center") dès qu'une fiche binyan/racine
          // est dépliée : "safe center" n'est pas fiable en pratique
          // (constaté en émulation mobile DevTools, cf. capture jointe par
          // le user sur MotScreen — même conteneur, même défaut) — le
          // centrage continue de pousser le haut ET le bas du contenu hors
          // de l'écran, avec ce conteneur en overflowY:auto rendant le
          // haut inaccessible au scroll. "center" simple tant que les deux
          // fiches sont fermées. "safe center" (pas "center" simple) tant
          // que les deux fiches sont fermées : ce conteneur est en
          // overflowY:auto avec scrollTop bloqué à 0 (cf. plus haut), donc
          // un "center" simple qui déborderait rendrait le haut du contenu
          // invisible et inatteignable au scroll — cf. bug rapporté par le
          // user (verbe hébreu tronqué en haut alors qu'aucune fiche
          // n'était ouverte).
          justifyContent: racineOpen || binyanOpen ? "flex-start" : "safe center",
          gap: 16,
          boxSizing: "border-box",
          // /1.5 : compense le zoom ambiant de .screen (ce conteneur est
          // à l'intérieur), sans quoi ce padding rendrait à 1.5x sa valeur
          // — garantit que la dernière conjugaison reste visible au-dessus
          // de la barre de contrôle inférieure au lieu d'être masquée par
          // elle, cf. bug rapporté par le user.
          paddingBottom: "calc(var(--bottom-nav-height) * 2 / 1.5)",
        }}
      >
        {/* Pastille "1" + titre, uniquement en révision — même format que
            l'écran révision/mot (StepBadge/SectionTitle, largeur 70%/400
            alignée sur les traits) — cf. demande explicite du user. */}
        {mode === "revision" && (
          // Même structure EXACTE (un seul div width+zoom) que les
          // pastilles 2/3 ci-dessous : un wrapper extérieur séparé pour le
          // marginBottom cassait le width:70% (containing block indéfini
          // -> "Conjugue le verbe" repassait à la ligne et la pastille ne
          // s'alignait plus avec les traits) — cf. bug rapporté par le
          // user. marginBottom calé en direct via Claude in Chrome.
          // ref badge1Ref UNIQUEMENT sur l'instance "base" (isBase) : le
          // marginTop de remontage est calculé et posé dynamiquement par
          // un useLayoutEffect plus haut. Cette fonction est aussi
          // appelée pour la page SORTANTE pendant l'animation "tourner la
          // page" (via PageTurnCurl) — un ref partagé s'accrochait à
          // l'instance rendue en dernier (souvent la sortante), et
          // l'effet réinitialisait alors son marginTop à 0 juste avant
          // l'animation, provoquant un saut visible des éléments de la
          // page de départ avant qu'elle ne se tourne — cf. bug rapporté
          // par le user. Pour la page sortante (isBase=false), le
          // marginTop figé au moment du clic (frozenBadge1MarginTop) est
          // posé directement en style : ce rendu est un DOM tout neuf que
          // l'effet ne touche jamais, donc sans ce figeage il démarrerait
          // sans décalage (position "naturelle", plus basse) puis
          // sauterait visiblement à la position réellement affichée un
          // instant plus tôt — cf. bug rapporté par le user.
          <div
            ref={isBase ? badge1Ref : undefined}
            style={{
              width: "70%",
              maxWidth: 400,
              display: "flow-root",
              zoom: 1 / 1.5,
              marginBottom: -11,
              ...(isBase ? null : { marginTop: frozenBadge1MarginTop }),
            }}
          >
            <SectionTitle fontSize="0.84em" color="#9ca3af" fontWeight={400}>
              <StepBadge number={1} background="#dbeafe" color="#1d4ed8" />
              Conjugue le verbe
            </SectionTitle>
          </div>
        )}

        {/* Hero (verbe hébreu + haut-parleur/binyan/racine) — partagé par
            les deux modes. zoom:0.75 : réduit de 25% ce bloc (verbe +
            logos), cf. demande explicite du user antérieure — ne s'applique
            plus à la traduction française ni aux tuiles de temps,
            désormais hors de ce bloc (révision) ou gérées séparément
            (exploration). */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, zoom: 0.75 }}>
          {/* 2.925em (même valeur que MotScreen::renderRevisionMot pour le
              mot hébreu) / 1.125 pour annuler le zoom ambiant à cet
              endroit (1.5 de .screen * 0.75 de ce wrapper) : la taille de
              police rendue doit être identique à l'écran révision/mot
              (aucun zoom là-bas, même contexte de police parent 18px),
              cf. demande explicite du user. */}
          {/* Non gras + gris clair en révision/renforcer uniquement (reste
              gras et couleur par défaut en exploration/apprentissage) —
              #9ca3af (pas var(--textSecondary), trop foncé) : plus clair
              que le gris standard de l'app, cf. demande explicite du user. */}
          <h1
            className="hebrew"
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: "calc(2.925em / 1.125)",
              color: mode === "revision" ? "var(--textPrimary)" : undefined,
            }}
          >
            {cardVerbe.pure}
          </h1>

          {/* SpeakerIcon size=24 : /1.125 annule le zoom ambiant (1.5*0.75)
              pour rendre à 27px, taille exacte de l'écran révision/mot —
              cf. demande explicite du user. Binyan représenté par le logo
              betletter.png (même technique/taille que shinIconStyle, noir
              plein) — pas une pastille ni une lettre en texte — cf.
              demande explicite du user. */}
          {/* gap:2 (8px par défaut de .hebrew-word-row -> 4 -> 2, réduit de
              50% à chaque demande explicite du user) : override en inline
              uniquement ici (pas la classe partagée, utilisée aussi par
              MotScreen). Masqué en révision/renforcer (reste affiché en
              exploration/apprentissage) — cf. demande explicite du user. */}
          {mode !== "revision" && (
            <span className="hebrew-word-row" style={{ justifyContent: "center", gap: 2 }}>
              {/* padding:0 : chaque <button> a un padding par défaut du
                  navigateur (~6px de chaque côté) qui dominait largement le
                  `gap` ci-dessus et rendait le rapprochement invisible —
                  mesuré via Claude in Chrome (padding 6px + gap 2px +
                  padding 6px = 14px, quasi inchangé malgré le gap réduit) —
                  cf. bug rapporté par le user. */}
              <button
                type="button"
                className="speak-btn"
                style={{ padding: 0 }}
                onClick={() => speak(cardVerbe.pure)}
              >
                {/* size=18 (24*0.75) : réduit de 25% (cf. demande explicite
                    du user). */}
                <SpeakerIcon color={ICONS_GRAY} size={18} />
              </button>
              <button type="button" className="speak-btn" style={{ padding: 0 }} onClick={toggleBinyanInline}>
                <span style={betIconStyle} />
              </button>
              <button type="button" className="speak-btn" style={{ padding: 0 }} onClick={toggleRacineInline}>
                <span style={shinIconStyle} />
              </button>
            </span>
          )}

          {mode === "exploration" && (
            <p
              style={{
                margin: 0,
                fontStyle: "italic",
                fontWeight: 400,
                fontSize: "0.6em",
                color: "var(--textSecondary)",
              }}
            >
              {capitalize(cardVerbe.traduction)}
            </p>
          )}
        </div>

        {/* Fiches binyan/racine "tapis" — SORTIES du bloc zoom:0.75
            ci-dessus (sinon leur zoom de compensation devrait annuler
            0.75*1.5 au lieu de 1.5, cf. régression corrigée) — même
            technique que la fiche racine de MotScreen (grid-template-rows
            0fr<->1fr + overflow hidden), cf. demande explicite du user.
            marginTop (zoom:1.5 ambiant de .screen) : remonte ce bloc et
            tout ce qui suit (fiche racine, tuiles temps, conjugaisons) pour
            réduire l'écart entre le verbe traduit en français et les
            tuiles temps — déjà réduit de 50% une première fois (77.4px ->
            38.7px), puis à nouveau de 50% ici (38.7px -> 19.35px, mesuré
            via Claude in Chrome) — cf. demande explicite du user. Note :
            "redescendre le hero" (marginTop positif posé sur le bloc du
            haut) a été essayé et NE marche PAS pour cet objectif — testé
            en direct dans le navigateur, ça déplace le hero ET les tuiles
            temps de la même distance (tout le groupe glisse ensemble sous
            "safe center"), donc l'écart entre les deux ne change pas ; seul
            resserrer CET écart précis (ce marginTop négatif) le réduit
            réellement. */}
        <div
          style={{
            width: "100%",
            display: "grid",
            gridTemplateRows: binyanOpen ? "1fr" : "0fr",
            transition: "grid-template-rows 300ms ease",
            marginTop: -38.7,
          }}
        >
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            {binyanDetails && (
              <div style={{ paddingTop: 14, paddingBottom: 14 }}>
                {/* zoom:1/1.5 annule le zoom:1.5 de .screen, cf. demande
                    explicite du user (même taille que sur les autres
                    écrans, non affectée par l'agrandissement du verbe). */}
                <div className="card" style={{ textAlign: "center", zoom: 1 / 1.5 }}>
                  <p className="hebrew-large" style={{ margin: 0, color: binyanDetails.color }}>
                    {binyanDetails.text}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {binyanDetails.sens}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            width: "100%",
            display: "grid",
            gridTemplateRows: racineOpen ? "1fr" : "0fr",
            transition: "grid-template-rows 300ms ease",
          }}
        >
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            {racineDetails && (
              <div style={{ paddingTop: 14, paddingBottom: 14 }}>
                <div style={{ zoom: 1 / 1.5 }}>
                  <RacineCard racine={racineDetails} />
                </div>
              </div>
            )}
          </div>
        </div>

        {mode === "exploration" ? (
          <>
            <div className="toggle-group" style={{ marginTop: binyanDetails || racineDetails ? 28 : 6, zoom: 0.6 }}>
              {TEMPS_LABELS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  style={{
                    fontWeight: 700,
                    ...(temps === t.key ? { border: "3px solid #000" } : undefined),
                  }}
                  onClick={() => openTemps(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <hr
              style={{
                width: "75%",
                maxWidth: 240,
                border: "none",
                borderTop: "1px solid var(--cardBorder)",
                margin: 0,
                marginTop: 1,
              }}
            />

            {temps && !conjugaisonsTemps && (
              <p className="muted" style={{ fontStyle: "italic" }}>
                Conjugaison indisponible pour ce verbe.
              </p>
            )}

            {temps && conjugaisonsTemps &&
              Object.values(conjugaisonsTemps).map((c, i) => (
                <div
                  key={c.personne}
                  style={{
                    marginBottom: "0.448em",
                    ...(i === 0 ? { marginTop: 1 } : {}),
                  }}
                >
                  <p
                    className="hebrew-large"
                    style={{
                      margin: 0,
                      color: "var(--textPrimary)",
                      fontWeight: 600,
                      fontSize: "calc(var(--font-size-hebrew-large) * 0.48)",
                    }}
                  >
                    {c.conjugaison}
                  </p>
                  <p
                    className="muted"
                    style={{ margin: "2px 0 0", fontStyle: "italic", fontSize: "0.49em" }}
                  >
                    {capitalize(c.personne)}
                  </p>
                </div>
              ))}
          </>
        ) : (
          <>
            {/* Première ligne horizontale du bloc révision supprimée — test
                visuel, cf. demande explicite du user. */}

            {/* Temps + personne, séparés par un trait fin vertical
                discret gris — cf. demande explicite du user. Police même
                taille/format que le mot traduit en français de l'écran
                révision/mot (fontSize:1.3em, var(--textSecondary)), mais
                SANS italique — cf. demande explicite du user. /1.5 :
                annule le zoom ambiant ici (le bloc 2 n'est pas dans le
                wrapper hero à zoom:0.75, donc l'ambiant est 1.5 et non
                1.125) pour rendre à la même taille absolue que l'écran
                révision/mot (23.4px, aucun zoom là-bas). */}
            {/* Non gras, gris clair #9ca3af (même gris que le verbe hébreu
                du bloc 1, pas var(--textSecondary) — trop foncé) — cf.
                demande explicite du user. */}
            {/* marginTop:-3.44 (zoom:1.5 ambiant de .screen) : ce bloc était
                trop remonté (chevauchait littéralement le verbe hébreu du
                bloc 1, un précédent -26.74 s'est avéré excessif) — remonté
                pour laisser un léger espace (~15px) au lieu d'un
                chevauchement, mesuré via Claude in Chrome — cf. demande
                explicite du user. */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: -3.44 }}>
              {/* 0.64 = 0.8 * 0.8 : -20% supplémentaires — cf. demande
                  explicite du user. */}
              <span style={{ fontSize: "calc(1.3em * 0.64 / 1.5)", color: "var(--textPrimary)", fontWeight: 700 }}>
                {capitalize(tempsLabel)}
              </span>
              <span style={{ width: 1, height: "1.2em", background: "var(--cardBorder)" }} />
              {/* 0.64 = 0.8 * 0.8 : -20% supplémentaires — cf. demande
                  explicite du user. */}
              <span style={{ fontSize: "calc(1.3em * 0.64 / 1.5)", color: "var(--textPrimary)", fontWeight: 700 }}>
                {capitalize(personneLabel)}
              </span>
            </div>

            {/* marginTop calé pour équidistance entre "la forme" (bloc 2)
                et la pastille 3 (bloc 1) — cf. demande explicite du user. */}
            <div style={{ width: "70%", maxWidth: 400, marginTop: -5.47 }}>
              <hr
                style={{
                  border: "none",
                  borderTop: "1px solid var(--cardBorder)",
                  margin: 0,
                }}
              />
            </div>

            {/* Pastille "2" (vert pastel, renumérotée après la suppression
                de l'ancienne pastille "2" "À la forme" — cf. demande
                explicite du user) + titre "Réponse". marginTop:20.99 :
                augmente de 150% l'écart avec le trait au-dessus (18px ->
                45px, mesuré via Claude in Chrome) en descendant ce bloc —
                cf. demande explicite du user. zoom:1/1.5 sur ce div annule
                le zoom ambiant de .screen (1.5) pour son propre rendu, donc
                ce marginTop s'applique en 1:1 (pas de facteur x1.5), contrairement
                aux marginTop posés directement dans l'ambiant (ex: la
                rangée temps/personne juste au-dessus). */}
            <div style={{ width: "70%", maxWidth: 400, marginTop: 20.99, display: "flow-root", zoom: 1 / 1.5 }}>
              <SectionTitle fontSize="0.84em" color="#9ca3af" fontWeight={400}>
                <StepBadge number={2} background="var(--validationGrisee)" color="var(--validationPleine)" />
                Réponse
              </SectionTitle>
            </div>

            {!conjugaisonsTemps ? (
              <p className="muted" style={{ fontStyle: "italic" }}>
                Conjugaison indisponible pour ce verbe.
              </p>
            ) : (
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
                    {/* 48*0.75/1.5 : 48/1.5 annule le zoom ambiant de
                        .screen (le bloc 3 n'est pas dans le wrapper hero à
                        zoom:0.75, l'ambiant vaut donc 1.5 ici) pour rendre
                        à 48px (taille de l'écran révision/mot), *0.75
                        réduit ensuite de 25% — cf. demande explicite du
                        user. Fond #9ca3af : même gris que le verbe hébreu
                        du bloc 1 — cf. demande explicite du user. */}
                    <QuestionMarkIcon
                      size={(48 * 0.75) / 1.5}
                      background="var(--textPrimary)"
                      style={{ display: "block" }}
                    />
                  </button>
                </div>

                <div
                  style={{
                    gridArea: "1 / 1",
                    visibility: revealed ? "visible" : "hidden",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    // gap:13 calé (mesuré via Claude in Chrome) pour égaler
                    // l'écart mesuré sur l'écran révision/mot entre le mot
                    // traduit en français et les logos ✗/✓ (21px) — cf.
                    // demande explicite du user.
                    gap: 13,
                  }}
                >
                  {/* Même taille/couleur que "la forme" du bloc 2, puis
                      +25% (calc ... * 1.25) — cf. demande explicite du
                      user. className="hebrew" (pas "hebrew-large") : garde
                      la police hébraïque sans le fontSize/direction
                      imposés par cette classe, qui écraseraient la taille
                      voulue ici. */}
                  <p className="hebrew" style={{ margin: 0, fontSize: "calc(1.3em * 1.25 / 1.5)", color: "var(--textPrimary)", fontWeight: 700 }}>
                    {conjugaisonsTemps[personneKey]?.conjugaison}
                  </p>
                  <div style={{ display: "flex", gap: 0 }}>
                    <button
                      type="button"
                      className={`eval-btn danger${pulse === "danger" ? " pulse" : ""}`}
                      onClick={() => handleEvaluate(false)}
                    >
                      {/* 36/1.5 : annule le zoom ambiant de .screen (le
                          bloc 3 n'est pas dans le wrapper hero à
                          zoom:0.75) pour rendre à 36px, taille exacte de
                          l'écran révision/mot (aucun zoom là-bas) — cf.
                          demande explicite du user. */}
                      <img src="/wrong.png" alt="Faux" width={36 / 1.5} height={36 / 1.5} draggable={false} />
                    </button>
                    <button
                      type="button"
                      className={`eval-btn success${pulse === "success" ? " pulse" : ""}`}
                      onClick={() => handleEvaluate(true)}
                    >
                      <img src="/right.png" alt="Vrai" width={36 / 1.5} height={36 / 1.5} draggable={false} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Alignée sous le point d'interrogation / la solution révélée,
                justifiée à droite pour que la fin de la chaîne coïncide
                avec l'extrémité droite du trait — cf. demande explicite du
                user. zoom:1/1.5 annule le zoom ambiant de .screen. */}
            <div style={{ width: "70%", maxWidth: 400, zoom: 1 / 1.5, marginTop: -6 }}>
              <PerfStat objectType="verbe" refreshKey={perfVersion} />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
    {/* zoom:1.5 sur .screen : le contenu (cf. renderVerbeCard) est agrandi
        de 50%, hors barres de contrôle (rendues hors de cette section,
        cf. plus bas). flex:1 sur le conteneur de pivot ci-dessous : porte
        l'animation "tourner la page" au changement de verbe (leçon ET
        révisions, cf. startFlip). */}
    <section className="screen" style={{ zoom: 1.5 }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} digits={mode === "revision" && !!temps && revealed} />

      <div style={{ position: "relative", flex: 1, width: "100%", perspective: 1600, overflow: "hidden" }}>
        {renderVerbeCard(verbe, true)}
        {flip && (
          <PageTurnCurl
            dir={flip.dir}
            phase={flip.phase}
            renderPage={() => renderVerbeCard(flip.verbe, false, flip.badge1MarginTop)}
          />
        )}
      </div>
    </section>
    <BottomNavBar onPrevious={goPrevious} onNext={goNext} />
    </>
  );
}
