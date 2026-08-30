import { useParams } from "react-router-dom";
import CuriositeScreen from "../fun/CuriositeScreen";

export default function CuriositeLessonScreen() {
  const { code, type } = useParams();
  return <CuriositeScreen type={type} lessonCode={code} />;
}
