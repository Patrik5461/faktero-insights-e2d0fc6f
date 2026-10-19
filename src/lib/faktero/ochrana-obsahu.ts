/*
  Kontrola obsahu e-mailu, ktorý firma posiela cez Faktero (faktúra, ponuka,
  upomienka, pozvánka…). Čistá logika bez databázy — volá ju strážca
  `ochrana-odosielania.server.ts` pred každým odoslaním.

  Prečo: 17. 10. 2026 si falošné účty založili firmy s názvami ako „ЕТSУ SНОР"
  (azbuka vydávajúca sa za latinku) a „VlNTED" (malé l namiesto I) a cez
  odoslanie faktúry rozposlali ~500 phishingových mailov s predmetmi
  „VlNTED Invoice No: #A21578" a „Sale confirmed — please verify your Etsy
  shop" a odkazmi na `vinted.discoververifypage.com`, `etsy.id7548355.shop`,
  `*.894273106.sbs` a `shorturl.at`.

  Kontroluje sa len predmet, vlastná správa a názov odosielateľa — nikdy nie
  položky faktúry, kde je „doprava DPD" úplne bežná.

  Pravidlá (B = blokovať vždy, N = blokovať novej firme, inak len výstraha):
    B  zmiešané písmo v jednom slove (latinka + azbuka/gréčtina),
    B  značka zamaskovaná homoglyfmi („VlNTED", „Р4yPal"),
    B  skracovač odkazov (bit.ly, shorturl.at…),
    B  odkaz, ktorého doména sa tvári ako značka (vinted.niečo.com),
    B  odkaz na doménu z čísel (894273106.sbs, id7548355.shop),
    B  výzva typu „verify your / overte svoj účet / prijať platbu" + cudzí odkaz,
    N  cudzia značka (Vinted, Etsy, PayPal, DPD…) — firma mladšia ako 30 dní
       a neoverená; staršej alebo overenej sa len zapíše výstraha adminovi,
    N  akýkoľvek odkaz na cudziu doménu — firma mladšia ako 30 dní a neoverená.
*/

export type DruhNalezu =
  | "zmiesane_pismo"
  | "maskovana_znacka"
  | "skracovac"
  | "odkaz_na_znacku"
  | "ciselna_domena"
  | "phishing_fraza"
  | "znacka"
  | "cudzi_odkaz";

export type Nalez = {
  kod: DruhNalezu;
  /** Pre admina: čo presne sa našlo (slovo, doména, značka). */
  popis: string;
  kde: "predmet" | "sprava" | "nazov";
};

export type VysledokObsahu = { blokuj: Nalez[]; vystrahy: Nalez[] };

export type VstupObsahu = {
  predmet: string | null | undefined;
  sprava: string | null | undefined;
  /** Názov firmy a meno odosielateľa (email_sender_name). */
  nazovFirmy: Array<string | null | undefined>;
  /** Vek firmy v dňoch (mladší z firmy a účtu odosielateľa). */
  vekDni: number;
  /** `companies.odosielanie_overene` — admin firmu preveril. */
  overena: boolean;
  /** `companies.website` — odkazy na vlastný web sú v poriadku. */
  webFirmy?: string | null;
};

/** Do koľkých dní je firma „mladá" pre kontrolu značiek a odkazov. */
export const DNI_MLADA_FIRMA_OBSAH = 30;

/* ────────────────────────── normalizácia ────────────────────────── */

/** Neviditeľné znaky, ktorými sa dá rozbiť slovo („Vin​ted"). */
const NEVIDITELNE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;

/*
  Znaky, ktoré vyzerajú ako latinské písmeno. Veľké aj malé zvlášť — grécke
  veľké Η vyzerá ako H, ale malé η ako n, takže sa mapuje pred zmenou veľkosti.
*/
const HOMOGLYFY: Record<string, string> = {
  // azbuka — veľké
  А: "A",
  В: "B",
  Е: "E",
  Ё: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  У: "Y",
  Х: "X",
  І: "I",
  Ї: "I",
  Ј: "J",
  Ѕ: "S",
  Ԛ: "Q",
  Ԝ: "W",
  Ү: "Y",
  Һ: "H",
  Ӏ: "I",
  // azbuka — malé
  а: "a",
  в: "b",
  е: "e",
  ё: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
  і: "i",
  ї: "i",
  ј: "j",
  ѕ: "s",
  ԁ: "d",
  ԛ: "q",
  ԝ: "w",
  г: "r",
  п: "n",
  ү: "y",
  һ: "h",
  ӏ: "l",
  ь: "b",
  // gréčtina — veľké
  Α: "A",
  Β: "B",
  Ε: "E",
  Ζ: "Z",
  Η: "H",
  Ι: "I",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ο: "O",
  Ρ: "P",
  Τ: "T",
  Υ: "Y",
  Χ: "X",
  // gréčtina — malé
  α: "a",
  β: "b",
  ε: "e",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
  ω: "w",
  // latinské podobné znaky
  ı: "i",
  ɩ: "i",
  ɑ: "a",
  ɡ: "g",
  ꞵ: "b",
  ʟ: "l",
};

