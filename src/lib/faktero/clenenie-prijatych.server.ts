/*
  Fronta predvyplnenia členenia DPH a KV DPH na prijatých faktúrach
  (`purchase_invoices`) a bločkoch (`expense_documents`) — serverová časť
  `resolveVatClassificationPrijatej` (clenenie-prijatych.ts).

  Doklad čaká vo fronte, kým má `clenenie_auto_at IS NULL` — spúšťač
  `faktero_clenenie_dokladu_strazca` ho tam vráti pri každej zmene kódu či
  údajov, od ktorých členenie závisí, nový doklad tam je od vzniku. Volá ju
  `uplatniClenenieFronty` (cron automatického účtovania každú minútu).

  Nikdy nemení: odovzdaný doklad (`exported_at`), zmazaný doklad, doklad
  v uzamknutom období (spúšťač zámku by zmenu aj tak odmietol) a ručnú
  hodnotu. Zaúčtovaný doklad dostane len chýbajúce hodnoty.
*/

import type { KodCiselnika } from "./auto-uctovanie";
import {
  resolveVatClassificationPrijatej,
  zmenaClenePrijatych,
  type DruhPrijateho,
  type FirmaClenPrijatych,
  type KontextPrijatych,
} from "./clenenie-prijatych";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Riadok = Record<string, any>;

export const TABULKA_PRIJATYCH: Record<DruhPrijateho, string> = {
  prijata: "purchase_invoices",
  blocek: "expense_documents",
};

const STLPCE_FIRMY =
  "id, country, vat_payer, vat_scheme, ic_dph, locked_until, pohoda_clenenie_dph_prijata, pohoda_clenenie_dph_doklady, pohoda_clenenie_dph_prijata_pdp, kv_clenenie_prijata, kv_clenenie_doklady";

export type KontextFirmyPrijatych = {
  firma: FirmaClenPrijatych & { id: string; locked_until?: string | null };
  ciselnik: KodCiselnika[];
  kvCiselnik: string[];
  pravidla: Map<string, { clenenie_dph?: string | null; kv_clenenie?: string | null }>;
};

export async function nacitajKontextPrijatych(sb: Klient, companyId: string): Promise<KontextFirmyPrijatych> {
  const [{ data: firma }, { data: kody }, { data: pravidla }] = await Promise.all([
    sb.from("companies").select(STLPCE_FIRMY).eq("id", companyId).maybeSingle(),
    sb
      .from("predkontacie")
      .select("druh, kod, popis, agenda, aktivne, typ_dokladu")
      .eq("company_id", companyId)
      .in("druh", ["clenenie_dph", "kv_clenenie"])
      .eq("aktivne", true)
      .limit(1000),
    sb.from("pravidla_uctovania").select("id, clenenie_dph, kv_clenenie").eq("company_id", companyId),
  ]);
  const riadky = (kody ?? []) as Riadok[];
  const { ponukaKvFirmy } = await import("./ciselnik-obrazok");
  return {
    firma: { ...(firma ?? {}), id: companyId },
    ciselnik: riadky.filter((r) => r.druh === "clenenie_dph") as KodCiselnika[],
    kvCiselnik: ponukaKvFirmy(riadky as any[], "prijate").map((k) => k.kod),
    pravidla: new Map(((pravidla ?? []) as Riadok[]).map((p) => [String(p.id), p])),
  };
}

function kontextDokladu(k: KontextFirmyPrijatych, row: Riadok): KontextPrijatych {
  return {
    pravidlo: row.pravidlo_id ? (k.pravidla.get(String(row.pravidlo_id)) ?? null) : null,
    ciselnik: k.ciselnik,
    kvCiselnik: k.kvCiselnik,
  };
}

