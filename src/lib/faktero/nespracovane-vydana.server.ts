/*
  Vlastná vystavená faktúra v Nespracovaných — serverová časť: návrh druhu
  podľa firmy a vystavených faktúr, priradenie súboru k vystavenej faktúre
  a založenie vystavenej faktúry z dokladu.

  Všetko ide klientom prihláseného človeka: nespracovaný doklad stráži RLS
  (oblasť „doklady“), faktúru a jej prílohy RLS oblasti „faktury“ — cudzia
  firma sa neprečíta ani nezapíše. Súbor sa do príloh faktúry kopíruje
  (iný kôš úložiska); nespracovaný záznam aj jeho súbor sa potom zmažú
  rovnako ako po „Vytvoriť“.
*/
import { MAX_PRILOH, POVOLENE_TYPY, cestaPrilohy, chybaObsahuPrilohy, typSuboru } from "./faktura-prilohy";
import { firmaZRiadku } from "./cudzia-faktura";
import { nacitajUdaje, type UdajeNespracovaneho } from "./nespracovane";
import {
  cisloVydanej,
  fakturaZDokladu,
  nazovPrilohy,
  navrhVydanej,
  normalizujCislo,
  rozhodnutiePriradenia,
  type Dovod,
  type FirmaPreVydanu,
  type KandidatVydanej,
  type NavrhVydanej,
} from "./nespracovane-vydana";
import { uctyFirmy } from "./nespracovane-iban";

type Klient = any;
const KOS_NESPRACOVANYCH = "nespracovane";
const KOS_PRILOH = "invoice-attachments";
export const STLPCE_VYDANEJ = "id, invoice_number, type, status, customer_name, issue_date, total, currency";

/** Firma na porovnanie: čísla a (ak to firma nevypla) firemné účty. */
export async function firmaPreVydanu(supabase: Klient, companyId: string): Promise<FirmaPreVydanu | null> {
  const { data: c } = await supabase
    .from("companies")
    .select("name, ico, dic, ic_dph, iban")
    .eq("id", companyId)
    .maybeSingle();
  if (!c) return null;
  const { nastaveniaNespracovanychFirmy } = await import("./nespracovane.server");
  const nastavenia = await nastaveniaNespracovanychFirmy(supabase, companyId).catch(() => null);
  let ucty: FirmaPreVydanu["ucty"] = [];
  if (nastavenia?.typPodlaIban) {
    const [{ data: a }, { data: b }] = await Promise.all([
      supabase.from("company_bank_accounts").select("iban, name").eq("company_id", companyId),
      supabase.from("bank_accounts").select("iban, account_name").eq("company_id", companyId),
    ]);
    ucty = uctyFirmy(
      ((a ?? []) as any[]).map((x) => ({ iban: x.iban ?? "", nazov: x.name ?? null })),
      ((b ?? []) as any[]).map((x) => ({ iban: x.iban ?? "", nazov: x.account_name ?? null })),
      c.iban ? [{ iban: c.iban, nazov: null }] : [],
    );
  }
  return { strana: firmaZRiadku(c), ucty };
}

/** Živé vystavené faktúry firmy s danými číslami (presne, bez ohľadu na medzery a veľkosť písmen). */
export async function vydaneSCislami(supabase: Klient, companyId: string, cisla: string[]): Promise<KandidatVydanej[]> {
  const varianty = [
    ...new Set(cisla.flatMap((c) => [String(c ?? "").trim(), normalizujCislo(c)]).filter(Boolean)),
  ];
  if (!varianty.length) return [];
  const out: KandidatVydanej[] = [];
  for (let i = 0; i < varianty.length; i += 200) {
    const { data, error } = await supabase
      .from("invoices")
      .select(STLPCE_VYDANEJ)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .in("invoice_number", varianty.slice(i, i + 200));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as KandidatVydanej[]));
  }
  return out;
}

type RiadokNespracovaneho = {
  id: string;
  druh?: string | null;
  udaje?: unknown;
  ai?: Record<string, unknown> | null;
  file_name?: string | null;
};

/** Návrh „Vydaná faktúra“ pre riadky jednej firmy — jedným dotazom na vystavené faktúry. */
export async function navrhyVydanych(
  supabase: Klient,
  companyId: string,
  rows: RiadokNespracovaneho[],
  firma?: FirmaPreVydanu | null,
): Promise<Map<string, NavrhVydanej>> {
  const f = firma === undefined ? await firmaPreVydanu(supabase, companyId) : firma;
  const udaje = new Map(rows.map((r) => [r.id, nacitajUdaje(r.udaje)]));
  const cisla = rows.map((r) => cisloVydanej(udaje.get(r.id), r.ai ?? null, r.file_name)).filter(Boolean);
  const kandidati = await vydaneSCislami(supabase, companyId, cisla);
  const out = new Map<string, NavrhVydanej>();
  for (const r of rows)
    out.set(
      r.id,
      navrhVydanej({ udaje: udaje.get(r.id), ai: r.ai ?? null, nazovSuboru: r.file_name, firma: f, kandidati }),
    );
  return out;
}

