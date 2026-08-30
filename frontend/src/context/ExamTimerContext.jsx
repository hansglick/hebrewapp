import { createContext, useContext, useState } from "react";

const ExamTimerContext = createContext(null);

// Permet à un écran d'examen (potentiellement profondément imbriqué dans
// <Outlet />) de piloter le minuteur affiché dans la barre supérieure
// (Layout), qui reste monté d'une route à l'autre. `timer` est
// `{ remainingSeconds, isRed } | null` (null = pas de minuteur affiché).
export function ExamTimerProvider({ children }) {
  const [timer, setTimer] = useState(null);

  return (
    <ExamTimerContext.Provider value={{ timer, setTimer }}>
      {children}
    </ExamTimerContext.Provider>
  );
}

export function useExamTimer() {
  const ctx = useContext(ExamTimerContext);
  if (!ctx) throw new Error("useExamTimer must be used within an ExamTimerProvider");
  return ctx;
}
