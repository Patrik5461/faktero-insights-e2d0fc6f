/**
 * Párovanie platieb cez e-mailové notifikácie banky — čistá logika bez siete
 * a databázy (adresa, overenie odosielateľa, čítanie čísel, validácia,
 * duplicity a rozhodnutie „pohyb hneď" vs. „na kontrolu").
 *
 * Firma dostane ku každému účtu tajnú adresu `banka-<token>@<doména príjmu>`
 * a v internetbankingu si na ňu zapne notifikácie o pohyboch. Z každého mailu
 * vznikne bankový pohyb, ktorý sa spáruje s faktúrou rovnako ako pohyby z API.
 *
 * Bezpečnosť: adresa je tajná, ale mail sa dá poslať komukoľvek. Pohyb hneď
 * vznikne len z mailu, ktorý **podpísala doména banky** (DKIM). Všetko ostatné
 * (neznámy odosielateľ, preposlané ručne, nepodpísané, AI si nie je istá) ide
 * na kontrolu a pohyb založí až človek. A aj overený pohyb sa s faktúrou
 * spáruje automaticky len pri zhode VS **a** sumy (`parovanie.ts`).
 */
import { normMeno, normVs } from "./parovanie";

/* ---------------- Adresa ---------------- */

export const PREDPONA_NOTIFIKACII = "banka-";
const ZNAKY_TOKENU = "abcdefghijklmnopqrstuvwxyz0123456789";
export const DLZKA_TOKENU = 16;

/** Nový tajný token (16 znakov a–z0–9 ≈ 82 bitov). `nahodne` sa dá podstrčiť v teste. */
export function novyTokenNotifikacii(nahodne?: (n: number) => Uint8Array): string {
  const bajty = nahodne
    ? nahodne(DLZKA_TOKENU)
    : globalThis.crypto.getRandomValues(new Uint8Array(DLZKA_TOKENU));
  let out = "";
  // 36 znakov: odmietnutie bajtov ≥ 252 by bolo presnejšie, ale odchýlka
  // 252/256 je pri tajnej adrese zanedbateľná.
  for (let i = 0; i < DLZKA_TOKENU; i++) out += ZNAKY_TOKENU[bajty[i]! % ZNAKY_TOKENU.length];
  return out;
}

export function adresaNotifikacii(token: string, domena: string): string {
  return `${PREDPONA_NOTIFIKACII}${token}@${domena}`;
}

/** Token z lokálnej časti adresy, alebo `null`, keď to nie je adresa pre notifikácie. */
export function tokenNotifikacii(localPart: string | null | undefined): string | null {
  const l = String(localPart ?? "").toLowerCase();
  if (!l.startsWith(PREDPONA_NOTIFIKACII)) return null;
  const t = l.slice(PREDPONA_NOTIFIKACII.length);
  return new RegExp(`^[a-z0-9]{${DLZKA_TOKENU}}$`).test(t) ? t : null;
}

/* ---------------- Banky ---------------- */

export type BankaNotifikacii = {
  kod: string;
  nazov: string;
  krajina: "SK" | "CZ" | "EU";
  /**
   * Domény, z ktorých banka notifikácie posiela a ktoré ich podpisujú (DKIM).
   * Mail podpísaný inou doménou nie je od banky.
   */
  domeny: string[];
  /** Kroky v internetbankingu — len to, čo je doložené zdrojom; inak prázdne. */
  navod: string[];
  /** Upozornenie k banke (doložené zdrojom). */
  poznamka?: string;
  /** Odkiaľ je návod alebo tvar mailu (URL). */
  zdroj?: string;
};

/**
 * Zoznam bánk. Domény a návody sú len tie, ktoré sú doložené (pozri `zdroj`);
 * pri ostatných sa doména berie zo samotnej banky (jej hlavná doména), návod
 * je všeobecný a mail číta AI. Pravidlové čítanie je v `banka-notifikacie-parsery.ts`.
 */
