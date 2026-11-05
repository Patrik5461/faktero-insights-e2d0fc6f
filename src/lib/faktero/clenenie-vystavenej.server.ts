/*
  Automatické členenie DPH, KV DPH a predkontácia vystavených dokladov —
  serverová časť `resolveVatClassification` (clenenie-vystavenej.ts).

  Kto volá `uplatniClenenieFaktury` (hneď po zápise):
    - nová faktúra cez server: vytvorFakturu (API /api/v1/invoices, e-shopy,
      Shoptet, Trans.eu, MCP cez API), vystavFakturuFn, opakované faktúry,
      daňový doklad k platbe, oprava § 25a, faktúra z ponuky, klonovanie,
    - úprava cez API (PATCH /api/v1/invoices/:id) a zaúčtovanie v detaile,
    - formulár vo webe a v appke (zápis ide z prehliadača) → `prepocitajClenenieFn`.
  Záchranná sieť: fronta automatického účtovania (cron každú minútu) zoberie
  každý doklad so `clenenie_auto_at IS NULL` — spúšťač v DB ho tak označí pri
  vzniku aj pri zmene údajov, od ktorých členenie závisí (aj keď zápis prišiel
  cestou, ktorá funkciu nevolá).

  Nikdy nemení: odovzdaný doklad (`exported_at`), zmazaný doklad a ručne
  zadanú hodnotu. Zaúčtovaný doklad a doklad v uzamknutom období dostanú len
  chýbajúce hodnoty — vyplnené ostanú.
*/

import {
  ciselnikVystavenych,
  jeOpravnyDoklad,
  odhadPredkontacie,
  resolveVatClassification,
  type FirmaClenenia,
  type KontextClenenia,
  type VysledokClenenia,
} from "./clenenie-vystavenej";
import { prvePravidlo, type Pravidlo } from "./pravidla-uctovania";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Riadok = Record<string, any>;

const STLPCE_FIRMY =
  "id, country, vat_payer, vat_scheme, ic_dph, locked_until, pohoda_clenenie_dph, pohoda_clenenie_dph_pdp, kv_clenenie_faktura, pohoda_predkontacia, pohoda_predkontacia_dobropis, pohoda_predkontacia_zaloha";

export type KontextFirmyClenenia = {
  firma: FirmaClenenia & { id: string; locked_until?: string | null };
  ciselnik: NonNullable<KontextClenenia["ciselnik"]>;
  pravidla: (Pravidlo & { id: string })[];
  odhad: { faktura: string | null; dobropis: string | null };
  /** Členenie KV DPH z číselníka firmy pre vydané doklady (prázdne = systémové). */
  kvCiselnik?: string[];
};

export async function nacitajKontextClenenia(
  sb: Klient,
  companyId: string,
): Promise<KontextFirmyClenenia> {
  const [{ data: firma }, { data: kody }, { data: pravidla }, { data: faktury }, kvKody] = await Promise.all([
    sb.from("companies").select(STLPCE_FIRMY).eq("id", companyId).maybeSingle(),
    sb
      .from("predkontacie")
      .select("druh, kod, popis, agenda, aktivne, druhy_dokladov")
      .eq("company_id", companyId)
      .eq("druh", "clenenie_dph")
      .limit(1000),
    sb.from("pravidla_uctovania").select("*").eq("company_id", companyId).eq("aktivne", true),
    sb
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .not("pohoda_predkontacia", "is", null)
      .order("created_at", { ascending: false })
      .limit(300),
    kvCiselnikFirmy(sb, companyId),
  ]);
  // Kód obmedzený v číselníku len na iné druhy dokladov (prijaté, bločky) sa vydanému neponúkne.
  const preVydane = ((kody ?? []) as Riadok[]).filter(
    (k) =>
      !Array.isArray(k.druhy_dokladov) ||
      !k.druhy_dokladov.length ||
      k.druhy_dokladov.some((d: string) => ["faktura", "dobropis", "pdp", "zaloha"].includes(d)),
  );
  return {
    firma: { ...(firma ?? {}), id: companyId } as KontextFirmyClenenia["firma"],
    ciselnik: ciselnikVystavenych(preVydane as never),
    pravidla: (pravidla ?? []) as KontextFirmyClenenia["pravidla"],
    odhad: odhadPredkontacie((faktury ?? []) as Riadok[]),
    kvCiselnik: kvKody,
  };
}

