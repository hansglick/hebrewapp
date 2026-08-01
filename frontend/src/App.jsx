import { Routes, Route } from "react-router-dom";
import Layout from "./layout/Layout";
import Accueil from "./pages/Accueil";
import Placeholder from "./pages/Placeholder";
import ChapitresListScreen from "./pages/apprentissage/ChapitresListScreen";
import LeconsListScreen from "./pages/apprentissage/LeconsListScreen";
import LeconDetailScreen from "./pages/apprentissage/LeconDetailScreen";
import TexteScreen from "./pages/apprentissage/TexteScreen";
import RevisionsChoiceScreen from "./pages/revisions/RevisionsChoiceScreen";
import RacineScreen from "./pages/revisions/RacineScreen";
import BinyanScreen from "./pages/BinyanScreen";
import FunChoiceScreen from "./pages/fun/FunChoiceScreen";
import ExpressionScreen from "./pages/fun/ExpressionScreen";
import PresseScreen from "./pages/fun/PresseScreen";
import ChansonScreen from "./pages/fun/ChansonScreen";
import NiveauScreen from "./pages/NiveauScreen";
import MotScreen from "./pages/MotScreen";
import VerbeScreen from "./pages/VerbeScreen";
import EvaluationChoiceScreen from "./pages/apprentissage/EvaluationChoiceScreen";
import QuestionEcriteScreen from "./pages/QuestionEcriteScreen";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Accueil />} />
        <Route path="apprentissage" element={<ChapitresListScreen />} />
        <Route path="apprentissage/:chapId" element={<LeconsListScreen />} />
        <Route path="apprentissage/:chapId/:code" element={<LeconDetailScreen />} />
        <Route path="apprentissage/:chapId/:code/texte" element={<TexteScreen />} />
        <Route
          path="apprentissage/:chapId/:code/mots"
          element={<MotScreen defaultMode="exploration" />}
        />
        <Route
          path="apprentissage/:chapId/:code/verbes"
          element={<VerbeScreen defaultMode="exploration" />}
        />
        <Route
          path="apprentissage/:chapId/:code/evaluation"
          element={<EvaluationChoiceScreen />}
        />
        <Route
          path="apprentissage/:chapId/:code/questions-ecrites"
          element={<QuestionEcriteScreen />}
        />
        <Route path="revisions" element={<RevisionsChoiceScreen />} />
        <Route path="revisions/racine" element={<RacineScreen />} />
        <Route path="revisions/mot" element={<MotScreen defaultMode="revision" />} />
        <Route path="revisions/verbe" element={<VerbeScreen defaultMode="revision" />} />
        <Route path="racine/:shoresh" element={<RacineScreen />} />
        <Route path="examen" element={<Placeholder title="Examen" />} />
        <Route path="fun" element={<FunChoiceScreen />} />
        <Route path="fun/expressions" element={<ExpressionScreen />} />
        <Route path="fun/presse" element={<PresseScreen />} />
        <Route path="fun/chansons" element={<ChansonScreen />} />
        <Route path="niveau" element={<NiveauScreen />} />
        <Route path="binyans" element={<BinyanScreen />} />
        <Route path="binyans/:nom" element={<BinyanScreen />} />
      </Route>
    </Routes>
  );
}

export default App;
