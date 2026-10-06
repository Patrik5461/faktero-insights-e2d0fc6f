import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  nacitajFiltre,
  pridajFilter,
  zlucNastavenia,
  type RiadokNastaveni,
  type StlpecZoznamu,
  type UlozenyFilter,
} from "@/lib/faktero/nastavenia-zoznamov";

/**
 * Stĺpce a uložené filtre zoznamu pre prihláseného používateľa. Číta a píše
 * priamo cez RLS — riadky patria len jemu.
 */
export function useNastaveniaZoznamu(zoznam: string, stlpce: StlpecZoznamu[]) {
  const [riadky, setRiadky] = useState<RiadokNastaveni[]>([]);
  const cid = getActiveCompanyId();

  const nacitaj = useCallback(async () => {
    if (!cid) return;
    const { data } = await supabase
      .from("nastavenia_zoznamov")
      .select("company_id, stlpce, filtre")
      .eq("zoznam", zoznam)
      .or(`company_id.is.null,company_id.eq.${cid}`);
    setRiadky((data ?? []) as RiadokNastaveni[]);
  }, [cid, zoznam]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  const zlucene = useMemo(() => zlucNastavenia(stlpce, riadky), [stlpce, riadky]);

  /** Zapíše zmenu do riadku firmy alebo spoločného riadku (založí ho, keď nie je). */
  async function zapis(
    preVsetky: boolean,
    zmena: { stlpce?: string[] | null; filtre?: UlozenyFilter[] },
  ) {
    if (!cid) return;
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return;
    const companyId = preVsetky ? null : cid;
    let q = supabase
      .from("nastavenia_zoznamov")
      .select("id")
      .eq("user_id", userId)
      .eq("zoznam", zoznam);
    q = companyId ? q.eq("company_id", companyId) : q.is("company_id", null);
    const { data: existujuci } = await q.maybeSingle();
    const hodnoty: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (zmena.stlpce !== undefined) hodnoty.stlpce = zmena.stlpce;
    if (zmena.filtre !== undefined)
      hodnoty.filtre = zmena.filtre.map(({ nazov, hodnoty }) => ({ nazov, hodnoty }));
    const { error } = existujuci
      ? await supabase
          .from("nastavenia_zoznamov")
          .update(hodnoty as any)
          .eq("id", existujuci.id)
      : await supabase
          .from("nastavenia_zoznamov")
          .insert({ user_id: userId, company_id: companyId, zoznam, ...(hodnoty as any) });
    if (error) throw new Error(error.message);
    await nacitaj();
  }

  function riadok(preVsetky: boolean) {
    return riadky.find((r) => (preVsetky ? !r.company_id : !!r.company_id));
  }

  return {
    viditelne: zlucene.viditelne,
    je: (kluc: string) => zlucene.viditelne.includes(kluc),
    filtre: zlucene.filtre,
    stlpcePreVsetky: zlucene.stlpcePreVsetky,
    async ulozStlpce(kluce: string[], preVsetky: boolean) {
      await zapis(preVsetky, { stlpce: kluce });
      // Pri prepnutí na „všetky firmy" sa firemný výber zruší, inak by ho prebíjal.
      if (preVsetky && riadok(false)?.stlpce) await zapis(false, { stlpce: null });
    },
    async ulozFilter(nazov: string, hodnoty: Record<string, string>, preVsetky: boolean) {
      const doterajsie = nacitajFiltre(riadok(preVsetky)?.filtre);
      await zapis(preVsetky, { filtre: pridajFilter(doterajsie, { nazov, hodnoty }) });
    },
    async zmazFilter(f: UlozenyFilter) {
      const doterajsie = nacitajFiltre(riadok(!!f.vsetkyFirmy)?.filtre);
      await zapis(!!f.vsetkyFirmy, { filtre: doterajsie.filter((x) => x.nazov !== f.nazov) });
    },
  };
}

export type NastaveniaZoznamu = ReturnType<typeof useNastaveniaZoznamu>;
