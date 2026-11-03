/*
  Odoslané e-maily firmy — súhrn pre Nastavenia → Odoslané e-maily.

  Zdroj: `odosielanie_mailov` — strážca odosielania (ochrana-odosielania.server.ts)
  doň zapíše každý e-mail, ktorý Faktero pošle v mene firmy (faktúra, dobropis,
  upomienka, ponuka, samofaktúra, predĺženie splatnosti, podklady účtovníkovi,
  žiadosť o schválenie, pozvánka, skúšobný e-mail šablóny, upozornenie na
  eFaktúru). Úplná je od 17. 10. 2026; staršie faktúry, ponuky a upomienky sa
  dopĺňajú z `invoice_email_logs`, `quote_email_logs` a `invoice_reminders`.
  Zastavené pokusy sú v `odosielanie_zablokovane` (bez adries, len počet).

  Tu sú len čisté funkcie (súhrn, obdobie, CSV) — testuje ich
  odoslane-maily.test.ts a volá ich stránka aj server.
*/
import { naCsv } from "./export-firmy";

/** Od tohto okamihu eviduje strážca každý e-mail firmy (spätne doplnené 2 dni pred nasadením). */
export const ZACIATOK_EVIDENCIE = "2026-10-17T19:00:00Z";
/** Najstarší záznam o odoslanej faktúre (invoice_email_logs). */
export const ZACIATOK_HISTORIE = "2026-07-31";

export type StavMailu = "odoslane" | "zlyhalo" | "zastavene" | "rezervovane";
export type TypDokladu = "faktura" | "ponuka" | "prijata";

export type OdoslanyMail = {
  id: string;
  /** ISO čas odoslania. */
  cas: string;
  druh: string;
  /** Adresy malými písmenami; pri zastavenom pokuse prázdne (strážca ich neukladá). */
  adresati: string[];
  pocet: number;
  stav: StavMailu;
  predmet: string | null;
  chyba: string | null;
  cez: "smtp" | "resend" | null;
  doklad: { typ: TypDokladu; id: string; cislo: string | null } | null;
  /** Odberateľ (dodávateľ pri samofaktúre) z dokladu. */
  odberatel: string | null;
  /** Meno toho, kto e-mail odoslal; `null` = automaticky (cron, API). */
  kto: string | null;
  /** `historia` = doplnené zo starších záznamov pred spustením evidencie. */
  zdroj: "evidencia" | "historia";
};

/** Druhy e-mailov v poradí, v akom sa ukazujú. Názvy idú cez t(). */
export const DRUHY_MAILOV: { druh: string; nazov: string }[] = [
  { druh: "faktura", nazov: "Faktúry a dobropisy" },
  { druh: "upomienka", nazov: "Upomienky" },
  { druh: "ponuka", nazov: "Cenové ponuky" },
  { druh: "samofaktura", nazov: "Samofaktúry" },
  { druh: "splatnost", nazov: "Predĺženie splatnosti" },
  { druh: "podklady", nazov: "Podklady účtovníkovi" },
  { druh: "schvalenie", nazov: "Žiadosti o schválenie" },
  { druh: "pozvanka", nazov: "Pozvánky" },
  { druh: "efaktura_prijata", nazov: "Upozornenia na eFaktúru" },
  { druh: "test_sablony", nazov: "Skúšobné e-maily" },
];

export function nazovDruhu(druh: string): string {
  return DRUHY_MAILOV.find((d) => d.druh === druh)?.nazov ?? "Iné";
}

/** Ktorá tabuľka dokladu patrí k druhu e-mailu (podľa `doklad_id`). */
export function typDokladuDruhu(druh: string): TypDokladu | null {
  if (["faktura", "upomienka", "splatnost", "schvalenie"].includes(druh)) return "faktura";
  if (druh === "ponuka") return "ponuka";
  if (druh === "samofaktura") return "prijata";
  return null;
}

/** Odoslaný (alebo práve odosielaný) e-mail — ráta sa do súhrnu aj stropu. */
export function jeOdoslany(m: Pick<OdoslanyMail, "stav">): boolean {
  return m.stav === "odoslane" || m.stav === "rezervovane";
}

