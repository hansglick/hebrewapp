import { createContext } from "react";

// La facture de la séance en cours (cf. Bill), null tant qu'elle n'est pas arrivée.
export const BillContext = createContext(null);

// Ferme la facture (sa croix, cf. TaskLayout) : les réglages reprennent sa place (cf. RevisionAgentScreen).
export const BillCloseContext = createContext(null);
