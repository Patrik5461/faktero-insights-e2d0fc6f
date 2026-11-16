/*
  Bankové pohyby do POHODY — čistá časť (bez databázy).

  Dve cesty, jeden výstup:
   - ručné „XML pre POHODU“ z Banka → Výpisy (`vypis-pohoda-xml.functions.ts`),
   - konektor (most) a mesačný balík, keď si firma zapne „Posielať bankové
     pohyby do Pohody“ (`companies.pohoda_posielat_banku`).

  Obidve skladajú pohyb z riadku `bank_transactions` tou istou funkciou
  ({@link pohybZTransakcie}) a XML tým istým generátorom
  (`polozkyBankovehoVypisu`), takže ten istý pohyb má v oboch rovnaké
  `dataPackItem id` (`BNK-<bank_transactions.id>`) aj obsah — POHODA druhý
  import toho istého pohybu odmietne kontrolou duplicity.
*/
import type { PohodaNastavenia, VypisPohyb } from "./export.server";
import { odhadniOznacenie } from "./vypis-oznacenie";
import { pravidloPohybu } from "./pravidla-uctovania";
import { symbolyZTextu } from "./banka-pohoda-id";

/** IBAN bez medzier a veľkými písmenami — na porovnanie účtov. */
export const normIban = (v: unknown) => String(v ?? "").replace(/\s+/g, "").toUpperCase();

/** Riadok `bank_transactions`, ktorý treba na pohyb do POHODY. */
export type TransakciaBanky = {
  id: string;
  booking_date: string;
  amount: number | string;
  currency?: string | null;
  variable_symbol?: string | null;
  counterparty?: string | null;
  counterparty_iban?: string | null;
  description?: string | null;
  bank_account_id?: string | null;
  created_at?: string | null;
  exported_at?: string | null;
};

/**
 * Pohyb z databázy ako pohyb výpisu pre POHODU — tak isto pre ručné XML,
 * konektor aj balík.
 *
 * @param o.iban IBAN účtu pohybu (pravidlá automatického účtovania pre banku
 *   sa môžu viazať na účet).
 * @param o.kurz kurz ku dňu zaúčtovania pri účte v cudzej mene, inak `null`.
 * @param o.poradie poradie pohybu vo výpise (`numberMovement`); bez neho
 *   poradie v zozname.
 */
export function pohybZTransakcie(
  t: TransakciaBanky,
  o: { pravidla: any[]; iban: string | null | undefined; kurz: number | null; poradie?: number | null },
): VypisPohyb {
  const popis = String(t.description ?? "");
  // Pohyby z bankových notifikácií majú IBAN protistrany len v texte („… · IBAN SK…“).
  const ibanZTextu = /IBAN\s+([A-Z]{2}\d{2}[0-9A-Z ]{10,36})\s*$/i.exec(popis)?.[1] ?? null;
  // KS a ŠS banky píšu do textu platby (`/VS…/SS…/KS…`) — N7.
  const symboly = symbolyZTextu(popis);
  const p: VypisPohyb = {
    id: t.id ?? null,
    kurz: o.kurz,
    ks: symboly.ks,
    ss: symboly.ss,
    datum: t.booking_date,
    suma: Math.abs(Number(t.amount)),
    smer: Number(t.amount) < 0 ? "vydaj" : "prijem",
    popis: popis.replace(/\s*·\s*IBAN\s+[A-Z]{2}[0-9A-Z ]{10,40}\s*$/i, "").trim() || null,
    protistrana: t.counterparty ?? null,
    protiucet: (t.counterparty_iban ?? ibanZTextu)?.replace(/\s+/g, "") ?? null,
    vs: t.variable_symbol ?? null,
  };
  if (o.poradie != null) p.poradie = o.poradie;
  // Označenie (poplatok, úrok, splátka…) ako pri prevodníku z PDF — ide do poznámky
  // a vyberie predkontáciu podľa označenia (N7).
  p.oznacenie = odhadniOznacenie({ popis: p.popis, protistrana: p.protistrana, smer: p.smer, vs: p.vs });
  const r = pravidloPohybu((o.pravidla ?? []) as any[], p, o.iban);
  return { ...p, predkontacia: r ? (r as { predkontacia: string }).predkontacia : null };
}

