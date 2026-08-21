/**
 * Potvrdenie preposielania z Gmailu.
 *
 * Keď si človek v Gmaile zapne automatické preposielanie na svoju adresu na
 * doklady, Google najprv pošle na tú adresu overovací mail s deväťmiestnym
 * kódom a odkazom. Bez neho sa preposielanie nikdy nezapne — a keďže tá adresa
 * je naša, mail dovtedy končil tam, kam používateľ nevidí.
 *
 * Tento súbor je zámerne bez závislostí na serveri: samotné vyzobanie kódu,
 * odkazu a zdrojovej schránky sa dá otestovať na skutočnom tvare mailu.
 *
 * **Nič z tela mailu sa neukladá** — von ide len kód, odkaz a adresa schránky.
 */

/**
 * Od koho takéto potvrdenie berieme. Zoznam je pripravený na ďalších
 * poskytovateľov (Outlook, vlastný server), preto pole a nie konštanta.
 */
export type OdosielatelPotvrdeni = { adresa: string; provider: string; domena: string };

export const ODOSIELATELIA_POTVRDENI: OdosielatelPotvrdeni[] = [
  { adresa: "forwarding-noreply@google.com", provider: "gmail", domena: "google.com" },
];

/** Holá adresa z hlavičky `From` — „Gmail Team <x@y>" aj „x@y". */
export function adresaOdosielatela(from?: string | null): string | null {
  const s = String(from ?? "").trim();
  if (!s) return null;
  const vLomenych = s.match(/<([^>]+)>/);
  const adresa = (vLomenych ? vLomenych[1] : s).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(adresa) ? adresa : null;
}

/** Je to mail, ktorý potvrdzuje preposielanie? Ak áno, vráti jeho poskytovateľa. */
export function poskytovatelPotvrdenia(from?: string | null): OdosielatelPotvrdeni | null {
  const adresa = adresaOdosielatela(from);
  if (!adresa) return null;
  return ODOSIELATELIA_POTVRDENI.find((o) => o.adresa === adresa) ?? null;
}

/*
  Adresa odosielateľa sa dá napísať do mailu akákoľvek. Jediné, čo o pravosti
  naozaj hovorí, je výsledok SPF a DKIM od servera, ktorý mail prijal — Resend
  ho pridáva do hlavičky `Authentication-Results`. Bez neho by stačilo poslať na
  adresu firmy mail „od Googlu" s vlastným odkazom a používateľ by si klikol na
  cudzie preposielanie.
*/
export type VysledokPravosti = { ok: true } | { ok: false; dovod: string };

export function overPravostPotvrdenia(args: {
  headers?: Record<string, unknown> | null;
  /** Ak by ich Resend niekedy dal priamo do odpovede, majú prednosť. */
  spf?: unknown;
  dkim?: unknown;
  domena: string;
}): VysledokPravosti {
  const { domena } = args;

  const stav = (v: unknown): string | null => {
    if (typeof v === "string") return v.toLowerCase();
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const s = o.status ?? o.result ?? o.verdict;
      if (typeof s === "string") return s.toLowerCase();
    }
    return null;
  };
  const spfPriamo = stav(args.spf);
  const dkimPriamo = stav(args.dkim);
  if (spfPriamo && dkimPriamo) {
    if (spfPriamo !== "pass") return { ok: false, dovod: `SPF ${spfPriamo}` };
    if (dkimPriamo !== "pass") return { ok: false, dovod: `DKIM ${dkimPriamo}` };
    return { ok: true };
  }

  const hlavicky = args.headers ?? {};
  const kluc = Object.keys(hlavicky).find((k) => k.toLowerCase() === "authentication-results");
  const riadok = kluc ? String((hlavicky as Record<string, unknown>)[kluc] ?? "") : "";
  if (!riadok) return { ok: false, dovod: "chýba hlavička Authentication-Results" };

  const nizko = riadok.toLowerCase();
  if (!/\bspf=pass\b/.test(nizko)) return { ok: false, dovod: "SPF neprešlo" };
  if (!/\bdkim=pass\b/.test(nizko)) return { ok: false, dovod: "DKIM neprešlo" };

  /*
    Nestačí `dkim=pass` — podpísať sa vie ktokoľvek vlastnou doménou. Musí sedieť
    doména podpisu (`header.d`, prípadne `header.i`) s tou, ktorú čakáme.
  */
  const podpisujuce = [...nizko.matchAll(/dkim=pass[^;]*?header\.(?:d|i)=([^\s;,]+)/g)].map((m) =>
    m[1]!.replace(/^@/, "").replace(/^"|"$/g, ""),
  );
  const sedi = podpisujuce.some((d) => d === domena || d.endsWith(`.${domena}`));
  if (!sedi) {
    return {
      ok: false,
      dovod: podpisujuce.length
        ? `DKIM podpísala doména ${podpisujuce.join(", ")}, nie ${domena}`
        : `v DKIM chýba doména podpisu, čakala sa ${domena}`,
    };
  }
  return { ok: true };
}

