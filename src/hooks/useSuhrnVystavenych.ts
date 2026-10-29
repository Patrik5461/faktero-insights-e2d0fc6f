import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { riadkyPreIds } from "@/lib/faktero/strankovanie";
import {
  normalizujSuhrn,
  suhrnVystavenych,
  type KontextSuctu,
  type PolozkaVystavenej,
  type SuhrnDph,
} from "@/lib/faktero/suhrn-dph";

/** Filtre zoznamu vystavených faktúr — tie isté, aké dostáva `usePagedList`. */
export type FiltreSuhrnu = {
  companyId: string | null;
  typy?: string[] | null;
  status?: string | null;
  hladanie?: string | null;
  podla?: string | null;
  od?: string | null;
  do?: string | null;
  stav?: string | null;
  stitok?: string | null;
  export?: string | null;
  neuhradene?: boolean;
  poSplatnosti?: boolean;
  bezUpomienky?: boolean;
  /** Len tieto doklady (výber); ostatné filtre platia aj tak. */
  ids?: string[] | null;
};

/**
 * Súčet za celý vyfiltrovaný zoznam vystavených faktúr — počíta ho databáza
 * (`suhrn_vystavenych_faktur`) jedným dotazom, lebo zoznam je stránkovaný.
 * Funkcia je SECURITY INVOKER, takže vidí len to, čo zoznam (RLS).
 * `vypnute` = netreba (kôš), nič sa nevolá.
 */
export function useSuhrnVystavenych(
  f: FiltreSuhrnu,
  o: { vypnute?: boolean; nonce?: unknown } = {},
) {
  const [suhrn, setSuhrn] = useState<SuhrnDph | null>(null);
  const [nacitava, setNacitava] = useState(false);
  const kluc = JSON.stringify(f);
  useEffect(() => {
    if (o.vypnute || !f.companyId) {
      setSuhrn(null);
      return;
    }
    let zruseny = false;
    setNacitava(true);
    // Hľadanie sa píše po znakoch — počká sa, kým človek dopíše.
    const casovac = setTimeout(async () => {
      const { data, error } = await supabase.rpc(
        "suhrn_vystavenych_faktur" as any,
        {
          p_company_id: f.companyId,
          p_typy: f.typy?.length ? f.typy : null,
          p_status: f.status || null,
          p_hladanie: f.hladanie?.trim() || null,
          p_podla: f.podla || "vystavenie",
          p_od: f.od || null,
          p_do: f.do || null,
          p_stav: f.stav || null,
          p_stitok: f.stitok || null,
          p_export: f.export || null,
          p_neuhradene: !!f.neuhradene,
          p_po_splatnosti: !!f.poSplatnosti,
          p_bez_upomienky: !!f.bezUpomienky,
          p_ids: f.ids?.length ? f.ids : null,
        } as any,
      );
      if (zruseny) return;
      if (error) {
        console.error("[suhrn_vystavenych_faktur]", error);
        setSuhrn(null);
      } else setSuhrn(normalizujSuhrn(data));
      setNacitava(false);
    }, 250);
    return () => {
      zruseny = true;
      clearTimeout(casovac);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kluc, o.vypnute, o.nonce]);
  return { suhrn, nacitava };
}

/**
 * Súčet označených vystavených faktúr. Hlavičky sú už načítané v zozname,
 * k rozpisu po sadzbách sa dotiahnu len ich položky. Pravidlá ako za filter
 * (`suhrnVystavenych` = to isté, čo `suhrn_vystavenych_faktur` v databáze).
 */
export function useSuhrnVyberuVystavenych(riadky: any[], kontext: KontextSuctu) {
  const [polozky, setPolozky] = useState<Record<string, PolozkaVystavenej[]>>({});
  const ids = riadky.map((r) => r.id as string).sort();
  const kluc = ids.join(",");
  useEffect(() => {
    if (!ids.length) {
      setPolozky({});
      return;
    }
    let zruseny = false;
    riadkyPreIds<any>(ids, (kus, od, po) =>
      supabase
        .from("invoice_items")
        .select("id, invoice_id, vat_rate, subtotal, vat_amount")
        .in("invoice_id", kus)
        .order("id")
        .range(od, po),
    )
      .then((data) => {
        if (zruseny) return;
        const m: Record<string, PolozkaVystavenej[]> = {};
        for (const p of data) (m[p.invoice_id] ??= []).push(p);
        setPolozky(m);
      })
      .catch((e) => console.error("[suhrn vyberu]", e));
    return () => {
      zruseny = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kluc]);
  const typyKluc = (kontext.typy ?? []).join(",");
  return useMemo(
    () =>
      suhrnVystavenych(
        riadky.map((r) => ({ ...r, polozky: polozky[r.id] })),
        kontext,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [riadky, polozky, typyKluc, kontext.status],
  );
}