/** Grécke písmená, ktoré sa dajú zameniť za latinku (μ v „μm" medzi ne nepatrí). */
const GRECKE_PODOBNE = new Set([
  "Α",
  "Β",
  "Ε",
  "Ζ",
  "Η",
  "Ι",
  "Κ",
  "Μ",
  "Ν",
  "Ο",
  "Ρ",
  "Τ",
  "Υ",
  "Χ",
  "α",
  "β",
  "ε",
  "ι",
  "κ",
  "ν",
  "ο",
  "ρ",
  "τ",
  "υ",
  "χ",
  "ω",
]);

function mapujHomoglyfy(s: string): string {
  let o = "";
  for (const ch of s) o += HOMOGLYFY[ch] ?? ch;
  return o;
}

function bezDiakritiky(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "");
}

/**
 * Text, ako ho prečíta človek: bez neviditeľných znakov, homoglyfy prevedené
 * na latinku, bez diakritiky, malými písmenami. „ЕТSУ" → „etsy".
 */
export function normalizuj(s: string | null | undefined): string {
  const nfkc = String(s ?? "")
    .normalize("NFKC")
    .replace(NEVIDITELNE, "");
  return bezDiakritiky(mapujHomoglyfy(nfkc)).toLowerCase();
}

/**
 * Kostra slova na porovnanie so značkou: navyše zlúči znaky, ktoré sa dajú
 * zameniť (l/I/1 → i, 0 → o, 3 → e, rn → m…). „VlNTED" → „vinted".
 */
