/**
 * Konektor do Pohody — priame prepojenie bez nášho programu na Windows.
 *
 * POHODA vie XML import spustiť z príkazového riadku
 * (`Pohoda.exe /XML "meno" "heslo" "import.ini"`), takže celý most je jedna
 * naplánovaná úloha u účtovníčky a dva endpointy tu:
 *
 *   1. stiahne si dávku (`/api/v1/pohoda/davka`),
 *   2. dá ju Pohode načítať,
 *   3. pošle nám späť `responsePack` (`/api/v1/pohoda/odpoved`), v ktorom je
 *      pri každom doklade stav a číslo, ktoré mu Pohoda pridelila.
 *
 * Von z jej počítača ide len obyčajné HTTPS — nič sa neotvára, nič sa
 * neinštaluje. Alternatíva cez POHODA mServer by znamenala vlastný program pre
 * Windows, druhú spustenú inštanciu Pohody a Stormware ju sám neodporúča
 * vystavovať mimo vnútornej siete.
 */
import type { PohodaNastavenia } from "./export.server";
import type { PolozkaOdpoctuPohody as OdpocetZalohy } from "./zalohy-odpocty";
import { rozoberBalikOdpovede, type VysledokDokladu } from "./pohoda-odpoved";
import { riadkyPreIds, vsetkoAkoData } from "./strankovanie";
import { TYPY_PRIJATYCH_DO_EXPORTU } from "./prijaty-danovy-doklad";

/** Riadky z databázy sa tu netypujú — modul ich len prekladá do XML. */
type Riadok = any;
type Klient = any;

/**
 * Najviac dokladov v jednej dávke.
 *
 * Konektor beží denne, takže bežná dávka má jednotky dokladov. Strop chráni
 * pred prvým spustením po dlhšej odmlke, keď by inak prišiel súbor, ktorý
 * Pohoda spracúva desiatky minút. Zvyšok príde ďalší deň.
 */
export const STROP_DAVKY = 200;

/**
 * Odkedy sa doklady posielajú, keď konektor nepovie inak.
 *
 * Zámerne **nie od začiatku evidencie**. Konektor je na priebežnú prácu; staršie
 * doklady už účtovníčka spravidla má a hromadné dosypanie histórie patrí do
 * mesačného balíka, kde je nad ním človek.
 */
export function predvolenyZaciatok(dnes: Date): string {
  const r = dnes.getUTCFullYear();
  const m = dnes.getUTCMonth(); // 0–11, čiže už minulý mesiac
  const rok = m === 0 ? r - 1 : r;
  const mesiac = m === 0 ? 12 : m;
  return `${rok}-${String(mesiac).padStart(2, "0")}-01`;
}

export type Davka = {
  /** Prázdny reťazec, keď nie je čo posielať. */
  xml: string;
  prazdna: boolean;
  jobId: string | null;
  faktur: number;
  dokladov: number;
  /** Zaúčtované prijaté faktúry. */
  prijatych: number;
  pokladnicnych: number;
  zakaznikov: number;
  zasob: number;
  zakaziek: number;
  pohybov: number;
  storien: number;
  /** Bankové pohyby (`pohoda_posielat_banku`). */
  bankovych?: number;
  preskocene: string[];
  /** Dávka sa pýta aj na predkontácie a členenia DPH (Nastavenie → Predkontácie). */
  ciselniky?: boolean;
};

/** Dávka, v ktorej nie je nič (konektor dostane 204). */
export function prazdnaDavka(): Davka {
  return {
    xml: "",
    prazdna: true,
    jobId: null,
    faktur: 0,
    dokladov: 0,
    prijatych: 0,
    pokladnicnych: 0,
    zakaznikov: 0,
    zasob: 0,
    zakaziek: 0,
    pohybov: 0,
    storien: 0,
    bankovych: 0,
    preskocene: [],
  };
}

/**
 * Ako sa doklad volá v Pohode.
 *
 * Väzby — storno, dobropis aj odpočet zálohy — sa na pôvodný doklad odvolávajú
 * **jeho číslom v Pohode**, nie naším. Pohoda si číslo prideľuje z vlastnej rady
 * a naše `numberRequested` je len želanie, takže sa spoľahnúť naň nedá. Číslo
 * poznáme z odpovede po importe (`export_logs.pohoda_cislo`); kým sa doklad
 * nepotvrdí, väzba sa neposiela a doklad ide bez nej.
 */
export async function cislaVPohode(
  supabase: Klient,
  companyId: string,
): Promise<Map<string, string>> {
  const { data } = await vsetkoAkoData((zac, kon) =>
    supabase
      .from("export_logs")
      .select("invoice_id, pohoda_cislo, potvrdene_at")
      .eq("company_id", companyId)
      .not("pohoda_cislo", "is", null)
      .order("potvrdene_at", { ascending: true })
      .order("id")
      .range(zac, kon),
  );

  const mapa = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.invoice_id && r.pohoda_cislo) mapa.set(String(r.invoice_id), String(r.pohoda_cislo));
  }
  return mapa;
}

/** Ktorá agenda číselníka — pod týmto sa vedie v `pohoda_odoslane`. */
type Agenda = "adresar" | "sklad" | "zakazka" | "pohyb";

/**
 * Číselníky sa neposielajú podľa dátumu, ale podľa zmeny.
 *
 * Odoslaná verzia sa **nedrží na samotnej karte**. Obidve tabuľky majú trigger
 * `set_updated_at`, takže vlastný zápis by posunul `updated_at` a karta by sa
 * navždy tvárila ako zmenená — konektor by ju posielal každý deň znova. Preto je
 * na to samostatná tabuľka, ktorej sa zdrojový riadok nedotkne.
 *
 * Porovnanie prebieha tu, nie vo filtri: PostgREST dva stĺpce porovnať nevie a
 * natiahnuť dva malé stĺpce je aj na tisíckach riadkov lacnejšie než celé karty.
 */
async function cakajuce(
  supabase: Klient,
  tabulka: "customers" | "stock_items",
  agenda: Agenda,
  companyId: string,
  stlpecZmazania: "deleted_at" | "archived_at",
): Promise<{ id: string; verzia: string }[]> {
  const [{ data: karty }, { data: odoslane }] = await Promise.all([
    vsetkoAkoData((zac, kon) =>
      supabase
        .from(tabulka)
        .select("id, updated_at")
        .eq("company_id", companyId)
        .is(stlpecZmazania, null)
        .order("id")
        .range(zac, kon),
    ),
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("pohoda_odoslane")
        .select("zaznam_id, verzia")
        .eq("company_id", companyId)
        .eq("agenda", agenda)
        .order("zaznam_id")
        .range(zac, kon),
    ),
  ]);

  const uz = new Map<string, string>(
    (odoslane ?? []).map((r: Riadok) => [String(r.zaznam_id), String(r.verzia)]),
  );

  return (karty ?? [])
    .filter((r: Riadok) => {
      const posledna = uz.get(String(r.id));
      // Časy z databázy prídu v rovnakom tvare, takže stačí porovnať okamih.
      return !posledna || new Date(String(r.updated_at)) > new Date(posledna);
    })
    .slice(0, STROP_DAVKY)
    .map((r: Riadok) => ({ id: String(r.id), verzia: String(r.updated_at) }));
}

function nahodnyToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export function zakladnaAdresa(): string {
  return (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
}

/**
 * Zostaví dávku pre konektor: faktúry, prijaté doklady a pokladňu naraz.
 *
 * Pri `oznacit` sa zapíše história odovzdania — bez nej by ďalšie spustenie
 * poslalo to isté znova. Doklad, ktorý Pohoda odmietne, sa v odpovedi vráti
 * medzi neúspešné a do ďalšej dávky sa vráti (`spracujOdpoved`).
 */
export async function zostavDavku(
  supabase: Klient,
  vstup: {
    companyId: string;
    od?: string | null;
    oznacit: boolean;
    dnes?: Date;
    /**
     * Prelom rokov: „prelom" = len doklady minulých rokov (do databázy
     * minulého roka), „bezny" = len tohtoročné a číselníky. Bez neho všetko.
     */
    cast?: "prelom" | "bezny" | null;
  },
): Promise<Davka> {
  /*
    Testovacia firma do Pohody nič neposiela — konektor dostane prázdnu dávku
    (204) a nič sa neoznačí ako „na ceste“. Pri chybe overenia sa vyhodí, takže
    sa tiež nič nepošle (fail-closed).
  */
  const { jeTestovaciaFirma } = await import("./testovacia-firma.server");
  if (await jeTestovaciaFirma(vstup.companyId, supabase)) {
    console.info("[pohoda-konektor] testovacia firma, dávka sa nevydá:", vstup.companyId);
    return prazdnaDavka();
  }
  const rokTeraz = (vstup.dnes ?? new Date()).getFullYear();
  const vCasti = <T>(riadky: T[], pole: string): T[] =>
    !vstup.cast
      ? riadky
      : riadky.filter((r: any) => {
          const rok = Number(String(r?.[pole] ?? "").slice(0, 4));
          return vstup.cast === "prelom" ? Boolean(rok) && rok < rokTeraz : !rok || rok >= rokTeraz;
        });
  const lenBezny = vstup.cast !== "prelom";
  const dnes = vstup.dnes ?? new Date();
  /*
    K3: dávka, na ktorú POHODA do limitu neodpovedala, sa vráti do fronty; čo je
    práve na ceste (čaká na odpoveď), druhýkrát nejde. Bez tabuľky položiek
    (migrácia) sa ostrá dávka nevydá vôbec — `KonektorBezTabulky`.
  */
  const potvrdenie = await import("./pohoda-konektor-potvrdenie.server");
  if (vstup.oznacit) await potvrdenie.vyprsNepotvrdene(supabase, vstup.companyId, dnes);
  const naCeste = await potvrdenie.cakajuceZaznamy(supabase, vstup.companyId, !vstup.oznacit);
  const neNaCeste =
    (druh: Parameters<typeof naCeste.get>[0]) =>
    (r: Riadok): boolean =>
      !naCeste.get(druh)?.has(String(r?.id));
  const pocetNaCeste = [...naCeste.values()].reduce((a, s) => a + s.size, 0);
  /*
    V11: výber podľa stavu (neodovzdané), nie podľa okna „od minulého mesiaca“ —
    neskoro zadaný doklad by inak neodišiel nikdy. Spodná hranica je mesiac
    pred prvým spustením konektora: staršie doklady konektor neposiela (patria
    do odovzdania, ktoré firma robila predtým) a Kontrola Pohody ich ukáže.
  */
  const od = vstup.od || (await zaciatokKonektora(supabase, vstup.companyId, dnes));

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", vstup.companyId)
    .single();
  if (cErr) throw new Error(cErr.message);
  if (!company) throw new Error("Firma nenájdená");

  const [{ data: vsetkyFaktury, error: fErr }, { data: uzOdovzdane }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("company_id", vstup.companyId)
      .gte("issue_date", od)
      // Len neodovzdané — strop sa inak minul na už odovzdaných a nové neodišli (S21).
      .is("exported_at", null)
      .neq("status", "draft")
      .neq("status", "cancelled")
      .is("deleted_at", null)
      .order("issue_date")
      .order("id")
      .limit(STROP_DAVKY + pocetNaCeste),
    // Všetky odovzdané — orezaný zoznam by staršie faktúry poslal druhýkrát.
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("export_logs")
        .select("invoice_id")
        .eq("company_id", vstup.companyId)
        .eq("status", "ok")
        .order("id")
        .range(zac, kon),
    ),
  ]);
  if (fErr) throw new Error(fErr.message);

  const odovzdane = new Set((uzOdovzdane ?? []).map((r: Riadok) => r.invoice_id));
  // Schvaľovanie: do Pohody ide len schválené (doklady spred zapnutia áno).
  const { lenSchvalene } = await import("./schvalovanie.server");
  const { ok: fakturySch } = await lenSchvalene(
    supabase,
    vstup.companyId,
    "vystavena",
    (vsetkyFaktury ?? [])
      .filter((f: Riadok) => !odovzdane.has(f.id) && neNaCeste("faktura")(f))
      .slice(0, STROP_DAVKY),
  );
  // Prázdne kódy tak, ako ich ukazuje detail („automaticky“), doplnené aj na doklad.
  const faktury = await (
    await import("./clenenie-vystavenej.server")
  ).zauctovanieNaExport(supabase, vstup.companyId, vCasti(fakturySch, "issue_date"), {
    ulozit: true,
  });

  const [{ data: dokladyVsetkyRiadky }, { data: pokladnicaRiadky }] = await Promise.all([
    supabase
      .from("expense_documents")
      .select("*")
      .eq("company_id", vstup.companyId)
      .gte("issue_date", od)
      .is("exported_at", null)
      // Most si doklady berie sám — nespracovaný doklad ešte nikto neskontroloval.
      .eq("status", "processed")
      .order("issue_date")
      .order("id")
      .limit(STROP_DAVKY + pocetNaCeste),
    supabase
      .from("cash_entries")
      .select("*")
      .eq("company_id", vstup.companyId)
      .gte("entry_date", od)
      .is("exported_at", null)
      .order("entry_date")
      .order("id")
      .limit(STROP_DAVKY + pocetNaCeste),
  ]);
  const dokladyNeschvalene = (dokladyVsetkyRiadky ?? [])
    .filter(neNaCeste("doklad"))
    .slice(0, STROP_DAVKY);
  const pokladnicaVsetko = (pokladnicaRiadky ?? [])
    .filter(neNaCeste("pokladna"))
    .slice(0, STROP_DAVKY);

  /*
    Prijaté faktúry — len zaúčtované (účtovník ich prešiel, ako v Doklado) a
    započítateľné (samofaktúra až po odsúhlasení). Do Pohody idú v tvare
    prijatého dokladu, s predkontáciou a členením DPH zo zaúčtovania.
  */
  const { data: prijateRiadky } = await supabase
    .from("purchase_invoices")
    .select("*")
    .eq("company_id", vstup.companyId)
    .gte("issue_date", od)
    // Zálohová sa neúčtuje — ide aj bez zaúčtovania (do Pohody bez DPH, kvôli odpočtu zálohy).
    .or("zauctovane_at.not.is.null,type.eq.proforma")
    .is("exported_at", null)
    .is("deleted_at", null)
    .in("type", [...TYPY_PRIJATYCH_DO_EXPORTU])
    .order("issue_date")
    .order("id")
    .limit(STROP_DAVKY + pocetNaCeste);
  const { zapocitatelna } = await import("./samofakturacia");
  const { prijataAkoDoklad } = await import("./prijate-do-pohody");
  const { ok: dokladySch } = await lenSchvalene(
    supabase,
    vstup.companyId,
    "doklad",
    dokladyNeschvalene ?? [],
  );
  const doklady = vCasti(dokladySch, "issue_date");
  /*
    Pokladničný doklad bez pokladne Pohoda nezaloží — `cashAccount` je podľa
    voucher.xsd „vyžadován při vytvoření dokladu“. Kým firma skratku pokladne
    nevyplní, pohyby ostávajú vo fronte (neoznačia sa) a povie sa to.
  */
  const pokladnicaVCasti = vCasti(pokladnicaVsetko ?? [], "entry_date");
  // Viac pokladní: skratka podľa pokladne pohybu, inak predvolená/firma.
  const nastPokladni = await (
    await import("./pokladne.server")
  ).nastaveniaPokladniFirmy(supabase, vstup.companyId, company.pohoda_pokladna);
  const { pohybyBezPokladne } = await import("./export.server");
  const bezSkratky = new Set(
    pohybyBezPokladne(pokladnicaVCasti, nastPokladni).map((p: Riadok) => p.id),
  );
  const pokladnaChyba = bezSkratky.size
    ? `Pokladňa (${bezSkratky.size}) — chýba skratka pokladne pre Pohodu, pohyby počkajú — doplňte ju v Pokladňa → Pokladne alebo v Účtovníctvo → Prepojenie s Pohodou`
    : null;
  const pokladnica = pokladnicaVCasti.filter((p: Riadok) => !bezSkratky.has(p.id));
  const { ok: prijateSch } = await lenSchvalene(
    supabase,
    vstup.companyId,
    "prijata",
    (prijateRiadky ?? []).filter(
      (p: Riadok) =>
        neNaCeste("prijata")(p) &&
        zapocitatelna(p) &&
        // Nezaúčtovaná zálohová ide sama — koncept ani stornovaná nie.
        !(p.type === "proforma" && (p.status === "draft" || p.status === "cancelled")),
    ),
  );
  const prijate = vCasti(prijateSch, "issue_date");
  /*
    Duplicitný doklad (ten istý dvakrát v evidencii) do Pohody nejde —
    `prekazkaDokladu` ho podľa `_duplicita` zastaví a povie prečo.
  */
  {
    const { oznacDuplicity } = await import("./duplicita-zauctovania.server");
    await oznacDuplicity(supabase, vstup.companyId, "prijata", prijate);
    await oznacDuplicity(supabase, vstup.companyId, "blocek", doklady ?? []);
  }

  /*
    V13: oprava dokladu vráteného z POHODY. POHODA cez XML doklad neprepíše
    ani nezmaže (invoice/voucher nemajú actionType) — najprv ide storno
    pôvodnej verzie (keď poznáme jej číslo v POHODE), oprava až po jeho
    potvrdení; inak sa doklad zadrží do potvrdenia zmazania v Kontrole Pohody.
  */
  const opravy = await potvrdenie.opravyVDavke(
    supabase,
    vstup.companyId,
    [
      ...faktury.map((f: Riadok) => ({
        druh: "faktura" as const,
        riadok: f,
        cislo: String(f.invoice_number ?? ""),
      })),
      ...prijate.map((p: Riadok) => ({
        druh: "prijata" as const,
        riadok: p,
        cislo: String(p.invoice_number ?? ""),
      })),
      ...doklady.map((d: Riadok) => ({
        druh: "doklad" as const,
        riadok: d,
        cislo: String(d.document_number || d.supplier_name || ""),
      })),
      ...pokladnica.map((p: Riadok) => ({
        druh: "pokladna" as const,
        riadok: p,
        cislo: String(p.entry_number ?? ""),
      })),
    ],
    await cislaVPohode(supabase, vstup.companyId),
    !vstup.oznacit,
  );
  if (opravy.vyradit.size)
    for (const zoznam of [faktury, prijate, doklady, pokladnica] as Riadok[][])
      for (let i = zoznam.length - 1; i >= 0; i--)
        if (opravy.vyradit.has(String(zoznam[i]?.id))) zoznam.splice(i, 1);
  // Storno pôvodných verzií ide len do bežnej databázy (ako ostatné storná).
  const stornaOpravXml = lenBezny ? opravy.stornaXml : "";
  const stornaOprav = lenBezny ? opravy.stornaOprav : [];
  const hlaskyOprav = [...opravy.drzane.map((d) => d.dovod), ...opravy.cakaju];

  // Číselníky — len keď si ich firma zapla. Sklad navyše potrebuje členenie,
  // bez neho Pohoda kartu nezaloží, tak sa ani neposiela.
  /*
    Partneri dokladov „pridať alebo aktualizovať a párovať" (Predkontácie →
    Export): aj bez posielania celého adresára idú karty partnerov, na ktorých
    sa doklady v dávke odvolávajú — doklad sa s kartou spáruje cez `extId`.
  */
  const { nastaveniaExportu } = await import("./export-nastavenia");
  const parovatPartnerov = nastaveniaExportu(company.uctovanie_nastavenia).partneri === "parovat";
  const partneriDokladov = new Set(
    [...faktury, ...prijate].map((d: Riadok) => String(d.customer_id ?? "")).filter(Boolean),
  );
  const zakaznici = !lenBezny
    ? []
    : company.pohoda_posielat_adresar
      ? await nacitajZakaznikov(supabase, vstup.companyId)
      : parovatPartnerov && partneriDokladov.size
        ? (await nacitajZakaznikov(supabase, vstup.companyId)).filter((z: Riadok) =>
            partneriDokladov.has(String(z.id)),
          )
        : [];
  const zasoby =
    lenBezny &&
    company.pohoda_posielat_sklad &&
    company.pohoda_sklad &&
    (company as any).pohoda_cenova_skupina
      ? await nacitajZasoby(supabase, vstup.companyId)
      : [];
  const { nove: zakazkyNoveVsetky, kody: zakazky } = company.pohoda_posielat_zakazky
    ? await nacitajZakazky(supabase, vstup.companyId, [...faktury, ...(doklady ?? []), ...prijate])
    : { nove: [], kody: {} };
  // Nové zákazky a číselníky idú len do bežnej databázy.
  const zakazkyNove = lenBezny ? zakazkyNoveVsetky : [];

  // Pohyby majú zmysel len vtedy, keď sú v Pohode karty — položka sa na kartu
  // odvoláva. Posielajú sa preto až tie, ktorých karta už odišla.
  const pohyby =
    lenBezny &&
    company.pohoda_posielat_pohyby &&
    company.pohoda_posielat_sklad &&
    company.pohoda_sklad &&
    (company as any).pohoda_cenova_skupina
      ? await nacitajPohyby(supabase, vstup.companyId, zasoby)
      : [];
  // Čo je na ceste (čaká na odpoveď POHODY), druhýkrát nejde (K3).
  for (const [zoznam, druh] of [
    [zakaznici, "adresar"],
    [zasoby, "sklad"],
    [zakazkyNove, "zakazka"],
    [pohyby, "pohyb"],
  ] as [Riadok[], "adresar" | "sklad" | "zakazka" | "pohyb"][])
    for (let i = zoznam.length - 1; i >= 0; i--)
      if (!neNaCeste(druh)(zoznam[i])) zoznam.splice(i, 1);
  const { zoskupPohyby } = await import("./export.server");
  const skupinyPohybov = zoskupPohyby(pohyby);

  // Väzby na doklady, ktoré v Pohode už sú: storno zrušenej faktúry, dobropis k
  // pôvodnej faktúre a odpočet zálohy na konečnej.
  const cisla = await cislaVPohode(supabase, vstup.companyId);
  const vsetkyStorna = lenBezny ? await nacitajStorna(supabase, vstup.companyId, cisla) : [];
  /*
    Daňový doklad k platbe je v Pohode interný doklad — ten sa cez XML
    stornovať nedá. Do dávky nejde, súhrn povie, čo urobiť v Pohode ručne.
  */
  const { rozdelStorna, hlaskaRucnychStorien } = await import("./storno-dokladu-k-platbe");
  const { doXml: storna, rucne: stornaRucne } = rozdelStorna(
    vsetkyStorna,
    nastaveniaExportu(company.uctovanie_nastavenia).dokladKPlatbe,
  );
  const hlaskaStorien = hlaskaRucnychStorien(stornaRucne);
  for (let i = storna.length - 1; i >= 0; i--)
    if (!neNaCeste("storno")(storna[i])) storna.splice(i, 1);
  const { zalohy, opravovane, povodneCisla } = await nacitajVazby(
    supabase,
    vstup.companyId,
    faktury,
    cisla,
  );

  /*
    Bankové pohyby (`pohoda_posielat_banku`) — neodovzdané pohyby účtov so
    skratkou v POHODE, rovnaké XML ako ručné „XML pre POHODU“. V dávke idú
    za faktúrami, prijatými a pokladňou.
  */
  const banka = await (
    await import("./banka-pohoda.server")
  ).bankaPreDavku(supabase, {
    company,
    od,
    naCeste: naCeste.get("banka"),
    strop: STROP_DAVKY,
    filter: (t) => vCasti([t], "booking_date").length > 0,
    dnes,
  });

  const prazdna =
    !banka.zaznamy.length &&
    !faktury.length &&
    !doklady?.length &&
    !prijate.length &&
    !pokladnica?.length &&
    !zakaznici.length &&
    !zasoby.length &&
    !zakazkyNove.length &&
    !pohyby.length &&
    !storna.length &&
    !stornaOprav.length;
  /*
    Žiadosť o predkontácie a členenia DPH ide s dávkou, kým na ňu Pohoda
    neodpovie — príznak zhodí až spracovanie odpovede. Keď inak nie je čo
    poslať, odíde samotná žiadosť bez zápisu do histórie.
  */
  const ciselniky = lenBezny && Boolean(company.pohoda_nacitat_ciselniky);
  if (prazdna && ciselniky) {
    const { ziadostCiselnikov } = await import("./predkontacie");
    return {
      xml: ziadostCiselnikov(company.ico),
      prazdna: false,
      jobId: null,
      faktur: 0,
      dokladov: 0,
      prijatych: 0,
      pokladnicnych: 0,
      zakaznikov: 0,
      zasob: 0,
      zakaziek: 0,
      pohybov: 0,
      storien: 0,
      preskocene: [],
      ciselniky: true,
    };
  }
  if (prazdna) {
    return {
      xml: "",
      prazdna: true,
      jobId: null,
      faktur: 0,
      dokladov: 0,
      prijatych: 0,
      pokladnicnych: 0,
      zakaznikov: 0,
      zasob: 0,
      zakaziek: 0,
      pohybov: 0,
      storien: 0,
      bankovych: 0,
      preskocene: [...(pokladnaChyba ? [pokladnaChyba] : []), ...hlaskyOprav, ...banka.hlasky],
    };
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

  const dokladyVsetky = [...(doklady ?? []), ...prijate.map(prijataAkoDoklad)];
  const { nastaveniaDokladov } = await import("./predkontacie.server");
  const nastavenia: PohodaNastavenia = {
    ...(await nastaveniaDokladov(supabase, company, dokladyVsetky)),
    predkontacia: company.pohoda_predkontacia,
    predkontaciaZaloha: company.pohoda_predkontacia_zaloha,
    predkontaciaDobropis: company.pohoda_predkontacia_dobropis,
    clenenieDph: company.pohoda_clenenie_dph,
    clenenieDphPdp: company.pohoda_clenenie_dph_pdp,
    banka: company.pohoda_banka,
    predkontaciaPrijata: company.pohoda_predkontacia_prijata,
    clenenieDphPrijata: company.pohoda_clenenie_dph_prijata,
    predkontaciaDoklady: company.pohoda_predkontacia_doklady,
    clenenieDphDoklady: company.pohoda_clenenie_dph_doklady,
    kvFaktura: company.kv_clenenie_faktura,
    kvPrijata: company.kv_clenenie_prijata,
    kvDoklady: company.kv_clenenie_doklady,
    predkontaciaRozuctovat: company.pohoda_predkontacia_rozuctovat,
    blockyPodlaPlatby: company.pohoda_blocky_agenda === "podla_platby",
    podlaKategorie: await (
      await import("./predkontacie.server")
    ).kodyPodlaKategorie(supabase, vstup.companyId),
    pokladna: company.pohoda_pokladna,
    ...(await (
      await import("./pokladne.server")
    ).nastaveniaPokladniFirmy(supabase, vstup.companyId, company.pohoda_pokladna)),
    predkontaciaPokladna: company.pohoda_predkontacia_pokladna,
    sklad: company.pohoda_sklad,
    cenovaSkupina: (company as any).pohoda_cenova_skupina,
  };
  // Karty, ktoré idú v tejto dávke, sú v Pohode skôr než doklady (adresár ide prvý).
  if (parovatPartnerov)
    nastavenia.partneriVPohode = [
      ...new Set([
        ...(nastavenia.partneriVPohode ?? []),
        ...zakaznici.map((z: Riadok) => String(z.id)),
      ]),
    ];

  const odkazy = company.pohoda_odkaz_na_pdf ? await odkazyNaPdf(supabase, faktury) : {};
  // Už odoslané eFaktúry dostanú vetu do internej poznámky — v Pohode sa nesmú poslať znova.
  const { efakturaOdoslane } = await import("./efaktura-odoslana.server");
  const odoslane = await efakturaOdoslane(
    supabase,
    faktury.map((f: Riadok) => f.id),
  );
  for (const f of faktury) (f as any)._efakturaOdoslana = odoslane[f.id] ?? null;

  const { buildPohodaDavkaXml, pohodaPrekazka } = await import("./export.server");
  const polozkyFaktury = (f: Riadok) =>
    (polozky ?? []).filter((p: Riadok) => p.invoice_id === f.id);
  const preskocene = faktury
    .map((f: Riadok) => pohodaPrekazka(f, company, { items: polozkyFaktury(f), nastavenia }))
    .filter((d: string | null): d is string => !!d);
  /*
    Kontrola pred odovzdaním aj pri prijatých dokladoch: zastavený doklad do
    dávky nejde a neoznačí sa — počká, kým ho niekto opraví (prehľad v
    Exportoch → Kontrola pred odovzdaním).
  */
  const { prekazkaDokladu } = await import("./pohoda-kontrola");
  const preskoceneDoklady: string[] = pokladnaChyba ? [pokladnaChyba] : [];
  const dokladyOk = (doklady ?? []).filter((d: Riadok) => {
    const dovod = prekazkaDokladu(d, company, nastavenia as any);
    if (dovod) preskoceneDoklady.push(dovod);
    return !dovod;
  });
  /*
    Upozornenia pri prijatých (sadzba DPH, ktorá neexistuje, členenie s
    prenesením bez príznaku, chýbajúca predkontácia — export-varovania.ts)
    ručný export ukáže na potvrdenie. Konektor nemá kto potvrdiť: doklad
    zadrží a Kontrola Pohody ho ukáže medzi závažnými (audit 14. 11., S7).
  */
  const { varovaniaPrijatejPredExportom } = await import("./export-varovania");
  const prijateOk = prijate.filter((p: Riadok) => {
    const dovod =
      prekazkaDokladu(prijataAkoDoklad(p), company, nastavenia as any) ??
      varovaniaPrijatejPredExportom(p, company, nastavenia as any)[0] ??
      null;
    if (dovod) preskoceneDoklady.push(dovod);
    return !dovod;
  });
  preskoceneDoklady.push(...hlaskyOprav);
  // Všetko zastavila kontrola — prázdny balík by schéma Pohody neprijala.
  if (
    preskocene.length === faktury.length &&
    !dokladyOk.length &&
    !prijateOk.length &&
    !pokladnica?.length &&
    !zakaznici.length &&
    !zasoby.length &&
    !zakazkyNove.length &&
    !pohyby.length &&
    !banka.zaznamy.length &&
    !storna.length &&
    !stornaOprav.length
  ) {
    return {
      xml: "",
      prazdna: true,
      jobId: null,
      faktur: 0,
      dokladov: 0,
      prijatych: 0,
      pokladnicnych: 0,
      zakaznikov: 0,
      zasob: 0,
      zakaziek: 0,
      pohybov: 0,
      storien: 0,
      bankovych: 0,
      preskocene: [...preskocene, ...preskoceneDoklady, ...banka.hlasky],
    };
  }

  const davkaXml = buildPohodaDavkaXml({
    company,
    invoices: faktury.map((invoice: Riadok) => ({
      invoice,
      items: polozkyFaktury(invoice),
    })),
    doklady: [...dokladyOk, ...prijateOk.map(prijataAkoDoklad)],
    pohyby: pokladnica ?? [],
    zakaznici,
    zasoby,
    zakazkyNove,
    skupinyPohybov,
    storna,
    nastavenia,
    odkazy,
    zakazky,
    zalohy,
    opravovane,
    povodneCisla,
    banka: banka.entries,
    /*
      XML import bankové doklady s faktúrami nespáruje (overené v POHODE
      16. 11.) — za pohybmi ide pre každý účet automatická likvidácia.
      Do pohoda_konektor_polozky sa nezapisuje (nie je to doklad); jej
      výsledok sa len oznámi v odpovedi (`spracujOdpoved`).
    */
    likvidacia: banka.skupiny.length
      ? await (async () => {
          const { likvidaciePreSkupiny, PRAVIDLO_PAROVANIA_ID } = await import("./banka-pohoda");
          const { polozkyAutomatickejLikvidacie } = await import("./export.server");
          return polozkyAutomatickejLikvidacie(
            likvidaciePreSkupiny(banka.skupiny, dnes.toISOString().slice(0, 10)),
            PRAVIDLO_PAROVANIA_ID,
          );
        })()
      : "",
  });
  // Storno pôvodných verzií opravených dokladov (V13) — pred opravou samotnou ide len storno.
  const { pridajPolozky, polozkyZDavky } = await import("./pohoda-konektor-davka");
  const davkaSoStornami = pridajPolozky(davkaXml, stornaOpravXml);
  const xml = ciselniky
    ? (await import("./predkontacie")).pridajZiadost(davkaSoStornami, company.ico)
    : davkaSoStornami;

  const cislaPreskocenych = new Set<string>(
    preskocene.map((d: string) => String(d).split(" — ")[0]),
  );
  const vyvezene = faktury.filter((f: Riadok) => !cislaPreskocenych.has(f.invoice_number));

  let jobId: string | null = null;
  if (vstup.oznacit) {
    /*
      K3: zapíše sa len to, že dávka odišla — položky sú `odoslane` a
      odovzdané (zamknuté) budú až po odpovedi POHODY (`spracujOdpoved`).
      Id položiek sa berú z hotového XML, takže sa zapíše presne to, čo išlo.
    */
    const teraz = new Date().toISOString();
    const verziaDokladu = (r: Riadok) => ({ id: String(r.id), verzia: r.pohoda_verzia });
    const vSkupinach = new Set(
      skupinyPohybov.flatMap((s) => s.pohyby.map((m: Riadok) => String(m.id))),
    );
    jobId = await potvrdenie.zapisDavku(supabase, {
      companyId: vstup.companyId,
      od,
      xml,
      faktury,
      pocetFaktur: vyvezene.length,
      cislaPreskocenych,
      preskocene,
      polozky: polozkyZDavky(
        xml,
        {
          faktury: vyvezene.map(verziaDokladu),
          doklady: dokladyOk.map(verziaDokladu),
          prijate: prijateOk.map(verziaDokladu),
          pokladna: (pokladnica ?? []).map(verziaDokladu),
          adresar: zakaznici.map((z: Riadok) => ({ id: String(z.id), verzia: z.updated_at })),
          sklad: zasoby.map((z: Riadok) => ({ id: String(z.id), verzia: z.updated_at })),
          zakazka: zakazkyNove.map((z: Riadok) => ({ id: String(z.id), verzia: z.updated_at })),
          // Pohyb sa nemení, takže verzia je len jeho vznik.
          pohyby: skupinyPohybov.map((s) => ({
            id: String(s.id),
            pohyby: s.pohyby.map((m: Riadok) => ({ id: String(m.id), verzia: m.created_at })),
          })),
          storna,
          stornaOprav,
          banka: banka.zaznamy,
        },
        teraz,
      ),
      bezPotvrdenia: [
        // Ručné storná (doklad k platbe) sa nikam neposielajú — vybavené, aby sa hláška neopakovala.
        ...stornaRucne.map((s: { id: string }) => ({ agenda: "storno", id: s.id, verzia: teraz })),
        // Pohyb s nulovým množstvom do príjemky ani výdajky nejde — nie je čo potvrdzovať.
        ...pohyby
          .filter((m: Riadok) => !vSkupinach.has(String(m.id)))
          .map((m: Riadok) => ({
            agenda: "pohyb",
            id: String(m.id),
            verzia: String(m.created_at),
          })),
      ],
    });
  }

  return {
    xml,
    prazdna: false,
    jobId,
    faktur: vyvezene.length,
    dokladov: dokladyOk.length,
    prijatych: prijateOk.length,
    pokladnicnych: pokladnica?.length ?? 0,
    zakaznikov: zakaznici.length,
    zasob: zasoby.length,
    zakaziek: zakazkyNove.length,
    pohybov: pohyby.length,
    storien: storna.length + stornaOprav.length,
    bankovych: banka.zaznamy.length,
    preskocene: [
      ...preskocene,
      ...preskoceneDoklady,
      ...(hlaskaStorien ? [hlaskaStorien] : []),
      ...banka.hlasky,
    ],
    ciselniky,
  };
}