/**
 * Nastavenia generátora pre bankové pohyby: skratka účtu v POHODE a
 * predkontácie banky z nastavení firmy.
 */
export function nastaveniaBankyPohody(company: any, banka: string): PohodaNastavenia {
  return {
    // Skratka bankového účtu v POHODE; bez nej by POHODA dala pohyby na predvolený účet.
    banka,
    /*
      Bez bnk:accounting vezme POHODA predkontáciu z nastavenia používateľa,
      pod ktorým beží import (bank.xsd) — nie z bankového účtu. Preto ide
      predkontácia banky z nastavení firmy pre POHODU; pravidlo pohybu má prednosť.
    */
    predkontaciaBanka: String(company?.pohoda_predkontacia_banka ?? "").trim() || null,
    predkontacieOznaceni: (company?.pohoda_predkontacie_oznaceni ?? {}) as Record<string, string>,
  } as PohodaNastavenia;
}

/** Číslo výpisu = mesiac (výpisy zostavené Fakterom sú mesačné). */
export function cisloVypisuZDatumu(datum: unknown): string {
  return String(Number(String(datum ?? "").slice(5, 7)) || "");
}

/** Posledný deň mesiaca dátumu `YYYY-MM-DD`. */
export function koniecMesiaca(datum: string): string {
  const r = Number(datum.slice(0, 4));
  const m = Number(datum.slice(5, 7));
  const posledny = new Date(Date.UTC(r, m, 0)).getUTCDate();
  return `${datum.slice(0, 7)}-${String(posledny).padStart(2, "0")}`;
}

/** Účet firmy v banke (`bank_accounts`). */
export type UcetBanky = { id: string; iban: string | null; currency?: string | null; account_name?: string | null };

/**
 * Skratka účtu v POHODE: z Firma → Bankové účty (`company_bank_accounts`,
 * párované cez IBAN). Spoločná skratka firmy (`pohoda_banka`) platí len
 * vtedy, keď má firma jediný účet — pri viacerých by pohyby všetkých účtov
 * skončili na jednom účte v POHODE (tak skončila VÚB pod Tatra bankou).
 */
export function skratkaUctuVPohode(
  ucet: UcetBanky,
  skratkyFirmy: { iban: string | null; pohoda_skratka: string | null }[],
  pohodaBanka: string | null | undefined,
  pocetUctov: number,
): string | null {
  const vlastna = skratkyFirmy.find((r) => normIban(r.iban) && normIban(r.iban) === normIban(ucet.iban));
  const s = String(vlastna?.pohoda_skratka ?? "").trim();
  if (s) return s;
  const spolocna = String(pohodaBanka ?? "").trim();
  return spolocna && pocetUctov === 1 ? spolocna : null;
}

/** Ako sa účet volá v hláške. */
export function nazovUctu(u: UcetBanky): string {
  const iban = normIban(u.iban);
  const meno = String(u.account_name ?? "").trim();
  if (meno && iban) return `${meno} (${iban})`;
  return meno || iban || "bez IBAN";
}

/** Hláška do dávky a do Kontroly Pohody pre účet bez skratky. */
export function hlaskaBezSkratky(u: UcetBanky): string {
  return `Banka — účet ${nazovUctu(u)} nemá skratku v Pohode, jeho pohyby sa neposielajú — doplňte ju vo Firma → Bankové účty`;
}

/** Skupina pohybov jedného účtu za jeden mesiac — jeden „výpis“ v dávke. */
export type SkupinaBanky = {
  ucet: UcetBanky;
  skratka: string;
  /** `YYYY-MM`. */
  mesiac: string;
  transakcie: TransakciaBanky[];
};

/**
 * Výber pohybov na odoslanie (konektor aj balík): len účty so skratkou v
 * POHODE, len neodovzdané, nie na ceste; zoradené podľa dňa a id ako ručný
 * výpis; najviac `strop` pohybov. Účty bez skratky sa vrátia na hlášku.
 */