/**
 * Priloží súbor nespracovaného dokladu k vystavenej faktúre tej istej firmy
 * a nespracovaný záznam zmaže (zo zoznamu zmizne). Pri chybe po nahratí sa
 * príloha vráti späť — nič nezostane napoly.
 */
export async function priradKVydanej(
  supabase: Klient,
  userId: string,
  r: Record<string, any>,
  invoiceId: string,
): Promise<{ invoiceId: string; cislo: string }> {
  const { data: f } = await supabase
    .from("invoices")
    .select("id, company_id, invoice_number, deleted_at")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!f || f.deleted_at) throw new Error("Vystavená faktúra sa nenašla.");
  if (f.company_id !== r.company_id) throw new Error("Faktúra je v inej firme než doklad.");
  if (!r.file_path) throw new Error("Doklad nemá súbor, ktorý by sa dal priložiť.");

  const { count } = await supabase
    .from("invoice_attachments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", f.id);
  if ((count ?? 0) >= MAX_PRILOH) throw new Error(`K faktúre sa dá priložiť najviac ${MAX_PRILOH} súborov.`);

  const { data: subor, error: eStiahnutia } = await supabase.storage.from(KOS_NESPRACOVANYCH).download(r.file_path);
  if (eStiahnutia || !subor) throw new Error("Súbor dokladu sa nepodarilo načítať.");
  const bajty = new Uint8Array(await subor.arrayBuffer());
  const typ = typSuboru(r.file_mime ?? "", r.file_name ?? "") ?? typSuboru("", String(r.file_path));
  if (!typ) throw new Error("Tento typ súboru sa k faktúre priložiť nedá.");
  const zly = chybaObsahuPrilohy(typ, bajty);
  if (zly) throw new Error(zly);

  const cesta = cestaPrilohy(f.company_id, f.id, typ);
  const up = await supabase.storage.from(KOS_PRILOH).upload(cesta, bajty, { contentType: typ, upsert: false });
  if (up.error) throw new Error(`Súbor sa nepodarilo uložiť: ${up.error.message}`);
  const { data: priloha, error: ePrilohy } = await supabase
    .from("invoice_attachments")
    .insert({
      company_id: f.company_id,
      invoice_id: f.id,
      path: cesta,
      name: nazovPrilohy(r.file_name, f.invoice_number, POVOLENE_TYPY[typ] ?? "pdf"),
      mime: typ,
      size: bajty.length,
      created_by: userId,
    })
    .select("id")
    .single();
  if (ePrilohy || !priloha) {
    await supabase.storage.from(KOS_PRILOH).remove([cesta]);
    throw new Error(ePrilohy?.message ?? "Prílohu sa nepodarilo uložiť.");
  }
  // Nespracovaný záznam preč — keď ho medzitým spracoval niekto iný, príloha sa vráti.
  const { data: zmazane, error: eZmazania } = await supabase
    .from("nespracovane_doklady")
    .delete()
    .eq("id", r.id)
    .select("id");
  if (eZmazania || !zmazane?.length) {
    await supabase.from("invoice_attachments").delete().eq("id", priloha.id);
    await supabase.storage.from(KOS_PRILOH).remove([cesta]);
    throw new Error(eZmazania?.message ?? "Doklad sa nenašiel — možno ho už niekto spracoval.");
  }
  await supabase.storage.from(KOS_NESPRACOVANYCH).remove([r.file_path]);
  return { invoiceId: f.id, cislo: f.invoice_number };
}

/** Chyba, keď číslo z dokladu už má iná vystavená faktúra. */
export function chybaObsadenehoCisla(cislo: string): string {
  return `Faktúra s číslom ${cislo} už vo Fakturácii je — priraďte doklad k nej.`;
}

/**
 * Vystavená faktúra z dokladu — číslo z dokladu (číselný rad sa neposúva),
 * stav „vystavená“, nič sa neodošle: bez e-mailu, eFaktúry a upomienok
 * (`reminders_enabled = false`, ako pri importe). Súbor dokladu sa priloží.
 */