/**
 * Spodná hranica dávky konektora (V11): prvý deň mesiaca pred jeho prvým
 * spustením — neskoro zadaný doklad s dátumom po nej odíde vždy, keď ešte
 * nie je odovzdaný. Pred prvým spustením minulý mesiac ako doteraz.
 */
export async function zaciatokKonektora(
  supabase: Klient,
  companyId: string,
  dnes: Date,
): Promise<string> {
  const { data } = await supabase
    .from("export_jobs")
    .select("created_at")
    .eq("company_id", companyId)
    .eq("file_name", "pohoda-davka.xml")
    .order("created_at", { ascending: true })
    .limit(1);
  const prvy = data?.[0]?.created_at ? new Date(String(data[0].created_at)) : null;
  return predvolenyZaciatok(prvy && !Number.isNaN(prvy.getTime()) && prvy < dnes ? prvy : dnes);
}

/**
 * Faktúry, ktoré sa po odovzdaní zrušili.
 *
 * Doklad, ktorý v Pohode už je, sa nedá len tak „odobrať" — účtovníctvo si ho
 * musí pamätať. Pohoda k nemu vyrobí **stornujúci doklad** a nájde si ho podľa
 * čísla, takže storno vieme poslať až po tom, ako sa import pôvodnej faktúry
 * potvrdil. Pokiaľ sa nepotvrdil, faktúra sa jednoducho čaká.
 */