export function vyberPohybovBanky(vstup: {
  zapnute: boolean;
  ucty: UcetBanky[];
  skratkyFirmy: { iban: string | null; pohoda_skratka: string | null }[];
  pohodaBanka: string | null | undefined;
  transakcie: TransakciaBanky[];
  /** Id pohybov, ktoré sú práve na ceste do POHODY. */
  naCeste?: Set<string>;
  /** Spodná hranica dňa zaúčtovania (vrátane). */
  od?: string | null;
  /** Horná hranica (bez nej). */
  doDna?: string | null;
  /** Brať aj odovzdané (balík „všetko za mesiac“). */
  ajOdovzdane?: boolean;
  strop?: number;
}): { skupiny: SkupinaBanky[]; bezSkratky: UcetBanky[]; vybrane: TransakciaBanky[] } {
  if (!vstup.zapnute) return { skupiny: [], bezSkratky: [], vybrane: [] };
  const skratky = new Map<string, string>();
  const bezSkratky: UcetBanky[] = [];
  for (const u of vstup.ucty) {
    const s = skratkaUctuVPohode(u, vstup.skratkyFirmy, vstup.pohodaBanka, vstup.ucty.length);
    if (s) skratky.set(String(u.id), s);
    else bezSkratky.push(u);
  }
  const ucty = new Map(vstup.ucty.map((u) => [String(u.id), u]));
  const vybrane = vstup.transakcie
    .filter((t) => skratky.has(String(t.bank_account_id)))
    .filter((t) => vstup.ajOdovzdane || !t.exported_at)
    .filter((t) => !vstup.naCeste?.has(String(t.id)))
    .filter((t) => !vstup.od || String(t.booking_date) >= vstup.od)
    .filter((t) => !vstup.doDna || String(t.booking_date) < vstup.doDna)
    .sort(
      (a, b) =>
        String(a.booking_date).localeCompare(String(b.booking_date)) || String(a.id).localeCompare(String(b.id)),
    )
    .slice(0, vstup.strop ?? Infinity);
  // Účet bez skratky, na ktorom nie je čo poslať, hlášku nepotrebuje.
  const sPohybmi = new Set(vstup.transakcie.filter((t) => vstup.ajOdovzdane || !t.exported_at).map((t) => String(t.bank_account_id)));
  const skupiny = new Map<string, SkupinaBanky>();
  for (const t of vybrane) {
    const ucetId = String(t.bank_account_id);
    const mesiac = String(t.booking_date).slice(0, 7);
    const k = `${ucetId}|${mesiac}`;
    let s = skupiny.get(k);
    if (!s) {
      s = { ucet: ucty.get(ucetId)!, skratka: skratky.get(ucetId)!, mesiac, transakcie: [] };
      skupiny.set(k, s);
    }
    s.transakcie.push(t);
  }
  return {
    skupiny: [...skupiny.values()],
    bezSkratky: bezSkratky.filter((u) => sPohybmi.has(String(u.id))),
    vybrane,
  };
}

/**
 * Poradie pohybov v mesačnom výpise účtu (1, 2, …) — to isté, aké má ručné
 * „XML pre POHODU“ za ten mesiac (podľa dňa a id).
 */
export function poradieVMesiaci(vsetkyIdMesiaca: { id: string; booking_date: string }[]): Map<string, number> {
  const zoradene = [...vsetkyIdMesiaca].sort(
    (a, b) => String(a.booking_date).localeCompare(String(b.booking_date)) || String(a.id).localeCompare(String(b.id)),
  );
  return new Map(zoradene.map((t, i) => [String(t.id), i + 1]));
}

/**
 * Poradie pohybov pre most a balík (`numberMovement`). POHODA z neho skladá
 * číslo bankového dokladu (skratka + výpis + poradie, napr. TABe114), takže
 * sa nesmie opakovať. Celomesačné poradie podľa dňa a id sa posúvalo, keď
 * neskôr prišiel pohyb s rovnakým dňom — tri dávky dostali TABe114 (overené
 * naostro 16. 11. 2026). Odovzdané pohyby si nechajú čísla 1…E, nové
 * pokračujú za nimi v poradí, v akom do Fakteru prišli.
 */
