import { riadkyPreIds, vsetkoAkoData } from "./strankovanie";
import { bezVzorca } from "@/lib/bezpecny-text";
import { dokladDoBalika } from "./odovzdanie-faktury";
import { hodnotaStlpca, kodStlpca, rozpisVystavenej, stlpceRozpisu } from "./rozpis-dph-exportu";
import { rozpisBlocku } from "./rozuctovanie";
import { cestaPatriFirme } from "./cesta-firmy";
import { TYPY_PRIJATYCH_DO_EXPORTU } from "./prijaty-danovy-doklad";

/**
 * Riadky z databázy sa tu netypujú — modul ich len prehadzuje do XML, CSV a
 * ZIPu a o ich tvare rozhodujú generátory v `export.server.ts`.
 */
export type Riadok = any;
/** Klient Supabase z middlewaru; nesie práva prihláseného používateľa. */
export type Klient = any;

/**
 * Odovzdanie za obdobie — jeden balík pre účtovníčku.
 *
 * Doterajší export bol „vyber si faktúry a stiahni XML". To znamená, že si
 * človek musel sám pamätať, čo už poslal; pri mesačnom odovzdávaní z toho
 * vzniká buď chýbajúci, alebo dvakrát zaúčtovaný doklad. Tu sa vyberá
 * **mesiac** a Faktero vie, čo z neho už išlo.
 *
 * V balíku je všetko, čo účtovníčka za mesiac potrebuje: vydané faktúry,
 * prijaté doklady, pokladňa, súpisky na kontrolu a samotné doklady v PDF.
 */
export type OdovzdanieVstup = {
  companyId: string;
  /** Mesiac v tvare `2026-08`. */
  mesiac: string;
  /** Zapísať do histórie, že tieto doklady sú odovzdané. */
  oznacit: boolean;
  /** Preskočiť už odovzdané doklady. */
  lenNove: boolean;
  /**
   * Pridať aj neodovzdané doklady z predošlých mesiacov (neskoro zadané) —
   * mesačný cron. Len s `lenNove`.
   */
  ajStarsieNeodovzdane?: boolean;
  /**
   * Ručné odovzdanie: človek videl závažné chyby (`zavazneOdovzdania`) a
   * potvrdil „Exportovať aj tak“ — doklady s obsahovou prekážkou idú do XML.
   * Mesačný cron ho nezapína (nemá kto potvrdiť), tam sa vynechajú ako doteraz.
   */
  potvrdeneVarovania?: boolean;
};

/**
 * Režim obsahových prekážok v balíku: `vynechat` (cron, predvolene),
 * `zistit` (len zoznam závažných chýb pred potvrdením), `povolit` (po ňom).
 */
type RezimPrekazok = "vynechat" | "zistit" | "povolit";

/** Signál z `zostavBalik` v režime `zistit` — balík sa ďalej nestavia. */
class ZavazneNajdene {
  constructor(
    readonly zavazne: string[],
    /** Upozornenia ako pri ručnom exporte prijatých (export-varovania.ts). */
    readonly varovania: string[] = [],
  ) {}
}

const MESIACE = [
  "január",
  "február",
  "marec",
  "apríl",
  "máj",
  "jún",
  "júl",
  "august",
  "september",
  "október",
  "november",
  "december",
];

export function rozsahMesiaca(mesiac: string): { od: string; do: string; nazov: string } {
  const [r, m] = mesiac.split("-").map(Number);
  const dalsiMesiac = m === 12 ? 1 : m + 1;
  const dalsiRok = m === 12 ? r + 1 : r;
  return {
    od: `${r}-${String(m).padStart(2, "0")}-01`,
    do: `${dalsiRok}-${String(dalsiMesiac).padStart(2, "0")}-01`,
    nazov: `${MESIACE[m - 1] ?? mesiac} ${r}`,
  };
}

