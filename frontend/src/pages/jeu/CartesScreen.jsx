import { useEffect, useRef } from "react";
import { viewCarteFiche } from "../../api/user";
import { mediaUrl } from "../../api/media";
import { useWallet } from "../../context/WalletContext";
import { initCardCabinet } from "./cardCabinet";
import "../screens.css";
import "./Jeu.css";

export default function CartesScreen() {
  const { wallet, setWallet } = useWallet();
  const containerRef = useRef(null);
  const cartesKey = wallet?.cartes?.join(",") ?? "";

  useEffect(() => {
    if (!wallet || !containerRef.current) return undefined;

    const cards = wallet.cartes
      .map((index) => ({ index, img: mediaUrl(wallet.cartes_images?.[index]) }))
      .filter((c) => c.img);

    const { destroy } = initCardCabinet(containerRef.current, {
      cards,
      onReveal: async (index) => {
        const result = await viewCarteFiche(index);
        setWallet((w) => (w ? { ...w, gems: result.gems } : w));
        return result;
      },
    });
    return destroy;
    // Le carrousel n'a besoin d'être reconstruit que quand la liste de
    // cartes possédées change (nouveau lot ouvert ailleurs) — pas à chaque
    // rafraîchissement périodique du wallet (points/gems), d'où la clé
    // dérivée plutôt que `wallet` entier en dépendance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartesKey]);

  if (!wallet) return null;

  return (
    <section className="screen">
      <div ref={containerRef} style={{ width: "100%" }} />
    </section>
  );
}