export function kostra(s: string): string {
  return normalizuj(s)
    .replace(/[l1|!¡]/g, "i")
    .replace(/0/g, "o")
    .replace(/3/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w");
}

/* ────────────────────────── značky ────────────────────────── */

type Znacka = { nazov: string; slova: string[] };

/**
 * Značky, za ktoré sa phishing najčastejšie vydáva (bazáre, doprava, platby,
 * ubytovanie). `slova` = slová značky; viacslovná sa hľadá ako súvislý sled.
 */
export const ZNACKY: Znacka[] = [
  { nazov: "Vinted", slova: ["vinted"] },
  { nazov: "Etsy", slova: ["etsy"] },
  { nazov: "PayPal", slova: ["paypal"] },
  { nazov: "OLX", slova: ["olx"] },
  { nazov: "Bazoš", slova: ["bazos"] },
  { nazov: "eBay", slova: ["ebay"] },
  { nazov: "Amazon", slova: ["amazon"] },
  { nazov: "DHL", slova: ["dhl"] },
  { nazov: "DPD", slova: ["dpd"] },
  { nazov: "GLS", slova: ["gls"] },
  { nazov: "Packeta", slova: ["packeta"] },
  { nazov: "Zásielkovňa", slova: ["zasielkovna"] },
  { nazov: "Zásilkovna", slova: ["zasilkovna"] },
  { nazov: "Slovenská pošta", slova: ["slovenska", "posta"] },
  { nazov: "Česká pošta", slova: ["ceska", "posta"] },
  { nazov: "Booking", slova: ["booking"] },
  { nazov: "Airbnb", slova: ["airbnb"] },
  { nazov: "Revolut", slova: ["revolut"] },
  { nazov: "Wise", slova: ["wise"] },
  { nazov: "Facebook Marketplace", slova: ["facebook", "marketplace"] },
  { nazov: "Shein", slova: ["shein"] },
  { nazov: "AliExpress", slova: ["aliexpress"] },
  { nazov: "Allegro", slova: ["allegro"] },
  { nazov: "Sbazar", slova: ["sbazar"] },
  { nazov: "Depop", slova: ["depop"] },
  { nazov: "Wallapop", slova: ["wallapop"] },
  { nazov: "Kleinanzeigen", slova: ["kleinanzeigen"] },
];

/** Slovenské/české pádové koncovky, ktoré smie mať krátka značka („cez DPDčku" nie, „OLXu" áno). */
const KONCOVKY = new Set(["", "u", "e", "a", "y", "i", "om", "ov", "ovi", "och", "em", "ou"]);

/** Krátke značky (do 4 znakov) sa porovnávajú presne, dlhšie aj ako časť slova. */
const KRATKA = 4;

function slovaTextu(s: string): string[] {
  // Rozdeľuje na všetkom, čo nie je písmeno ani číslica (aj bodky v doménach).
  return String(s ?? "")
    .normalize("NFKC")
    .replace(NEVIDITELNE, "")
    .split(/[^\p{L}\p{N}@$|!¡]+/u)
    .filter(Boolean);
}

/** Rozostavené písmená „V i n t e d" / „V.i.n.t.e.d" zlúčené do slova. */
function zlucRozostavene(slova: string[]): string[] {
  const vysledok: string[] = [];
  let beh: string[] = [];
  const uzavri = () => {
    if (beh.length >= 3) vysledok.push(beh.join(""));
    beh = [];
  };
  for (const w of slova) {
    if ([...w].length === 1) beh.push(w);
    else uzavri();
  }
  uzavri();
  return vysledok;
}

type Zhoda = { znacka: Znacka; slovo: string; maskovana: boolean };

/** Slovo bez prevodu homoglyfov — či značka sedí aj bez neho. */
function surove(s: string): string {
  return bezDiakritiky(s.normalize("NFKC").replace(NEVIDITELNE, "")).toLowerCase();
}

function zhodaSlova(slovo: string, z: Znacka): { ano: boolean; maskovana: boolean } {
  const vzor = z.slova[0];
  const plain = normalizuj(slovo);
  const bezPrevodu = surove(slovo);
  const k = kostra(slovo);
  const kVzor = kostra(vzor);
  if (vzor.length <= KRATKA) {
    if (plain.startsWith(vzor) && KONCOVKY.has(plain.slice(vzor.length))) {
      return { ano: true, maskovana: !bezPrevodu.startsWith(vzor) };
    }
    // Zámena znakov má zmysel len v slove, ktoré nejaký zameniteľný znak má —
    // „GIS" nie je „GLS", ale „G1S" už áno.
    const maZamenu = plain !== k || /[^a-z]/.test(plain);
    if (maZamenu && k.startsWith(kVzor) && KONCOVKY.has(k.slice(kVzor.length))) {
      return { ano: true, maskovana: true };
    }
    return { ano: false, maskovana: false };
  }
  if (plain.includes(vzor)) return { ano: true, maskovana: !bezPrevodu.includes(vzor) };
  if (k.includes(kVzor)) return { ano: true, maskovana: true };
  return { ano: false, maskovana: false };
}

/** Všetky značky v texte. */
export function najdiZnacky(text: string | null | undefined): Zhoda[] {
  const slova = slovaTextu(String(text ?? ""));
  const kandidati = [...slova, ...zlucRozostavene(slova)];
  const out: Zhoda[] = [];
  const pridaj = (z: Zhoda) => {
    const stara = out.find((o) => o.znacka.nazov === z.znacka.nazov);
    if (stara) {
      if (z.maskovana) stara.maskovana = true;
      return;
    }
    out.push(z);
  };
  for (const z of ZNACKY) {
    if (z.slova.length === 1) {
      for (const w of kandidati) {
        const r = zhodaSlova(w, z);
        if (r.ano) pridaj({ znacka: z, slovo: w, maskovana: r.maskovana });
      }
      // „Pay Pal", „Vin ted" — dve susedné slová spolu dávajú presne značku.
      for (let i = 0; i + 1 < slova.length; i++) {
        const spolu = slova[i] + slova[i + 1];
        if (kostra(spolu) === kostra(z.slova[0])) {
          pridaj({
            znacka: z,
            slovo: `${slova[i]} ${slova[i + 1]}`,
            maskovana: surove(spolu) !== z.slova[0],
          });
        }
      }
    } else {
      for (let i = 0; i + z.slova.length <= slova.length; i++) {
        let ano = true;
        let maskovana = false;
        for (let j = 0; j < z.slova.length; j++) {
          const vzor = z.slova[j];
          // Pádové tvary („Slovenskej pošty", „Facebook Marketplace-u").
          const sedi = surove(slova[i + j]).startsWith(vzor.slice(0, Math.max(4, vzor.length - 2)));
          const sediKostra = kostra(slova[i + j]).startsWith(
            kostra(vzor).slice(0, Math.max(4, vzor.length - 2)),
          );
          if (!sedi && !sediKostra) {
            ano = false;
            break;
          }
          if (!sedi) maskovana = true;
        }
        if (ano)
          pridaj({ znacka: z, slovo: slova.slice(i, i + z.slova.length).join(" "), maskovana });
      }
    }
  }
  return out;
}

/* ────────────────────────── písmo ────────────────────────── */

/** Slová, v ktorých sa mieša latinka s azbukou alebo gréčtinou („ЕТSУ", „mаrкеtрlасе"). */
export function zmiesanePismo(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const w of String(text ?? "")
    .normalize("NFKC")
    .replace(NEVIDITELNE, "")
    .split(/[^\p{L}\p{M}\p{N}]+/u)) {
    if (!w) continue;
    const latinka = /\p{Script=Latin}/u.test(w);
    if (!latinka) continue;
    const azbuka = /\p{Script=Cyrillic}/u.test(w);
    const grecke = [...w].filter((c) => /\p{Script=Greek}/u.test(c));
    if (azbuka || (grecke.some((c) => GRECKE_PODOBNE.has(c)) && [...w].length >= 3)) {
      out.push(w);
    }
  }
  return out;
}