export async function vytvorVydanu(
  supabase: Klient,
  userId: string,
  r: Record<string, any>,
  u: UdajeNespracovaneho,
): Promise<{ invoiceId: string; cislo: string }> {
  const { data: c } = await supabase
    .from("companies")
    .select("name, ico, dic, ic_dph, default_currency, country")
    .eq("id", r.company_id)
    .maybeSingle();
  if (!c) throw new Error("Firma sa nenašla.");
  const { domacaMena } = await import("./kurzy");
  const z = fakturaZDokladu({
    udaje: u,
    ai: (r.ai ?? null) as Record<string, unknown> | null,
    nazovSuboru: r.file_name,
    firma: firmaZRiadku(c),
    menaFirmy: c.default_currency || domacaMena(c.country),
  });
  if (!z.ok) throw new Error(z.dovod);
  const f = z.faktura;
  if (!r.file_path) throw new Error("Doklad nemá súbor, ktorý by sa dal priložiť.");

  // Číslo z dokladu nesmie mať iná živá faktúra (unikátny index to aj tak nepustí).
  const uz = await vydaneSCislami(supabase, r.company_id, [f.invoice_number]);
  if (uz.some((x) => normalizujCislo(x.invoice_number) === normalizujCislo(f.invoice_number)))
    throw new Error(chybaObsadenehoCisla(f.invoice_number));

  // Odberateľ z adresára, keď ho firma má (podľa IČO); inak len opísaný na faktúre.
  let customerId: string | null = null;
  if (f.customer.ico) {
    const { data: k } = await supabase
      .from("customers")
      .select("id")
      .eq("company_id", r.company_id)
      .eq("ico", f.customer.ico)
      .is("deleted_at", null)
      .limit(1);
    customerId = (k?.[0]?.id as string | undefined) ?? null;
  }
  const { vsNaUlozenie } = await import("./variabilny-symbol");
  const teraz = new Date().toISOString();
  const payload: Record<string, any> = {
    company_id: r.company_id,
    customer_id: customerId,
    customer_name: f.customer.name,
    customer_ico: f.customer.ico,
    customer_dic: f.customer.dic,
    customer_ic_dph: f.customer.ic_dph,
    customer_street: f.customer.street,
    customer_city: f.customer.city,
    customer_zip: f.customer.zip,
    customer_country: f.customer.country || c.country || "SK",
    invoice_number: f.invoice_number,
    variable_symbol: vsNaUlozenie(f.variable_symbol, f.invoice_number),
    issue_date: f.issue_date,
    delivery_date: f.delivery_date,
    due_date: f.due_date,
    currency: f.currency,
    status: "issued",
    type: f.type,
    subtotal: f.subtotal,
    vat_total: f.vat_total,
    total: f.total,
    // Doklad už odberateľ má — Faktero ho neupomína ani neposiela.
    reminders_enabled: false,
    import_source: "nespracovane",
    imported_at: teraz,
    created_by: userId,
  };
  if (f.currency !== (c.default_currency || domacaMena(c.country))) {
    const { doplnovacKurzov } = await import("./kurz-dokladu.server");
    Object.assign(payload, await doplnovacKurzov(r.company_id)("invoices", payload));
  }
  const { data: ins, error } = await supabase.from("invoices").insert(payload).select("id").single();
  if (error || !ins) {
    if ((error as any)?.code === "23505") throw new Error(chybaObsadenehoCisla(f.invoice_number));
    throw new Error(error?.message ?? "Faktúru sa nepodarilo vytvoriť.");
  }
  const zrus = async () => {
    await supabase.from("invoice_items").delete().eq("invoice_id", ins.id);
    await supabase.from("invoices").delete().eq("id", ins.id);
  };
  const { error: ePol } = await supabase
    .from("invoice_items")
    .insert(z.polozky.map((p) => ({ ...p, invoice_id: ins.id })));
  if (ePol) {
    await zrus();
    throw new Error(`Položky: ${ePol.message}`);
  }
  try {
    await priradKVydanej(supabase, userId, r, ins.id);
  } catch (e) {
    await zrus();
    throw e;
  }
  return { invoiceId: ins.id as string, cislo: f.invoice_number };
}

export type Preskoceny = { popis: string; dovod: Dovod };

/**
 * Hromadné priradenie k vystaveným faktúram. Priradí sa len doklad s presnou
 * zhodou čísla (a sumou, ktorá neodporuje); ostatné sa preskočia s dôvodom.
 */
export async function priradVydaneHromadne(
  supabase: Klient,
  userId: string,
  companyId: string,
  ids: string[],
): Promise<{ priradene: number; preskocene: Preskoceny[] }> {
  const { data: rows, error } = await supabase
    .from("nespracovane_doklady")
    .select("id, company_id, druh, stav, udaje, ai, file_name, file_path, file_mime")
    .eq("company_id", companyId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const navrhy = await navrhyVydanych(supabase, companyId, rows ?? []);
  let priradene = 0;
  const preskocene: Preskoceny[] = [];
  for (const r of (rows ?? []) as any[]) {
    const u = nacitajUdaje(r.udaje);
    const popis = [u.dodavatel.nazov, u.cislo].filter((v) => v && v.trim()).join(" · ") || r.file_name || "Doklad";
    const rozh = rozhodnutiePriradenia({
      druh: r.druh,
      stav: r.stav,
      maSubor: Boolean(r.file_path),
      navrh: navrhy.get(r.id)!,
    });
    if ("dovod" in rozh) {
      preskocene.push({ popis, dovod: rozh.dovod });
      continue;
    }
    try {
      await priradKVydanej(supabase, userId, r, rozh.invoiceId);
      priradene++;
    } catch (e: any) {
      preskocene.push({ popis, dovod: { text: String(e?.message ?? "") || "Nepodarilo sa" } });
    }
  }
  return { priradene, preskocene };
}