export function poradiePokracovanim(
  mesiac: { id: string; booking_date: string; exported_at?: string | null; created_at?: string | null }[],
): Map<string, number> {
  const kluc = (t: { booking_date: string; created_at?: string | null; id: string }) =>
    `${String(t.booking_date)}|${String(t.created_at ?? "")}|${String(t.id)}`;
  const odovzdane = mesiac.filter((t) => t.exported_at).sort((a, b) => kluc(a).localeCompare(kluc(b)));
  const nove = mesiac.filter((t) => !t.exported_at).sort((a, b) => kluc(a).localeCompare(kluc(b)));
  const m = new Map<string, number>();
  odovzdane.forEach((t, i) => m.set(String(t.id), i + 1));
  nove.forEach((t, i) => m.set(String(t.id), odovzdane.length + i + 1));
  return m;
}

/** Dátum výpisu pre skupinu: koniec mesiaca, najneskôr dnes. */
export function datumVypisuSkupiny(mesiac: string, dnes: string): string {
  const koniec = koniecMesiaca(`${mesiac}-01`);
  return koniec <= dnes ? koniec : dnes;
}

/* ------------------------------------------------ automatická likvidácia (len konektor) */

/**
 * Pravidlo párovania v POHODE, s ktorým konektor spúšťa automatickú
 * likvidáciu: `typ:id` 1 = prvé pravidlo, v POHODE predvolene „Výpisy“
 * (v PALIERE: 1 „Výpisy“, 2 „Výpisy - opakovaná likvidácia“, 3 „Avíza“).
 * Vlastné pravidlo firmy by chcelo nový stĺpec na `companies` (migráciu) —
 * zatiaľ konštanta. Keď pravidlo s týmto id vo firme nie je, POHODA odmietne
 * len položku likvidácie; pohyby aj doklady dávky ostanú v poriadku.
 */
export const PRAVIDLO_PAROVANIA_ID = 1;

/** Predpona `dataPackItem id` položky automatickej likvidácie. */
export const PREDPONA_LIKVIDACIE = "LQD-";

export function jeIdLikvidacie(id: unknown): boolean {
  return String(id ?? "").startsWith(PREDPONA_LIKVIDACIE);
}

/** 53-bitový odtlačok (cyrb53) — krátke rozlíšenie id medzi dávkami toho istého dňa. */
function kratkyOdtlacok(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0").slice(0, 8);
}

/**
 * `LQD-<skratka>-<dnes>-<odtlačok>` — každá dávka má vlastné id (odtlačok
 * z pohybov), inak by kontrola duplicity dávok druhé párovanie v ten istý
 * deň odmietla.
 */
export function idLikvidacie(skratka: string, dnes: string, pohyby: string[]): string {
  const s = String(skratka).replace(/\s+/g, "_").slice(0, 19);
  return `${PREDPONA_LIKVIDACIE}${s}-${dnes}-${kratkyOdtlacok(`${skratka}|${dnes}|${[...pohyby].sort().join(",")}`)}`.slice(0, 64);
}

/** Skratka účtu z id likvidácie (skratka môže mať pomlčky). */
export function skratkaZIdLikvidacie(id: string): string {
  const m = /^LQD-(.*)-\d{4}-\d{2}-\d{2}-[0-9a-f]+$/i.exec(String(id));
  return m ? m[1]! : String(id).slice(PREDPONA_LIKVIDACIE.length);
}

/**
 * Jedna likvidácia na účet: od prvého dňa najstaršieho mesiaca pohybov v
 * dávke do dnes — filter POHODY ide na dátum bankového dokladu (dátum výpisu),
 * ten je u nás koniec mesiaca, najviac dnes.
 */
