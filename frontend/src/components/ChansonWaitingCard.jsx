import { youtubeEmbedUrl } from "../api/media";

// Chanson affichée dans un encadré compact pendant l'attente d'une
// correction Gemini, en alternative à la vidéo d'attente muette (cf.
// WaitingVideo, qui bascule vers ce composant sur clic de "Patienter en
// chansons" et pilote le tirage/la navigation — barre de contrôle
// inférieure next/previous — pour que ce composant reste purement
// présentationnel). La vidéo se relance automatiquement à chaque nouvelle
// chanson tirée — `key={chanson.url}` sur l'iframe force un vrai remount
// pour que `autoplay=1` reparte à chaque fois, un simple changement de
// `src` sur le même élément n'étant pas garanti de le faire.
export function ChansonWaitingCard({ chanson }) {
  if (!chanson) return null;

  return (
    <div className="card" style={{ textAlign: "center" }}>
      <h2 className="hebrew" style={{ margin: 0, fontSize: "1.1em" }}>
        {chanson.title_he}
      </h2>
      {chanson.title_fr && (
        <p className="muted" style={{ margin: "2px 0 10px", fontStyle: "italic", fontSize: "0.8em" }}>
          {chanson.title_fr}
        </p>
      )}
      <iframe
        key={chanson.url}
        src={`${youtubeEmbedUrl(chanson.url)}?autoplay=1`}
        title={chanson.title_he}
        allow="autoplay; encrypted-media"
        allowFullScreen
        style={{ width: "100%", aspectRatio: "16 / 9", border: "none", borderRadius: 8, display: "block" }}
      />
      <div
        style={{
          textAlign: "center",
          margin: "10px 0",
          userSelect: "text",
        }}
      >
        {chanson.lyrics.map((vers) => (
          <div key={vers.index} style={{ marginBottom: "0.7em" }}>
            <p className="hebrew" style={{ margin: 0, fontSize: "1.105em" }}>
              {vers.hebrew}
            </p>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.78em" }}>
              {vers.french}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
