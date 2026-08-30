import { createContext, useCallback, useContext, useState } from "react";
import { getWallet } from "../api/user";

const WalletContext = createContext(null);

// État du wallet (points/tickets/cartes/gems) partagé entre la barre
// supérieure (Layout, qui le rafraîchit périodiquement et déclenche le tick
// d'inactivité côté serveur) et les écrans "Jeu" — sans ce partage, une
// dépense (achat de ticket, gem consommé sur une fiche) mise à jour dans
// l'état local d'un écran ne se reflèterait pas immédiatement dans la bande
// du header (qui n'a son propre poll que toutes les 30s).
export function WalletProvider({ children }) {
  const [wallet, setWallet] = useState(null);

  const refreshWallet = useCallback(() => {
    return getWallet().then((w) => {
      setWallet(w);
      return w;
    });
  }, []);

  return (
    <WalletContext.Provider value={{ wallet, setWallet, refreshWallet }}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
