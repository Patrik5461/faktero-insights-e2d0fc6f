import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { zapisOpravy, zauctovanieZRiadku, zmenyOpravy } from "./stav-odovzdania";

/*
  „Opraviť zaúčtovanie“ pri doklade, ktorý už je v Pohode (P-1009).

  Odomkne len zaúčtovacie polia (predkontácia, členenie DPH a KV, stredisko,
  činnosť, účtovná poznámka) — spúšťač zámku ich pustí, len keď je zároveň
  nastavené `oprava_zauctovania_at`; sumy, dátumy ani strany nie. V Pohode sa
  nič nemaže a doklad ostáva odovzdaný: Pohoda ho z XML neprepíše (agenda
  faktúr nemá `actionType`), takže poslať ho znova by v nej založilo druhý.
  Kódy preto prepíše účtovník v Pohode a potvrdí to „Prepísané v Pohode“.

  Všetko cez klienta prihláseného (RLS, role).
*/

const TABULKA = {
  faktura: "invoices",
  prijata: "purchase_invoices",
  doklad: "expense_documents",
} as const;

const druh = z.enum(["faktura", "prijata", "doklad"]);
const kod = z.string().trim().max(40).nullable().optional();

export const opravZauctovanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        druh,
        company_id: z.string().uuid(),
        id: z.string().uuid(),
        hodnoty: z.object({
          pohoda_predkontacia: kod,
          pohoda_clenenie_dph: kod,
          kv_clenenie: kod,
          stredisko: kod,
          cinnost: kod,
          int_poznamka: z.string().trim().max(200).nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const tab = TABULKA[data.druh];
    const { data: r, error } = await supabase
      .from(tab)
      .select("*")
      .eq("company_id", data.company_id)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) throw new Error("Doklad sa nenašiel.");
    if (!r.exported_at)
      throw new Error("Doklad nie je odovzdaný do Pohody — zaúčtovanie upravte priamo.");
    if (r.locked_at) throw new Error("Doklad je zamknutý proti úpravám — najprv ho odomknite.");

    // Čo je v Pohode, sa zapamätá pri prvej oprave — ďalšie opravy to neprepíšu.
    const povodne = r.oprava_zauctovania_povodne ?? zauctovanieZRiadku(r);
    const zapis = zapisOpravy(data.hodnoty);
    const novy = { ...r, ...zapis };
    const zmeny = zmenyOpravy(povodne, novy);
    // Zámok pustí zaúčtovacie polia len spolu s príznakom opravy v tom istom zápise.
    const { error: e1 } = await supabase
      .from(tab)
      .update({
        ...zapis,
        oprava_zauctovania_at: r.oprava_zauctovania_at ?? new Date().toISOString(),
        oprava_zauctovania_povodne: povodne,
      })
      .eq("company_id", data.company_id)
      .eq("id", data.id);
    if (e1) throw new Error(e1.message);
    // Vrátené na pôvodné kódy — v Pohode netreba nič prepisovať, oprava sa uzavrie.
    if (!zmeny.length) {
      const { error: e2 } = await supabase
        .from(tab)
        .update({ oprava_zauctovania_at: null, oprava_zauctovania_povodne: null })
        .eq("company_id", data.company_id)
        .eq("id", data.id);
      if (e2) throw new Error(e2.message);
    }
    return { zmeny };
  });

/** Účtovník kódy prepísal aj v Pohode — doklad je znova v zhode. */
export const potvrdOpravuVPohodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ druh, company_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: r, error } = await supabase
      .from(TABULKA[data.druh])
      .update({ oprava_zauctovania_at: null, oprava_zauctovania_povodne: null })
      .eq("company_id", data.company_id)
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) throw new Error("Doklad sa nenašiel.");
    return { ok: true };
  });