/** Kódy KV DPH z číselníka firmy pre vydané doklady — chyba čítania = systémové kódy. */
async function kvCiselnikFirmy(sb: Klient, companyId: string): Promise<string[]> {
  try {
    const { data } = await sb
      .from("predkontacie")
      .select("druh, kod, popis, aktivne, typ_dokladu")
      .eq("company_id", companyId)
      .eq("druh", "kv_clenenie")
      .limit(1000);
    const { ponukaKvFirmy } = await import("./ciselnik-obrazok");
    return ponukaKvFirmy((data ?? []) as any[], "vydane").map((k) => k.kod);
  } catch {
    return [];
  }
}

/** Pravidlo pre vystavený doklad — uplatnené spúšťačom, inak prvé zhodné (ako `faktero_pravidlo_pre_doklad`). */
export function pravidloPreFakturu(
  pravidla: (Pravidlo & { id: string })[],
  row: Riadok,
  krajinaFirmy?: string | null,
) {
  if (row.type === "proforma") return null;
  if (row.pravidlo_id) {
    const p = pravidla.find((x) => x.id === row.pravidlo_id);
    if (p) return p;
  }
  return prvePravidlo(pravidla, {
    supplier_ico: row.customer_ico ?? null,
    supplier_name: row.customer_name ?? null,
    payment_method: null,
    created_by: row.created_by ?? null,
    druh: "vystavena",
    typ: row.type ?? null,
    krajina_firmy: krajinaFirmy ?? null,
  });
}

/** Výsledok pre riadok `invoices` (bez zápisu). */
export async function vyriesClenenieRiadku(
  sb: Klient,
  row: Riadok,
  kontext?: KontextFirmyClenenia,
): Promise<VysledokClenenia> {
  const k = kontext ?? (await nacitajKontextClenenia(sb, row.company_id));
  let povodna: KontextClenenia["povodna"] = null;
  if (jeOpravnyDoklad(row) && row.opravuje_fakturu_id) {
    const { data } = await sb
      .from("invoices")
      .select("pohoda_clenenie_dph, kv_clenenie, pohoda_predkontacia")
      .eq("id", row.opravuje_fakturu_id)
      .eq("company_id", row.company_id)
      .maybeSingle();
    povodna = data ?? null;
  }
  return resolveVatClassification(k.firma, row, {
    pravidlo: pravidloPreFakturu(k.pravidla, row, k.firma.country),
    povodna,
    ciselnik: k.ciselnik,
    odhad: k.odhad,
    kvCiselnik: k.kvCiselnik,
  });
}

/** Zmena riadku, ktorú výsledok vyžaduje (prázdny objekt = nič sa nemení okrem značky). */
export function zmenaClenenia(
  row: Riadok,
  v: VysledokClenenia,
  o: { lenDoplnit: boolean },
): Riadok {
  const zmena: Riadok = {};
  const polia = [
    ["pohoda_clenenie_dph", "clenenie_zdroj", "clenenie"],
    ["kv_clenenie", "kv_zdroj", "kv"],
    ["pohoda_predkontacia", "predkontacia_zdroj", "predkontacia"],
  ] as const;
  for (const [stlpec, zdrojStlpec, pole] of polia) {
    const teraz = String(row[stlpec] ?? "").trim() || null;
    const rucne = v.rucne[pole];
    const nova = rucne ? teraz : v.auto[stlpec];
    const zdroj = rucne ? "rucne" : nova ? "auto" : null;
    // Zaúčtovaný doklad či uzamknuté obdobie: vyplnené pole ostáva, prázdne sa doplní.
    if (o.lenDoplnit && teraz) continue;
    if (nova !== teraz) zmena[stlpec] = nova;
    if ((row[zdrojStlpec] ?? null) !== zdroj) zmena[zdrojStlpec] = zdroj;
  }
  return zmena;
}

/**
 * Vyrieši a uloží členenie, KV a predkontáciu jednej faktúry. `admin` =
 * servisný kľúč (po overení prístupu volajúcim). Chyba sa nehádže ďalej —
 * doklad je uložený, fronta to skúsi znova.
 */