export const BANKY: BankaNotifikacii[] = [
  {
    kod: "tatrabanka",
    nazov: "Tatra banka",
    krajina: "SK",
    // b-mail@tatrabanka.sk (remp2020/crm-payments-module, TatraBankaMailConfirmationCommand.php)
    domeny: ["tatrabanka.sk"],
    navod: [
      "V internetbankingu otvorte Nastavenia → B-mail → Vytvoriť nový.",
      "Spôsob doručenia správy: E-mail, zaškrtnite „Vklad“ aj „Výber“ a zadajte sumu, od ktorej sa má správa posielať.",
    ],
    zdroj: "https://www.fakturoid.cz/podpora/parovani/tatra",
  },
  {
    kod: "slsp",
    nazov: "Slovenská sporiteľňa",
    krajina: "SK",
    domeny: ["slsp.sk"],
    navod: [
      "V Business24: Nastavenia → Notifikácie → Pridať notifikáciu, typ „20401 | Notifikácia o obrate na účte“, odoslanie e-mailom, Bez šifrovania, Ďalej a Podpísať.",
      "V Georgi sa iná e-mailová adresa zadať nedá — notifikáciu na túto adresu vám nastavia na pobočke alebo na telefóne.",
    ],
    poznamka: "Zaheslovaný ZIP v prílohe neprečítame — notifikácia musí prísť ako text.",
    zdroj:
      "https://pomoc.superfaktura.sk/automaticke-parovanie-uhrad-ako-si-nastavim-email-v-internet-bankingu/",
  },
  {
    kod: "vub",
    nazov: "VÚB banka",
    krajina: "SK",
    domeny: ["vub.sk"],
    navod: [],
    poznamka:
      "Notifikácie o pohyboch posiela VÚB podľa svojho sprievodcu ako push alebo SMS; e-mailovú podobu sme nenašli. Ak vám e-mail chodí, prepošlite ho sem.",
    zdroj:
      "https://www.vub.sk/document/documents/VUB/vub-online-banking/ako-pouzivat/sprievodca-prihlasenim-do-noveho-internet-bankingu-a-vub-bankingu.pdf",
  },
  {
    kod: "csob_sk",
    nazov: "ČSOB (SK)",
    krajina: "SK",
    // AdminTBS@csob.sk, predmet „ČSOB Info 24 - Avízo" (remp2020, SkCsobMailConfirmationCommand.php)
    domeny: ["csob.sk"],
    navod: [
      "V službe ČSOB Info 24 si zapnite avízo o zaúčtovaní platby a ako adresu zadajte túto.",
    ],
    zdroj:
      "https://pomoc.superfaktura.sk/automaticke-parovanie-uhrad-ako-si-nastavim-email-v-internet-bankingu/",
  },
  { kod: "prima", nazov: "Prima banka", krajina: "SK", domeny: ["primabanka.sk"], navod: [] },
  { kod: "365", nazov: "365.bank", krajina: "SK", domeny: ["365.bank"], navod: [] },
  { kod: "postova", nazov: "Poštová banka", krajina: "SK", domeny: ["postovabanka.sk"], navod: [] },
  {
    kod: "unicredit_sk",
    nazov: "UniCredit Bank (SK)",
    krajina: "SK",
    domeny: ["unicreditgroup.sk", "unicredit.sk"],
    navod: [],
    poznamka:
      "Podľa SuperFaktúry UniCredit v e-mailových notifikáciách neposiela variabilný symbol — platby sa potom spárujú len ako návrhy.",
    zdroj:
      "https://pomoc.superfaktura.sk/automaticke-parovanie-uhrad-ako-si-nastavim-email-v-internet-bankingu/",
  },
  {
    kod: "unicredit_cz",
    nazov: "UniCredit Bank (CZ)",
    krajina: "CZ",
    domeny: ["unicreditgroup.cz", "unicredit.cz"],
    navod: [
      "Nastavení → Notifikace → Vytvořit notifikace pro transakce → Všechny transakce nad 1 Kč → e-mail.",
    ],
    zdroj: "https://www.fakturoid.cz/podpora/parovani/unicredit",
  },
  {
    kod: "mbank",
    nazov: "mBank",
    krajina: "SK",
    domeny: ["mbank.sk", "mbank.cz"],
    navod: [],
    poznamka:
      "iDoklad aj Fakturoid uvádzajú, že notifikácie mBank nemajú údaje potrebné na párovanie. Skúsiť sa to dá, ale počítajte s ručnou kontrolou.",
    zdroj: "https://www.idoklad.cz/?p=12492",
  },
  {
    kod: "fio",
    nazov: "Fio banka",
    krajina: "CZ",
    domeny: ["fio.cz", "fio.sk"],
    navod: [
      "V internetbankingu otvorte Nastavení → Oznámení → Pohyby → Přidat Oznámení.",
      "Kam posílat: E-mail, kontaktný e-mail „Jiný email“ (táto adresa), Částka 0,01, zapnite „Posílat online“ a potvrďte Odeslat.",
    ],
    poznamka:
      "Fio sa dá pripojiť aj priamo tokenom (Pripojiť banku → Fio) — to je presnejšie než e-maily.",
    zdroj: "https://www.fakturoid.cz/podpora/parovani/fio",
  },
  {
    kod: "cs",
    nazov: "Česká spořitelna",
    krajina: "CZ",
    domeny: ["csas.cz", "servis24.cz"],
    navod: [
      "V Georgi kliknite na ozubené koliesko → Kontaktní údaje a doplňte túto adresu.",
      "Potom Informační zprávy → Příchozí platby (prípadne Odchozí platby) → Aktivovat.",
    ],
    zdroj: "https://www.fakturoid.cz/podpora/parovani/cs",
  },
  {
    kod: "kb",
    nazov: "Komerční banka",
    krajina: "CZ",
    domeny: ["kb.cz"],
    navod: ["V KB+: Nastavení → Oznámení → Příchozí/Odchozí platby → prepínač „E-mailem“."],
    poznamka:
      "Banka dovolí len jednu adresu. Ak ju potrebujete pre seba, nechajte notifikácie chodiť vám a automaticky ich preposielajte sem.",
    zdroj: "https://www.fakturoid.cz/podpora/parovani/kb",
  },
  {
    kod: "csob_cz",
    nazov: "ČSOB (CZ)",
    krajina: "CZ",
    // notification@csob.cz, predmet „CEB Info: Zaúčtování platby" (remp2020, CsobMailConfirmationCommand.php)
    domeny: ["csob.cz"],
    navod: [
      "ČSOB Internetbanking: Nastavení → Moje info → Účty a platby → Telefonní číslo a e-mail, potom Platby → Zaúčtovaná platba (příchozí aj odchozí).",
      "ČSOB CEB: Nastavení → CEB info → Účty a platby → nová notifikácia „Zaúčtování platby“ → Všechny pohyby.",
    ],
    zdroj: "https://www.fakturoid.cz/podpora/parovani/csob",
  },
  {
    kod: "rb",
    nazov: "Raiffeisenbank (CZ)",
    krajina: "CZ",
    domeny: ["rb.cz"],
    navod: [
      "Nastavení → Upozornění Informuj mě → Nové upozornění: Směr pohybu Příchozí alebo Všechny, Částka od 0 CZK.",
    ],
    zdroj: "https://www.fakturoid.cz/podpora/parovani/rb",
  },
  {
    kod: "airbank",
    nazov: "Air Bank",
    krajina: "CZ",
    domeny: ["airbank.cz"],
    navod: [
      "V internetbankingu na počítači: Účty a karty → účet → Možnosti → Info o dění na účtu → Jiný kontakt → Mail.",
      "Zapnite „Informace o změně zůstatku: posílejte mailem“.",
    ],
    zdroj: "https://www.fakturoid.cz/podpora/parovani/air",
  },
  {
    kod: "moneta",
    nazov: "MONETA Money Bank",
    krajina: "CZ",
    domeny: ["moneta.cz"],
    navod: [
      "Nastavení → Osobní → Upozornění – Info Servis → Přidat upozornění → Účty → E-mail pri Odchozí a Příchozí platba.",
    ],
    zdroj: "https://www.fakturoid.cz/podpora/parovani/moneta",
  },
  {
    kod: "revolut",
    nazov: "Revolut",
    krajina: "EU",
    domeny: ["revolut.com"],
    navod: [],
    poznamka:
      "Revolut Business sa dá pripojiť priamo (Pripojiť banku → Revolut) — to je presnejšie než e-maily.",
  },
];

