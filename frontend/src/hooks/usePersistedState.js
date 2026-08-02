import { useState } from "react";

// Persiste une valeur dans localStorage : sert de mémoire pour une
// préférence utilisateur (ex: mode Exploration/Révision) qui doit survivre
// au démontage d'un écran (navigation vers un écran annexe puis retour) et,
// plus largement, aux rechargements de page — tant que le user ne change
// pas la valeur lui-même, elle ne revient jamais à `defaultValue`.
export function usePersistedState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  function setPersistedValue(newValue) {
    setValue(newValue);
    try {
      localStorage.setItem(key, JSON.stringify(newValue));
    } catch {
      // stockage indisponible (mode privé, quota...) : on continue en mémoire seule
    }
  }

  return [value, setPersistedValue];
}