export async function uplatniClenenieFaktury(
  admin: Klient,
  id: string,
  o: { kontext?: KontextFirmyClenenia } = {},
): Promise<{ zmenene: boolean; vysledok: VysledokClenenia | null }> {
  try {
    const { data: row, error } = await admin.from("invoices").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.deleted_at || row.exported_at) return { zmenene: false, vysledok: null };
    const k = o.kontext ?? (await nacitajKontextClenenia(admin, row.company_id));
    const v = await vyriesClenenieRiadku(admin, row, k);
    const datum = String(row.delivery_date ?? row.issue_date ?? "");
    const zamknute = Boolean(k.firma.locked_until && datum && datum <= String(k.firma.locked_until));
    const zmena = zmenaClenenia(row, v, { lenDoplnit: Boolean(row.zauctovane_at) || zamknute });
    const zmenene = Object.keys(zmena).some((s) => !s.endsWith("_zdroj"));
    const { error: e2 } = await admin
      .from("invoices")
      .update({ ...zmena, clenenie_auto_at: new Date().toISOString() })
      .eq("id", id)
      .is("exported_at", null);
    if (e2) throw new Error(e2.message);
    return { zmenene, vysledok: v };
  } catch (e) {
    console.warn("[clenenie] faktúra", id, String((e as Error)?.message ?? e).slice(0, 200));
    // Doklad, ktorý sa zapísať nedá, nesmie zapchať frontu — označí sa ako prejdený.
    await admin
      .from("invoices")
      .update({ clenenie_auto_at: new Date().toISOString() })
      .eq("id", id)
      .then(
        () => {},
        () => {},
      );
    return { zmenene: false, vysledok: null };
  }
}

/** To isté pre viac faktúr jednej či viacerých firiem (kontext firmy sa načíta raz). */
export async function uplatniClenenieFaktur(admin: Klient, ids: string[]) {
  const unikatne = [...new Set(ids.filter(Boolean))];
  if (!unikatne.length) return 0;
  const { data } = await admin.from("invoices").select("id, company_id").in("id", unikatne);
  const kontexty = new Map<string, KontextFirmyClenenia>();
  let n = 0;
  for (const r of (data ?? []) as Riadok[]) {
    let k = kontexty.get(r.company_id);
    if (!k) {
      k = await nacitajKontextClenenia(admin, r.company_id);
      kontexty.set(r.company_id, k);
    }
    if ((await uplatniClenenieFaktury(admin, r.id, { kontext: k })).zmenene) n++;
  }
  return n;
}

/** Pohodlné volanie zo serverových ciest: servisný kľúč, chyby len do logu. */
export async function uplatniClenenieNovej(
  id: string | null | undefined,
): Promise<Pick<VysledokClenenia, "pohoda_clenenie_dph" | "kv_clenenie" | "pohoda_predkontacia"> | null> {
  if (!id) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { vysledok: v } = await uplatniClenenieFaktury(supabaseAdmin, id);
    return v
      ? {
          pohoda_clenenie_dph: v.pohoda_clenenie_dph,
          kv_clenenie: v.kv_clenenie,
          pohoda_predkontacia: v.pohoda_predkontacia,
        }
      : null;
  } catch (e) {
    console.warn("[clenenie] nová faktúra", id, String((e as Error)?.message ?? e).slice(0, 200));
    return null;
  }
}

/**
 * Fronta (cron automatického účtovania): faktúry, ktorým spúšťač zhodil
 * `clenenie_auto_at` — nové alebo so zmenenými údajmi.
 */
export async function uplatniClenenieFronty(
  admin: Klient,
  o: { naraz?: number; rozpocetMs?: number } = {},
): Promise<{ spracovanych: number; zostava: boolean }> {
  const zaciatok = Date.now();
  const { data, error } = await admin
    .from("invoices")
    .select("id, company_id")
    .is("clenenie_auto_at", null)
    .is("exported_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(o.naraz ?? 100);
  if (error) {
    console.warn("[clenenie] fronta:", String(error.message).slice(0, 200));
    return { spracovanych: 0, zostava: false };
  }
  const kontexty = new Map<string, KontextFirmyClenenia>();
  let spracovanych = 0;
  for (const r of (data ?? []) as Riadok[]) {
    if (Date.now() - zaciatok > (o.rozpocetMs ?? 8000)) return { spracovanych, zostava: true };
    let k = kontexty.get(r.company_id);
    if (!k) {
      k = await nacitajKontextClenenia(admin, r.company_id);
      kontexty.set(r.company_id, k);
    }
    await uplatniClenenieFaktury(admin, r.id, { kontext: k });
    spracovanych++;
  }
  return { spracovanych, zostava: (data ?? []).length >= (o.naraz ?? 100) };
}