export async function nacitajStorna(
  supabase: Klient,
  companyId: string,
  cisla: Map<string, string>,
): Promise<{ id: string; cislo: string; typ: string | null }[]> {
  if (!cisla.size) return [];

  const [{ data: zrusene }, { data: uzStornovane }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, cancelled_at, status, type")
      .eq("company_id", companyId)
      .not("cancelled_at", "is", null)
      .in("id", [...cisla.keys()]),
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("pohoda_odoslane")
        .select("zaznam_id")
        .eq("company_id", companyId)
        .eq("agenda", "storno")
        .order("zaznam_id")
        .range(zac, kon),
    ),
  ]);

  const uz = new Set((uzStornovane ?? []).map((r: Riadok) => String(r.zaznam_id)));
  return (zrusene ?? [])
    .filter((f: Riadok) => !uz.has(String(f.id)))
    .slice(0, STROP_DAVKY)
    .map((f: Riadok) => ({
      id: String(f.id),
      cislo: cisla.get(String(f.id)) as string,
      typ: f.type ? String(f.type) : null,
    }));
}

/**
 * Väzby na už existujúce doklady: odpočet zálohy a dobropis k pôvodnej faktúre.
 *
 * Obidve sa odvolávajú na číslo v Pohode. Keď ho ešte nepoznáme, väzba sa
 * vynechá a doklad odíde tak ako doteraz — samostatne. Radšej doklad bez väzby
 * než doklad, ktorý sa neimportuje vôbec.
 */
export async function nacitajVazby(
  supabase: Klient,
  companyId: string,
  faktury: Riadok[],
  cisla: Map<string, string>,
): Promise<{
  zalohy: Record<string, OdpocetZalohy[]>;
  opravovane: Record<string, string>;
  povodneCisla: Record<string, string>;
}> {
  const zalohy: Record<string, OdpocetZalohy[]> = {};
  const opravovane: Record<string, string> = {};
  // Číslo opravovanej faktúry vo Fakteri — SK Pohoda ho chce pri dobropise
  // aj vtedy, keď pôvodná faktúra v Pohode (zatiaľ) nie je.
  const povodneCisla: Record<string, string> = {};

  /*
    Odpočty záloh — ten istý výpočet ako ručný súbor (`pripravFaktury`):
    riadky dokladu k prijatej platbe po sadzbách, nezdanená záloha bez DPH
    (`nacitajOdpocty` + `zalohyPrePohodu`). Predtým sa sadzba počítala
    z pomeru DPH a základu zálohovej faktúry — pri zálohe 23 % + 0 % vyšlo
    8 % a odpočet skončil v priehradke 19 % (audit 14. 11. 2026, V1).

    Faktúra dostane `_odpocty`, aby `pohodaPrekazka` odpočet, ktorý sa
    zapísať nedá, zastavila — predtým odišla bez odpočtu, len so zápisom
    do logu servera (K2).
  */
  /*
    Odkaz na doklad v Pohode (odpočet → zálohová, dobropis → pôvodná) len
    vtedy, keď tam ten doklad je: potvrdený Pohodou (`cisla`), odovzdaný
    (`exported_at`, aj migrovaný z Doklada) alebo ide v tej istej dávke pred
    odkazujúcim. Inak POHODA SK 14404.8 odmietne celý doklad („Nebol nájdený
    odkazovaný záznam“ / „Zadaný záznam sa nepodarilo nájsť“); bez odkazu ho
    prijme a suma na úhradu sedí (overené naostro 15. 11. 2026).
  */
  const { odkazNaDokladPohody } = await import("./export-priprava.server");
  const poradie = new Map(faktury.map((f: Riadok, n: number) => [String(f.id), n]));
  const { nacitajOdpocty } = await import("./zalohy-odpocty.server");
  const { zalohyPrePohodu } = await import("./zalohy-odpocty");
  const odpocty = await nacitajOdpocty(
    supabase,
    companyId,
    faktury.map((f: Riadok) => String(f.id)),
  );
  for (const f of faktury) {
    const zoz = odpocty[String(f.id)] ?? null;
    (f as any)._odpocty = zoz;
    // Číslo zálohovej faktúry v Pohode, ak ho poznáme zo spätnej väzby; inak naše (`numberRequested`).
    const z = zalohyPrePohodu(
      zoz,
      (o) => (o.zalohaId ? cisla.get(o.zalohaId) : null),
      (o) =>
        odkazNaDokladPohody(
          o.zalohaOdovzdana || (o.zalohaId ? cisla.has(String(o.zalohaId)) : false),
          o.zalohaId,
          f.id,
          poradie,
        ),
    );
    if (z) zalohy[String(f.id)] = z;
  }

  const opraveneIds = faktury
    .filter(
      (f: Riadok) => (f.type === "credit_note" || f.type === "debit_note") && f.opravuje_fakturu_id,
    )
    .map((f: Riadok) => String(f.opravuje_fakturu_id));
  const potrebne = [...new Set(opraveneIds)];
  const { data: suvisiace } = potrebne.length
    ? await supabase
        .from("invoices")
        .select("id, invoice_number, exported_at")
        .eq("company_id", companyId)
        .in("id", potrebne)
    : { data: [] };
  const podlaId = new Map<string, Riadok>((suvisiace ?? []).map((f: Riadok) => [String(f.id), f]));

  for (const f of faktury) {
    if ((f.type === "credit_note" || f.type === "debit_note") && f.opravuje_fakturu_id) {
      const idPovodnej = String(f.opravuje_fakturu_id);
      const povodna = podlaId.get(idPovodnej);
      // Číslo v Pohode zo spätnej väzby, inak naše (`numberRequested` pôvodnej).
      const cislo =
        cisla.get(idPovodnej) ?? (povodna?.invoice_number ? String(povodna.invoice_number) : null);
      const vPohode = odkazNaDokladPohody(
        cisla.has(idPovodnej) || Boolean(povodna?.exported_at),
        idPovodnej,
        f.id,
        poradie,
      );
      if (cislo && vPohode) opravovane[String(f.id)] = cislo;
      if (cislo) povodneCisla[String(f.id)] = cislo;
    }
  }

  return { zalohy, opravovane, povodneCisla };
}