/* ────────────────────────── odkazy ────────────────────────── */

/** Služby na skracovanie odkazov — cieľ je skrytý, v mailoch firmy nemajú čo robiť. */
export const SKRACOVACE = new Set([
  "bit.ly",
  "bitly.com",
  "bit.do",
  "tinyurl.com",
  "tiny.cc",
  "tiny.one",
  "t.ly",
  "t.co",
  "cutt.ly",
  "cutt.us",
  "is.gd",
  "v.gd",
  "x.gd",
  "rb.gy",
  "goo.su",
  "goo.gl",
  "shorturl.at",
  "shorturl.asia",
  "ow.ly",
  "buff.ly",
  "rebrand.ly",
  "s.id",
  "bl.ink",
  "lnkd.in",
  "qrco.de",
  "clck.ru",
  "u.to",
  "shrtco.de",
  "9qr.de",
  "urlz.fr",
  "gg.gg",
  "surl.li",
  "han.gl",
  "tny.im",
  "shorte.st",
  "adf.ly",
  "ouo.io",
  "shorturl.ac",
  "shrturi.com",
  "short.gy",
  "rotf.lol",
  "linkr.it",
  "yourls.org",
  "kutt.it",
  "zpr.io",
  "lnk.to",
  "1url.cz",
  "url.sk",
]);

/*
  Domény bez „http://" sa uznávajú len s bežnou koncovkou — inak by „s.r.o."
  alebo „faktura.pdf" vyzerali ako odkaz. S „http(s)://" alebo „www." sa berie
  každá koncovka. Zámerne chýba .zip a .mov (názvy súborov).
*/
const KONCOVKY_DOMEN = new Set(
  (
    "com net org info biz io co me sk cz de at eu uk pl hu ch it fr es nl be ru su ua by kz " +
    "cn us ca in ro bg hr si rs lt lv ee pt gr se no dk fi ie lu li shop site online store " +
    "xyz top cyou sbs click link live app dev page club icu buzz fun space website tech pro " +
    "cc tk ml ga cf gq pw ws ly to gl ai gg gd id vip work email support help services world " +
    "today life cloud digital agency media news blog one asia mobi tv cfd rest bond lol mom " +
    "monster quest hair beauty skin boats autos homes yachts motorcycles best cam loan win bid " +
    "date review stream trade party science racing download men ink wiki group center"
  ).split(/\s+/),
);

/** Druhá úroveň, za ktorou ešte nasleduje skutočné meno (co.uk, com.au…). */
const DRUHA_UROVEN = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);

export type Odkaz = { host: string; cely: string };

