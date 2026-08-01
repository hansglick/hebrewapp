import { Routes, Route } from "react-router-dom";
import Layout from "./layout/Layout";
import Accueil from "./pages/Accueil";
import Placeholder from "./pages/Placeholder";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Accueil />} />
        <Route path="apprentissage" element={<Placeholder title="Apprentissage" />} />
        <Route path="revisions" element={<Placeholder title="Révisions" />} />
        <Route path="examen" element={<Placeholder title="Examen" />} />
        <Route path="fun" element={<Placeholder title="Fun !" />} />
        <Route path="niveau" element={<Placeholder title="Fiche niveau" />} />
      </Route>
    </Routes>
  );
}

export default App;