export function likvidaciePreSkupiny(
  skupiny: { skratka: string; mesiac: string; transakcie: { id: string }[] }[],
  dnes: string,
): { id: string; skratka: string; od: string; do: string }[] {
  const ucty = new Map<string, { od: string; pohyby: string[] }>();
  for (const s of skupiny) {
    const u = ucty.get(s.skratka) ?? { od: `${s.mesiac}-01`, pohyby: [] };
    if (`${s.mesiac}-01` < u.od) u.od = `${s.mesiac}-01`;
    u.pohyby.push(...s.transakcie.map((t) => String(t.id)));
    ucty.set(s.skratka, u);
  }
  return [...ucty.entries()].map(([skratka, u]) => ({
    id: idLikvidacie(skratka, dnes, u.pohyby),
    skratka,
    od: u.od,
    do: dnes,
  }));
}

const MENO = "(?:[A-Za-z0-9_.-]+:)?";
function bloky(xml: string, nazov: string): { atr: string; telo: string }[] {
  const re = new RegExp(`<${MENO}${nazov}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${MENO}${nazov}>)`, "gi");
  const out: { atr: string; telo: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ atr: m[1] ?? "", telo: m[2] ?? "" });
  return out;
}
const textEl = (xml: string, nazov: string) => {
  const b = bloky(xml, nazov)[0]?.telo;
  return b == null ? null : b.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null;
};

export type VysledokLikvidacie = {
  id: string;
  skratka: string;
  /** POHODA položku prijala a likvidáciu spustila. */
  prijata: boolean;
  poznamka: string | null;
  sparovane: number;
  bezDokladu: number;
};

/**
 * Výsledky automatickej likvidácie z `responsePack` (`lqd:automaticLiquidationResponse`).
 * Pohyb je spárovaný, keď jeho `liquidationDetail` má stav ok a aspoň jeden
 * doklad; inak (warning „nenájdený doklad (VS = …)“) je bez dokladu.
 */
export function rozoberLikvidaciu(xml: string): VysledokLikvidacie[] {
  return bloky(String(xml ?? ""), "responsePackItem")
    .map(({ atr, telo }) => ({ id: /\bid\s*=\s*"([^"]*)"/i.exec(atr)?.[1] ?? "", atr, telo }))
    .filter((p) => jeIdLikvidacie(p.id))
    .map(({ id, atr, telo }) => {
      const stavPolozky = (/\bstate\s*=\s*"([^"]*)"/i.exec(atr)?.[1] ?? "").toLowerCase();
      const odpoved = bloky(telo, "automaticLiquidationResponse")[0];
      const stavOdpovede = (/\bstate\s*=\s*"([^"]*)"/i.exec(odpoved?.atr ?? "")?.[1] ?? "").toLowerCase();
      let sparovane = 0;
      let bezDokladu = 0;
      for (const d of bloky(odpoved?.telo ?? "", "automaticLiquidationDetail")) {
        const lik = bloky(d.telo, "liquidationDetail")[0]?.telo ?? "";
        const stav = (/<(?:[A-Za-z0-9_.-]+:)?state>\s*([a-z]+)\s*</i.exec(lik.replace(/<(?:[A-Za-z0-9_.-]+:)?documents\b[\s\S]*$/i, ""))?.[1] ?? "").toLowerCase();
        const doklady = bloky(lik, "document").length;
        if (stav === "ok" && doklady > 0) sparovane++;
        else bezDokladu++;
      }
      const prijata = stavPolozky !== "error" && stavOdpovede !== "error";
      const poznamka = prijata
        ? null
        : (bloky(telo, "detail")
            .map((b) => textEl(b.telo, "note"))
            .filter(Boolean)
            .join("; ") || textEl(telo, "note") || null);
      return { id, skratka: skratkaZIdLikvidacie(id), prijata, poznamka, sparovane, bezDokladu };
    });
}

/** Hlášky do upozornení odpovede konektora. */
export function hlaskyLikvidacie(v: VysledokLikvidacie[]): string[] {
  return v.map((l) =>
    l.prijata
      ? `Párovanie ${l.skratka}: spárované ${l.sparovane}, bez dokladu ${l.bezDokladu}`
      : `Párovanie ${l.skratka}: POHODA automatickú likvidáciu odmietla${l.poznamka ? ` (${l.poznamka})` : ""} — pohyby sú v POHODE, spárujte ich tam ručne (Likvidácia)`,
  );
}
