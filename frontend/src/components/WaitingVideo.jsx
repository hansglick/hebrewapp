import { useEffect, useRef, useState } from "react";
import { getWaitingVids, getRandomChanson } from "../api/content";
import { dataMediaUrl } from "../api/media";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { BottomNavBar } from "./BottomNavBar";
import { ChansonWaitingCard } from "./ChansonWaitingCard";
import "./WaitingVideo.css";

// Icône UI statique servie depuis frontend/public/ (pas via mediaUrl/le
// backend) : backend/results/ est gitignored et jamais déployé.
const MUSIC_ICON_URL = "/musique.png";

// Joue en boucle une vidéo tirée au hasard parmi backend/data/waiting_vids,
// pendant l'attente d'une réponse Gemini (remplace l'ancien EnvelopeLoader).
// `label` permet de personnaliser le texte (ex: progression d'un traitement
// par lot) ; pour tirer une NOUVELLE vidéo à chaque requête d'un lot, le
// parent doit changer la prop `key` à chaque étape (force un vrai remount,
// le tirage n'a lieu qu'au montage). Une tuile permet de basculer vers
// ChansonWaitingCard (chanson aléatoire avec vidéo YouTube) pour patienter
// autrement, sans jamais masquer le message d'attente au-dessus — cf.
// demande explicite du user.
export function WaitingVideo({ label = "Patientez quelques instants ..." }) {
  const [filename, setFilename] = useState(null);
  const [ready, setReady] = useState(false);
  const [chansons, setChansons] = useState(false);
  const videoRef = useRef(null);

  // Levé ici (plutôt que dans ChansonWaitingCard) pour que la barre de
  // contrôle inférieure (next/previous), rendue par ce composant, pilote
  // la même chanson que la carte — cf. demande explicite du user.
  const { current: chanson, next: nextChanson, back: backChanson } = useRandomBrowser(getRandomChanson);

  // Garde d'annulation nécessaire à cause de StrictMode (main.jsx) : en dev,
  // React monte chaque composant deux fois exprès (mount -> unmount simulé
  // -> remount) pour détecter les effets mal nettoyés. Sans elle, les DEUX
  // montages lancent chacun leur getWaitingVids() et tirent un fichier au
  // hasard indépendamment ; la réponse la plus lente écrase alors `filename`
  // avec un tirage différent, remplaçant la vidéo déjà en train de jouer.
  useEffect(() => {
    let cancelled = false;
    getWaitingVids()
      .then((files) => {
        if (!cancelled && files.length > 0) {
          setFilename(files[Math.floor(Math.random() * files.length)]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setReady(false);
  }, [filename]);

  // L'attribut HTML autoPlay seul ne déclenche pas de façon fiable le
  // chargement/la lecture d'une <video> insérée dynamiquement par React
  // (contrairement à AudioPlayer, qui appelle explicitement .play()) — on
  // force nous-mêmes la lecture une fois l'élément monté. On repose aussi
  // `muted` directement sur l'élément avant .play() : React peut poser cet
  // attribut trop tard par rapport à notre appel, ce qui fait échouer
  // silencieusement l'autoplay (Chrome exige muted=true au moment de play()).
  useEffect(() => {
    if (!filename) return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.play().catch(() => {});
  }, [filename]);

  return (
    <>
      {/* Le texte s'affiche toujours, y compris en mode chansons : le user
          doit continuer à voir que sa copie est en cours d'évaluation, cf.
          demande explicite du user. */}
      <p className="muted" style={{ fontStyle: "italic", fontSize: "0.75em" }}>
        {label}
      </p>

      {chansons ? (
        <>
          <ChansonWaitingCard chanson={chanson} />
          <BottomNavBar onPrevious={backChanson} onNext={nextChanson} />
        </>
      ) : (
        <>
          {/* La tuile doit être au-dessus de la vidéo (pas en dessous), cf.
              demande explicite du user. */}
          <button
            type="button"
            className="waiting-video-chansons-tile"
            onClick={() => setChansons(true)}
          >
            <img className="waiting-video-chansons-icon" src={MUSIC_ICON_URL} alt="" />
            <span className="waiting-video-chansons-label">Patienter en chansons</span>
          </button>

          {filename && (
            <video
              ref={videoRef}
              src={dataMediaUrl(`waiting_vids/${filename}`)}
              autoPlay
              loop
              muted
              playsInline
              width="280"
              // Le rectangle noir de fond (background) restait visible avant que
              // la première frame ne soit décodée — on le masque (opacity 0)
              // jusqu'à l'évènement "loadeddata" pour ne montrer la vidéo qu'une
              // fois réellement prête à s'afficher, jamais un cadre noir vide.
              onLoadedData={() => setReady(true)}
              style={{
                borderRadius: 8,
                width: 280,
                height: "auto",
                background: "#000",
                opacity: ready ? 1 : 0,
                transition: "opacity 0.15s",
              }}
            />
          )}
        </>
      )}
    </>
  );
}