export const INA_BANKA = "ina";

export function bankaPodlaKodu(kod: string | null | undefined): BankaNotifikacii | null {
  return BANKY.find((b) => b.kod === kod) ?? null;
}

/** Doména sedí na doménu banky (aj jej poddoména, napr. `notify.vub.sk`). */
function domenaPatri(domena: string, banka: BankaNotifikacii): boolean {
  const d = domena.toLowerCase().replace(/^@/, "").replace(/\.$/, "");
  return banka.domeny.some((b) => d === b || d.endsWith(`.${b}`));
}

export function bankaPodlaDomeny(domena: string | null | undefined): BankaNotifikacii | null {
  if (!domena) return null;
  return BANKY.find((b) => domenaPatri(domena, b)) ?? null;
}

/** Holá adresa z „Meno <adresa>" a jej doména. */
export function adresaZFrom(
  from: string | null | undefined,
): { adresa: string; domena: string } | null {
  const s = String(from ?? "").trim();
  const m = s.match(/<([^>]+)>/);
  const adresa = (m ? m[1]! : s).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresa)) return null;
  return { adresa, domena: adresa.slice(adresa.indexOf("@") + 1) };
}

/* ---------------- Overenie odosielateľa ---------------- */

export type OverenieOdosielatela = {
  /**
   * overene — DKIM podpis domény banky prešiel;
   * nepodpisane — From je doména banky, ale podpis chýba alebo neprešiel;
   * nezname — odosielateľ nie je banka zo zoznamu (aj ručne preposlané).
   */
  stav: "overene" | "nepodpisane" | "nezname";
  banka: BankaNotifikacii | null;
  popis: string;
};

