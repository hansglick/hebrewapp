import { WaitingVideo } from "../../components/WaitingVideo";

// Écran de développement, sans équivalent dans les menus de l'app : affiche
// exactement l'écran vu par le user pendant l'évaluation groupée d'un
// examen (n'importe lequel — rapide/long/très long/hard partagent tous ce
// même composant WaitingVideo), sans avoir à réellement passer un examen
// pour la voir — cf. demande explicite du user. Accessible uniquement en
// tapant l'URL (/dev/waiting-preview).
export default function WaitingPreviewScreen() {
  return (
    <section className="screen" style={{ paddingBottom: "calc(var(--bottom-nav-height) * 2)" }}>
      <WaitingVideo
        label={
          <>
            Patientez quelques instants, votre professeur évalue votre copie
            <br />
            (question 3 / 25)
          </>
        }
      />
    </section>
  );
}