function csvHodnota(v: unknown): string {
  const s = v == null ? "" : bezVzorca(v);
  return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function csvSubor(hlavicka: string[], riadky: unknown[][]): string {
  // BOM, nech Excel prečíta diakritiku.
  return "﻿" + [hlavicka.join(";"), ...riadky.map((r) => r.map(csvHodnota).join(";"))].join("\r\n");
}

const TYP_DOKLADU: Record<string, string> = {
  regular: "Faktúra",
  proforma: "Zálohová faktúra",
  credit_note: "Dobropis",
  debit_note: "Ťarchopis",
  advance_payment: "Doklad k prijatej platbe",
};

/** Bezpečný názov súboru v ZIPe — diakritika ostáva, oddeľovače nie. */
function nazovSuboru(s: unknown): string {
  return String(s ?? "doklad")
    .replace(/[/\\?%*:|"<>\r\n]+/g, "-")
    .trim()
    .slice(0, 80);
}

/**
 * Koľko sa toho zmestí do prílohy mailu.
 *
 * Resend prijme 40 MB, ale schránka príjemcu býva prísnejšia (Gmail 25 MB) a
 * base64 objem ešte o tretinu nafúkne. Keď sa PDF a skeny nezmestia, balík
 * odíde bez nich — údaje na zaúčtovanie sú dôležitejšie než obrázky a v
 * Fakteru ostanú dostupné.
 */
export const STROP_PRILOH_MAILOM = 12 * 1024 * 1024;

export type Balik = {
  base64: string;
  fileName: string;
  pocetFaktur: number;
  pocetDokladov: number;
  pocetPokladnicnych: number;
  /** Pokladničné doklady, ktoré išli v XML (majú skratku pokladne) — označia sa ako odovzdané. */
  pokladnicaIds?: string[];
  /** Bankové pohyby v pohoda-banka.xml (`pohoda_posielat_banku`) — označia sa ako odovzdané. */
  bankaIds?: string[];
  /** Listy, predpisy, exekúcie a zmluvy doručené v mesiaci. */
  pocetOstatnych: number;
  ostatneIds: string[];
  preskocene: string[];
  /** Len vynechané vydané faktúry — podľa nich sa značí história faktúr. */
  preskoceneFaktur?: string[];
  vynechanePrilohy: number;
  fakturyIds: string[];
  dokladyIds: string[];
  /** Prijaté faktúry v balíku (označia sa ako odovzdané). */
  prijateIds?: string[];
  pocetPrijatych?: number;
  /** Doklady, ktoré išli do XML napriek závažnej chybe (po potvrdení). */
  zavazne?: string[];
  /** Doklady z predošlých mesiacov, ktoré pribudli neskôr (V11, cron). */
  neskoroZadane?: number;
  /**
   * Upozornenia k prijatým faktúram v XML (sadzba DPH, prenesenie bez
   * príznaku, chýbajúca predkontácia) — ručný balík ich ukáže na potvrdenie
   * ako ručný export, v balíku sú v pohoda-skontrolovat.txt a v maile.
   */
  varovania?: string[];
  /** Číselníky, ktoré v balíku išli — zapisujú sa do `pohoda_odoslane`. */
  ciselniky: { agenda: string; id: string; verzia: string }[];
  pocetCiselnikov: number;
  xmlFaktur: string;
  /** XML prijatých dokladov (bločkov) a prijatých faktúr — ukladá sa do histórie ako pri faktúrach. */
  xmlDokladov?: string;
  xmlPrijatych?: string;
  poslednyDatum: string;
  nazovObdobia: string;
};

/**
 * `pohoda-skontrolovat.txt` v balíku: doklady v XML napriek závažnej chybe a
 * upozornenia k prijatým (ako pri ručnom exporte). Bez nich `null`.
 */
export function suborSkontrolovat(zavazne: string[], varovania: string[]): string | null {
  if (!zavazne.length && !varovania.length) return null;
  return (
    "\uFEFF" +
    (zavazne.length
      ? "Tieto doklady sú v XML pre Pohodu napriek závažnej chybe — po importe ich skontrolujte v Pohode:\n" +
        zavazne.map((d) => `- ${d}`).join("\n") +
        "\n"
      : "") +
    (varovania.length
      ? `${zavazne.length ? "\n" : ""}Upozornenia — po importe skontrolujte v Pohode:\n` +
        varovania.map((d) => `- ${d}`).join("\n") +
        "\n"
      : "")
  );
}

/**
 * Spodná hranica pre neskoro zadané doklady: najskorší začiatok obdobia, za
 * ktoré firma niečo odovzdala (balík, súbor, konektor), najviac rok pred
 * mesiacom balíka. Bez histórie odovzdaní len mesiac sám — doklady spred
 * používania Faktera sa nepribaľujú.
 */
export async function hranicaNeskoroZadanych(supabase: Klient, companyId: string, od: string): Promise<string> {
  const { data } = await supabase
    .from("export_jobs")
    .select("date_from")
    .eq("company_id", companyId)
    .eq("target_system", "pohoda")
    .not("date_from", "is", null)
    .order("date_from", { ascending: true })
    .limit(1);
  const prvy = String(data?.[0]?.date_from ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prvy) || prvy >= od) return od;
  const rokPred = `${Number(od.slice(0, 4)) - 1}${od.slice(4)}`;
  return prvy > rokPred ? `${prvy.slice(0, 8)}01` : rokPred;
}

/**
 * Zostaví balík za mesiac. Nič nezapisuje — o tom, či sa doklady označia za
 * odovzdané, rozhoduje volajúci.
 */
export async function zostavBalik(
  supabase: Klient,
  vstup: OdovzdanieVstup & { stropPriloh?: number; _rezim?: RezimPrekazok },
): Promise<{ balik: Balik; company: Riadok }> {
  const { od, do: doDatumu, nazov } = rozsahMesiaca(vstup.mesiac);
  /*
    V11 (audit 14. 11. 2026): mesačný cron posielal len doklady s dátumom
    v minulom mesiaci — doklad zadaný neskôr (bloček z minulého mesiaca
    nahratý až po 5.) neodišiel nikdy. S `ajStarsieNeodovzdane` (cron, len
    nové) ide aj to, čo z predošlých mesiacov ešte neodišlo — najviac rok
    dozadu a nie pred prvým odovzdaním z Faktera.
  */
  const odVyberu =
    vstup.ajStarsieNeodovzdane && vstup.lenNove ? await hranicaNeskoroZadanych(supabase, vstup.companyId, od) : od;
  const rezim: RezimPrekazok = vstup._rezim ?? (vstup.potvrdeneVarovania ? "povolit" : "vynechat");
  /** Obsahové prekážky: v `zistit` zoznam na potvrdenie, v `povolit` doklady v XML napriek chybe. */
  const zavazne: string[] = [];
  /** Upozornenia k prijatým (export-varovania.ts) — doklad nezastavia, ukážu sa. */
  const varovania: string[] = [];

  const [{ data: company, error: cErr }, { data: vsetky }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", vstup.companyId).single(),
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("invoices")
        .select("*")
        .eq("company_id", vstup.companyId)
        .gte("issue_date", odVyberu)
        .lt("issue_date", doDatumu)
        .neq("status", "draft")
        .neq("status", "cancelled")
        .is("deleted_at", null)
        .order("issue_date")
        .order("id")
        .range(zac, kon),
    ),
  ]);
  if (cErr) throw new Error(cErr.message);
  if (!company) throw new Error("Firma nenájdená");

  // Čo už raz odišlo, sa druhýkrát neposiela — inak doklad pribudne dvakrát.
  const { data: uzOdovzdane } = await vsetkoAkoData((zac, kon) =>
    supabase
      .from("export_logs")
      .select("invoice_id")
      .eq("company_id", vstup.companyId)
      .eq("status", "ok")
      .order("id")
      .range(zac, kon),
  );
  const odovzdaneIds = new Set((uzOdovzdane ?? []).map((r: Riadok) => r.invoice_id));

  // Schvaľovanie: účtovníčke ide len schválené (doklady spred zapnutia áno).
  const { lenSchvalene } = await import("./schvalovanie.server");
  const { ok: fakturySch, cakaju: cakajuFaktury } = await lenSchvalene(
    supabase,
    vstup.companyId,
    "vystavena",
    (vsetky ?? []).filter((f: Riadok) => !vstup.lenNove || !odovzdaneIds.has(f.id)),
  );
  // Prázdne kódy tak, ako ich ukazuje detail („automaticky“), doplnené aj na doklad.
  const faktury = await (
    await import("./clenenie-vystavenej.server")
  ).zauctovanieNaExport(supabase, vstup.companyId, fakturySch, { ulozit: true });

  const [{ data: vsetkyDoklady }, { data: pokladnicaVsetko }, { data: vsetkyOstatne }] =
    await Promise.all([
      vsetkoAkoData((zac, kon) =>
        supabase
          .from("expense_documents")
          .select("*")
          .eq("company_id", vstup.companyId)
          // Nespracovaný bloček (`new`) účtovníčke nejde — ešte ho nik neskontroloval.
          .neq("status", "new")
          .gte("issue_date", odVyberu)
          .lt("issue_date", doDatumu)
          .order("issue_date")
          .order("id")
          .range(zac, kon),
      ),
      vsetkoAkoData((zac, kon) =>
        supabase
          .from("cash_entries")
          .select("*")
          .eq("company_id", vstup.companyId)
          .gte("entry_date", odVyberu)
          .lt("entry_date", doDatumu)
          .order("entry_date")
          .order("id")
          .range(zac, kon),
      ),
      // Iné doklady sa radia podľa dňa doručenia — dátum vystavenia nemajú.
      vsetkoAkoData((zac, kon) =>
        supabase
          .from("other_documents")
          .select(
          "*, other_document_files(path, name, position), zamestnanec:employees(first_name, last_name), zmluva:financing_contracts(name, provider_name, contract_number)",
          )
          .eq("company_id", vstup.companyId)
          .gte("received_date", odVyberu)
          .lt("received_date", doDatumu)
          .order("received_date")
          .order("id")
          .range(zac, kon),
      ),
    ]);
  const { ok: doklady, cakaju: cakajuDoklady } = await lenSchvalene(
    supabase,
    vstup.companyId,
    "doklad",
    (vsetkyDoklady ?? []).filter(
      (d: Riadok) => dokladDoBalika(d) && (!vstup.lenNove || !d.exported_at),
    ),
  );

  /*
    Prijaté faktúry za mesiac. Účtovníčka ich v Pohode zaúčtuje sama, preto
    idú všetky vystavené (nie len tie zaúčtované vo Fakteri) — predkontácia a
    členenie sa pridajú, keď ich faktúra má. Samofaktúra až po odsúhlasení.
  */
  const { data: vsetkyPrijate } = await vsetkoAkoData((zac, kon) =>
    supabase
      .from("purchase_invoices")
      .select("*")
      .eq("company_id", vstup.companyId)
      .gte("issue_date", odVyberu)
      .lt("issue_date", doDatumu)
      .is("deleted_at", null)
      // Aj prijaté zálohové — v Pohode sa evidujú kvôli odpočtu zálohy (bez DPH, neúčtujú sa).
      .in("type", [...TYPY_PRIJATYCH_DO_EXPORTU])
      .not("status", "in", "(draft,cancelled)")
      .order("issue_date")
      .order("id")
      .range(zac, kon),
  );
  const { zapocitatelna } = await import("./samofakturacia");
  const { ok: prijate, cakaju: cakajuPrijate } = await lenSchvalene(
    supabase,
    vstup.companyId,
    "prijata",
    (vsetkyPrijate ?? []).filter((p: Riadok) => zapocitatelna(p) && (!vstup.lenNove || !p.exported_at)),
  );
  const cakajuNaSchvalenie = cakajuFaktury + cakajuDoklady + cakajuPrijate;
  const ostatne = (vsetkyOstatne ?? []).filter((d: Riadok) => !vstup.lenNove || !d.exported_at);
  // Pokladňa ako ostatné doklady: „len nové“ = ešte neodovzdané (konektor ich značí rovnako).
  const pokladnica = (pokladnicaVsetko ?? []).filter((p: Riadok) => !vstup.lenNove || !p.exported_at);

  /*
    Bankové pohyby (`pohoda_posielat_banku`) — účty so skratkou v POHODE,
    to isté XML ako ručné „XML pre POHODU“ a konektor (id `BNK-<id>`, takže
    POHODA pohyb, ktorý už má, odmietne ako duplicitu). „Len nové“ = ešte
    neodovzdané; označia sa pri odovzdaní ako ostatné doklady. Len pohyby
    mesiaca balíka (nie `odVyberu` cronu) — po zapnutí by inak odišiel rok
    histórie, ktorú si účtovníčka mohla načítať z banky sama.
  */
  const banka = await (await import("./banka-pohoda.server")).bankaPreDavku(supabase, {
    company,
    od,
    doDna: doDatumu,
    ajOdovzdane: !vstup.lenNove,
    dnes: new Date(),
  });

  if (
    !faktury.length &&
    !doklady.length &&
    !prijate.length &&
    !pokladnica?.length &&
    !ostatne.length &&
    !banka.zaznamy.length
  ) {
    throw new Error(
      vstup.lenNove &&
        (vsetky?.length || vsetkyDoklady?.length || vsetkyOstatne?.length || vsetkyPrijate?.length)
        ? `Za ${nazov} už bolo všetko odovzdané`
        : `Za ${nazov} nie sú žiadne doklady`,
    );
  }

  const polozky = await riadkyPreIds<Riadok>(
    faktury.map((f: Riadok) => String(f.id)),
    (kus, zac, kon) =>
      supabase
        .from("invoice_items")
        .select("*")
        .in("invoice_id", kus)
        .order("invoice_id")
        .order("position")
        .order("id")
        .range(zac, kon),
  );

  const nastavenia = {
    predkontacia: company.pohoda_predkontacia,
    predkontaciaZaloha: company.pohoda_predkontacia_zaloha,
    predkontaciaDobropis: company.pohoda_predkontacia_dobropis,
    clenenieDph: company.pohoda_clenenie_dph,
    clenenieDphPdp: company.pohoda_clenenie_dph_pdp,
    banka: company.pohoda_banka,
    stredisko: company.pohoda_stredisko,
    zamknuteDo: company.locked_until,
    predkontaciaPrijata: company.pohoda_predkontacia_prijata,
    clenenieDphPrijata: company.pohoda_clenenie_dph_prijata,
    predkontaciaDoklady: company.pohoda_predkontacia_doklady,
    clenenieDphDoklady: company.pohoda_clenenie_dph_doklady,
    kvFaktura: company.kv_clenenie_faktura,
    kvPrijata: company.kv_clenenie_prijata,
    kvDoklady: company.kv_clenenie_doklady,
    predkontaciaRozuctovat: company.pohoda_predkontacia_rozuctovat,
    blockyPodlaPlatby: company.pohoda_blocky_agenda === "podla_platby",
    podlaKategorie: await (await import("./predkontacie.server")).kodyPodlaKategorie(supabase, company.id),
    pokladna: company.pohoda_pokladna,
    ...(await (await import("./pokladne.server")).nastaveniaPokladniFirmy(supabase, company.id, company.pohoda_pokladna)),
    predkontaciaPokladna: company.pohoda_predkontacia_pokladna,
    sklad: company.pohoda_sklad,
    cenovaSkupina: (company as any).pohoda_cenova_skupina,
    // Nastavenia exportu, skratky bankových účtov a partneri v adresári Pohody.
    ...(await (await import("./export-nastavenia.server")).doplnkyExportu(supabase, company)),
  };

  const {
    EXPORT_STRATEGIES,
    buildPohodaCashXml,
    pohybyBezPokladne,
    buildPohodaExpensesXml,
    buildPohodaAddressbookXml,
    buildPohodaStockXml,
    buildPohodaContractsXml,
    buildPohodaMovementsXml,
    buildPohodaStornaXml,
    zoskupPohyby,
  } = await import("./export.server");

  // Balík nesie to isté, čo priame prepojenie — inak by ten, kto konektor
  // nechce, o adresár, sklad a zákazky prišiel len preto, že si vybral mail.
  const {
    cislaVPohode,
    nacitajPohyby,
    nacitajStorna,
    nacitajVazby,
    nacitajZakaznikov,
    nacitajZakazky,
    nacitajZasoby,
  } = await import("./pohoda-konektor.server");

  const cisla = await cislaVPohode(supabase, vstup.companyId);
  const { zalohy, opravovane, povodneCisla } = await nacitajVazby(supabase, vstup.companyId, faktury, cisla);
  const vsetkyStorna = await nacitajStorna(supabase, vstup.companyId, cisla);

  /*
    Partneri „pridať alebo aktualizovať a párovať" (Predkontácie → Export):
    aj bez celého adresára idú karty partnerov dokladov z balíka.
  */
  const { nastaveniaExportu } = await import("./export-nastavenia");
  const parovatPartnerov = nastaveniaExportu(company.uctovanie_nastavenia).partneri === "parovat";
  /*
    Daňový doklad k platbe je v Pohode interný doklad — ten sa cez XML
    stornovať nedá. Do storien nejde, súhrn povie, čo urobiť v Pohode ručne.
  */
  const { rozdelStorna, hlaskaRucnychStorien } = await import("./storno-dokladu-k-platbe");
  const { doXml: storna, rucne: stornaRucne } = rozdelStorna(
    vsetkyStorna,
    nastaveniaExportu(company.uctovanie_nastavenia).dokladKPlatbe,
  );
  const partneriDokladov = new Set(
    [...faktury, ...prijate].map((d: Riadok) => String(d.customer_id ?? "")).filter(Boolean),
  );
  const zakaznici = company.pohoda_posielat_adresar
    ? await nacitajZakaznikov(supabase, vstup.companyId)
    : parovatPartnerov && partneriDokladov.size
      ? (await nacitajZakaznikov(supabase, vstup.companyId)).filter((z: Riadok) =>
          partneriDokladov.has(String(z.id)),
        )
      : [];
  // Karty z balíka (pohoda-adresar.xml) — doklady sa na ne odvolajú cez extId.
  if (parovatPartnerov)
    nastavenia.partneriVPohode = [
      ...new Set([...(nastavenia.partneriVPohode ?? []), ...zakaznici.map((z: Riadok) => String(z.id))]),
    ];
  const zasoby =
    company.pohoda_posielat_sklad && company.pohoda_sklad && (company as any).pohoda_cenova_skupina
      ? await nacitajZasoby(supabase, vstup.companyId)
      : [];
  const { nove: zakazkyNove, kody: zakazky } = company.pohoda_posielat_zakazky
    ? await nacitajZakazky(supabase, vstup.companyId, faktury)
    : { nove: [] as Riadok[], kody: {} as Record<string, string> };
  const pohyby =
    company.pohoda_posielat_pohyby && company.pohoda_posielat_sklad && company.pohoda_sklad && (company as any).pohoda_cenova_skupina
      ? await nacitajPohyby(supabase, vstup.companyId, zasoby)
      : [];

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  let xmlFaktur = "";
  let preskocene: string[] = [];
  let vyvezene: Riadok[] = [];
  if (faktury.length) {
    const balikFaktur = faktury.map((invoice: Riadok) => ({
      invoice,
      items: (polozky ?? []).filter((p: Riadok) => p.invoice_id === invoice.id),
    }));
    /*
      Obsahové prekážky vydaných faktúr (`pohodaPrekazka`) — pri ručnom
      odovzdaní len „Závažné“; po potvrdení ide faktúra do XML (Patrik 13. 11.).
    */
    if (rezim !== "vynechat") {
      const { pohodaPrekazka } = await import("./export.server");
      for (const b of balikFaktur) {
        const dovod = pohodaPrekazka(b.invoice, company, { items: b.items, nastavenia });
        if (dovod) zavazne.push(dovod);
      }
    }
    const nastFaktur = rezim === "povolit" ? { ...nastavenia, ajSPrekazkami: true } : nastavenia;
    // Jedna nevyviezteľná faktúra nesmie zhodiť celý balík — pôjde do vynechaných.
    const { fakturyDoBalika } = await import("./odovzdanie-faktury");
    const vystup = await fakturyDoBalika(
      balikFaktur,
      (b) => String(b.invoice.invoice_number ?? b.invoice.id),
      (vyber) =>
        EXPORT_STRATEGIES.pohoda_xml.build({
          company,
          invoices: vyber,
          nastavenia: nastFaktur,
          zalohy,
          opravovane,
          povodneCisla,
          zakazky,
        }),
    );
    xmlFaktur = vystup.content;
    preskocene = vystup.preskocene;
    if (cakajuNaSchvalenie)
      preskocene.push(`${cakajuNaSchvalenie} dokladov čaká na schválenie — pôjdu v ďalšom odovzdaní`);
    const cislaPreskocenych = new Set(preskocene.map((d) => String(d).split(" — ")[0]));
    vyvezene = faktury.filter((f: Riadok) => !cislaPreskocenych.has(f.invoice_number));

    if (xmlFaktur) zip.file("pohoda-faktury.xml", xmlFaktur);
    // Rozpis DPH po sadzbách (zaklad_23, dph_23, …) a KV — za pôvodné stĺpce.
    const rozpisFaktur = balikFaktur.map((b) => rozpisVystavenej(b.invoice, b.items, company.country));
    const stlpceFaktur = stlpceRozpisu(rozpisFaktur);
    zip.file(
      "faktury.csv",
      csvSubor(
        [
          "cislo",
          "typ",
          "vystavena",
          "dodanie",
          "splatnost",
          "odberatel",
          "ico",
          "ic_dph",
          "zaklad",
          "dph",
          "celkom",
          "mena",
          "v_xml",
          ...stlpceFaktur.map(kodStlpca),
          "kv_dph",
        ],
        faktury.map((f: Riadok, i: number) => [
          f.invoice_number,
          TYP_DOKLADU[f.type] ?? f.type,
          f.issue_date,
          f.delivery_date ?? "",
          f.due_date,
          f.customer_name ?? "",
          f.customer_ico ?? "",
          f.customer_ic_dph ?? "",
          f.subtotal,
          f.vat_total,
          f.total,
          f.currency,
          cislaPreskocenych.has(f.invoice_number) ? "nie" : "áno",
          ...stlpceFaktur.map((st) => hodnotaStlpca(rozpisFaktur[i] ?? [], st)),
          f.kv_clenenie ?? "",
        ]),
      ),
    );
  }

  const preskoceneFaktur = [...preskocene];
  /*
    Kontrola pred odovzdaním: duplicita a cudzí doklad do XML nejdú nikdy.
    Doklad, ktorý by Pohoda zaúčtovala zle (obsahová prekážka), cron vynechá —
    ostane v súpiske a v zozname vynechaných; ručné odovzdanie ho po
    potvrdení pustí (`rezim`).
  */
  const { prekazkaDokladu, prekazkaStavuDokladu } = await import("./pohoda-kontrola");
  /** `true` = doklad ide do XML. */
  const doXml = (d: Riadok, nast: Riadok): boolean => {
    const stav = prekazkaStavuDokladu(d);
    if (stav) return preskocene.push(stav), false;
    const dovod = prekazkaDokladu(d, company, { ...nast, ajSPrekazkami: false });
    if (!dovod) return true;
    if (rezim === "vynechat") return preskocene.push(dovod), false;
    zavazne.push(dovod);
    return true;
  };
  // Duplicitný doklad (ten istý dvakrát v evidencii) do XML nejde — `_duplicita`.
  {
    const { oznacDuplicity } = await import("./duplicita-zauctovania.server");
    // Už odovzdané ostávajú v balíku ako doteraz — zastaví sa len nový duplikát.
    await oznacDuplicity(supabase, vstup.companyId, "blocek", doklady.filter((d: Riadok) => !d.exported_at));
    await oznacDuplicity(supabase, vstup.companyId, "prijata", prijate.filter((p: Riadok) => !p.exported_at));
  }
  let xmlDokladov = "";
  let dokladyDoXml: Riadok[] = [];
  if (doklady.length) {
    const nastDokladov = {
      ...nastavenia,
      ...(await (await import("./predkontacie.server")).nastaveniaDokladov(supabase, company, doklady)),
      partneriVPohode: nastavenia.partneriVPohode,
    };
    for (const d of doklady) if (doXml(d, nastDokladov)) dokladyDoXml.push(d);
    if (dokladyDoXml.length) {
      xmlDokladov = buildPohodaExpensesXml({
        company,
        doklady: dokladyDoXml,
        nastavenia: { ...nastDokladov, ajSPrekazkami: rezim === "povolit" },
      });
      if (xmlDokladov) zip.file("pohoda-prijate-doklady.xml", xmlDokladov);
      else dokladyDoXml = [];
    }
    const rozpisDokladov = doklady.map((d: Riadok) => rozpisBlocku(d));
    const stlpceDokladov = stlpceRozpisu(rozpisDokladov);
    zip.file(
      "prijate-doklady.csv",
      csvSubor(
        [
          "datum",
          "dodavatel",
          "ico",
          "ic_dph",
          "cislo_dokladu",
          "zaklad",
          "dph",
          "celkom",
          "mena",
          "kategoria",
          ...stlpceDokladov.map(kodStlpca),
          "kv_dph",
        ],
        doklady.map((d: Riadok, i: number) => [
          d.issue_date,
          d.supplier_name ?? "",
          d.supplier_ico ?? "",
          d.supplier_ic_dph ?? "",
          d.document_number ?? "",
          d.net_amount,
          d.vat_amount,
          d.total_amount,
          d.currency,
          d.category ?? "",
          ...stlpceDokladov.map((st) => hodnotaStlpca(rozpisDokladov[i] ?? [], st)),
          d.kv_clenenie ?? "",
        ]),
      ),
    );
  }

  let xmlPrijatych = "";
  let prijateDoXml: Riadok[] = [];
  if (prijate.length) {
    const { prijataAkoDoklad } = await import("./prijate-do-pohody");
    const nastPrijatych = {
      ...nastavenia,
      ...(await (await import("./predkontacie.server")).nastaveniaDokladov(
        supabase,
        company,
        prijate.map(prijataAkoDoklad),
      )),
      partneriVPohode: nastavenia.partneriVPohode,
    };
    for (const p of prijate) if (doXml(prijataAkoDoklad(p), nastPrijatych)) prijateDoXml.push(p);
    /*
      Upozornenia ako pri ručnom exporte prijatých (audit 14. 11., S7) —
      balík ich predtým nikomu neukázal.
    */
    const { varovaniaPrijatejPredExportom } = await import("./export-varovania");
    for (const p of prijateDoXml) varovania.push(...varovaniaPrijatejPredExportom(p, company, nastPrijatych));
    if (prijateDoXml.length) {
      xmlPrijatych = buildPohodaExpensesXml({
        company,
        doklady: prijateDoXml.map(prijataAkoDoklad),
        nastavenia: { ...nastPrijatych, ajSPrekazkami: rezim === "povolit" },
      });
      if (xmlPrijatych) zip.file("pohoda-prijate-faktury.xml", xmlPrijatych);
      else prijateDoXml = [];
    }
    const { rozpisPrijatej, sadzbaSamozdanenia, jeSamozdanenieCele } = await import("./prijate-do-pohody");
    // Prenesená časť bez sadzby ide v stĺpci základnej sadzby (zaklad_pdp_23), nie „0“.
    const rozpisPrijatych = prijate.map((p: Riadok) =>
      sadzbaSamozdanenia(rozpisPrijatej(p), {
        cele: jeSamozdanenieCele(p),
        krajina: company?.country,
        den: p.delivery_date || p.issue_date,
      }),
    );
    const stlpcePrijatych = stlpceRozpisu(rozpisPrijatych);
    zip.file(
      "prijate-faktury.csv",
      csvSubor(
        [
          "cislo_faktury",
          "dodavatel",
          "ico",
          "ic_dph",
          "vystavena",
          "dodanie",
          "splatnost",
          "zaklad",
          "dph",
          "celkom",
          "mena",
          "predkontacia",
          "clenenie_dph",
          "zauctovana",
          "typ",
          ...stlpcePrijatych.map(kodStlpca),
          "kv_dph",
          "rezim_dph",
        ],
        prijate.map((p: Riadok, i: number) => [
          p.invoice_number,
          p.supplier_name ?? "",
          p.supplier_ico ?? "",
          p.supplier_ic_dph ?? "",
          p.issue_date,
          p.delivery_date ?? "",
          p.due_date ?? "",
          p.amount_without_vat,
          p.vat_amount,
          p.amount_total,
          p.currency,
          p.pohoda_predkontacia ?? "",
          p.pohoda_clenenie_dph ?? "",
          p.zauctovane_at ? "áno" : "nie",
          p.type === "proforma" ? "zálohová" : p.type === "advance_payment" ? "daňový doklad k platbe" : "faktúra",
          ...stlpcePrijatych.map((st) => hodnotaStlpca(rozpisPrijatych[i] ?? [], st)),
          p.kv_clenenie ?? "",
          p.dph_rezim ?? "",
        ]),
      ),
    );
  }

  // Pred potvrdením stačí zoznam závažných chýb — PDF a skeny sa nesťahujú.
  if (rezim === "zistit" && (zavazne.length || varovania.length)) throw new ZavazneNajdene(zavazne, varovania);
  {
    const skontrolovat = suborSkontrolovat(zavazne, varovania);
    if (skontrolovat) zip.file("pohoda-skontrolovat.txt", skontrolovat);
  }

  const pokladnicaDoXml: Riadok[] = [];
  if (pokladnica?.length) {
    /*
      Pokladničný doklad bez pokladne Pohoda nezaloží (voucher.xsd:
      `cashAccount` je „vyžadován při vytvoření dokladu“) — XML sa bez skratky
      pokladne nevyrobí, pohyby ostanú v súpiske a povie sa to.
    */
    // Viac pokladní: skratka podľa pokladne pohybu, inak predvolená/firma.
    const bezSkratky = pohybyBezPokladne(pokladnica, nastavenia);
    const bezSkratkyIds = new Set(bezSkratky.map((p: Riadok) => p.id));
    pokladnicaDoXml.push(...pokladnica.filter((p: Riadok) => !bezSkratkyIds.has(p.id)));
    if (bezSkratky.length < pokladnica.length)
      zip.file(
        "pohoda-pokladna.xml",
        buildPohodaCashXml({ company, pohyby: pokladnica, nastavenia }),
      );
    if (bezSkratky.length)
      preskocene.push(
        `Pokladňa (${bezSkratky.length}) — chýba skratka pokladne pre Pohodu — doplňte ju v Pokladňa → Pokladne alebo v Účtovníctvo → Prepojenie s Pohodou`,
      );
    zip.file(
      "pokladna.csv",
      csvSubor(
        ["cislo", "datum", "druh", "suma", "popis", "kategoria"],
        pokladnica.map((p: Riadok) => [
          p.entry_number,
          p.entry_date,
          p.type === "prijem" ? "príjem" : "výdavok",
          p.amount,
          p.description ?? "",
          p.category ?? "",
        ]),
      ),
    );
  }

  // Číselníky a väzby — každý ako vlastný súbor, aby si účtovníčka mohla
  // naimportovať len to, čo naozaj chce.
  if (zakaznici.length) {
    zip.file("pohoda-adresar.xml", buildPohodaAddressbookXml({ company, zakaznici }));
  }
  if (zasoby.length) {
    zip.file("pohoda-sklad.xml", buildPohodaStockXml({ company, zasoby, nastavenia }));
  }
  if (zakazkyNove.length) {
    zip.file("pohoda-zakazky.xml", buildPohodaContractsXml({ company, zakazky: zakazkyNove }));
  }
  if (pohyby.length) {
    zip.file(
      "pohoda-skladove-pohyby.xml",
      buildPohodaMovementsXml({ company, skupiny: zoskupPohyby(pohyby), nastavenia }),
    );
  }
  const hlaskaStorien = hlaskaRucnychStorien(stornaRucne);
  if (hlaskaStorien) preskocene.push(hlaskaStorien);
  if (storna.length) {
    // Storno je samostatný súbor zámerne: ruší doklad, ktorý v Pohode už je, a
    // účtovníčka si ho má naimportovať vedome.
    zip.file("pohoda-storna.xml", buildPohodaStornaXml({ company, storna }));
  }
  if (banka.entries) {
    const { obalkaBankovehoVypisu } = await import("./export.server");
    zip.file("pohoda-banka.xml", obalkaBankovehoVypisu(company, banka.entries));
  }
  preskocene.push(...banka.hlasky);

  // Samotné doklady. Účtovníčka potrebuje aj papier, nielen údaje — ale keď sa
  // balík posiela mailom, prílohy majú strop a údaje sú dôležitejšie.
  const strop = vstup.stropPriloh ?? Infinity;
  let velkost = 0;
  let vynechanePrilohy = 0;

  const { ensureInvoicePdf } = await import("./invoice-pdf.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const pdfPriecinok = zip.folder("faktury-pdf")!;
  for (const f of vyvezene) {
    if (velkost >= strop) {
      vynechanePrilohy++;
      continue;
    }
    try {
      const { path, fileName } = await ensureInvoicePdf(f.id);
      const { data: subor } = await supabaseAdmin.storage.from("invoice-pdfs").download(path);
      if (!subor) {
        vynechanePrilohy++;
        continue;
      }
      const bajty = await subor.arrayBuffer();
      velkost += bajty.byteLength;
      pdfPriecinok.file(fileName, bajty);
    } catch {
      // Jedna nevydarená faktúra nesmie zhodiť celé odovzdanie.
      vynechanePrilohy++;
    }
  }

  /*
   * Prílohy vydaných faktúr (dodací list, zmluva, výkaz) patria účtovníčke
   * rovnako ako samotné PDF — bez podpísaného dodacieho listu faktúru často
   * nezaúčtuje. Každá faktúra má vlastný priečinok, aby sa súbory rovnakého
   * mena z rôznych faktúr neprebili.
   */
  if (vyvezene.length) {
    const { data: prilohy } = await supabaseAdmin
      .from("invoice_attachments")
      .select("invoice_id, path, name, size")
      .in(
        "invoice_id",
        vyvezene.map((f: Riadok) => f.id),
      )
      .order("created_at");
    const cisla = new Map(vyvezene.map((f: Riadok) => [f.id, String(f.invoice_number ?? f.id)]));
    const prilohyPriecinok = zip.folder("faktury-prilohy")!;
    const pouzite = new Set<string>();
    for (const p of prilohy ?? []) {
      if (velkost >= strop) {
        vynechanePrilohy++;
        continue;
      }
      // Cestu vie člen firmy v riadku prepísať — cudzí súbor do balíka nepatrí.
      if (!cestaPatriFirme(p.path, company.id)) {
        vynechanePrilohy++;
        continue;
      }
      try {
        const { data: subor } = await supabaseAdmin.storage
          .from("invoice-attachments")
          .download(p.path);
        if (!subor) {
          vynechanePrilohy++;
          continue;
        }
        const priecinok = (cisla.get(p.invoice_id as string) ?? "bez-cisla").replace(
          /[\\/:*?"<>|]/g,
          "-",
        );
        let meno = `${priecinok}/${p.name}`;
        for (let i = 2; pouzite.has(meno); i++) meno = `${priecinok}/${i}-${p.name}`;
        pouzite.add(meno);
        const bajty = await subor.arrayBuffer();
        velkost += bajty.byteLength;
        prilohyPriecinok.file(meno, bajty);
      } catch {
        vynechanePrilohy++;
      }
    }
  }

  const skeny = zip.folder("prijate-doklady-skeny")!;
  for (const d of doklady) {
    if (!d.file_path) continue;
    if (!cestaPatriFirme(d.file_path, company.id)) {
      vynechanePrilohy++;
      continue;
    }
    if (velkost >= strop) {
      vynechanePrilohy++;
      continue;
    }
    try {
      const { data: subor } = await supabaseAdmin.storage
        .from("expense-receipts")
        .download(d.file_path);
      if (!subor) {
        vynechanePrilohy++;
        continue;
      }
      const bajty = await subor.arrayBuffer();
      velkost += bajty.byteLength;
      const pripona = (d.file_path.split(".").pop() || "bin").toLowerCase();
      skeny.file(
        `${nazovSuboru([d.issue_date, d.supplier_name, d.document_number].filter(Boolean).join("_"))}.${pripona}`,
        bajty,
      );
    } catch {
      vynechanePrilohy++;
    }
  }

  // Iné doklady nejdú do Pohody — sú podkladom, z ktorého účtovník účtuje.
  if (ostatne.length) {
    const { balikOstatnych } = await import("./ostatne-doklady-balik.server");
    const { vynechane } = await balikOstatnych(zip, ostatne, supabaseAdmin, "ostatne-doklady/");
    vynechanePrilohy += vynechane;
  }

  const base64 = await zip.generateAsync({ type: "base64" });

  return {
    company,
    balik: {
      base64,
      fileName: `odovzdanie-${vstup.mesiac}.zip`,
      pocetFaktur: vyvezene.length,
      pocetDokladov: dokladyDoXml.length,
      pocetPokladnicnych: pokladnica?.length ?? 0,
      pokladnicaIds: pokladnicaDoXml.map((p: Riadok) => p.id),
      bankaIds: banka.zaznamy.map((z) => z.id),
      pocetOstatnych: ostatne.length,
      ostatneIds: ostatne.map((d: Riadok) => d.id),
      preskocene,
      preskoceneFaktur,
      zavazne,
      varovania,
      neskoroZadane:
        odVyberu < od
          ? [...faktury, ...dokladyDoXml, ...prijateDoXml].filter(
              (d: Riadok) => String(d.issue_date ?? "") < od,
            ).length + pokladnicaDoXml.filter((p: Riadok) => String(p.entry_date ?? "") < od).length
          : 0,
      vynechanePrilohy,
      fakturyIds: faktury.map((f: Riadok) => f.id),
      dokladyIds: dokladyDoXml.map((d: Riadok) => d.id),
      prijateIds: prijateDoXml.map((p: Riadok) => p.id),
      pocetPrijatych: prijateDoXml.length,
      ciselniky: [
        ...zakaznici.map((z: Riadok) => ({
          agenda: "adresar",
          id: String(z.id),
          verzia: String(z.updated_at),
        })),
        ...zasoby.map((z: Riadok) => ({
          agenda: "sklad",
          id: String(z.id),
          verzia: String(z.updated_at),
        })),
        ...zakazkyNove.map((z: Riadok) => ({
          agenda: "zakazka",
          id: String(z.id),
          verzia: String(z.updated_at),
        })),
        ...pohyby.map((m: Riadok) => ({
          agenda: "pohyb",
          id: String(m.id),
          verzia: String(m.created_at),
        })),
        // Aj ručné storná — zapíšu sa ako vybavené, aby sa hláška neopakovala.
        ...[...storna, ...stornaRucne].map((x: { id: string }) => ({
          agenda: "storno",
          id: x.id,
          verzia: new Date().toISOString(),
        })),
      ],
      pocetCiselnikov:
        zakaznici.length + zasoby.length + zakazkyNove.length + pohyby.length + storna.length,
      xmlFaktur,
      xmlDokladov,
      xmlPrijatych,
      poslednyDatum: faktury[faktury.length - 1]?.issue_date ?? od,
      nazovObdobia: nazov,
    },
  };
}

/** Zapíše, že doklady odišli. Bez toho by ich ďalšie odovzdanie poslalo znova. */
/** Úprava po dávkach — tisíc id v `.in()` by prerástlo dĺžku adresy PostgREST. */
async function poDavkach(ids: string[], krok: (kus: string[]) => PromiseLike<unknown>, davka = 200) {
  for (let i = 0; i < ids.length; i += davka) await krok(ids.slice(i, i + davka));
}

/**
 * Balík pre ručné odovzdanie (stiahnutie, mail). Bez `potvrdeneVarovania`
 * sa pri závažných chybách (obsahové prekážky) balík nedostaví a vráti sa
 * len ich zoznam na potvrdenie; bez nich vznikne balík rovno. Po potvrdení
 * idú doklady so závažnou chybou do XML.
 */
export async function zostavBalikRucne(
  supabase: Klient,
  vstup: OdovzdanieVstup & { stropPriloh?: number },
): Promise<
  | { balik: Balik; company: Riadok; zavazne?: undefined; varovania?: undefined }
  | { balik?: undefined; zavazne: string[]; varovania: string[] }
> {
  try {
    return await zostavBalik(supabase, { ...vstup, _rezim: vstup.potvrdeneVarovania ? "povolit" : "zistit" });
  } catch (e) {
    if (e instanceof ZavazneNajdene) return { zavazne: e.zavazne, varovania: e.varovania };
    throw e;
  }
}

export async function oznacOdovzdane(
  supabase: Klient,
  vstup: { companyId: string; mesiac: string; userId: string | null },
  balik: Balik,
  faktury: { id: string; invoice_number: string }[],
) {
  const preskoceneFaktur = balik.preskoceneFaktur ?? balik.preskocene;
  const cislaPreskocenych = new Set(preskoceneFaktur.map((d) => String(d).split(" — ")[0]));
  const { od } = rozsahMesiaca(vstup.mesiac);
  // Názvy v histórii exportov s firmou na konci — pri opätovnom stiahnutí.
  const { nazovSuboruSFirmou } = await import("./nazov-suboru-firmy");
  const { data: firmaJobu } = await supabase
    .from("companies")
    .select("name")
    .eq("id", vstup.companyId)
    .maybeSingle();
  const sFirmou = (n: string) => nazovSuboruSFirmou(n, firmaJobu?.name ?? null);

  const { data: job, error } = await supabase
    .from("export_jobs")
    .insert({
      company_id: vstup.companyId,
      created_by: vstup.userId,
      format: "pohoda_xml",
      target_system: "pohoda",
      status: "completed",
      invoice_count: balik.pocetFaktur,
      date_from: od,
      date_to: balik.poslednyDatum,
      file_name: sFirmou(`pohoda-faktury-${vstup.mesiac}.xml`),
      // V histórii sa drží XML, nie celý balík — ZIP s PDF by tabuľku nafúkol
      // a dôležitý je práve importovateľný súbor.
      file_content: balik.xmlFaktur,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (job && faktury.length) {
    await supabase.from("export_logs").insert(
      faktury.map((f) => ({
        export_job_id: job.id,
        company_id: vstup.companyId,
        invoice_id: f.id,
        invoice_number: f.invoice_number,
        status: cislaPreskocenych.has(f.invoice_number) ? "skipped" : "ok",
        error: preskoceneFaktur.find((d) => d.startsWith(f.invoice_number)) ?? null,
      })),
    );
  }
  /*
    Prijaté doklady a faktúry majú v histórii vlastný súbor — aby sa dalo
    neskôr porovnať, čo Pohoda naozaj dostala („Rozdiely oproti Pohode“).
  */
  const { ulozOdoslaneXml } = await import("./pohoda-odoslane-xml.server");
  if (job && balik.dokladyIds.length) {
    const jobDokladov =
      (await ulozOdoslaneXml(supabase, {
        companyId: vstup.companyId,
        userId: vstup.userId,
        fileName: sFirmou(`pohoda-prijate-doklady-${vstup.mesiac}.xml`),
        xml: balik.xmlDokladov ?? "",
        pocet: balik.dokladyIds.length,
        od,
        do: balik.poslednyDatum,
      })) ?? job.id;
    const kedy = new Date().toISOString();
    await poDavkach(balik.dokladyIds, (kus) =>
      supabase
        .from("expense_documents")
        .update({ status: "exported", exported_at: kedy, export_job_id: jobDokladov })
        .in("id", kus),
    );
  }
  if (job && balik.prijateIds?.length) {
    const jobPrijatych =
      (await ulozOdoslaneXml(supabase, {
        companyId: vstup.companyId,
        userId: vstup.userId,
        fileName: sFirmou(`pohoda-prijate-faktury-${vstup.mesiac}.xml`),
        xml: balik.xmlPrijatych ?? "",
        pocet: balik.prijateIds.length,
        od,
        do: balik.poslednyDatum,
      })) ?? job.id;
    const kedy = new Date().toISOString();
    await poDavkach(balik.prijateIds, (kus) =>
      supabase
        .from("purchase_invoices")
        .update({ exported_at: kedy, export_job_id: jobPrijatych })
        .in("id", kus),
    );
  }
  // Pokladničné doklady z XML — inak by ich konektor poslal znova a zoznam by ich neukázal ako odovzdané.
  if (job && balik.pokladnicaIds?.length) {
    const kedy = new Date().toISOString();
    await poDavkach(balik.pokladnicaIds, (kus) =>
      supabase.from("cash_entries").update({ exported_at: kedy, export_job_id: job.id }).in("id", kus),
    );
  }
  /*
    Bankové pohyby z pohoda-banka.xml — inak by ich konektor poslal znova.
    Už odovzdané (konektorom) si ponechajú prvé označenie. Zápis servisným
    kľúčom: na pohyby smie písať len správca s oblasťou „banka“, odovzdáva
    však aj účtovníčka — id pohybov zostavil server pre túto firmu.
  */
  if (job && balik.bankaIds?.length) {
    const kedy = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await poDavkach(balik.bankaIds, (kus) =>
      supabaseAdmin
        .from("bank_transactions")
        .update({ exported_at: kedy, export_job_id: job.id })
        .eq("company_id", vstup.companyId)
        .in("id", kus)
        .is("exported_at", null),
    );
  }
  if (job && balik.ostatneIds.length) {
    const kedy = new Date().toISOString();
    await poDavkach(balik.ostatneIds, (kus) =>
      supabase.from("other_documents").update({ status: "exported", exported_at: kedy }).in("id", kus),
    );
  }
  // Číselníky si pamätá tá istá tabuľka ako pri konektore, takže sa doklad
  // neodovzdá dvakrát ani vtedy, keď firma používa obidve cesty.
  if (job && balik.ciselniky.length) {
    await supabase.from("pohoda_odoslane").upsert(
      balik.ciselniky.map((c) => ({
        company_id: vstup.companyId,
        agenda: c.agenda,
        zaznam_id: c.id,
        verzia: c.verzia,
        odoslane_at: new Date().toISOString(),
      })),
      { onConflict: "company_id,agenda,zaznam_id" },
    );
  }
  return job?.id as string | undefined;
}

/**
 * Pošle hotový balík na adresu účtovníčky.
 *
 * Text mailu je zámerne vecný — účtovníčka potrebuje vedieť, čo jej prišlo, kde
 * to v Pohode načíta a či niečo chýba. Práve poznámky o vynechaných prílohách a
 * o dokladoch mimo XML sú dôvod, prečo sa mail skladá tu, a nie na dvoch
 * miestach zvlášť.
 */
export async function posliBalikMailom(opts: {
  company: Riadok;
  balik: Balik;
  prijemca: string;
  poznamka?: string;
  /** Kto odosiela — pre strážcu odosielania; `null` pri mesačnom crone. */
  userId?: string | null;
}): Promise<void> {
  const { company, balik, poznamka } = opts;
  const prijemca = (opts.prijemca ?? "").trim();
  if (!prijemca)
    throw new Error("Chýba e-mail účtovníčky — doplňte ho v Účtovníctvo → Prepojenie s Pohodou");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prijemca)) {
    throw new Error(`„${prijemca}" nevyzerá ako e-mailová adresa`);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Odosielanie e-mailov nie je nastavené");

  const casti = [
    balik.pocetFaktur ? `${balik.pocetFaktur} vydaných faktúr` : "",
    balik.pocetDokladov ? `${balik.pocetDokladov} prijatých dokladov` : "",
    balik.pocetPokladnicnych ? `${balik.pocetPokladnicnych} pokladničných dokladov` : "",
    balik.pocetOstatnych ? `${balik.pocetOstatnych} iných dokladov` : "",
    balik.bankaIds?.length ? `${balik.bankaIds.length} bankových pohybov (pohoda-banka.xml)` : "",
    balik.pocetCiselnikov ? `${balik.pocetCiselnikov} záznamov číselníkov` : "",
  ].filter(Boolean);

  const text = [
    `Dobrý deň,`,
    ``,
    `v prílohe posielame podklady za ${balik.nazovObdobia} — ${casti.join(", ")}.`,
    ``,
    `V balíku sú súbory XML na priamy import do programu POHODA (Súbor → Dátová komunikácia → XML import/export), súpisky v CSV na kontrolu a samotné doklady.`,
    balik.vynechanePrilohy
      ? `\nPozn.: ${balik.vynechanePrilohy} dokladov je bez prílohy, aby sa e-mail zmestil do schránky. Radi ich pošleme samostatne.`
      : "",
    balik.preskocene.length
      ? `\nPozn.: do XML sa nedostali tieto doklady: ${balik.preskocene.join(", ")}. Sú v súpiske a treba ich zadať ručne.`
      : "",
    balik.neskoroZadane
      ? `\nPozn.: v balíku je aj ${balik.neskoroZadane} dokladov z predošlých mesiacov, ktoré do Faktera pribudli neskôr — v Pohode patria do obdobia podľa svojho dátumu.`
      : "",
    // Upozornenia k prijatým (sadzba DPH, prenesenie, predkontácia) — ako pri ručnom exporte.
    balik.zavazne?.length || balik.varovania?.length
      ? `\nNa kontrolu po importe (aj v súbore pohoda-skontrolovat.txt): ${[...(balik.zavazne ?? []), ...(balik.varovania ?? [])].join("; ")}.`
      : "",
    poznamka ? `\n${poznamka}` : "",
    ``,
    `S pozdravom`,
    company.name ?? "",
  ]
    .filter((r) => r !== "" || true)
    .join("\n");

  const odosielatel = company.email_sender_name || company.name || "Faktero";
  // Podklady účtovníkovi idú z vlastného SMTP firmy, keď ho má zapnutý.
  const { posliMailFirmy } = await import("./odoslanie-mailu.server");
  try {
    await posliMailFirmy(String(company.id), {
      from: `${odosielatel} <${process.env.RESEND_FROM_EMAIL || "faktury@faktero.sk"}>`,
      fromName: odosielatel,
      to: [prijemca],
      reply_to: company.email_reply_to || company.email || undefined,
      subject: `Podklady za ${balik.nazovObdobia} — ${company.name ?? "Faktero"}`,
      text,
      html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;white-space:pre-wrap">${text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")}</div>`,
      attachments: [{ filename: balik.fileName, content: balik.base64 }],
      ochrana: { userId: opts.userId ?? null, druh: "podklady", sprava: poznamka ?? "" },
    });
  } catch (e: any) {
    if (e?.name === "OdosielanieZastavene") throw e;
    throw new Error(`Odoslanie zlyhalo: ${String(e?.message ?? e).replace(/^Resend error: /, "").slice(0, 300)}`);
  }
}