/**
 * Skladové pohyby, ktoré ešte neodišli — a len tie, ktorých karta v Pohode už
 * je (alebo ide v tej istej dávke).
 *
 * Položka príjemky sa na kartu odvoláva naším identifikátorom; keby karta ešte
 * neexistovala, Pohoda by doklad odmietla a pohyb by sa zbytočne vracal do
 * fronty. Radšej počká deň.
 */
export async function nacitajPohyby(
  supabase: Klient,
  companyId: string,
  zasobyVDavke: Riadok[],
): Promise<Riadok[]> {
  const [{ data: vsetky }, { data: odoslanePohyby }, { data: odoslaneKarty }] = await Promise.all([
    // Všetky pohyby aj všetko odoslané — strop 1 000 riadkov by novšie pohyby
    // nikdy neposlal a orezaný zoznam odoslaných by staršie poslal druhýkrát.
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("stock_movements")
        .select("*, stock_items(sku, unit, vat_rate, products(name, code, unit, vat_rate))")
        .eq("company_id", companyId)
        .order("created_at")
        .order("id")
        .range(zac, kon),
    ),
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("pohoda_odoslane")
        .select("zaznam_id")
        .eq("company_id", companyId)
        .eq("agenda", "pohyb")
        .order("zaznam_id")
        .range(zac, kon),
    ),
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("pohoda_odoslane")
        .select("zaznam_id")
        .eq("company_id", companyId)
        .eq("agenda", "sklad")
        .order("zaznam_id")
        .range(zac, kon),
    ),
  ]);

  const uz = new Set((odoslanePohyby ?? []).map((r: Riadok) => String(r.zaznam_id)));
  const karty = new Set((odoslaneKarty ?? []).map((r: Riadok) => String(r.zaznam_id)));
  for (const z of zasobyVDavke) karty.add(String(z.id));

  return (vsetky ?? [])
    .filter((m: Riadok) => !uz.has(String(m.id)) && karty.has(String(m.stock_item_id)))
    .slice(0, STROP_DAVKY)
    .map((m: Riadok) => ({
      ...m,
      nazov: m.stock_items?.products?.name ?? null,
      sku: m.stock_items?.sku || m.stock_items?.products?.code || null,
      unit: m.stock_items?.unit || m.stock_items?.products?.unit || "ks",
      vat_rate: m.stock_items?.vat_rate ?? m.stock_items?.products?.vat_rate ?? 0,
    }));
}

/**
 * Zákazky: ktoré ešte neodišli, a ako sa volajú tie, na ktoré sa odvolávajú
 * faktúry v dávke.
 *
 * Posielajú sa **len raz** — agenda `contract` nemá v schéme `actionType`, takže
 * zákazku sa dá založiť, ale nie prepísať; druhé poslanie by v Pohode vyrobilo
 * druhú. Preto sa tu neporovnáva verzia, stačí, že záznam o odoslaní existuje.
 *
 * Zákazka bez evidenčného čísla sa dá do Pohody založiť, ale faktúru ňou
 * označiť nevieme — odkaz z faktúry je práve na to číslo.
 */
export async function nacitajZakazky(
  supabase: Klient,
  companyId: string,
  faktury: Riadok[],
): Promise<{ nove: Riadok[]; kody: Record<string, string> }> {
  const [{ data: vsetky }, { data: odoslane }] = await Promise.all([
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("jobs")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at")
        .order("id")
        .range(zac, kon),
    ),
    vsetkoAkoData((zac, kon) =>
      supabase
        .from("pohoda_odoslane")
        .select("zaznam_id")
        .eq("company_id", companyId)
        .eq("agenda", "zakazka")
        .order("zaznam_id")
        .range(zac, kon),
    ),
  ]);

  const uz = new Set((odoslane ?? []).map((r: Riadok) => String(r.zaznam_id)));
  const zakazky = vsetky ?? [];

  const kody: Record<string, string> = {};
  for (const z of zakazky) {
    if (z.job_number) kody[String(z.id)] = String(z.job_number).slice(0, 12);
  }

  // Prednosť majú zákazky, na ktoré sa odvoláva niečo v tejto dávke — inak by
  // faktúra ukázala na zákazku, ktorá v Pohode ešte nie je.
  const potrebne = new Set(
    faktury.map((f: Riadok) => String(f.job_id ?? "")).filter((x: string) => x),
  );
  const nove = zakazky
    .filter((z: Riadok) => !uz.has(String(z.id)))
    .sort(
      (a: Riadok, b: Riadok) =>
        Number(potrebne.has(String(b.id))) - Number(potrebne.has(String(a.id))),
    )
    .slice(0, STROP_DAVKY);

  return { nove, kody };
}

/** Kontakty, ktoré ešte neodišli alebo sa od odoslania zmenili. */
export async function nacitajZakaznikov(supabase: Klient, companyId: string): Promise<Riadok[]> {
  const cakaju = await cakajuce(supabase, "customers", "adresar", companyId, "deleted_at");
  if (!cakaju.length) return [];
  const { data } = await supabase
    .from("customers")
    .select("*")
    .in(
      "id",
      cakaju.map((c) => c.id),
    );
  return data ?? [];
}

/**
 * Skladové karty aj s názvom.
 *
 * Názov, kód a jednotka nie sú na skladovej karte, ale na produkte — bez
 * pripojenia by do Pohody odišla karta bez názvu a tú by odmietla.
 */
export async function nacitajZasoby(supabase: Klient, companyId: string): Promise<Riadok[]> {
  const cakaju = await cakajuce(supabase, "stock_items", "sklad", companyId, "archived_at");
  if (!cakaju.length) return [];

  const { data } = await supabase
    .from("stock_items")
    .select("*, products(name, code, unit, vat_rate)")
    .in(
      "id",
      cakaju.map((c) => c.id),
    );

  return (data ?? []).map((s: Riadok) => ({
    ...s,
    nazov: s.products?.name ?? null,
    sku: s.sku || s.products?.code || null,
    unit: s.unit || s.products?.unit || "ks",
    vat_rate: s.vat_rate ?? s.products?.vat_rate ?? 0,
  }));
}

/**
 * Krátky verejný odkaz na PDF faktúry.
 *
 * Podpísaný odkaz zo Supabase sa do Pohody nezmestí — schéma dáva URL adrese
 * 255 znakov a podpis má aj s tokenom vyše troch stoviek, navyše mu vyprší
 * platnosť. Preto má faktúra vlastný náhodný token a podpis sa vyrába až pri
 * kliknutí.
 */
async function odkazyNaPdf(supabase: Klient, faktury: Riadok[]): Promise<Record<string, string>> {
  const zaklad = zakladnaAdresa();
  const odkazy: Record<string, string> = {};
  for (const f of faktury) {
    let token = f.pdf_token as string | null;
    if (!token) {
      token = nahodnyToken();
      const { error } = await supabase.from("invoices").update({ pdf_token: token }).eq("id", f.id);
      // Bez tokenu ostane doklad bez odkazu — kvôli tomu sa dávka nezhodí.
      if (error) continue;
    }
    odkazy[String(f.id)] = `${zaklad}/api/public/faktura/${token}`;
  }
  return odkazy;
}

/*
  Rozbor `responsePack` je v `pohoda-odpoved.ts` (čistá časť — testy, skript
  na vyhodnotenie skúšky `scripts/pohoda-odpoved.ts`). Tu sa len zapisuje.
*/
export type { VysledokDokladu } from "./pohoda-odpoved";

/** Výsledky položiek odpovede (kompatibilita so staršími volaniami). */
export function rozoberOdpoved(xml: string): VysledokDokladu[] {
  return rozoberBalikOdpovede(xml).polozky;
}

/**
 * Identifikátor bez verzie.
 *
 * Doklady posielame pod holým `id`, číselníky pod `id-verzia` (aby zmenená
 * karta prešla kontrolou duplicity). Späť sa mapujú obidva rovnako.
 */
export function holeId(id: string): string {
  const m = String(id).match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-\d+)?(?:-storno)?$/i,
  );
  return m ? m[1] : String(id);
}

export type SpracovanieOdpovede = {
  spracovanych: number;
  zalozenych: number;
  chybnych: number;
  chyby: string[];
  /** Upozornenia Pohody (doklad prešiel, ale niečo upravila) — na kontrolu. */
  upozornenia?: string[];
  /** Pohoda odmietla celý balík (prihlásenie, práva, IČO) — dávka sa vrátila do fronty. */
  chybaBaliku?: string | null;
  /** Načítané predkontácie a členenia DPH, ak sa na ne dávka pýtala. */
  ciselniky?: { predkontacii: number; cleneni: number; vypnutych: number } | null;
};

