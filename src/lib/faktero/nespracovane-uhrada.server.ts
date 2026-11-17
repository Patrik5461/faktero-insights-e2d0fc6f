/*
  Doklad o úhrade v Nespracovaných — serverová časť: prijaté faktúry, ku
  ktorým doklad patrí, priradenie (súbor medzi prílohy faktúry + úhrada)
  a založenie prijatej faktúry z dokladu, ktorý nesie aj samotnú faktúru.

  Všetko ide klientom prihláseného človeka: nespracovaný doklad, prijatú
  faktúru, jej prílohy aj úhrady stráži RLS oblasti „doklady“ — cudzia
  firma sa neprečíta ani nezapíše. Úhrada ide do `purchase_invoice_payments`
  ako pri „Označiť ako uhradenú“ (stav a dátum úhrady prepočíta spúšťač);
  úhrada nie je zamknutá odovzdaním do Pohody ani uzávierkou obdobia.
*/
import { MAX_PRILOHA, MAX_PRILOH, POVOLENE_TYPY, cestaPrilohy, chybaObsahuPrilohy, typSuboru } from "./faktura-prilohy";
import { nacitajUdaje } from "./nespracovane";
import {
  fakturaZDokladuUhrady,
  hladanaCastCisla,
  jeDokladOUhrade,
  planUhrady,
  PREDPONA_INEJ_SUMY,
  rozhodnutieUhrady,
  sumaSedi,
  udajePreUhradu,
  zhodyPrijatych,
  type Dovod,
  type KandidatPrijatej,
  type UdajeUhrady,
  type ZhodaPrijatej,
} from "./nespracovane-uhrada";
import { nazovPrilohy } from "./nespracovane-vydana";
import { stavUhradyPrijatej, zalohaPrijatej } from "./uhrady-prijatej";
import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";

type Klient = any;
const KOS_NESPRACOVANYCH = "nespracovane";
const KOS_PRILOH = "invoice-attachments";
/** Stĺpce prijatej faktúry na výber (všetky overené v `purchase_invoices`). */
export const STLPCE_PRIJATEJ =
  "id, invoice_number, variable_symbol, supplier_name, issue_date, amount_total, currency, status, type, payment_date";
/** Druhy prijatých faktúr, ku ktorým patrí doklad o úhrade. */
export const TYPY_NA_UHRADU = ["regular", "proforma"];