/** Telo mailu z Resendu môže prísť ako `data:` URI (`html_format: "data_uri"`). */
export function rozbalTelo(hodnota?: string | null): string {
  const s = String(hodnota ?? "");
  if (!s.startsWith("data:")) return s;
  const ciarka = s.indexOf(",");
  if (ciarka < 0) return "";
  const hlavicka = s.slice(5, ciarka);
  const zvysok = s.slice(ciarka + 1);
  try {
    if (/;base64/i.test(hlavicka)) return Buffer.from(zvysok, "base64").toString("utf8");
    return decodeURIComponent(zvysok);
  } catch {
    return "";
  }
}

/** Z HTML spraví holý text — na hľadanie kódu a adries stačí a je to bezpečnejšie. */
function bezZnaciek(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Potvrdzovací kód.
 *
 * Gmail ho dáva do predmetu v tvare `(#123456789)`, ale **nie vždy**: v maile,
 * ktorý reálne prišiel na `doklady.faktero.sk`, bol v zátvorke názov účtu a kód
 * v ňom nebol vôbec — potvrdzovalo sa iba odkazom. Preto sa hľadá aj pri slove
 * „code"/„kód" a až nakoniec voľné deväťmiestne číslo.
 *
 * Z textu sa najprv vyhodia odkazy: v pätičke býva `answer=184973` a podobné
 * čísla, ktoré s kódom nemajú nič spoločné.
 */
export function kodPotvrdenia(predmet?: string | null, telo?: string | null): string | null {
  const zPredmetu = String(predmet ?? "").match(/\(#(\d{6,12})\)/);
  if (zPredmetu) return zPredmetu[1]!;

  const bezOdkazov = String(telo ?? "").replace(/https?:\/\/\S+/gi, " ");
  const priSlove = bezOdkazov.match(
    /(?:confirmation code|verification code|potvrdzovac\w*\s+k[oó]d|overovac\w*\s+k[oó]d|k[oó]d|code)\D{0,20}(\d{6,12})/i,
  );
  if (priSlove) return priSlove[1]!;

  const volne = bezOdkazov.match(/\b(\d{9})\b/);
  return volne ? volne[1]! : null;
}

/** Odkaz, ktorým sa preposielanie potvrdí. */
export function odkazPotvrdenia(html?: string | null, text?: string | null): string | null {
  const vzor = /https:\/\/mail-settings\.google\.com\/mail\/[a-z]+-[^\s"'<>]+/i;
  /*
    Najprv surové HTML: odkaz býva v `href`, a ten by sa pri odstraňovaní
    značiek stratil. Až potom text — v ňom ho Gmail píše celý na riadok.
  */
  for (const zdroj of [String(html ?? ""), bezZnaciek(String(html ?? "")), String(text ?? "")]) {
    const n = zdroj.match(vzor);
    // Na konci vety býva bodka alebo zátvorka — tie do odkazu nepatria.
    if (n) return n[0].replace(/&amp;/gi, "&").replace(/[.,);]+$/, "");
  }
  return null;
}

/**
 * Schránka, z ktorej sa preposiela. Gmail ju píše do predmetu aj do tela a robí
 * to v jazyku používateľa, takže sa nedá chytiť na jednu vetu: berie sa prvá
 * adresa, ktorá nie je Googlu ani naša vlastná. Keď sa nenájde, nevadí —
 * v banneri sa potom len nepovie odkiaľ.
 */
export function zdrojovaSchranka(args: {
  predmet?: string | null;
  telo?: string | null;
  naseAdresy?: (string | null | undefined)[];
}): string | null {
  const nase = new Set(
    (args.naseAdresy ?? []).map((a) => String(a ?? "").toLowerCase()).filter(Boolean),
  );
  const naseDomeny = [...nase].map((a) => a.split("@")[1]).filter(Boolean) as string[];
  const zdroj = `${args.predmet ?? ""}\n${bezZnaciek(String(args.telo ?? ""))}`;
  const najdene = zdroj.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  for (const surova of najdene) {
    const a = surova.toLowerCase();
    if (nase.has(a)) continue;
    const domena = a.split("@")[1]!;
    if (domena === "google.com" || domena.endsWith(".google.com")) continue;
    if (naseDomeny.includes(domena)) continue;
    return a;
  }
  return null;
}

export type PotvrdenieZMailu = {
  provider: string;
  code: string | null;
  confirm_url: string | null;
  source_email: string | null;
};

/** Poskladá to, čo sa z mailu uloží. Telo mailu von neide. */
export function potvrdenieZMailu(args: {
  provider: string;
  predmet?: string | null;
  text?: string | null;
  html?: string | null;
  naseAdresy?: (string | null | undefined)[];
}): PotvrdenieZMailu {
  const text = String(args.text ?? "");
  const html = String(args.html ?? "");
  const spolu = `${text}\n${bezZnaciek(html)}`;
  return {
    provider: args.provider,
    code: kodPotvrdenia(args.predmet, spolu),
    confirm_url: odkazPotvrdenia(html, text),
    source_email: zdrojovaSchranka({
      predmet: args.predmet,
      telo: spolu,
      naseAdresy: args.naseAdresy,
    }),
  };
}