/** Hodnota hlavičky bez ohľadu na veľkosť písmen; viac hodnôt spojí. */
export function hlavicka(
  headers: Record<string, unknown> | null | undefined,
  meno: string,
): string {
  if (!headers) return "";
  const out: string[] = [];
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== meno.toLowerCase()) continue;
    if (Array.isArray(v)) out.push(...v.map((x) => String(x ?? "")));
    else out.push(String(v ?? ""));
  }
  return out.join("\n");
}

/** Domény, ktorých DKIM podpis podľa prijímajúceho servera prešiel. */
export function dkimPodpisaneDomeny(authResults: string): string[] {
  const nizko = authResults.toLowerCase();
  return [...nizko.matchAll(/dkim=pass[^;]*?header\.(?:d|i)=([^\s;,]+)/g)].map((m) =>
    m[1]!
      .replace(/^@/, "")
      .replace(/^"|"$/g, "")
      .replace(/^[^@]*@/, ""),
  );
}

/**
 * `Authentication-Results`, ktorú pridal **náš** prijímajúci server.
 *
 * Odosielateľ môže do mailu vložiť vlastnú hlavičku `Authentication-Results:
 * … dkim=pass header.d=banka.sk`. Prijímajúci server svoju pridáva navrch
 * (RFC 8601), takže sa berie len prvá; a keď je známe authserv-id nášho
 * servera, len tá, ktorá ním začína.
 */
export function nasaAuthResults(
  headers: Record<string, unknown> | null | undefined,
  authservId?: string | null,
): string {
  const hodnoty: string[] = [];
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (k.toLowerCase() !== "authentication-results") continue;
    if (Array.isArray(v)) hodnoty.push(...v.map((x) => String(x ?? "")));
    else hodnoty.push(String(v ?? ""));
  }
  const id = String(authservId ?? "")
    .trim()
    .toLowerCase();
  if (id) return hodnoty.find((h) => h.trim().toLowerCase().startsWith(id)) ?? "";
  return hodnoty[0] ?? "";
}

/**
 * Je mail naozaj od banky? Rozhoduje len `Authentication-Results`, ktorý
 * pridal náš prijímajúci server (Resend), a v ňom DKIM podpis s doménou banky.
 * Samotná adresa v `From` sa dá napísať akákoľvek, a preto sama o sebe pohyb
 * nezaloží. `ARC-*` hlavičky (Gmail pri preposielaní) sa neberú — ich podpis
 * tu neoverujeme a dajú sa podvrhnúť.
 *
 * Pri automatickom preposielaní z Gmailu/Outlooku ostáva `From` aj pôvodný
 * DKIM podpis banky (telo sa nemení), takže taký mail prejde ako overený.
 * Ručne preposlaný („Fwd:") má `From` človeka — ide na kontrolu.
 */
export function overOdosielatela(args: {
  from: string | null | undefined;
  headers?: Record<string, unknown> | null;
  /**
   * Identita nášho prijímajúceho servera (authserv-id, prvé slovo hlavičky).
   * Keď je zadaná, iná `Authentication-Results` sa neberie do úvahy.
   */
  authservId?: string | null;
}): OverenieOdosielatela {
  const od = adresaZFrom(args.from);
  const banka = od ? bankaPodlaDomeny(od.domena) : null;
  if (!od || !banka) {
    return {
      stav: "nezname",
      banka: null,
      popis: od ? `odosielateľ ${od.domena} nie je banka zo zoznamu` : "chýba odosielateľ",
    };
  }
  const auth = nasaAuthResults(args.headers, args.authservId);
  const podpisane = dkimPodpisaneDomeny(auth);
  if (podpisane.some((d) => domenaPatri(d, banka))) {
    return {
      stav: "overene",
      banka,
      popis: `DKIM ${podpisane.find((d) => domenaPatri(d, banka))}`,
    };
  }
  return {
    stav: "nepodpisane",
    banka,
    popis: auth
      ? podpisane.length
        ? `podpis domény ${podpisane.join(", ")}, nie ${banka.domeny[0]}`
        : "DKIM podpis banky neprešiel"
      : "chýba hlavička Authentication-Results",
  };
}

/**
 * Pôvodný odosielateľ v ručne preposlanom maile („---------- Forwarded
 * message ---------" / „Od:" / „From:"). Slúži **len** na výber pravidla, nie
 * ako dôkaz pravosti — text tela si napíše ktokoľvek.
 */
