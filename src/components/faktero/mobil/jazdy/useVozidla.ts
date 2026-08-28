import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ulozVozidla, vozidlaZPamate } from "@/lib/mobile/jazdy-lokalne";

export type Vozidlo = { id: string; name: string; license_plate: string | null };

/**
 * Zoznam vozidiel firmy pre appku Kniha jázd.
 *
 * Rovnaké pravidlo ako na obrazovke Jazda: keď dotaz zlyhá, siahne sa po
 * poslednom známom zozname z telefónu. Kniha jázd je potrebná práve v aute,
 * teda tam, kde signál býva najhorší — prázdny zoznam by tam znamenal, že
 * jazdu nemá kam zapísať.
 *
 * `nezistene` rozlišuje „firma nemá vozidlo" od „nevieme, či má". To druhé sa
 * nesmie tváriť ako to prvé, inak appka pošle človeka zakladať auto, ktoré už
 * existuje.
 */
export function useVozidla(companyId: string) {
  const [vozidla, setVozidla] = useState<Vozidlo[] | null>(null);
  const [nezistene, setNezistene] = useState(false);

  const nacitaj = useCallback(async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, name, license_plate")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name")
      .then(
        (r) => r,
        (e) => ({ data: null, error: e as unknown }),
      );

    const zoznam = error || !data ? await vozidlaZPamate(companyId) : data;
    if ((error || !data) && !zoznam.length) {
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      setNezistene(!(await isOnline()));
    } else {
      setNezistene(false);
    }
    if (!error && data)
      void ulozVozidla(
        companyId,
        data.map((v) => ({ ...v, company_id: companyId })),
      );
    setVozidla(zoznam as Vozidlo[]);
  }, [companyId]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  return { vozidla, nezistene, nacitaj };
}