// ─────────────────────────── obdobie ───────────────────────────

export type Obdobie = "mesiac" | "minuly" | "rok" | "vlastne";

const pad = (n: number) => String(n).padStart(2, "0");

/** Kalendárny deň (YYYY-MM-DD) okamihu v Bratislave. */
export function datumBratislava(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Rozsah dní (vrátane) pre voľbu obdobia; `dnes` je YYYY-MM-DD. */
export function rozsahObdobia(
  o: Obdobie,
  dnes: string,
  vlastne?: { od?: string | null; do?: string | null },
): { od: string; do: string } {
  const [r, m] = dnes.split("-").map(Number);
  if (o === "minuly") {
    const rr = m === 1 ? r - 1 : r;
    const mm = m === 1 ? 12 : m - 1;
    const posledny = new Date(Date.UTC(rr, mm, 0)).getUTCDate();
    return { od: `${rr}-${pad(mm)}-01`, do: `${rr}-${pad(mm)}-${pad(posledny)}` };
  }
  if (o === "rok") return { od: `${r}-01-01`, do: dnes };
  if (o === "vlastne") {
    let od = vlastne?.od || `${r}-${pad(m)}-01`;
    let doDna = vlastne?.do || dnes;
    if (od > doDna) [od, doDna] = [doDna, od];
    return { od, do: doDna };
  }
  return { od: `${r}-${pad(m)}-01`, do: dnes };
}

export function vObdobi(cas: string, r: { od: string; do: string }): boolean {
  const d = datumBratislava(cas);
  return d >= r.od && d <= r.do;
}

// ─────────────────────────── súhrn ───────────────────────────

export type SuhrnDruhu = {
  druh: string;
  nazov: string;
  emailov: number;
  adresatov: number;
  chyby: number;
};

export type SuhrnAdresata = {
  adresa: string;
  odberatel: string | null;
  emailov: number;
  chyby: number;
  posledne: string;
  druhy: string[];
};

export type SuhrnMailov = {
  /** Odoslané e-maily (bez zlyhaných a zastavených). */
  emailov: number;
  /** Súčet adresátov odoslaných e-mailov (jeden e-mail dvom = 2). */
  adresatov: number;
  roznychAdresatov: number;
  zlyhalo: number;
  zastavene: number;
  cezSmtp: number;
  poDruhoch: SuhrnDruhu[];
  poAdresatoch: SuhrnAdresata[];
  poOdosielateloch: { kto: string | null; emailov: number }[];
};

export function suhrnMailov(maily: OdoslanyMail[]): SuhrnMailov {
  const druhy = new Map<string, SuhrnDruhu>();
  const adresati = new Map<string, SuhrnAdresata>();
  const kto = new Map<string | null, number>();
  let emailov = 0;
  let adresatov = 0;
  let zlyhalo = 0;
  let zastavene = 0;
  let cezSmtp = 0;

  for (const m of maily) {
    const odoslany = jeOdoslany(m);
    if (m.stav === "zastavene") zastavene++;
    else if (m.stav === "zlyhalo") zlyhalo++;
    if (odoslany) {
      emailov++;
      adresatov += m.adresati.length || m.pocet;
      if (m.cez === "smtp") cezSmtp++;
      kto.set(m.kto, (kto.get(m.kto) ?? 0) + 1);
    }

    const d =
      druhy.get(m.druh) ??
      ({ druh: m.druh, nazov: nazovDruhu(m.druh), emailov: 0, adresatov: 0, chyby: 0 } as SuhrnDruhu);
    if (odoslany) {
      d.emailov++;
      d.adresatov += m.adresati.length || m.pocet;
    } else d.chyby++;
    druhy.set(m.druh, d);

    for (const a of m.adresati) {
      const x = adresati.get(a) ?? {
        adresa: a,
        odberatel: null,
        emailov: 0,
        chyby: 0,
        posledne: m.cas,
        druhy: [],
      };
      if (odoslany) x.emailov++;
      else x.chyby++;
      // Odberateľ a posledné odoslanie podľa najnovšieho e-mailu.
      if (m.cas >= x.posledne) {
        x.posledne = m.cas;
        if (m.odberatel) x.odberatel = m.odberatel;
      } else if (!x.odberatel && m.odberatel) x.odberatel = m.odberatel;
      if (!x.druhy.includes(m.druh)) x.druhy.push(m.druh);
      adresati.set(a, x);
    }
  }

  const poradie = (druh: string) => {
    const i = DRUHY_MAILOV.findIndex((d) => d.druh === druh);
    return i < 0 ? DRUHY_MAILOV.length : i;
  };
  return {
    emailov,
    adresatov,
    roznychAdresatov: [...adresati.values()].filter((a) => a.emailov > 0).length,
    zlyhalo,
    zastavene,
    cezSmtp,
    poDruhoch: [...druhy.values()].sort((a, b) => poradie(a.druh) - poradie(b.druh)),
    poAdresatoch: [...adresati.values()].sort(
      (a, b) =>
        b.emailov - a.emailov || b.chyby - a.chyby || b.posledne.localeCompare(a.posledne),
    ),
    poOdosielateloch: [...kto.entries()]
      .map(([k, n]) => ({ kto: k, emailov: n }))
      .sort((a, b) => b.emailov - a.emailov),
  };
}

// ─────────────────────────── strážca ───────────────────────────

/**
 * Vyťaženie stropov strážcu — rovnaký výpočet ako `odosielanie_rezervuj`:
 * rôzni adresáti za 24 h a súčet adresátov za hodinu, bez zlyhaných.
 */
export function vytazenieStrazcu(
  riadky: { cas: string; adresati: string[]; pocet: number; stav: string }[],
  teraz: number,
): { zaDen: number; zaHodinu: number } {
  const den = new Set<string>();
  let hodina = 0;
  for (const r of riadky) {
    if (r.stav === "zlyhalo" || r.stav === "zastavene") continue;
    const t = Date.parse(r.cas);
    if (!(t > teraz - 86_400_000)) continue;
    for (const a of r.adresati) den.add(a.toLowerCase());
    if (t > teraz - 3_600_000) hodina += r.pocet;
  }
  return { zaDen: den.size, zaHodinu: hodina };
}

// ─────────────────────────── CSV ───────────────────────────

const STAV_TEXT: Record<StavMailu, string> = {
  odoslane: "Odoslané",
  rezervovane: "Odosiela sa",
  zlyhalo: "Chyba",
  zastavene: "Zastavené strážcom",
};
export function textStavu(s: StavMailu): string {
  return STAV_TEXT[s] ?? s;
}

export function casBratislava(iso: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const p = (t: string) => f.find((x) => x.type === t)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")} ${p("hour")}:${p("minute")}`;
}

/** CSV zoznamu (bodkočiarka, UTF-8 s BOM — Excel ho otvorí priamo). `t` prekladá hlavičky a hodnoty. */
export function mailyDoCsv(maily: OdoslanyMail[], t: (s: string) => string = (s) => s): string {
  const H = {
    cas: t("Dátum a čas"),
    druh: t("Druh"),
    adresati: t("Adresáti"),
    pocet: t("Počet adresátov"),
    odberatel: t("Odberateľ"),
    doklad: t("Doklad"),
    predmet: t("Predmet"),
    stav: t("Stav"),
    chyba: t("Chyba"),
    cez: t("Odoslané cez"),
    kto: t("Odoslal"),
  };
  const riadky = maily.map((m) => ({
    [H.cas]: casBratislava(m.cas),
    [H.druh]: t(nazovDruhu(m.druh)),
    [H.adresati]: m.adresati.join(", "),
    [H.pocet]: m.adresati.length || m.pocet,
    [H.odberatel]: m.odberatel ?? "",
    [H.doklad]: m.doklad?.cislo ?? "",
    [H.predmet]: m.predmet ?? "",
    [H.stav]: t(textStavu(m.stav)),
    [H.chyba]: m.chyba ?? "",
    [H.cez]: m.cez === "smtp" ? t("vlastný SMTP") : m.cez === "resend" ? "Faktero" : "",
    [H.kto]: m.kto ?? t("Automaticky"),
  }));
  return naCsv(riadky, Object.values(H));
}