/**
 * Zapíše výsledok importu.
 *
 * Až odpoveď POHODY urobí z odoslaného dokladu odovzdaný (K3): položka s
 * `state="ok"` (aj `recordDuplicity`) sa označí a zamkne, odmietnutá ostane
 * vo fronte, odmietnutý celý balík vráti celú dávku. Párovanie je podľa
 * presného `dataPackItem id` vrátane storna (V12) —
 * `pohoda-konektor-potvrdenie.server.ts`.
 */
export async function spracujOdpoved(
  supabase: Klient,
  vstup: { companyId: string; xml: string },
): Promise<SpracovanieOdpovede> {
  // Predkontácie a členenia DPH, ak sa na ne dávka pýtala.
  const { jeIdCiselnika } = await import("./predkontacie");
  const { ulozCiselnikyZPohody } = await import("./predkontacie.server");
  const ciselniky = await ulozCiselnikyZPohody(supabase, vstup);

  const balik = rozoberBalikOdpovede(vstup.xml);
  const { spracujPolozkyOdpovede } = await import("./pohoda-konektor-potvrdenie.server");
  // Samotná žiadosť o číselníky (bez dávky) nemá čo potvrdzovať.
  /*
    Automatická likvidácia bankových pohybov (`LQD-…`) nie je doklad — do
    párovania s položkami dávky ani s doklady nejde a jej odmietnutie nič
    nevracia do fronty; výsledok párovania ide do upozornení.
  */
  const { jeIdLikvidacie, rozoberLikvidaciu, hlaskyLikvidacie } = await import("./banka-pohoda");
  const mimoDokladov = (id: string) => jeIdCiselnika(id) || jeIdLikvidacie(id);
  const hlaskyParovania = hlaskyLikvidacie(rozoberLikvidaciu(vstup.xml));
  const lenCiselniky = balik.polozky.length > 0 && balik.polozky.every((v) => mimoDokladov(v.id));
  const r = lenCiselniky
    ? {
        spracovanych: 0,
        zalozenych: 0,
        chyby: [] as string[],
        upozornenia: [] as string[],
        chybaBaliku: null,
        nezname: 0,
        nesparovane: [],
      }
    : await spracujPolozkyOdpovede(supabase, {
        companyId: vstup.companyId,
        balik,
        jeCiselnik: mimoDokladov,
      });
  /*
    Položky, ktoré nepatria dávke konektora — odpoveď na mesačný balík alebo
    ručný súbor nahratá v Prepojení s Pohodou. Tie sa pri odovzdaní označili
    hneď (človek súbor importuje sám), odpoveď im len dopíše číslo a
    odmietnuté vráti do fronty.
  */
  const bezDavky = await spracujPolozkyBezDavky(supabase, vstup.companyId, r.nesparovane);

  const chyby = [...r.chyby, ...bezDavky.chyby];
  return {
    spracovanych: r.spracovanych,
    zalozenych: r.zalozenych - r.nesparovane.length + bezDavky.zalozenych,
    chybnych: chyby.length,
    chyby: chyby.slice(0, 20),
    upozornenia: [...hlaskyParovania, ...r.upozornenia, ...bezDavky.upozornenia].slice(0, 20),
    chybaBaliku: r.chybaBaliku,
    ciselniky,
  };
}

/**
 * Odpoveď POHODY na mesačný balík či ručný súbor (doklady nie sú v dávke
 * konektora). Doklad sa pri ich odovzdaní označil hneď; tu sa mu dopíše
 * číslo v POHODE a odmietnutý sa vráti do fronty. Storno (`<id>-storno`) sa
 * pri odmietnutí vráti do fronty (V12) — predtým jeho id nesedelo s ničím.
 */
