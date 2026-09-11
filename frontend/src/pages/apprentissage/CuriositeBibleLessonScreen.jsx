import { useParams } from "react-router-dom";
import CuriositeScreen from "../fun/CuriositeScreen";

// "Bible" du Coin culture fast : fusionne récit du Tanakh + citation +
// proverbe en un seul ensemble parcourable, sans distinction affichée entre
// les trois — cf. demande explicite du user.
export default function CuriositeBibleLessonScreen() {
  const { code } = useParams();
  return <CuriositeScreen types={["recit", "tanakh", "proverb"]} lessonCode={code} />;
}