/** Výsledok pre riadok (bez zápisu) — na zobrazenie či kontrolu. */
export async function vyriesClenenieDokladu(sb: Klient, druh: DruhPrijateho, row: Riadok, k?: KontextFirmyPrijatych) {
  const kontext = k ?? (await nacitajKontextPrijatych(sb, row.company_id));
  return resolveVatClassificationPrijatej(kontext.firma, druh, row, kontextDokladu(kontext, row));
}

/** Vyrieši a uloží členenie a KV jedného dokladu. `admin` = servisný kľúč. Chyby len do logu. */
export async function uplatniClenenieDokladu(
  admin: Klient,
  druh: DruhPrijateho,
  id: string,
  o: { kontext?: KontextFirmyPrijatych } = {},
): Promise<{ zmenene: boolean }> {
  const tabulka = TABULKA_PRIJATYCH[druh];
  const oznac = () =>
    admin
      .from(tabulka)
      .update({ clenenie_auto_at: new Date().toISOString() })
      .eq("id", id)
      .then(
        () => {},
        () => {},
      );
  try {
    const { data: row, error } = await admin.from(tabulka).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.deleted_at || row.exported_at) {
      if (row) await oznac();
      return { zmenene: false };
    }
    const k = o.kontext ?? (await nacitajKontextPrijatych(admin, row.company_id));
    const datum = String(row.delivery_date ?? row.issue_date ?? "");
    if (k.firma.locked_until && datum && datum <= String(k.firma.locked_until)) {
      await oznac();
      return { zmenene: false };
    }
    const v = resolveVatClassificationPrijatej(k.firma, druh, row, kontextDokladu(k, row));
    const zmena = zmenaClenePrijatych(row, v, { lenDoplnit: Boolean(row.zauctovane_at) });
    const zmenene = Object.keys(zmena).some((s) => !s.endsWith("_zdroj"));
    const { error: e2 } = await admin
      .from(tabulka)
      .update({ ...zmena, clenenie_auto_at: new Date().toISOString() })
      .eq("id", id)
      .is("exported_at", null);
    if (e2) throw new Error(e2.message);
    return { zmenene };
  } catch (e) {
    console.warn("[clenenie]", tabulka, id, String((e as Error)?.message ?? e).slice(0, 200));
    // Doklad, ktorý sa zapísať nedá, nesmie zapchať frontu.
    await oznac();
    return { zmenene: false };
  }
}

/** Fronta: prijaté faktúry a bločky so `clenenie_auto_at IS NULL`. */
export async function uplatniClenenieFrontyPrijatych(
  admin: Klient,
  o: { naraz?: number; rozpocetMs?: number } = {},
): Promise<{ spracovanych: number; zostava: boolean }> {
  const zaciatok = Date.now();
  const naraz = o.naraz ?? 100;
  const kontexty = new Map<string, KontextFirmyPrijatych>();
  let spracovanych = 0;
  let zostava = false;
  for (const druh of ["prijata", "blocek"] as const) {
    let q = admin
      .from(TABULKA_PRIJATYCH[druh])
      .select("id, company_id")
      .is("clenenie_auto_at", null)
      .is("exported_at", null);
    if (druh === "prijata") q = q.is("deleted_at", null);
    const { data, error } = await q.order("created_at", { ascending: true }).limit(naraz);
    if (error) {
      // Pred nasadením migrácie stĺpec nie je — fronta potichu nič nerobí.
      console.warn("[clenenie] fronta", druh, String(error.message).slice(0, 200));
      continue;
    }
    for (const r of (data ?? []) as Riadok[]) {
      if (Date.now() - zaciatok > (o.rozpocetMs ?? 4000)) return { spracovanych, zostava: true };
      let k = kontexty.get(r.company_id);
      if (!k) {
        k = await nacitajKontextPrijatych(admin, r.company_id);
        kontexty.set(r.company_id, k);
      }
      await uplatniClenenieDokladu(admin, druh, r.id, { kontext: k });
      spracovanych++;
    }
    if ((data ?? []).length >= naraz) zostava = true;
  }
  return { spracovanych, zostava };
}