async function spracujPolozkyBezDavky(
  supabase: Klient,
  companyId: string,
  vysledky: VysledokDokladu[],
): Promise<{ zalozenych: number; chyby: string[]; upozornenia: string[] }> {
  const teraz = new Date().toISOString();
  const chyby: string[] = [];
  const upozornenia: string[] = [];
  let zalozenych = 0;
  for (const v of vysledky) {
    // Duplicita dávky = doklad už v Pohode je; vrátiť ho do fronty by ho posielalo donekonečna.
    const chyba = v.stav === "error" && !v.duplicita;
    if (chyba) chyby.push(`${v.cislo ?? v.id}: ${v.poznamka ?? "neznáma chyba"}`);
    else zalozenych++;
    if (v.stav === "warning" && v.poznamka) upozornenia.push(`${v.cislo ?? v.id}: ${v.poznamka}`);
    const id = holeId(v.id);

    /*
      Bankový pohyb z balíka (`BNK-<bank_transactions.id>`): dopíše sa číslo,
      odmietnutý sa vráti do fronty. Pohyb z PDF/XML banky (odtlačok, nie
      uuid) vo Fakteri nie je — nie je čo zapísať.
    */
    const bnk = /^BNK-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(v.id);
    if (bnk) {
      await supabase
        .from("bank_transactions")
        .update({
          pohoda_cislo: v.cislo,
          ...(chyba ? { exported_at: null, export_job_id: null } : {}),
        })
        .eq("company_id", companyId)
        .eq("id", bnk[1]!.toLowerCase());
      // Potvrdený z ručného súboru — v POHODE je, konektor ani balík ho už neposielajú.
      if (!chyba)
        await supabase
          .from("bank_transactions")
          .update({ exported_at: teraz })
          .eq("company_id", companyId)
          .eq("id", bnk[1]!.toLowerCase())
          .is("exported_at", null);
      continue;
    }
    if (/^(BNK|LQD)-/i.test(v.id)) continue;

    if (/-storno$/i.test(v.id)) {
      if (chyba)
        await supabase
          .from("pohoda_odoslane")
          .delete()
          .eq("company_id", companyId)
          .eq("agenda", "storno")
          .eq("zaznam_id", id);
      continue;
    }

    const { data: log } = await supabase
      .from("export_logs")
      .select("id")
      .eq("company_id", companyId)
      .eq("invoice_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (log) {
      await supabase
        .from("export_logs")
        .update({
          pohoda_cislo: v.cislo,
          pohoda_stav: v.stav,
          potvrdene_at: teraz,
          // `ok` je pre nás „odovzdané" — chybný doklad sa musí vrátiť do fronty.
          status: chyba ? "error" : "ok",
          // Pri upozornení text ostáva — Pohoda doklad zapísala inak, než prišiel.
          error: v.stav === "ok" ? null : v.poznamka,
        })
        .eq("id", log.id);
      continue;
    }
    const { data: doklad } = await supabase
      .from("expense_documents")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();
    if (doklad) {
      await supabase
        .from("expense_documents")
        .update({ pohoda_cislo: v.cislo, ...(chyba ? { exported_at: null, status: "new" } : {}) })
        .eq("id", id);
      continue;
    }
    const { data: prijata } = await supabase
      .from("purchase_invoices")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();
    if (prijata) {
      await supabase
        .from("purchase_invoices")
        .update({ pohoda_cislo: v.cislo, ...(chyba ? { exported_at: null } : {}) })
        .eq("id", id);
      continue;
    }
    const { data: pohyb } = await supabase
      .from("cash_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();
    if (pohyb) {
      await supabase
        .from("cash_entries")
        .update({ pohoda_cislo: v.cislo, ...(chyba ? { exported_at: null } : {}) })
        .eq("id", id);
      continue;
    }
    // Číselníky a skladové doklady: odmietnutý záznam sa vráti do fronty tým, že
    // sa zabudne, čo odišlo. Číslo im Pohoda neprideľuje.
    if (!chyba) continue;
    await supabase.from("pohoda_odoslane").delete().eq("company_id", companyId).eq("zaznam_id", id);
    // Príjemka a výdajka nesie identifikátor prvého pohybu — vráti sa celá skupina.
    await vratSkupinuPohybov(supabase, companyId, id);
  }
  return { zalozenych, chyby, upozornenia };
}

/**
 * Vráti do fronty všetky pohyby z tej istej príjemky či výdajky (odpoveď na
 * balík). Skupina sa dopočíta rovnako, ako sa skladala — podľa smeru, dňa a
 * zdrojového dokladu.
 */
async function vratSkupinuPohybov(supabase: Klient, companyId: string, id: string): Promise<void> {
  const { data: prvy } = await supabase
    .from("stock_movements")
    .select("id, type, quantity, created_at, source_document_id, reference_id")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (!prvy) return;
  const den = String(prvy.created_at ?? "").slice(0, 10);
  const { data: vDen } = await supabase
    .from("stock_movements")
    .select("id, type, quantity, created_at, source_document_id, reference_id")
    .eq("company_id", companyId)
    .gte("created_at", `${den}T00:00:00Z`)
    .lt("created_at", `${den}T23:59:59.999Z`);
  const { zoskupPohyby } = await import("./export.server");
  const skupina = zoskupPohyby(vDen ?? []).find((s) => s.id === id);
  if (!skupina) return;
  await supabase
    .from("pohoda_odoslane")
    .delete()
    .eq("company_id", companyId)
    .eq("agenda", "pohyb")
    .in(
      "zaznam_id",
      skupina.pohyby.map((m: Riadok) => m.id),
    );
}

/**
 * Text odpovede z Pohody.
 *
 * Pohoda zapisuje XML vo Windows-1250 a `Request.text()` by z diakritiky v
 * chybových hláškach urobil nečitateľnú kašu.
 */
export function dekodujOdpoved(bajty: ArrayBuffer): string {
  const zaciatok = new TextDecoder("ascii").decode(new Uint8Array(bajty).slice(0, 200));
  const m = zaciatok.match(/encoding\s*=\s*["']([\w-]+)["']/i);
  const kodovanie = (m?.[1] ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(kodovanie).decode(bajty);
  } catch {
    return new TextDecoder("utf-8").decode(bajty);
  }
}

function bezDiakritiky(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Názov súboru balíčka — aby sa tri stiahnuté ZIPy dali od seba rozoznať. */
export function nazovBalicka(firma: string): string {
  const slug = bezDiakritiky(firma)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug ? `faktero-pohoda-${slug}.zip` : "faktero-pohoda-konektor.zip";
}

/**
 * Balíček pre účtovníčku — celý most na jej strane.
 *
 * Zámerne to nie je program, ktorý by sa inštaloval. POHODA vie XML import
 * spustiť z príkazového riadku, takže stačí dávkový súbor a naplánovaná úloha
 * Windows: nič sa nepodpisuje, nič sa neaktualizuje, účtovníčka si obsah vie
 * prečítať v Poznámkovom bloku a kedykoľvek ho zmazať.
 *
 * Kľúč sa vyrába tu a vloží sa rovno do súboru — nikde sa nezobrazuje a nemá
 * ako skončiť v mailoch ani v chate.
 */
/**
 * Pomocník dávkového súboru na HTTPS (stiahnutie dávky, odoslanie odpovede).
 *
 * Predtým to robil `curl`, ktorý Windows Server 2016 (a Windows 10 pred
 * verziou 1803, Server 2012) nemá — most by u takej účtovníčky nespravil nič
 * (overené 16. 11. 2026 na Server 2016 s POHODOU). PowerShell 3+ je všade;
 * TLS 1.2 sa zapína výslovne, staršie .NET ho samo neponúkne. Vypíše len
 * HTTP kód (0 = spojenie zlyhalo). Odpoveď POHODY ide ako surové bajty
 * (Windows-1250), nič sa neprekóduje.
 */
export function httpSkript(): string {
  return `param([string]$Url, [string]$Kluc, [string]$Vystup, [string]$Subor, [string]$Text)
# Faktero - HTTPS pre faktero-pohoda.cmd. Nemente.
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
$h = @{ Authorization = "Bearer $Kluc" }
try {
  if ($Subor) {
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $Url -Headers $h -ContentType 'text/xml' -InFile $Subor
  } elseif ($PSBoundParameters.ContainsKey('Text')) {
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $Url -Headers $h -ContentType 'text/xml' -Body ([Text.Encoding]::UTF8.GetBytes($Text))
  } else {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -Headers $h -OutFile $Vystup -PassThru
  }
  [int]$r.StatusCode
} catch {
  if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
}
`;
}

export function davkovySubor(p: { adresa: string }): string {
  // Bez diakritiky zámerne: dávkový súbor sa vykonáva v kódovej stránke, ktorú
  // si Windows volí sám, a rozsypané hlásenie by len mýlilo.
  return `@echo off
setlocal enabledelayedexpansion
title Faktero - prenos do Pohody

rem ===========================================================
rem  NASTAVENIE - spolocne pre vsetky firmy v tomto priecinku
rem ===========================================================

rem Cesta k programu POHODA (skontrolujte nazov priecinka)
set "POHODA=C:\\Program Files (x86)\\STORMWARE\\POHODA SK\\Pohoda.exe"

rem Prihlasenie do Pohody. Ked ucet nema heslo, nechajte prazdne.
set "MENO=@"
set "HESLO="

rem ===========================================================
rem  Ktore firmy sa prenasaju, je vo firmy.txt vedla tohto suboru.
rem  Jeden riadok na firmu:  KLUC;DATABAZA;NAZOV;DATABAZA_MINULY_ROK
rem  Posledne pole je volitelne - na prelome rokov sa do nej prenesu
rem  doklady minuleho roka, do DATABAZA len tohtorocne.
rem  Jeden kluc pre viac firiem nesie za zavinacom ICO firmy:
rem  KLUC@12345678 - kluc je vo vsetkych riadkoch ten isty.
rem  Dalej uz netreba menit nic.
rem ===========================================================

set "ADRESA=${p.adresa}"
set "PRIECINOK=%~dp0"
set "ZOZNAM=%PRIECINOK%firmy.txt"
set "VSTUP=%PRIECINOK%vstup"
set "ODPOVED=%PRIECINOK%odpoved"
set "HOTOVO=%PRIECINOK%hotovo"
set "PROTOKOL=%PRIECINOK%protokol.txt"

if not exist "%VSTUP%" mkdir "%VSTUP%"
if not exist "%ODPOVED%" mkdir "%ODPOVED%"
if not exist "%HOTOVO%" mkdir "%HOTOVO%"

call :log "--- start ---"

if not exist "%POHODA%" (
  call :log "CHYBA: Pohoda.exe sa nenasla - opravte cestu v tomto subore."
  goto :koniec
)
if not exist "%ZOZNAM%" (
  call :log "CHYBA: chyba subor firmy.txt - bez neho nevieme, co prenasat."
  goto :koniec
)

rem Firmy sa beru po jednej. Pohoda vie naraz spracovat len jeden import,
rem takze paralelne by to aj tak neslo - a takto sedi kazda odpoved k svojmu
rem klucu. Riadky zacinajuce na # su poznamky.
for /f "usebackq eol=# tokens=1,2,3,4 delims=;" %%a in ("%ZOZNAM%") do (
  set "KLUC=%%a"
  set "DATABAZA=%%b"
  set "NAZOV=%%c"
  set "PRELOM=%%d"
  call :firma
)

goto :koniec

rem ===========================================================
rem  Jedna firma
rem ===========================================================
:firma
if "%KLUC%"=="" exit /b
rem Poistka na poznamku, ktorej sa do zaciatku dostal BOM: Poznamkovy blok
rem ho pri ulozeni v UTF-8 pridava sam a "eol=#" ho uz nerozpozna.
echo %KLUC%| findstr /b /c:"fk_" >nul || exit /b
rem Kluc pre viac firiem: firma (ICO alebo id) je za zavinacom.
set "FIRMA="
for /f "tokens=1,2 delims=@" %%x in ("%KLUC%") do (
  set "KLUC=%%x"
  set "FIRMA=%%y"
)
if "%DATABAZA%"=="" (
  call :log "%NAZOV%: PRESKOCENE - v firmy.txt chyba nazov databazy."
  exit /b
)

rem Odpoved z predosleho behu, ktoru sa nepodarilo odoslat, patri inej firme
rem ako tej, ktora ide teraz - poslat ju s cudzim klucom by bola chyba.
for %%f in ("%ODPOVED%\\*.xml") do (
  move /y "%%f" "%HOTOVO%" >nul
  call :log "Odlozena neodoslana odpoved z predosleho behu: %%~nxf"
)

rem Prelom rokov: najprv doklady minuleho roka do databazy minuleho roka,
rem potom tohtorocne do beznej. Bez nej ide vsetko naraz ako doteraz.
if not "%PRELOM%"=="" (
  set "CAST=prelom"
  set "DB=%PRELOM%"
  call :prenos
  set "CAST=bezny"
  set "DB=%DATABAZA%"
  call :prenos
) else (
  set "CAST="
  set "DB=%DATABAZA%"
  call :prenos
)
exit /b

rem ===========================================================
rem  Jeden prenos do jednej databazy
rem ===========================================================
:prenos
set "URL=%ADRESA%/api/v1/pohoda/davka"
set "ODPOVED_URL=%ADRESA%/api/v1/pohoda/odpoved"
set "SPOJ=?"
set "SPOJ2=?"
if not "%CAST%"=="" (
  set "URL=%URL%?cast=%CAST%"
  set "SPOJ=&"
)
rem Pri kluci pre viac firiem povie, ktorej firme davka a odpoved patria.
if not "%FIRMA%"=="" (
  set "URL=%URL%%SPOJ%company=%FIRMA%"
  set "ODPOVED_URL=%ODPOVED_URL%?company=%FIRMA%"
  set "SPOJ2=&"
)
rem Hlasenie, ze Pohoda nic nevratila - Faktero vrati doklady do fronty hned.
set "BEZ_URL=%ODPOVED_URL%%SPOJ2%bez_odpovede=1"

rem 1. Stiahnutie davky z Faktera. Von ide bezne HTTPS, nic sa neotvara.
rem    Cez PowerShell (faktero-http.ps1) - Windows Server 2016 a starsie nemaju program na HTTPS z prikazoveho riadku.
set "SUBOR=%VSTUP%\\davka.xml"
if exist "%SUBOR%" del /q "%SUBOR%"
set "KOD=0"
for /f %%k in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%PRIECINOK%faktero-http.ps1" -Url "%URL%" -Kluc "%KLUC%" -Vystup "%SUBOR%"') do set "KOD=%%k"

if "%KOD%"=="204" (
  call :log "%NAZOV% %CAST%: nic nove na prenos."
  if exist "%SUBOR%" del /q "%SUBOR%"
  exit /b
)
if not "%KOD%"=="200" (
  call :log "%NAZOV%: Faktero odpovedalo %KOD% - preskocene."
  if exist "%SUBOR%" del /q "%SUBOR%"
  exit /b
)
rem Odrezany subor (prerusene spojenie) by Pohoda nenacitala - davka sa vrati do fronty.
findstr /c:"</dat:dataPack>" "%SUBOR%" >nul 2>&1 || (
  call :log "%NAZOV%: davka prisla neuplna - import sa nespusta, Faktero ju posle znova."
  del /q "%SUBOR%"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PRIECINOK%faktero-http.ps1" -Url "%BEZ_URL%" -Kluc "%KLUC%" -Text "neuplny subor" >nul
  exit /b
)
call :log "%NAZOV%: davka stiahnuta."

rem 2. a 3. Import do Pohody (podprogram :importuj nizsie).
call :importuj
rem POHODA na SQL serveri databazu s koncovkou .mdb nenajde ("Nepodarilo sa
rem otvorit databazovy subor") a odpoved nevrati - skusi sa este bez koncovky.
dir /b "%ODPOVED%\\*.xml" >nul 2>&1 || (
  if /i "!DB:~-4!"==".mdb" (
    set "DB=!DB:~0,-4!"
    call :log "%NAZOV%: databaza s koncovkou .mdb sa neotvorila - skusam !DB!"
    call :importuj
  )
)

rem 4. Odpoved spat do Faktera - z nej sa dozvie cisla dokladov a chyby.
dir /b "%ODPOVED%\\*.xml" >nul 2>&1 || (
  call :log "%NAZOV%: Pohoda nevratila ziadnu odpoved - pozrite protokol importu v Pohode. Doklady pojdu znova."
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PRIECINOK%faktero-http.ps1" -Url "%BEZ_URL%" -Kluc "%KLUC%" -Text "bez odpovede" >nul
)
for %%f in ("%ODPOVED%\\*.xml") do (
  set "KOD2=0"
  for /f %%k in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%PRIECINOK%faktero-http.ps1" -Url "%ODPOVED_URL%" -Kluc "%KLUC%" -Subor "%%f"') do set "KOD2=%%k"
  if "!KOD2!"=="200" (
    move /y "%%f" "%HOTOVO%" >nul
    call :log "%NAZOV%: odpoved odoslana (%%~nxf)"
  ) else (
    call :log "%NAZOV%: odpoved sa odoslat nepodarila (!KOD2!): %%~nxf"
  )
)
exit /b

rem ===========================================================
rem  Import jednej davky do databazy %DB%
rem ===========================================================
:importuj
rem Konfiguracia importu. Pise sa zakazdym, lebo databaza je ina firma od firmy.
> "%PRIECINOK%import.ini" (
  echo [XML]
  echo database=%DB%
  echo input_dir=%VSTUP%
  echo response_dir=%ODPOVED%
  echo check_duplicity=1
  echo action_after_processing=2
  echo Move_to=%HOTOVO%
)

rem Nacitanie do Pohody. /wait - inak by sa pokracovalo skor, nez skonci.
call :log "%NAZOV% %CAST%: spustam import do Pohody (%DB%)..."
start "" /wait "%POHODA%" /XML "%MENO%" "%HESLO%" "%PRIECINOK%import.ini"
call :log "%NAZOV%: import skoncil."
exit /b

:koniec
call :log "--- koniec ---"
endlocal
exit /b 0

:log
rem Presmerovanie je pred echom zamerne: ked by text koncil cislicou,
rem cmd by ju spojil so znakmi >> a vzalo by to ako presmerovanie prudu.
>>"%PROTOKOL%" echo %date% %time% %~1
echo %~1
exit /b
`;
}

/**
 * Zoznam firiem, ktoré sa prenášajú.
 *
 * Účtovníčka vedie klientov aj päťdesiat a Pohoda spúšťa import vždy nad
 * jednou účtovnou jednotkou — cyklus teda musí byť na jej strane tak či tak.
 * Radšej ako päťdesiat priečinkov a päťdesiat naplánovaných úloh je jeden
 * priečinok a jeden riadok na klienta: kľúč z jeho balíčka, databáza jeho
 * účtovnej jednotky, názov do protokolu.
 */
export function zoznamFiriem(firmy: { kluc: string; firma: string; databaza: string }[]): string {
  return `# Ktore firmy sa prenasaju do Pohody.
#
# Jeden riadok na firmu, hodnoty oddelene bodkociarkou:
#
#   KLUC;DATABAZA;NAZOV
#   KLUC;DATABAZA;NAZOV;DATABAZA_MINULY_ROK   (na prelome rokov)
#
#   KLUC      - z balicka, ktory vam poslal klient (zacina fk_live_).
#               Jeden kluc pre viac firiem ma za zavinacom ICO firmy:
#               fk_live_...@12345678 - kluc je vo vsetkych riadkoch rovnaky.
#   DATABAZA  - nazov databazy uctovnej jednotky v Pohode
#               (Pohoda: Subor - Uctovne jednotky - stlpec Databaza)
#   NAZOV     - lubovolne pomenovanie do protokolu (bez bodkociarky)
#   DATABAZA_MINULY_ROK - volitelne; ked je vyplnena, doklady minuleho roka
#               idu do nej a do DATABAZA len tohtorocne. Po uzavreti roka
#               ju z riadku zmazte.
#
# Bez medzier okolo bodkociarky. Riadok zacinajuci na # sa preskoci,
# takze firmu viete docasne vypnut tym, ze pred nu date #.
#
# Dalsieho klienta pridate tak, ze si z jeho balicka skopirujete jeho
# riadok sem pod tento. Priecinok, davkovy subor ani ulohu uz nemenite.

${firmy.map((f) => `${f.kluc};${f.databaza};${String(f.firma).replace(/;/g, ",")}`).join("\n")}
`;
}

export function nastavenieUlohy(): string {
  return `@echo off
rem Zalozi naplanovanu ulohu, ktora spusti prenos kazdy den o 2:00 v noci.
rem Cas zmenite tak, ze prepisete 02:00 nizsie.
rem
rem Nazov ulohy nesie nazov tohto priecinka. Vsetky firmy z firmy.txt
rem obsluhuje jedna uloha; ked by ste priecinkov mali predsa viac, nazvy
rem sa nezhoduju a jedna uloha druhu neprepise.

for %%i in ("%~dp0.") do set "TENTO=%%~nxi"
set "ULOHA=Faktero - prenos do Pohody - %TENTO%"

schtasks /create /tn "%ULOHA%" /tr "'%~dp0faktero-pohoda.cmd'" /sc daily /st 02:00 /f

if errorlevel 1 (
  echo.
  echo Ulohu sa nepodarilo zalozit. Skuste tento subor spustit ako spravca.
) else (
  echo.
  echo Hotovo. Uloha "%ULOHA%" pobezi kazdy den o 2:00.
)
pause
`;
}

export function navod(p: {
  firmy: string[];
  adresa: string;
  /** Balíček nesie jeden kľúč pre viac firiem; `vsetky` = platí aj pre budúce. */
  jedenKluc?: { vsetky: boolean };
}): string {
  const dalsiKlient = p.jedenKluc?.vsetky
    ? `Všetky firmy idú cez jeden kľúč a ten platí aj pre firmy, ktoré vo
Fakteri spravujete neskôr. Nového klienta pridáte tak, že vo firmy.txt
skopírujete hociktorý riadok, za zavináčom prepíšete IČO na IČO nového
klienta a doplníte názov jeho databázy a firmy. Nový kľúč netreba.`
    : p.jedenKluc
      ? `Všetky firmy z tohto balíčka idú cez jeden kľúč (za zavináčom je IČO
firmy). Platí len pre firmy, ktoré ste vybrali pri sťahovaní — pre
ďalšieho klienta si stiahnite nový balíček a jeho riadok skopírujte sem.
Keď pri sťahovaní vyberiete všetky svoje firmy, kľúč bude platiť aj pre
tie, ktoré pribudnú, a nový balíček už nebude treba.`
      : `Klient vám pošle svoj balíček. Z jeho firmy.txt skopírujte posledný
riadok (ten s kľúčom) a vložte ho do svojho firmy.txt pod ostatné.
Doplňte názov jeho databázy — a to je všetko.`;
  return `PRENOS DOKLADOV Z FAKTERA DO POHODY
${"=".repeat(45)}

${p.firmy.length === 1 ? `Firma: ${p.firmy[0]}` : `Firmy (${p.firmy.length}): ${p.firmy.join(", ")}`}

Čo to robí
----------
Raz denne v noci si tento priečinok stiahne z Faktera doklady, ktoré
ešte v Pohode nie sú, načíta ich do Pohody a pošle späť správu o tom,
ako import dopadol. Vďaka tomu Faktero vie, ktoré doklady sa naozaj
založili a aké čísla dostali.

Nič sa neinštaluje a Pohoda nemusí byť spustená — dávkový súbor si ju
spustí sám a po skončení zavrie. Von ide len bežné HTTPS spojenie,
takže sa neotvárajú žiadne porty.

Firiem môže byť v jednom priečinku ľubovoľne veľa — sú vypísané
v súbore firmy.txt a prenášajú sa jedna po druhej.

Nastavenie (raz, asi päť minút)
-------------------------------
1. Celý priečinok skopírujte na počítač, kde je POHODA.
   Odporúčame C:\\Faktero — cesta bez medzier a diakritiky.

2. Otvorte faktero-pohoda.cmd v Poznámkovom bloku
   (pravé tlačidlo → Upraviť) a hore vyplňte:

   POHODA — cesta k Pohoda.exe
   MENO   — prihlasovacie meno do Pohody (@ = admin)
   HESLO  — heslo; keď žiadne nie je, nechajte prázdne

   Toto platí pre všetky firmy naraz, mení sa to len raz.

3. Otvorte firmy.txt a skontrolujte názov databázy účtovnej jednotky.
   Predvyplnili sme odhad; skutočný nájdete v Pohode:
   Súbor → Účtovné jednotky, stĺpec Databáza.

4. Dvakrát kliknite na faktero-pohoda.cmd a pozrite sa, čo vypíše.
   Prvý beh je najlepšie spustiť, keď v Pohode nikto nepracuje.

5. Keď prvý beh prejde, spustite nastav-ulohu.cmd — založí
   naplánovanú úlohu na 2:00 v noci. Ak sa nepodarí, spustite ho
   pravým tlačidlom → Spustiť ako správca.

Ďalší klient (asi pol minúty)
-----------------------------
${dalsiKlient} Priečinok, dávkový súbor ani naplánovanú úlohu
už nemeníte, o zvyšok sa postará cyklus.

Firmu dočasne vypnete tým, že pred jej riadok dáte #.

Čo v priečinku vzniká
---------------------
firmy.txt    zoznam firiem — jediné, čo pri pribúdaní klientov meníte
vstup\\      stiahnutá dávka pred načítaním
odpoved\\    odpoveď z Pohody pred odoslaním späť
hotovo\\     spracované súbory (archív, dá sa občas vyprázdniť)
protokol.txt čo sa kedy stalo — každý riadok má na začiatku firmu
import.ini   konfigurácia importu; prepisuje sa pri každej firme

Časté otázky
------------
Musí byť počítač zapnutý?
  Áno, v čase, keď má úloha bežať. Keď je vypnutý, prenos sa vynechá
  a doklady prídu ďalšiu noc — nič sa nestratí.

Ako dlho to trvá pri viacerých firmách?
  Firmy idú za sebou, nie naraz — Pohoda vie spracovať vždy len jeden
  import. Firma, ktorá nemá nič nové, je vybavená za sekundu: Faktero
  odpovie „nič nové" a ide sa ďalej.

Môže sa doklad naimportovať dvakrát?
  Nie. Pohoda má zapnutú kontrolu duplicity a každý doklad má stály
  identifikátor, takže druhý pokus odmietne.

Čo keď Pohoda niektorý doklad odmietne?
  Dôvod uvidíte v protokole importu a Faktero ho dostane v odpovedi.
  Taký doklad sa vráti do fronty a príde znova, keď sa chyba opraví.

Kedy je doklad vo Fakteri „odovzdaný“?
  Až keď Pohoda import potvrdí v odpovedi. Keď Pohoda odmietne celý
  súbor (zlé meno alebo heslo, iná databáza, IČO) alebo nevráti nič,
  doklady ostanú vo Fakteri neodovzdané a pôjdu znova pri ďalšom behu.
  Prehľad je vo Fakteri v Exportoch → Kontrola pred odovzdaním.

Ako to vypnem?
  Celé: zrušte naplánovanú úlohu (Plánovač úloh → Faktero - prenos do
  Pohody - <názov priečinka>) alebo zmažte priečinok.
  Pre jednu firmu: dajte # pred jej riadok vo firmy.txt.
  Kľúč sa dá zneplatniť v Fakteru v Nastavenia → API kľúče.

Podpora: ${p.adresa}
`;
}