/** Živé prijaté faktúry firmy, ktorých číslo alebo VS obsahuje hľadanú časť čísel z dokladov. */
export async function prijateKUhradam(
  supabase: Klient,
  companyId: string,
  uhrady: Pick<UdajeUhrady, "cisloFaktury">[],
): Promise<KandidatPrijatej[]> {
  const casti = [...new Set(uhrady.map((u) => hladanaCastCisla(u.cisloFaktury)).filter(Boolean))];
  if (!casti.length) return [];
  const out = new Map<string, KandidatPrijatej>();
  for (let i = 0; i < casti.length; i += 20) {
    const podmienky = casti
      .slice(i, i + 20)
      .flatMap((c) => [`invoice_number.ilike.%${c}%`, `variable_symbol.ilike.%${c}%`]);
    const { data, error } = await supabase
      .from("purchase_invoices")
      .select(STLPCE_PRIJATEJ)
      .eq("company_id", companyId)
      .in("type", TYPY_NA_UHRADU)
      .is("deleted_at", null)
      .or(podmienky.join(","))
      .order("issue_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    for (const f of (data ?? []) as KandidatPrijatej[]) out.set(f.id, f);
  }
  return [...out.values()];
}

type RiadokNespracovaneho = {
  id: string;
  druh?: string | null;
  udaje?: unknown;
  ai?: Record<string, unknown> | null;
  file_name?: string | null;
};

export type NavrhUhrady = {
  /** Vyzerá ako doklad o úhrade (pri inom druhu ponúkne prepnutie). */
  navrh: boolean;
  uhrada: UdajeUhrady;
  zhody: ZhodaPrijatej[];
};

/** Údaje úhrady a zhody prijatých faktúr pre riadky jednej firmy — jedným dotazom. */
export async function navrhyUhrad(
  supabase: Klient,
  companyId: string,
  rows: RiadokNespracovaneho[],
  /** `vzdy` — zhody aj pri doklade, ktorý nie je ani nevyzerá ako doklad o úhrade (detail: človek môže druh zmeniť). */
  volby: { vzdy?: boolean } = {},
): Promise<Map<string, NavrhUhrady>> {
  const zaklad = rows.map((r) => {
    const navrh = r.druh !== "uhrada" && jeDokladOUhrade(r.ai ?? null, r.file_name);
    const uhrada = udajePreUhradu(nacitajUdaje(r.udaje), r.ai ?? null).uhrada!;
    return { r, navrh, uhrada, treba: volby.vzdy || r.druh === "uhrada" || navrh };
  });
  const kandidati = await prijateKUhradam(
    supabase,
    companyId,
    zaklad.filter((x) => x.treba).map((x) => x.uhrada),
  );
  const out = new Map<string, NavrhUhrady>();
  for (const x of zaklad)
    out.set(x.r.id, { navrh: x.navrh, uhrada: x.uhrada, zhody: x.treba ? zhodyPrijatych(kandidati, x.uhrada) : [] });
  return out;
}

/** Koľko na faktúre ešte zostáva uhradiť (úhrady + zaplatená záloha, ako karta Úhrady). */
async function zostavaUhradit(supabase: Klient, f: Record<string, any>): Promise<number> {
  const [{ data: uhrady }, z] = await Promise.all([
    supabase
      .from("purchase_invoice_payments")
      .select("id, amount, paid_at")
      .eq("purchase_invoice_id", f.id),
    f.advance_invoice_id && f.type !== "advance_payment"
      ? supabase.from("purchase_invoices").select("amount_total, status").eq("id", f.advance_invoice_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);
  const zaloha = zalohaPrijatej(f.advance_amount, z?.data?.status === "paid" ? Number(z.data.amount_total ?? 0) : 0);
  return stavUhradyPrijatej({ amount_total: f.amount_total, status: f.status, uhrady: (uhrady ?? []) as any[], zaloha }).zostava;
}

/** Poznámka úhrady z Nespracovaných dokladov. */
const POZNAMKA_NESPRACOVANE = "Doklad o úhrade z Nespracovaných dokladov";

/**
 * Zapíše úhradu z dokladu k prijatej faktúre, ak ešte nie je uhradená.
 * Nikdy nevyhodí — keď úhrada neprejde, vráti dôvod (súbor už je priložený).
 */
async function zapisUhradu(
  supabase: Klient,
  userId: string,
  f: Record<string, any>,
  uhrada: UdajeUhrady,
  poznamka: string = POZNAMKA_NESPRACOVANE,
): Promise<{ uhradene: boolean; dovod?: Dovod }> {
  try {
    const plan = planUhrady({
      status: f.status,
      type: f.type,
      zostava: await zostavaUhradit(supabase, f),
      uhrada,
      dnes: dnesBratislava(),
    });
    if ("lenPriloha" in plan) return { uhradene: false, dovod: plan.lenPriloha };
    const { error } = await supabase.from("purchase_invoice_payments").insert({
      company_id: f.company_id,
      purchase_invoice_id: f.id,
      amount: plan.uhradit.suma,
      paid_at: plan.uhradit.datum,
      currency: f.currency ?? "EUR",
      method: uhrada.sposob || f.payment_method || null,
      zdroj: "rucne",
      note: poznamka,
      created_by: userId,
    });
    if (error)
      return { uhradene: false, dovod: { text: "Úhradu sa nepodarilo zapísať: {chyba}", params: { chyba: error.message } } };
    // Spôsob úhrady na faktúre, keď ho nemá (zamknutá faktúra zápis odmietne — úhrada aj tak platí).
    if (!f.payment_method && uhrada.sposob) {
      const { error: eSposobu } = await supabase
        .from("purchase_invoices")
        .update({ payment_method: uhrada.sposob })
        .eq("id", f.id)
        .is("payment_method", null);
      if (eSposobu) console.warn("[nespracovane-uhrada] spôsob úhrady sa nezapísal:", eSposobu.message);
    }
    return { uhradene: true };
  } catch (e: any) {
    return { uhradene: false, dovod: { text: "Úhradu sa nepodarilo zapísať: {chyba}", params: { chyba: String(e?.message ?? e) } } };
  }
}

export type VysledokUhrady = {
  purchaseInvoiceId: string;
  cislo: string;
  /** Faktúra je teraz označená ako uhradená (pribudla úhrada). */
  uhradene: boolean;
  /** Prečo sa úhrada nezapísala (už uhradená, stornovaná, chyba). */
  dovod?: Dovod;
};

/** Doklad o úhrade, ktorého súbor ide k prijatej faktúre (nespracovaný doklad alebo bloček). */
export type ZdrojUhrady = {
  companyId: string;
  /** Kbelík so súborom dokladu. */
  kos: string;
  filePath: string | null | undefined;
  fileMime?: string | null;
  fileName?: string | null;
  uhrada: UdajeUhrady;
  /** Poznámka zapísanej úhrady. */
  poznamka: string;
};

/**
 * Spoločné jadro „doklad o úhrade k prijatej faktúre“: overí faktúru (tá istá
 * firma, druh, suma), priloží súbor dokladu medzi prílohy faktúry, zavolá
 * `odstranZdroj` (zmazanie nespracovaného záznamu, bloček do koša) — keď
 * zlyhá, príloha sa vráti — a nakoniec nezaplatenú faktúru označí ako
 * uhradenú. Keď suma nesedí, bez `ajInuSumu` odmietne (rozhodne človek).
 */
export async function prilozUhraduKFakture(
  supabase: Klient,
  userId: string,
  zdroj: ZdrojUhrady,
  purchaseInvoiceId: string,
  volby: { ajInuSumu?: boolean },
  odstranZdroj: () => Promise<void>,
): Promise<VysledokUhrady> {
  const { data: f } = await supabase
    .from("purchase_invoices")
    .select(
      "id, company_id, invoice_number, amount_total, currency, status, type, payment_method, advance_amount, advance_invoice_id, deleted_at",
    )
    .eq("id", purchaseInvoiceId)
    .maybeSingle();
  if (!f || f.deleted_at) throw new Error("Prijatá faktúra sa nenašla.");
  if (f.company_id !== zdroj.companyId) throw new Error("Faktúra je v inej firme než doklad.");
  if (!TYPY_NA_UHRADU.includes(f.type)) throw new Error("Doklad o úhrade sa dá priradiť len k prijatej faktúre alebo zálohovej faktúre.");
  if (!zdroj.filePath) throw new Error("Doklad nemá súbor, ktorý by sa dal priložiť.");
  const uhrada = zdroj.uhrada;
  if (!volby.ajInuSumu && sumaSedi(uhrada.suma, f.amount_total) === false)
    throw new Error(
      `${PREDPONA_INEJ_SUMY}Suma dokladu o úhrade ${uhrada.suma} nesedí so sumou faktúry ${f.invoice_number} (${f.amount_total}).`,
    );

  const { count } = await supabase
    .from("prilohy_dokladov")
    .select("id", { count: "exact", head: true })
    .eq("purchase_invoice_id", f.id);
  if ((count ?? 0) >= MAX_PRILOH) throw new Error(`K faktúre sa dá priložiť najviac ${MAX_PRILOH} súborov.`);

  const { data: subor, error: eStiahnutia } = await supabase.storage.from(zdroj.kos).download(zdroj.filePath);
  if (eStiahnutia || !subor) throw new Error("Súbor dokladu sa nepodarilo načítať.");
  const bajty = new Uint8Array(await subor.arrayBuffer());
  if (bajty.length > MAX_PRILOHA) throw new Error("Súbor dokladu je väčší než 15 MB — k faktúre sa priložiť nedá.");
  const typ = typSuboru(zdroj.fileMime ?? "", zdroj.fileName ?? "") ?? typSuboru("", String(zdroj.filePath));
  if (!typ) throw new Error("Tento typ súboru sa k faktúre priložiť nedá.");
  const zly = chybaObsahuPrilohy(typ, bajty);
  if (zly) throw new Error(zly);

  const cesta = cestaPrilohy(f.company_id, f.id, typ);
  const up = await supabase.storage.from(KOS_PRILOH).upload(cesta, bajty, { contentType: typ, upsert: false });
  if (up.error) throw new Error(`Súbor sa nepodarilo uložiť: ${up.error.message}`);
  const { data: priloha, error: ePrilohy } = await supabase
    .from("prilohy_dokladov")
    .insert({
      company_id: f.company_id,
      purchase_invoice_id: f.id,
      path: cesta,
      name: nazovPrilohy(zdroj.fileName, `o úhrade ${f.invoice_number}`, POVOLENE_TYPY[typ] ?? "pdf"),
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
  // Pôvodný záznam preč — keď to neprejde (niekto ho medzitým spracoval, chýba právo), príloha sa vráti.
  try {
    await odstranZdroj();
  } catch (e) {
    await supabase.from("prilohy_dokladov").delete().eq("id", priloha.id);
    await supabase.storage.from(KOS_PRILOH).remove([cesta]);
    throw e;
  }
  // Úhrada až po priložení — keď neprejde, súbor ostáva pri faktúre a človek dostane dôvod.
  const u = await zapisUhradu(supabase, userId, f, uhrada, zdroj.poznamka);
  return { purchaseInvoiceId: f.id, cislo: f.invoice_number, ...u };
}

/**
 * Priloží súbor dokladu o úhrade k prijatej faktúre tej istej firmy, nezaplatenú
 * faktúru označí ako uhradenú (suma, deň a spôsob z dokladu) a nespracovaný
 * záznam zmaže. Keď suma nesedí, bez `ajInuSumu` odmietne (rozhodne človek).
 */
export async function priradUhradu(
  supabase: Klient,
  userId: string,
  r: Record<string, any>,
  purchaseInvoiceId: string,
  volby: { ajInuSumu?: boolean } = {},
): Promise<VysledokUhrady> {
  const uhrada = udajePreUhradu(nacitajUdaje(r.udaje), r.ai ?? null).uhrada!;
  return prilozUhraduKFakture(
    supabase,
    userId,
    {
      companyId: r.company_id,
      kos: KOS_NESPRACOVANYCH,
      filePath: r.file_path,
      fileMime: r.file_mime,
      fileName: r.file_name,
      uhrada,
      poznamka: POZNAMKA_NESPRACOVANE,
    },
    purchaseInvoiceId,
    volby,
    async () => {
      const { data: zmazane, error: eZmazania } = await supabase
        .from("nespracovane_doklady")
        .delete()
        .eq("id", r.id)
        .select("id");
      if (eZmazania || !zmazane?.length)
        throw new Error(eZmazania?.message ?? "Doklad sa nenašiel — možno ho už niekto spracoval.");
      await supabase.storage.from(KOS_NESPRACOVANYCH).remove([r.file_path]);
    },
  );
}

/**
 * Prijatá faktúra z dokladu, ktorý nesie aj samotnú faktúru (METRO: bloček
 * „Úhrada faktúry“ + fotky faktúry s rekapituláciou DPH), a hneď úhrada
 * z dokladu. Bez čitateľnej faktúry v súbore (rozpis DPH, dodávateľ, dátum)
 * odmietne s dôvodom. Faktúra vzniká rovnakou cestou ako „Zaúčtovať“
 * (kontrola duplicít, sadzieb DPH, zaúčtovanie, presun súboru).
 */
export async function vytvorFakturuSUhradou(
  supabase: Klient,
  userId: string,
  r: Record<string, any>,
): Promise<VysledokUhrady & { zauctovana?: boolean }> {
  const { udajeZAi, chybajuce, NAZVY_POLI } = await import("./nespracovane");
  const { data: firma } = await supabase
    .from("companies")
    .select("country, povinne_polia_dokladu, vat_payer, vat_scheme, ic_dph")
    .eq("id", r.company_id)
    .maybeSingle();
  const krajina = (firma?.country ?? null) as string | null;
  const ulozene = nacitajUdaje(r.udaje);
  const uhrada = udajePreUhradu(ulozene, r.ai ?? null).uhrada!;
  const zAi = udajeZAi(r.ai ?? null, dnesBratislava(), { krajina });
  // Zaúčtovanie a poznámky, ktoré človek vyplnil pri doklade o úhrade, ostávajú.
  const z = fakturaZDokladuUhrady({
    ai: r.ai ?? null,
    uhrada,
    udajeFaktury: {
      ...zAi,
      kody: ulozene.kody,
      kategoria: ulozene.kategoria || zAi.kategoria,
      jobId: ulozene.jobId,
      vehicleId: ulozene.vehicleId,
      komentar: ulozene.komentar,
      pravidloId: ulozene.pravidloId,
      datumPrijatia: ulozene.datumPrijatia || zAi.datumPrijatia,
    },
  });
  if (!z.ok) throw new Error(z.dovod);
  const { nastaveniaNespracovanychFirmy, vytvorDoklad } = await import("./nespracovane.server");
  const chyby = chybajuce("faktura", z.udaje, firma?.povinne_polia_dokladu ?? [], await nastaveniaNespracovanychFirmy(supabase, r.company_id));
  if (chyby.length)
    throw new Error(
      `Faktúra v súbore nie je čitateľná celá — chýba: ${chyby.map((k) => NAZVY_POLI[k] ?? k).join(", ")}. Zmeňte druh na Prijatá faktúra a doplňte údaje.`,
    );
  const { kontrolaNespracovaneho } = await import("@/components/faktero/dph-formular");
  // Neplatiteľ DPH si daň neodpočíta — rozpis ho nezastaví (neplatitel-dph.ts).
  const { jeNeplatitel } = await import("./uctovanie-agenda");
  const k = kontrolaNespracovaneho(z.udaje, krajina, "faktura", jeNeplatitel(firma as any));
  if (!k.ok) {
    const { popisChybRozpisu } = await import("./rozpis-dph-kontrola");
    throw new Error(`Rozpis DPH faktúry nesedí (${popisChybRozpisu(k)}). Zmeňte druh na Prijatá faktúra a rozpis opravte.`);
  }
  // Odberateľ na doklade je iná firma — faktúra sa tu nezaloží.
  const { nesediNespracovany, firmaNaPorovnanie } = await import("./cudzia-faktura.server");
  const { chybaCudzej } = await import("./cudzia-faktura");
  const n = nesediNespracovany({ ...r, druh: "faktura" }, await firmaNaPorovnanie(supabase, r.company_id));
  if (n) throw new Error(chybaCudzej(n));

  const v = await vytvorDoklad(supabase, userId, { ...r, druh: "faktura" }, "faktura", z.udaje);
  const { data: f } = await supabase
    .from("purchase_invoices")
    .select("id, company_id, invoice_number, amount_total, currency, status, type, payment_method, advance_amount, advance_invoice_id")
    .eq("id", v.id)
    .maybeSingle();
  if (!f) return { purchaseInvoiceId: v.id, cislo: z.udaje.cislo, uhradene: false, zauctovana: v.zauctovana };
  const u = await zapisUhradu(supabase, userId, f, uhrada);
  return { purchaseInvoiceId: v.id, cislo: f.invoice_number, zauctovana: v.zauctovana, ...u };
}

export type Preskoceny = { popis: string; dovod: Dovod };

/**
 * Hromadné „Priradiť doklady o úhrade“: len doklad o úhrade (druh alebo
 * návrh) s presnou zhodou čísla aj sumy; ostatné sa preskočia s dôvodom.
 */
export async function priradUhradyHromadne(
  supabase: Klient,
  userId: string,
  companyId: string,
  ids: string[],
): Promise<{ priradene: number; uhradene: number; preskocene: Preskoceny[] }> {
  const { data: rows, error } = await supabase
    .from("nespracovane_doklady")
    .select("id, company_id, druh, stav, udaje, ai, file_name, file_path, file_mime")
    .eq("company_id", companyId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const navrhy = await navrhyUhrad(supabase, companyId, rows ?? []);
  let priradene = 0;
  let uhradene = 0;
  const preskocene: Preskoceny[] = [];
  for (const r of (rows ?? []) as any[]) {
    const u = nacitajUdaje(r.udaje);
    const n = navrhy.get(r.id)!;
    const popis =
      [u.dodavatel.nazov, n.uhrada.cisloFaktury || u.cislo].filter((v) => v && String(v).trim()).join(" · ") ||
      r.file_name ||
      "Doklad";
    const rozh = rozhodnutieUhrady({
      druh: r.druh,
      navrh: n.navrh,
      stav: r.stav,
      maSubor: Boolean(r.file_path),
      uhrada: n.uhrada,
      zhody: n.zhody,
    });
    if ("dovod" in rozh) {
      preskocene.push({ popis, dovod: rozh.dovod });
      continue;
    }
    try {
      const v = await priradUhradu(supabase, userId, r, rozh.purchaseInvoiceId);
      priradene++;
      if (v.uhradene) uhradene++;
    } catch (e: any) {
      preskocene.push({ popis, dovod: { text: String(e?.message ?? "").replace(PREDPONA_INEJ_SUMY, "") || "Nepodarilo sa" } });
    }
  }
  return { priradene, uhradene, preskocene };
}
