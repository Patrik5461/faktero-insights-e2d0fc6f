import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Po otvorení stránky s kotvou (`/firma#bankove-ucty` z hľadania v hlavičke)
 * zroluje na danú časť. Router to sám nevie, keď sa obsah kreslí až po
 * načítaní dát — preto sa čaká na `pripravene` a prvok sa chvíľu hľadá.
 */
export function useSkokNaKotvu(pripravene = true) {
  const hash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => {
    const id = decodeURIComponent(String(hash ?? "").replace(/^#/, ""));
    if (!pripravene || !id) return;
    let pokusy = 0;
    const casovac = window.setInterval(() => {
      const prvok = document.getElementById(id);
      if (prvok || ++pokusy > 30) {
        window.clearInterval(casovac);
        prvok?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
    return () => window.clearInterval(casovac);
  }, [hash, pripravene]);
}
