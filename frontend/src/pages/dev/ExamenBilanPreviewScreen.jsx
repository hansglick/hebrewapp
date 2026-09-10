import { ExamenBilanScreen } from "../examen/ExamenBilanScreen";

// Écran de développement : affiche l'écran de transition montré après la
// réussite d'UN SEUL des deux examens (écrit ou oral) d'une leçon, avant
// que le niveau ne soit débloqué (ExamenBilanScreen, niveau_updated:false) —
// à ne pas confondre avec NiveauUpScreen (cf. /dev/niveau-up-preview),
// l'écran de célébration affiché une fois les DEUX examens réussis. Ici :
// écrit réussi à l'instant, oral pas encore tenté. `code`/`finalResult`
// sont fictifs ; `onRetour` ne fait rien de plus (pas de navigation), cf.
// demande explicite du user. Accessible uniquement en tapant l'URL
// (/dev/examen-bilan-preview).
export default function ExamenBilanPreviewScreen() {
  return (
    <ExamenBilanScreen
      code="0.07"
      finalResult={{
        current: { exam_type: "ecrit", average_note: 4.2, success_ratio: 0.8, passed: true },
        niveau_updated: false,
        attempt_id: 123,
        history: {
          ecrit: [
            { id: 101, passed: false },
            { id: 102, passed: false },
            { id: 103, passed: true },
          ],
          oral: [
            { id: null, passed: null },
            { id: null, passed: null },
            { id: null, passed: null },
          ],
        },
        attempts_remaining_ecrit: 2,
        attempts_remaining_oral: 3,
      }}
      onRetour={() => {}}
    />
  );
}
