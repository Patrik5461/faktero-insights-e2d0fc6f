import { useEffect, useState } from "react";

/**
 * Je otvorené modálne okno?
 *
 * Plávajúce prvky (pomoc v rohu, lišta so súhlasom pre cookies) sedia nad
 * obsahom a na menšej obrazovke sadnú presne na tlačidlá v päte okna. Klik
 * potom chytia ony a vyzerá to, že formulár nereaguje — presne takto sa nedal
 * uložiť nový odberateľ. Kým je okno otvorené, tieto prvky sa odložia.
 *
 * Sleduje sa `role="dialog"`, čo majú aj ručne kreslené okná; vlastný prvok sa
 * vylúči atribútom `data-plavajuce`.
 */
export function useOtvoreneOkno(): boolean {
  const [otvorene, setOtvorene] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const zisti = () =>
      setOtvorene(Boolean(document.querySelector('[role="dialog"]:not([data-plavajuce])')));
    zisti();
    const sledovac = new MutationObserver(zisti);
    sledovac.observe(document.body, { childList: true, subtree: true });
    return () => sledovac.disconnect();
  }, []);

  return otvorene;
}