export function povodnyOdosielatelZTela(text: string): string | null {
  const blok = text.match(
    /(?:-{2,}\s*(?:Forwarded message|Pôvodná správa|Původní zpráva|Preposlaná správa|Přeposlaná zpráva|Original Message)[\s\S]{0,40}?-{2,}|^>?\s*(?:Begin forwarded message|Začiatok preposlanej správy):)([\s\S]{0,800})/im,
  );
  const kde = blok ? blok[1]! : "";
  const m = kde.match(/^(?:>\s*)?(?:From|Od)\s*:\s*(.+)$/im);
  if (!m) return null;
  return adresaZFrom(m[1]!.replace(/\[mailto:[^\]]*\]/i, ""))?.adresa ?? null;
}

/* ---------------- Čísla, dátumy, IBAN ---------------- */

/**
 * Suma z textu banky: „1 234,56", „1.234,56", „1,234.56", „1234.56", „+150,00",
 * „-12,30" aj s pevnou medzerou. Vráti absolútnu hodnotu; znamienko rieši smer.
 */
export function citajSumu(s: string | null | undefined): number | null {
  let t = String(s ?? "")
    .replace(/[\s\u00a0\u202f']/g, "")
    .replace(/^[+-]/, "")
    .replace(/[^\d.,]/g, "");
  if (!t || !/\d/.test(t)) return null;
  const posledna = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  if (posledna >= 0) {
    const zaNou = t.length - posledna - 1;
    // Jedna alebo dve číslice za posledným oddeľovačom = desatinné miesta.
    // Tri („1.234", „1,234") = tisícky — banky sumy píšu s dvomi desatinnými.
    if (zaNou === 1 || zaNou === 2) {
      const cela = t.slice(0, posledna).replace(/[.,]/g, "");
      t = `${cela}.${t.slice(posledna + 1)}`;
    } else {
      t = t.replace(/[.,]/g, "");
    }
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Suma so znamienkom (zostatok môže byť v mínuse): „-1 234,56", „−12,30" (U+2212). */
export function citajSumuSoZnamienkom(s: string | null | undefined): number | null {
  const n = citajSumu(s);
  if (n == null) return null;
  return /^\s*[-\u2212]/.test(String(s ?? "")) ? -n : n;
}

const MESIACE: Record<string, number> = {
  jan: 1,
  januar: 1,
  january: 1,
  ledna: 1,
  leden: 1,
  januara: 1,
  feb: 2,
  februar: 2,
  february: 2,
  unora: 2,
  unor: 2,
  februara: 2,
  mar: 3,
  marec: 3,
  march: 3,
  brezna: 3,
  brezen: 3,
  marca: 3,
  apr: 4,
  april: 4,
  dubna: 4,
  duben: 4,
  aprila: 4,
  maj: 5,
  may: 5,
  kvetna: 5,
  kveten: 5,
  maja: 5,
  jun: 6,
  june: 6,
  cervna: 6,
  cerven: 6,
  juna: 6,
  jul: 7,
  july: 7,
  cervence: 7,
  cervenec: 7,
  jula: 7,
  aug: 8,
  august: 8,
  srpna: 8,
  srpen: 8,
  augusta: 8,
  sep: 9,
  september: 9,
  zari: 9,
  septembra: 9,
  okt: 10,
  oct: 10,
  oktober: 10,
  october: 10,
  rijna: 10,
  rijen: 10,
  oktobra: 10,
  nov: 11,
  november: 11,
  listopadu: 11,
  listopad: 11,
  novembra: 11,
  dec: 12,
  december: 12,
  prosince: 12,
  prosinec: 12,
  decembra: 12,
};

function dvojmiestne(n: number): string {
  return String(n).padStart(2, "0");
}

function zostavDatum(r: number, m: number, d: number): string | null {
  if (r < 100) r += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(r, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${r}-${dvojmiestne(m)}-${dvojmiestne(d)}`;
}

/** Dátum z textu: „19.10.2026", „19. 10. 2026", „2026-10-19", „19/10/2026", „19 Oct 2026". */
export function citajDatum(s: string | null | undefined): string | null {
  const t = String(s ?? "");
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return zostavDatum(+m[1]!, +m[2]!, +m[3]!);
  m = t.match(/\b(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4}|\d{2})\b/);
  if (m) return zostavDatum(+m[3]!, +m[2]!, +m[1]!);
  m = t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .match(/\b(\d{1,2})\.?\s+([a-z]{3,10})\.?\s+(\d{4})\b/);
  if (m && MESIACE[m[2]!]) return zostavDatum(+m[3]!, MESIACE[m[2]!]!, +m[1]!);
  return null;
}

export function normIban(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/[\s\u00a0-]/g, "")
    .toUpperCase();
}

/** Kontrolná číslica IBAN (mod 97). */
export function ibanPlatny(s: string | null | undefined): boolean {
  const iban = normIban(s);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const prest = iban.slice(4) + iban.slice(0, 4);
  let zvysok = 0;
  for (const z of prest) {
    const kod = /[A-Z]/.test(z) ? String(z.charCodeAt(0) - 55) : z;
    for (const c of kod) zvysok = (zvysok * 10 + Number(c)) % 97;
  }
  return zvysok === 1;
}

/**
 * Patrí (aj maskované) číslo účtu z mailu k nášmu IBAN? Banky ho často
 * skracujú („SK12 **** 1234", „…1234", „xxxx5678"); vtedy sa porovnajú
 * viditeľné číslice na konci. Nedá sa rozhodnúť = `null`.
 */
export function ucetSedi(
  zMailu: string | null | undefined,
  nasIban: string | null | undefined,
): boolean | null {
  const a = normIban(zMailu);
  const b = normIban(nasIban);
  if (!a || !b) return null;
  if (ibanPlatny(a)) return a === b;
  // Maskované: viditeľný koniec aspoň 4 číslice.
  const koniec = a.match(/(\d{4,})$/)?.[1];
  if (!koniec) return null;
  // Domáce číslo účtu (CZ „123456789/0800") — porovnáva sa číslo pred lomkou.
  return b.endsWith(koniec) || b.replace(/^0+/, "").endsWith(koniec.replace(/^0+/, ""));
}

const MENY = new Set([
  "EUR",
  "CZK",
  "USD",
  "GBP",
  "CHF",
  "PLN",
  "HUF",
  "SEK",
  "NOK",
  "DKK",
  "RON",
  "BGN",
  "JPY",
  "CAD",
  "AUD",
]);

export function normMena(s: string | null | undefined): string | null {
  const t = String(s ?? "")
    .trim()
    .toUpperCase();
  if (t === "€" || t === "EURO") return "EUR";
  if (t === "KČ" || t === "KC" || t === ",-") return "CZK";
  if (t === "$") return "USD";
  if (t === "£") return "GBP";
  return /^[A-Z]{3}$/.test(t) ? t : null;
}

/* ---------------- Výsledok čítania ---------------- */

export type Notifikacia = {
  /** Je to vôbec mail o pohybe na účte? (reklama, zmena hesla = false) */
  jePohyb: boolean;
  smer: "kredit" | "debet" | null;
  /** Kladná suma; smer určuje znamienko pohybu. */
  suma: number | null;
  mena: string | null;
  /** YYYY-MM-DD */
  datum: string | null;
  vs: string | null;
  ks: string | null;
  ss: string | null;
  sprava: string | null;
  protistrana: string | null;
  protistranaIban: string | null;
  /** Účet, ku ktorému notifikácia je (môže byť maskovaný). */
  ibanUctu: string | null;
  zostatok: number | null;
  /** Referencia pohybu od banky, keď ju mail nesie. */
  referencia: string | null;
};

export const PRAZDNA_NOTIFIKACIA: Notifikacia = {
  jePohyb: false,
  smer: null,
  suma: null,
  mena: null,
  datum: null,
  vs: null,
  ks: null,
  ss: null,
  sprava: null,
  protistrana: null,
  protistranaIban: null,
  ibanUctu: null,
  zostatok: null,
  referencia: null,
};

/** Symbol na uloženie: len číslice, bez vedúcich núl, najviac 10 znakov; inak `null`. */
export function symbol(v: unknown): string | null {
  const s = String(v ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  return s && s.length <= 10 ? s : null;
}

/** Text z mailu na uloženie: bez riadiacich znakov, orezaný. */
export function textPola(v: unknown, max = 200): string | null {
  const s = String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.slice(0, max) : null;
}

/* ---------------- Validácia ---------------- */

export type Validacia = { ok: boolean; problemy: string[] };

/**
 * Overí, že z mailu vyšiel rozumný pohyb. Čo neprejde, ide na kontrolu —
 * radšej jeden klik navyše než vymyslená platba v účtovníctve.
 */
export function validujNotifikaciu(
  n: Notifikacia,
  kontext: { dnes: string; menaUctu?: string | null; ibanUctu?: string | null },
): Validacia {
  const problemy: string[] = [];
  if (!n.jePohyb) problemy.push("mail nevyzerá ako notifikácia o pohybe na účte");
  if (!n.smer) problemy.push("nedá sa určiť, či peniaze prišli alebo odišli");
  if (n.suma == null || !(n.suma > 0)) problemy.push("chýba suma alebo nie je kladná");
  else if (n.suma > 100_000_000) problemy.push("suma je nezmyselne vysoká");
  if (!n.mena || !MENY.has(n.mena)) problemy.push(n.mena ? `neznáma mena ${n.mena}` : "chýba mena");
  else if (kontext.menaUctu && n.mena !== kontext.menaUctu.toUpperCase())
    problemy.push(`mena ${n.mena} nesedí na účet v ${kontext.menaUctu.toUpperCase()}`);
  if (!n.datum) problemy.push("chýba dátum");
  else {
    const dni = (Date.parse(kontext.dnes) - Date.parse(n.datum)) / 86_400_000;
    if (!Number.isFinite(dni)) problemy.push("dátum sa nedá prečítať");
    else if (dni < -2) problemy.push(`dátum ${n.datum} je v budúcnosti`);
    else if (dni > 62) problemy.push(`dátum ${n.datum} je starší než dva mesiace`);
  }
  if (
    n.protistranaIban &&
    /^[A-Z]{2}\d{2}/.test(normIban(n.protistranaIban)) &&
    !ibanPlatny(n.protistranaIban)
  )
    problemy.push("IBAN protistrany nemá platnú kontrolnú číslicu");
  if (n.ibanUctu && kontext.ibanUctu && ucetSedi(n.ibanUctu, kontext.ibanUctu) === false)
    problemy.push("notifikácia je k inému účtu, než ku ktorému patrí adresa");
  return { ok: problemy.length === 0, problemy };
}

/* ---------------- Duplicity ---------------- */

/** Podpisová suma pohybu — so znamienkom podľa smeru. */
export function sumaPohybu(n: Pick<Notifikacia, "suma" | "smer">): number {
  const s = Math.round(Number(n.suma ?? 0) * 100) / 100;
  return n.smer === "debet" ? -s : s;
}

/**
 * Referencia pohybu z notifikácie (`transaction_reference`). Na jedinečnom
 * indexe (účet + referencia) zastaví ten istý pohyb druhýkrát, aj keď príde
 * iným mailom (banka notifikáciu zopakuje, klient ju prepošle ešte raz).
 *
 * Keď banka vlastnú referenciu dá, berie sa tá. Inak sa skladá z dňa, sumy,
 * VS a protistrany — dve naozaj rôzne platby s úplne rovnakými údajmi v jeden
 * deň sa tak zastavia ako duplicita a druhú založí človek ručne.
 */
export function referenciaNotifikacie(n: Notifikacia): string {
  if (n.referencia) return `notif:ref:${textPola(n.referencia, 80)}`;
  const casti = [
    n.datum ?? "",
    sumaPohybu(n).toFixed(2),
    (n.mena ?? "").toUpperCase(),
    normVs(n.vs),
    normMeno(n.protistrana).replace(/\s+/g, "-").slice(0, 40),
    normIban(n.protistranaIban).slice(-10),
  ];
  return `notif:${casti.join(":")}`;
}

/** Existujúci pohyb na účte, ktorý je ten istý (napr. už z nahratého výpisu). */
export type PohybNaPorovnanie = {
  booking_date: string;
  amount: number;
  variable_symbol: string | null;
  counterparty: string | null;
};

/**
 * Sú dva pohyby ten istý? Deň ± 1 (banka v maile a vo výpise uvádza raz deň
 * pripísania, raz zaúčtovania), suma so znamienkom do haliera, rovnaký VS;
 * bez VS rozhoduje protistrana, keď ju poznajú obe strany.
 */
export function zhodnyPohyb(a: PohybNaPorovnanie, b: PohybNaPorovnanie): boolean {
  const dni = Math.abs(Date.parse(a.booking_date) - Date.parse(b.booking_date)) / 86_400_000;
  if (!(dni <= 1)) return false;
  if (Math.abs(Number(a.amount) - Number(b.amount)) >= 0.005) return false;
  const vsA = normVs(a.variable_symbol);
  const vsB = normVs(b.variable_symbol);
  if (vsA || vsB) return vsA === vsB;
  const x = normMeno(a.counterparty);
  const y = normMeno(b.counterparty);
  return !x || !y || x === y || x.includes(y) || y.includes(x);
}

/** Existujúci pohyb na účte, ktorý je ten istý ako notifikácia (napr. už z nahratého výpisu). */
export function jeRovnakyPohyb(n: Notifikacia, p: PohybNaPorovnanie): boolean {
  if (!n.datum) return false;
  return zhodnyPohyb(
    {
      booking_date: n.datum,
      amount: sumaPohybu(n),
      variable_symbol: n.vs,
      counterparty: n.protistrana,
    },
    p,
  );
}

/**
 * Riadky z nahratého výpisu, ktoré už na účte sú ako pohyb z e-mailu. Každý
 * pohyb z e-mailu „zje" najviac jeden riadok výpisu — dve rovnaké platby vo
 * výpise a jedna v maile znamenajú, že druhá sa vloží.
 */
export function bezPohybovZMailu<T extends PohybNaPorovnanie>(
  riadky: T[],
  zMailov: PohybNaPorovnanie[],
): T[] {
  const volne = [...zMailov];
  return riadky.filter((r) => {
    const i = volne.findIndex((m) => zhodnyPohyb(r, m));
    if (i < 0) return true;
    volne.splice(i, 1);
    return false;
  });
}

/* ---------------- Rozhodnutie ---------------- */

export type Sposob = "pravidlo" | "ai";

/**
 * Objaví sa suma (a VS, ak je) doslovne v texte mailu? Poistka proti tomu,
 * aby si AI číslo domyslela — pravidlu sa to stať nemôže, AI áno.
 */
export function udajeVTexte(n: Notifikacia, text: string): boolean {
  if (n.suma == null) return false;
  const holy = text.replace(/[\s\u00a0\u202f]/g, "");
  const [cela, des] = n.suma.toFixed(2).split(".");
  const tisicky = (oddelovac: string) => cela!.replace(/\B(?=(\d{3})+(?!\d))/g, oddelovac);
  const tvary = new Set([
    `${cela},${des}`,
    `${cela}.${des}`,
    `${tisicky(".")},${des}`,
    `${tisicky(",")}.${des}`,
  ]);
  if (des === "00") {
    tvary.add(`${cela},-`);
    tvary.add(`${tisicky(".")},-`);
  }
  if (![...tvary].some((t) => holy.includes(t))) return false;
  const vs = normVs(n.vs);
  if (
    vs &&
    !text
      .replace(/\D+/g, " ")
      .split(" ")
      .some((c) => c.replace(/^0+/, "") === vs)
  )
    return false;
  return true;
}

export type Rozhodnutie =
  | { akcia: "pohyb"; dovod: null }
  | { akcia: "kontrola"; dovod: string }
  | { akcia: "nie_pohyb"; dovod: string };

/**
 * Pohyb vznikne sám len vtedy, keď:
 * - mail podpísala doména banky (DKIM),
 * - údaje prešli validáciou,
 * - a pri AI sa suma a VS doslovne nachádzajú v texte.
 * Inak ide mail na kontrolu (alebo sa označí, že o pohyb nejde).
 */
export function rozhodni(args: {
  overenie: OverenieOdosielatela;
  sposob: Sposob | null;
  notifikacia: Notifikacia | null;
  validacia: Validacia | null;
  text: string;
}): Rozhodnutie {
  const { overenie, sposob, notifikacia: n, validacia: v } = args;
  if (!n || !sposob) return { akcia: "kontrola", dovod: "mail sa nepodarilo prečítať" };
  if (!n.jePohyb) {
    // Od overenej banky to je napr. reklama alebo bezpečnostná správa — nie je čo kontrolovať.
    return overenie.stav === "overene"
      ? { akcia: "nie_pohyb", dovod: "mail od banky nie je o pohybe na účte" }
      : { akcia: "kontrola", dovod: "mail nevyzerá ako notifikácia o pohybe na účte" };
  }
  if (overenie.stav !== "overene") {
    return {
      akcia: "kontrola",
      dovod:
        overenie.stav === "nepodpisane"
          ? `pravosť mailu sa nedá overiť (${overenie.popis})`
          : `mail neprišiel priamo od banky (${overenie.popis})`,
    };
  }
  if (v && !v.ok) return { akcia: "kontrola", dovod: v.problemy.join("; ") };
  if (sposob === "ai" && !udajeVTexte(n, args.text))
    return {
      akcia: "kontrola",
      dovod: "suma alebo VS prečítané AI sa v texte mailu nenašli doslovne",
    };
  return { akcia: "pohyb", dovod: null };
}

/** Riadok `bank_transactions` z notifikácie (bez company_id a účtu). */
export function pohybZNotifikacie(n: Notifikacia): {
  booking_date: string;
  amount: number;
  currency: string;
  variable_symbol: string | null;
  counterparty: string | null;
  description: string | null;
  transaction_reference: string;
  zdroj: "email";
} {
  const popis = [
    n.sprava,
    n.protistranaIban
      ? `${ibanPlatny(n.protistranaIban) ? "IBAN" : "Účet"} ${normIban(n.protistranaIban)}`
      : null,
    n.ks ? `KS ${n.ks}` : null,
    n.ss ? `ŠS ${n.ss}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    booking_date: n.datum!,
    amount: sumaPohybu(n),
    currency: (n.mena ?? "EUR").toUpperCase(),
    variable_symbol: n.vs,
    counterparty: n.protistrana,
    description: popis ? popis.slice(0, 500) : null,
    transaction_reference: referenciaNotifikacie(n),
    zdroj: "email",
  };
}