function hostZWebu(web: string | null | undefined): string | null {
  const s = String(web ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  const m = /^(?:[a-z]+:\/\/)?([^/\s:?#]+)/.exec(s);
  const h = m?.[1]?.replace(/^www\./, "") ?? "";
  return h.includes(".") ? h : null;
}

/** Odkazy a holé domény v texte (e-mailové adresy sa nerátajú). */
export function najdiOdkazy(text: string | null | undefined): Odkaz[] {
  const s = String(text ?? "")
    .normalize("NFKC")
    .replace(NEVIDITELNE, "")
    // e-mailová adresa nie je odkaz
    .replace(/[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[^\s@<>()"',;]+/g, " ");
  const out: Odkaz[] = [];
  const re =
    /(?<![\p{L}\p{N}@.-])((?:https?:\/\/|hxxps?:\/\/)?(?:www\.)?((?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+([\p{L}]{2,24}|xn--[a-z0-9-]+)))(?::\d+)?((?:\/|\?|#)[^\s<>"')\]]*)?/giu;
  for (const m of s.matchAll(re)) {
    const zProtokolom = /^(?:https?|hxxps?):\/\//i.test(m[1]) || /^www\./i.test(m[1]);
    const host = m[2].toLowerCase().replace(/^www\./, "");
    const tld = m[3].toLowerCase();
    if (!zProtokolom && !KONCOVKY_DOMEN.has(tld) && !tld.startsWith("xn--")) continue;
    out.push({ host, cely: m[0] });
  }
  // Odkaz priamo na IP adresu.
  for (const m of s.matchAll(/https?:\/\/(\d{1,3}(?:\.\d{1,3}){3})/gi)) {
    out.push({ host: m[1], cely: m[0] });
  }
  return out;
}

/** Registrovaná doména: „a.b.vinted.co.uk" → „vinted.co.uk", „x.894273106.sbs" → „894273106.sbs". */
export function registrovanaDomena(host: string): string {
  const casti = host.split(".");
  if (casti.length <= 2) return host;
  const druha = casti[casti.length - 2];
  if (DRUHA_UROVEN.has(druha) && casti[casti.length - 1].length === 2 && casti.length >= 3) {
    return casti.slice(-3).join(".");
  }
  return casti.slice(-2).join(".");
}

function menoDomeny(reg: string): string {
  return reg.split(".")[0];
}

function jeNaDomene(host: string, domena: string): boolean {
  return host === domena || host.endsWith(`.${domena}`);
}

/** Naše domény — odkaz na platbu, ponuku či manuál je vždy v poriadku. */
const NASE_DOMENY = ["faktero.sk", "faktero.cz", "faktero.de", "faktero.eu", "faktero.com"];

/* ────────────────────────── frázy ────────────────────────── */

/**
 * Výzvy, ktorými phishing ťahá človeka na odkaz. Porovnávajú sa
 * po normalizácii (bez diakritiky, malými písmenami, homoglyfy na latinku).
 */
export const PHISHING_FRAZY = [
  // EN
  "verify your",
  "confirm your",
  "please verify",
  "please confirm",
  "receive payment",
  "receive your payment",
  "receive the payment",
  "receive funds",
  "claim your",
  "unlock your",
  "update your payment",
  "update your account",
  "account has been suspended",
  "account will be suspended",
  "account has been limited",
  "secure your account",
  // SK
  "overte svoj",
  "overte si svoj",
  "overit svoj",
  "overte vas",
  "potvrdte svoj",
  "potvrdte si svoj",
  "potvrdit svoj",
  "prijat platbu",
  "prijmite platbu",
  "prevziat platbu",
  "prevezmite platbu",
  "ziskat platbu",
  "aktualizujte svoje platobne",
  "vas ucet bol pozastaveny",
  "vas ucet bude pozastaveny",
  // CZ
  "overte svuj",
  "overit svuj",
  "potvrdte svuj",
  "potvrdit svuj",
  "prijmout platbu",
  "prevzit platbu",
  "vas ucet byl pozastaven",
  // DE
  "bestatigen sie ihr",
  "bestatigen sie ihre",
  "verifizieren sie ihr",
  "verifizieren sie ihre",
  "zahlung erhalten",
  "zahlung empfangen",
  "zahlung zu erhalten",
  "ihr konto wurde gesperrt",
  "ihr konto wurde eingeschrankt",
].map((f) => normalizuj(f));

function najdiFrazy(text: string): string[] {
  const n = normalizuj(text).replace(/\s+/g, " ");
  return PHISHING_FRAZY.filter((f) => n.includes(f));
}

/* ────────────────────────── vyhodnotenie ────────────────────────── */

export function skontrolujObsah(v: VstupObsahu): VysledokObsahu {
  const blokuj: Nalez[] = [];
  const vystrahy: Nalez[] = [];
  const mlada = v.vekDni < DNI_MLADA_FIRMA_OBSAH && !v.overena;

  const polia: Array<{ kde: Nalez["kde"]; text: string }> = [
    { kde: "predmet", text: String(v.predmet ?? "") },
    { kde: "sprava", text: String(v.sprava ?? "") },
    ...v.nazovFirmy
      .filter((n): n is string => !!n && !!String(n).trim())
      .map((n) => ({ kde: "nazov" as const, text: String(n) })),
  ];

  // Značky, ktoré firma legitímne nesie v názve — len keď ju admin overil.
  const znackyVNazve = new Set(
    v.overena
      ? polia
          .filter((p) => p.kde === "nazov")
          .flatMap((p) => najdiZnacky(p.text).filter((z) => !z.maskovana))
          .map((z) => z.znacka.nazov)
      : [],
  );

  const vlastnyWeb = hostZWebu(v.webFirmy);

  /*
    Výzva v predmete a odkaz v správe patria k sebe — odkazy sa zbierajú
    z oboch. Za cudzí sa tu ráta aj vlastný web firmy: web si firma zapíše
    sama, takže „overte svoj účet na <web firmy>" nemá byť výnimkou.
  */
  const odkazyMimoFaktera = polia
    .filter((p) => p.kde !== "nazov")
    .flatMap((p) => najdiOdkazy(p.text))
    .filter((o) => !NASE_DOMENY.some((d) => jeNaDomene(o.host, d)));

  for (const p of polia) {
    for (const w of zmiesanePismo(p.text)) {
      blokuj.push({ kod: "zmiesane_pismo", popis: w, kde: p.kde });
    }

    for (const z of najdiZnacky(p.text)) {
      if (z.maskovana) {
        blokuj.push({
          kod: "maskovana_znacka",
          popis: `${z.znacka.nazov}: ${z.slovo}`,
          kde: p.kde,
        });
        continue;
      }
      if (znackyVNazve.has(z.znacka.nazov)) continue;
      const n: Nalez = { kod: "znacka", popis: z.znacka.nazov, kde: p.kde };
      if (mlada) blokuj.push(n);
      else vystrahy.push(n);
    }

    if (p.kde === "nazov") continue;

    for (const o of najdiOdkazy(p.text)) {
      const reg = registrovanaDomena(o.host);
      if (SKRACOVACE.has(o.host) || SKRACOVACE.has(reg)) {
        blokuj.push({ kod: "skracovac", popis: o.host, kde: p.kde });
        continue;
      }
      if (NASE_DOMENY.some((d) => jeNaDomene(o.host, d))) continue;
      // Tieto dve kontroly platia aj pre „vlastný web" — ten si firma zapisuje sama.
      if (/^[a-z]{0,3}\d{5,}$/.test(menoDomeny(reg))) {
        blokuj.push({ kod: "ciselna_domena", popis: o.host, kde: p.kde });
        continue;
      }
      // Doména sa tvári ako značka, ale značke nepatrí (vinted.discoververifypage.com).
      const vlastnaZnacke = ZNACKY.some(
        (z) => z.slova.length === 1 && kostra(menoDomeny(reg)) === kostra(z.slova[0]),
      );
      const znackaVHoste = najdiZnacky(o.host.replace(/[.-]/g, " "));
      if (znackaVHoste.length && !vlastnaZnacke) {
        blokuj.push({
          kod: "odkaz_na_znacku",
          popis: `${o.host} (${znackaVHoste.map((z) => z.znacka.nazov).join(", ")})`,
          kde: p.kde,
        });
        continue;
      }
      if (vlastnyWeb && jeNaDomene(o.host, vlastnyWeb)) continue;
      if (mlada) blokuj.push({ kod: "cudzi_odkaz", popis: o.host, kde: p.kde });
    }

    if (odkazyMimoFaktera.length) {
      for (const f of najdiFrazy(p.text)) {
        blokuj.push({
          kod: "phishing_fraza",
          popis: `„${f}" + ${odkazyMimoFaktera[0].host}`,
          kde: p.kde,
        });
      }
    }
  }

  return { blokuj: unikatne(blokuj), vystrahy: unikatne(vystrahy) };
}

function unikatne(n: Nalez[]): Nalez[] {
  const videne = new Set<string>();
  return n.filter((x) => {
    const k = `${x.kod}|${x.popis}|${x.kde}`;
    if (videne.has(k)) return false;
    videne.add(k);
    return true;
  });
}

/** Krátky popis nálezov pre admina a tabuľku `odosielanie_zablokovane`. */
export function popisNalezov(n: Nalez[]): string {
  return n
    .map((x) => `${x.kod} (${x.kde}): ${x.popis}`)
    .join("; ")
    .slice(0, 1000);
}
