import { Routes, Route } from "react-router-dom";
import Layout from "./layout/Layout";
import Accueil from "./pages/Accueil";
import Placeholder from "./pages/Placeholder";
import ChapitresListScreen from "./pages/apprentissage/ChapitresListScreen";
import LeconsListScreen from "./pages/apprentissage/LeconsListScreen";
import LeconDetailScreen from "./pages/apprentissage/LeconDetailScreen";
import PdfScreen from "./pages/apprentissage/PdfScreen";
import TexteScreen from "./pages/apprentissage/TexteScreen";
import CuriositeListScreen from "./pages/apprentissage/CuriositeListScreen";
import CuriositeLessonScreen from "./pages/apprentissage/CuriositeLessonScreen";
import RevisionsChoiceScreen from "./pages/revisions/RevisionsChoiceScreen";
import QuizzScreen from "./pages/revisions/QuizzScreen";
import RacineScreen from "./pages/revisions/RacineScreen";
import StatistiquesScreen from "./pages/revisions/StatistiquesScreen";
import BinyanScreen from "./pages/BinyanScreen";
import FunChoiceScreen from "./pages/fun/FunChoiceScreen";
import ChansonChoiceScreen from "./pages/fun/ChansonChoiceScreen";
import ChansonScreen from "./pages/fun/ChansonScreen";
import ChansonRechercheScreen from "./pages/fun/ChansonRechercheScreen";
import BibleChoiceScreen from "./pages/fun/BibleChoiceScreen";
import CuriositeScreen from "./pages/fun/CuriositeScreen";
import NiveauScreen from "./pages/NiveauScreen";
import NotificationsScreen from "./pages/NotificationsScreen";
import MotScreen from "./pages/MotScreen";
import VerbeScreen from "./pages/VerbeScreen";
import QuestionEcriteScreen from "./pages/QuestionEcriteScreen";
import QuestionOraleScreen from "./pages/QuestionOraleScreen";
import ExamenChoiceScreen from "./pages/examen/ExamenChoiceScreen";
import ExamenSauterScreen from "./pages/examen/ExamenSauterScreen";
import ExamenSauterChapitreScreen from "./pages/examen/ExamenSauterChapitreScreen";
import ExamenCibleScreen from "./pages/examen/ExamenCibleScreen";
import ExamenHardScreen from "./pages/examen/ExamenHardScreen";
import ExamenHardPasserScreen from "./pages/examen/ExamenHardPasserScreen";
import ExamenHardCopieDetailScreen from "./pages/examen/ExamenHardCopieDetailScreen";
import ExamenStatistiquesScreen from "./pages/examen/ExamenStatistiquesScreen";
import ExamenEcritScreen from "./pages/examen/ExamenEcritScreen";
import ExamenOralScreen from "./pages/examen/ExamenOralScreen";
import ExamenCopiesListScreen from "./pages/examen/ExamenCopiesListScreen";
import ExamenCopieDetailScreen from "./pages/examen/ExamenCopieDetailScreen";
import DictionnaireScreen from "./pages/DictionnaireScreen";
import JdrScreen from "./pages/jdr/JdrScreen";
import ConversationChapitresListScreen from "./pages/jdr/ConversationChapitresListScreen";
import ConversationLeconsListScreen from "./pages/jdr/ConversationLeconsListScreen";
import RevisionScreen from "./pages/revision/RevisionScreen";
import ConversationProfChapitresListScreen from "./pages/revision/ConversationProfChapitresListScreen";
import ConversationProfLeconsListScreen from "./pages/revision/ConversationProfLeconsListScreen";
import ParlerScreen from "./pages/ParlerScreen";
import WaitingPreviewScreen from "./pages/dev/WaitingPreviewScreen";
import QuizzPreviewScreen from "./pages/dev/QuizzPreviewScreen";
import DevIndexScreen from "./pages/dev/DevIndexScreen";
import OnboardingPreviewScreen from "./pages/dev/OnboardingPreviewScreen";
import NiveauUpPreviewScreen from "./pages/dev/NiveauUpPreviewScreen";
import LotteriePreviewScreen from "./pages/dev/LotteriePreviewScreen";
import SignInPreviewScreen from "./pages/dev/SignInPreviewScreen";
import JeuChoiceScreen from "./pages/jeu/JeuChoiceScreen";
import RegleDuJeuScreen from "./pages/jeu/RegleDuJeuScreen";
import LotterieScreen from "./pages/jeu/LotterieScreen";
import CartesScreen from "./pages/jeu/CartesScreen";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Accueil />} />
        <Route path="apprentissage" element={<ChapitresListScreen />} />
        <Route path="apprentissage/:chapId" element={<LeconsListScreen />} />
        <Route path="apprentissage/:chapId/:code" element={<LeconDetailScreen />} />
        <Route path="apprentissage/:chapId/:code/pdf" element={<PdfScreen />} />
        <Route path="apprentissage/:chapId/:code/texte" element={<TexteScreen />} />
        <Route path="apprentissage/:chapId/:code/curiosite" element={<CuriositeListScreen />} />
        <Route
          path="apprentissage/:chapId/:code/curiosite/:type"
          element={<CuriositeLessonScreen />}
        />
        <Route path="apprentissage/:chapId/:code/mots" element={<MotScreen />} />
        <Route path="apprentissage/:chapId/:code/verbes" element={<VerbeScreen />} />
        <Route
          path="apprentissage/:chapId/:code/questions-ecrites"
          element={<QuestionEcriteScreen />}
        />
        <Route
          path="apprentissage/:chapId/:code/questions-orales"
          element={<QuestionOraleScreen />}
        />
        <Route path="revisions" element={<RevisionsChoiceScreen />} />
        <Route path="revisions/mot" element={<MotScreen />} />
        <Route path="revisions/verbe" element={<VerbeScreen />} />
        <Route path="revisions/question-ecrite" element={<QuestionEcriteScreen />} />
        <Route path="revisions/quizz" element={<QuizzScreen />} />
        <Route path="revisions/question-orale" element={<QuestionOraleScreen />} />
        <Route path="revisions/statistiques" element={<StatistiquesScreen />} />
        <Route path="racine/:shoresh" element={<RacineScreen />} />
        <Route path="dictionnaire" element={<DictionnaireScreen />} />
        <Route path="parler" element={<ParlerScreen />} />
        <Route path="jdr" element={<ConversationChapitresListScreen />} />
        <Route path="jdr/chapitre/:chapId" element={<ConversationLeconsListScreen />} />
        <Route path="jdr/:code" element={<JdrScreen />} />
        <Route path="revision-prof" element={<ConversationProfChapitresListScreen />} />
        <Route path="revision-prof/chapitre/:chapId" element={<ConversationProfLeconsListScreen />} />
        <Route path="revision-prof/:code" element={<RevisionScreen />} />
        <Route path="dev" element={<DevIndexScreen />} />
        <Route path="dev/waiting-preview" element={<WaitingPreviewScreen />} />
        <Route path="dev/quizz-preview" element={<QuizzPreviewScreen />} />
        <Route path="dev/onboarding-preview" element={<OnboardingPreviewScreen />} />
        <Route path="dev/niveau-up-preview" element={<NiveauUpPreviewScreen />} />
        <Route path="dev/lotterie-preview" element={<LotteriePreviewScreen />} />
        <Route path="dev/signin-preview" element={<SignInPreviewScreen />} />
        <Route path="examen" element={<ExamenChoiceScreen />} />
        <Route path="examen/sauter" element={<ExamenSauterScreen />} />
        <Route path="examen/sauter/:chapId" element={<ExamenSauterChapitreScreen />} />
        <Route path="examen/statistiques" element={<ExamenStatistiquesScreen />} />
        <Route path="examen/cible/:code" element={<ExamenCibleScreen />} />
        <Route path="examen/hard" element={<ExamenHardScreen />} />
        <Route path="examen/hard/passer" element={<ExamenHardPasserScreen />} />
        <Route path="examen/hard/copies/:id" element={<ExamenHardCopieDetailScreen />} />
        <Route path="examen/ecrite/:code" element={<ExamenEcritScreen />} />
        <Route path="examen/orale/:code" element={<ExamenOralScreen />} />
        <Route path="examen/copies" element={<ExamenCopiesListScreen />} />
        <Route path="examen/copies/:id" element={<ExamenCopieDetailScreen />} />
        <Route path="fun" element={<FunChoiceScreen />} />
        <Route path="fun/expressions" element={<CuriositeScreen type="expression" />} />
        <Route path="fun/presse" element={<CuriositeScreen type="presse" />} />
        <Route path="fun/chansons" element={<ChansonChoiceScreen />} />
        <Route path="fun/chansons/exploration" element={<ChansonScreen />} />
        <Route path="fun/chansons/recherche" element={<ChansonRechercheScreen />} />
        <Route path="fun/bible" element={<BibleChoiceScreen />} />
        <Route path="fun/bible/proverbes" element={<CuriositeScreen type="proverb" />} />
        <Route path="fun/bible/tanakh" element={<CuriositeScreen type="tanakh" />} />
        <Route path="fun/bible/recits" element={<CuriositeScreen type="recit" />} />
        <Route path="fun/blagues" element={<CuriositeScreen type="blague" />} />
        <Route path="fun/israel" element={<CuriositeScreen type="landmark" />} />
        <Route path="fun/mots-origine-hebraique" element={<CuriositeScreen type="hebreworiginword" />} />
        <Route path="jeu" element={<JeuChoiceScreen />} />
        <Route path="jeu/regles" element={<RegleDuJeuScreen />} />
        <Route path="jeu/lotterie" element={<LotterieScreen />} />
        <Route path="jeu/cartes" element={<CartesScreen />} />
        <Route path="niveau" element={<NiveauScreen />} />
        <Route path="notifications" element={<NotificationsScreen />} />
        <Route path="binyans" element={<BinyanScreen />} />
        <Route path="binyans/:nom" element={<BinyanScreen />} />
      </Route>
    </Routes>
  );
}

export default App;
