import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { navrhyKodovFn } from "@/lib/faktero/zauctovanie.functions";
import type { StavDokladu } from "@/lib/faktero/doklady-hromadne";

/*
  Číselníky pre zoznamy a detail dokladu — predkontácie a členenia DPH,
  dátum uzávierky, vlastné stavy a štítky firmy.

  Načítajú sa raz za firmu (a druh dokladu pri kódoch) a držia sa v pamäti
  stránky, takže výber v každom riadku zoznamu nič ďalšie nesťahuje.
*/

export type NavrhyKodov = Awaited<ReturnType<typeof navrhyKodovFn>>;
type Pre = "prijata" | "doklad" | "vystavena";

const kody = new Map<string, Promise<NavrhyKodov>>();
const firma = new Map<
  string,
  Promise<{ zamknuteDo: string | null; stavy: StavDokladu[]; stitky: string[] }>
>();

function nacitajFirmu(cid: string) {
  let p = firma.get(cid);
  if (!p) {
    p = Promise.all([
      supabase.from("companies").select("locked_until").eq("id", cid).maybeSingle(),
      supabase
        .from("stavy_dokladov")
        .select("id, nazov, farba, poradie, aktivne")
        .eq("company_id", cid)
        .order("poradie")
        .order("nazov"),
      supabase.from("stitky_firmy").select("nazov").eq("company_id", cid).order("nazov"),
    ]).then(([f, s, st]) => ({
      zamknuteDo: ((f.data as any)?.locked_until ?? null) as string | null,
      stavy: (s.data ?? []) as StavDokladu[],
      stitky: ((st.data ?? []) as { nazov: string }[]).map((x) => x.nazov),
    }));
    // Chyba sa nesmie zapamätať — skúsi sa pri ďalšom otvorení znova.
    p.catch(() => firma.delete(cid));
    firma.set(cid, p);
  }
  return p;
}

/** Po zmene stavov alebo štítkov v nastaveniach — ďalšie načítanie pôjde znova z databázy. */
export function zabudniCiselnikyFirmy(cid: string) {
  firma.delete(cid);
}

export function useCiselnikyDokladov(
  cid: string | null | undefined,
  pre: Pre | null,
  sKodmi = true,
) {
  const [navrhy, setNavrhy] = useState<NavrhyKodov | null>(null);
  const [zamknuteDo, setZamknuteDo] = useState<string | null>(null);
  const [stavy, setStavy] = useState<StavDokladu[]>([]);
  const [stitky, setStitky] = useState<string[]>([]);

  const obnovFirmu = useCallback(() => {
    if (!cid) return;
    nacitajFirmu(cid)
      .then((v) => {
        setZamknuteDo(v.zamknuteDo);
        setStavy(v.stavy);
        setStitky(v.stitky);
      })
      .catch(() => {
        /* bez číselníkov zoznam funguje ďalej */
      });
  }, [cid]);

  useEffect(() => {
    obnovFirmu();
  }, [obnovFirmu]);

  useEffect(() => {
    if (!cid || !pre || !sKodmi) return;
    const k = `${cid}|${pre}`;
    let p = kody.get(k);
    if (!p) {
      p = navrhyKodovFn({ data: { company_id: cid, pre } });
      p.catch(() => kody.delete(k));
      kody.set(k, p);
    }
    let zive = true;
    p.then((v) => zive && setNavrhy(v)).catch(() => {});
    return () => {
      zive = false;
    };
  }, [cid, pre, sKodmi]);

  /** Nový štítok z hromadnej akcie — pridá sa do ponuky bez nového načítania. */
  const pridajStitok = useCallback(
    (s: string) => {
      setStitky((x) => (x.includes(s) ? x : [...x, s].sort()));
      if (cid) firma.delete(cid);
    },
    [cid],
  );

  return { navrhy, zamknuteDo, stavy, stitky, obnovFirmu, pridajStitok };
}

export { filtreStavuAStitkov, splnaStavAStitok } from "@/lib/faktero/doklady-hromadne";
