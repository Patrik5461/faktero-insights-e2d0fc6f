/**
 * Modul Zamestnanci — personalistika bez výpočtu miezd.
 *
 * Tu je len čistá logika bez databázy a bez prehliadača: pripomienky,
 * mesačný súhrn dochádzky, CSV a vypĺňanie šablón dokumentov. Server aj
 * obrazovky ju volajú rovnako a dá sa otestovať bez ničoho okolo.
 *
 * Rodné číslo a číslo OP tu nikdy neprechádzajú, okrem vypĺňania šablóny,
 * kam ich server doplní až pri výrobe PDF.
 */

export type DruhZmluvy = "pracovna_zmluva" | "dovp" | "dopc" | "brigadnicka" | "ina";
export type DruhNepritomnosti =
  | "dovolenka"
  | "pn"
  | "ocr"
  | "nahradne_volno"
  | "neplatene_volno"
  | "sviatok"
  | "ine";
export type DruhDochadzky = "praca" | "home_office" | "sluzobna_cesta";
export type KlucSablony =
  | "pracovna_zmluva"
  | "dovp"
  | "dopc"
  | "brigadnicka"
  | "vypoved"
  | "potvrdenie_prijmu";

export const DRUH_ZMLUVY: Record<DruhZmluvy, string> = {
  pracovna_zmluva: "Pracovná zmluva",
  dovp: "Dohoda o vykonaní práce",
  dopc: "Dohoda o pracovnej činnosti",
  brigadnicka: "Dohoda o brigádnickej práci študenta",
  ina: "Iná zmluva",
};

export const DRUH_NEPRITOMNOSTI: Record<DruhNepritomnosti, string> = {
  dovolenka: "Dovolenka",
  pn: "PN",
  ocr: "OČR",
  nahradne_volno: "Náhradné voľno",
  neplatene_volno: "Neplatené voľno",
  sviatok: "Sviatok",
  ine: "Iné",
};

export const DRUH_DOCHADZKY: Record<DruhDochadzky, string> = {
  praca: "Práca",
  home_office: "Home office",
  sluzobna_cesta: "Služobná cesta",
};

export type Zamestnanec = {
  id: string;
  first_name: string;
  last_name: string;
  title_before?: string | null;
  title_after?: string | null;
  birth_date?: string | null;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  position?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status: string;
  sp_registered_at?: string | null;
  zp_registered_at?: string | null;
  medical_check_due?: string | null;
  bozp_training_due?: string | null;
};

export type Zmluva = {
  id: string;
  employee_id: string;
  kind: DruhZmluvy;
  number?: string | null;
  start_date: string;
  end_date?: string | null;
  probation_end?: string | null;
  position?: string | null;
  workplace?: string | null;
  weekly_hours?: number | null;
  salary?: number | null;
  salary_period?: "mesacne" | "hodinovo" | "odmena" | null;
  currency?: string | null;
  status: string;
};

export type Nepritomnost = {
  employee_id: string;
  kind: DruhNepritomnosti;
  date_from: string;
  date_to: string;
  days?: number | null;
  note?: string | null;
};

export type Dochadzka = {
  employee_id: string;
  work_date: string;
  time_from?: string | null;
  time_to?: string | null;
  break_minutes?: number | null;
  hours?: number | null;
  kind: DruhDochadzky;
  note?: string | null;
};

/* ── Dátumy ako YYYY-MM-DD, bez časových pásiem ─────────────────────────── */

function naDen(iso: string): number {
  const [r, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(r, m - 1, d) / 86_400_000;
}

function zDna(den: number): string {
  return new Date(den * 86_400_000).toISOString().slice(0, 10);
}

export function pridajDni(iso: string, dni: number): string {
  return zDna(naDen(iso) + dni);
}

/** Koľko dní ostáva do `termin` (záporné = po termíne). */
export function dniDo(dnes: string, termin: string): number {
  return naDen(termin) - naDen(dnes);
}

export function datumSk(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [r, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}. ${Number(m)}. ${r}`;
}

export function celeMeno(z: Pick<Zamestnanec, "first_name" | "last_name" | "title_before" | "title_after">): string {
  const jadro = [z.title_before, z.first_name, z.last_name].filter(Boolean).join(" ");
  return z.title_after ? `${jadro}, ${z.title_after}` : jadro;
}

/* ── Pripomienky ────────────────────────────────────────────────────────── */

export type DruhPripomienky =
  | "sp_prihlaska"
  | "zp_prihlaska"
  | "skusobna_doba"
  | "koniec_zmluvy"
  | "lekarska_prehliadka"
  | "bozp";

export type Pripomienka = {
  /** Stabilný kľúč — slúži aj na zapamätanie prečítania v zvončeku. */
  kluc: string;
  druh: DruhPripomienky;
  employee_id: string;
  meno: string;
  termin: string;
  zavaznost: "info" | "warning" | "danger";
  nadpis: string;
  text: string;
};

/** Od koľkých dní pred termínom sa pripomienka ukazuje. */
export const PREDSTIH_DNI: Record<DruhPripomienky, number> = {
  sp_prihlaska: 7,
  zp_prihlaska: 15,
  skusobna_doba: 14,
  koniec_zmluvy: 30,
  lekarska_prehliadka: 30,
  bozp: 30,
};

/**
 * Pripomienky pre aktívnych zamestnancov k dnešnému dňu.
 *
 * - Sociálna poisťovňa: prihlášku treba podať **pred nástupom**, preto je
 *   termínom deň pred začiatkom pracovného pomeru.
 * - Zdravotná poisťovňa: oznámenie do 8 dní od nástupu.
 * - Skúšobná doba a koniec zmluvy na dobu určitú: z aktívnych zmlúv.
 * - Lekárska prehliadka a školenie BOZP: z dátumov na karte zamestnanca.
 *
 * Po termíne pripomienka neodchádza — zmizne, až keď sa vec vybaví
 * (vyplní sa dátum prihlášky alebo nový termín prehliadky).
 */
export function pripomienkyZamestnancov(
  dnes: string,
  zamestnanci: Zamestnanec[],
  zmluvy: Zmluva[],
): Pripomienka[] {
  const vysledok: Pripomienka[] = [];
  const pridaj = (
    z: Zamestnanec,
    druh: DruhPripomienky,
    termin: string,
    nadpis: string,
    text: string,
    kluc = `zam:${druh}:${z.id}:${termin}`,
  ) => {
    const zostava = dniDo(dnes, termin);
    if (zostava > PREDSTIH_DNI[druh]) return;
    vysledok.push({
      kluc,
      druh,
      employee_id: z.id,
      meno: celeMeno(z),
      termin,
      zavaznost: zostava < 0 ? "danger" : zostava <= 3 ? "warning" : "info",
      nadpis,
      text: `${text} — ${zostava < 0 ? `termín ${datumSk(termin)} už uplynul` : zostava === 0 ? "termín je dnes" : `do ${datumSk(termin)}`}`,
    });
  };

  for (const z of zamestnanci) {
    if (z.status !== "active") continue;
    const meno = celeMeno(z);

    if (z.start_date && !z.sp_registered_at) {
      pridaj(z, "sp_prihlaska", pridajDni(z.start_date, -1), "Prihláška do Sociálnej poisťovne", `${meno}: prihlásiť pred nástupom ${datumSk(z.start_date)}`);
    }
    if (z.start_date && !z.zp_registered_at) {
      pridaj(z, "zp_prihlaska", pridajDni(z.start_date, 8), "Oznámenie zdravotnej poisťovni", `${meno}: oznámiť do 8 dní od nástupu`);
    }
    if (z.medical_check_due) {
      pridaj(z, "lekarska_prehliadka", z.medical_check_due, "Lekárska prehliadka", `${meno}: preventívna prehliadka`);
    }
    if (z.bozp_training_due) {
      pridaj(z, "bozp", z.bozp_training_due, "Školenie BOZP", `${meno}: školenie bezpečnosti a ochrany zdravia`);
    }

    for (const k of zmluvy) {
      if (k.employee_id !== z.id || k.status !== "active") continue;
      if (k.probation_end && dniDo(dnes, k.probation_end) >= 0) {
        pridaj(z, "skusobna_doba", k.probation_end, "Koniec skúšobnej doby", `${meno}: ${DRUH_ZMLUVY[k.kind]}`, `zam:skusobna_doba:${k.id}:${k.probation_end}`);
      }
      if (k.end_date && dniDo(dnes, k.end_date) >= 0) {
        pridaj(z, "koniec_zmluvy", k.end_date, "Koniec zmluvy na dobu určitú", `${meno}: ${DRUH_ZMLUVY[k.kind]}`, `zam:koniec_zmluvy:${k.id}:${k.end_date}`);
      }
    }
  }

  const poradie = { danger: 0, warning: 1, info: 2 } as const;
  return vysledok.sort((a, b) => poradie[a.zavaznost] - poradie[b.zavaznost] || a.termin.localeCompare(b.termin));
}

/* ── Dochádzka ──────────────────────────────────────────────────────────── */

function minuty(cas: string): number {
  const [h, m] = cas.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Hodiny jedného záznamu. Zapísané hodiny majú prednosť; inak sa počítajú z
 * príchodu a odchodu mínus prestávka. Odchod po polnoci sa berie ako ďalší deň.
 */
export function hodinyZaznamu(z: Pick<Dochadzka, "hours" | "time_from" | "time_to" | "break_minutes">): number {
  if (z.hours != null) return Number(z.hours);
  if (!z.time_from || !z.time_to) return 0;
  let trvanie = minuty(z.time_to) - minuty(z.time_from);
  if (trvanie < 0) trvanie += 24 * 60;
  return Math.max(0, Math.round(((trvanie - (z.break_minutes ?? 0)) / 60) * 100) / 100);
}

/** Pracovné dni (pondelok–piatok) v intervale, zrezanom na mesiac. */
export function pracovneDniVMesiaci(od: string, doDna: string, mesiac: string): number {
  const zaciatok = Math.max(naDen(od), naDen(`${mesiac}-01`));
  const [r, m] = mesiac.split("-").map(Number);
  const posledny = naDen(zDna(Date.UTC(r, m, 0) / 86_400_000));
  const koniec = Math.min(naDen(doDna), posledny);
  let dni = 0;
  for (let d = zaciatok; d <= koniec; d++) {
    const tyzden = new Date(d * 86_400_000).getUTCDay();
    if (tyzden !== 0 && tyzden !== 6) dni++;
  }
  return dni;
}

export type SuhrnZamestnanca = {
  employee_id: string;
  meno: string;
  odpracovaneDni: number;
  hodiny: number;
  nepritomnosti: Record<DruhNepritomnosti, number>;
};

/** Mesačný súhrn dochádzky a neprítomností — `mesiac` je YYYY-MM. */
export function mesacnySuhrn(
  mesiac: string,
  zamestnanci: Pick<Zamestnanec, "id" | "first_name" | "last_name" | "title_before" | "title_after">[],
  dochadzka: Dochadzka[],
  nepritomnosti: Nepritomnost[],
): SuhrnZamestnanca[] {
  const vMesiaci = (d: string) => d.slice(0, 7) === mesiac;
  return zamestnanci
    .map((z) => {
      const zaznamy = dochadzka.filter((d) => d.employee_id === z.id && vMesiaci(d.work_date));
      const prazdne = Object.fromEntries(
        Object.keys(DRUH_NEPRITOMNOSTI).map((k) => [k, 0]),
      ) as Record<DruhNepritomnosti, number>;
      for (const n of nepritomnosti) {
        if (n.employee_id !== z.id) continue;
        prazdne[n.kind] += pracovneDniVMesiaci(n.date_from, n.date_to, mesiac);
      }
      return {
        employee_id: z.id,
        meno: celeMeno(z),
        odpracovaneDni: new Set(zaznamy.map((d) => d.work_date)).size,
        hodiny: Math.round(zaznamy.reduce((s, d) => s + hodinyZaznamu(d), 0) * 100) / 100,
        nepritomnosti: prazdne,
      };
    })
    .sort((a, b) => a.meno.localeCompare(b.meno, "sk"));
}

function bunka(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV pre mzdovú účtovníčku. Oddeľovač je bodkočiarka a čísla majú
 * desatinnú čiarku — tak ho otvorí slovenský Excel bez importu.
 */
export function csvDochadzky(mesiac: string, suhrn: SuhrnZamestnanca[]): string {
  const cislo = (n: number) => String(n).replace(".", ",");
  const druhy = Object.keys(DRUH_NEPRITOMNOSTI) as DruhNepritomnosti[];
  const hlavicka = ["Mesiac", "Zamestnanec", "Odpracované dni", "Hodiny", ...druhy.map((k) => `${DRUH_NEPRITOMNOSTI[k]} (dni)`)];
  const riadky = suhrn.map((s) => [
    mesiac,
    s.meno,
    s.odpracovaneDni,
    cislo(s.hodiny),
    ...druhy.map((k) => cislo(s.nepritomnosti[k])),
  ]);
  return "﻿" + [hlavicka, ...riadky].map((r) => r.map(bunka).join(";")).join("\r\n") + "\r\n";
}

/* ── Šablóny dokumentov ─────────────────────────────────────────────────── */

export const NAZOV_SABLONY: Record<KlucSablony, string> = {
  pracovna_zmluva: "Pracovná zmluva",
  dovp: "Dohoda o vykonaní práce",
  dopc: "Dohoda o pracovnej činnosti",
  brigadnicka: "Dohoda o brigádnickej práci študenta",
  vypoved: "Výpoveď",
  potvrdenie_prijmu: "Potvrdenie o príjme",
};

/** Tokeny, ktoré šablóna pozná — pre nápovedu v editore. */
export const TOKENY: { token: string; popis: string }[] = [
  { token: "firma.nazov", popis: "Názov firmy" },
  { token: "firma.ico", popis: "IČO" },
  { token: "firma.dic", popis: "DIČ" },
  { token: "firma.adresa", popis: "Sídlo firmy" },
  { token: "zamestnanec.meno", popis: "Meno a priezvisko s titulmi" },
  { token: "zamestnanec.datum_narodenia", popis: "Dátum narodenia" },
  { token: "zamestnanec.rodne_cislo", popis: "Rodné číslo (doplní sa pri výrobe PDF)" },
  { token: "zamestnanec.adresa", popis: "Bydlisko" },
  { token: "zmluva.cislo", popis: "Číslo zmluvy" },
  { token: "zmluva.pozicia", popis: "Pracovné zaradenie" },
  { token: "zmluva.miesto_vykonu", popis: "Miesto výkonu práce" },
  { token: "zmluva.zaciatok", popis: "Deň nástupu" },
  { token: "zmluva.koniec", popis: "Koniec (alebo „na dobu neurčitú“)" },
  { token: "zmluva.skusobna_doba", popis: "Koniec skúšobnej doby" },
  { token: "zmluva.uvazok", popis: "Týždenný pracovný čas" },
  { token: "zmluva.mzda", popis: "Mzda alebo odmena" },
  { token: "vypoved.dovod", popis: "Dôvod výpovede" },
  { token: "vypoved.vypovedna_doba", popis: "Výpovedná doba" },
  { token: "prijem.obdobie", popis: "Obdobie príjmu" },
  { token: "prijem.hruba_mzda", popis: "Hrubý príjem" },
  { token: "prijem.cista_mzda", popis: "Čistý príjem" },
  { token: "dnes", popis: "Dnešný dátum" },
  { token: "miesto", popis: "Miesto podpisu (mesto sídla)" },
];

/** Doplnky, ktoré sa pri výrobe dokumentu pýtajú zvlášť — nie sú na karte. */
export const DOPLNKY_SABLONY: Partial<Record<KlucSablony, { token: string; popis: string }[]>> = {
  vypoved: [
    { token: "vypoved.dovod", popis: "Dôvod výpovede" },
    { token: "vypoved.vypovedna_doba", popis: "Výpovedná doba (napr. 2 mesiace)" },
  ],
  potvrdenie_prijmu: [
    { token: "prijem.obdobie", popis: "Obdobie (napr. 1–6/2026)" },
    { token: "prijem.hruba_mzda", popis: "Hrubý príjem (€)" },
    { token: "prijem.cista_mzda", popis: "Čistý príjem (€)" },
  ],
};

const HLAVICKA = `Zamestnávateľ: {{firma.nazov}}, IČO {{firma.ico}}, so sídlom {{firma.adresa}}
Zamestnanec: {{zamestnanec.meno}}, nar. {{zamestnanec.datum_narodenia}}, r. č. {{zamestnanec.rodne_cislo}}, bytom {{zamestnanec.adresa}}`;

const PODPISY = `V {{miesto}} dňa {{dnes}}


.................................                .................................
zamestnávateľ                                          zamestnanec`;

/** Predvolené texty. Firma si ich môže upraviť; úprava sa uloží len pre ňu. */
export const PREDVOLENE_SABLONY: Record<KlucSablony, string> = {
  pracovna_zmluva: `# PRACOVNÁ ZMLUVA
uzatvorená podľa § 42 a nasl. zákona č. 311/2001 Z. z. Zákonník práce

${HLAVICKA}

1. Druh práce: {{zmluva.pozicia}}
2. Miesto výkonu práce: {{zmluva.miesto_vykonu}}
3. Deň nástupu do práce: {{zmluva.zaciatok}}
4. Pracovný pomer sa uzatvára {{zmluva.koniec}}.
5. Skúšobná doba trvá do {{zmluva.skusobna_doba}}.
6. Týždenný pracovný čas: {{zmluva.uvazok}}.
7. Mzdové podmienky: {{zmluva.mzda}}.
8. Výmera dovolenky, výpovedná doba a ďalšie pracovné podmienky sa riadia Zákonníkom práce.

Zmluva je vyhotovená v dvoch rovnopisoch, z ktorých každá strana dostane jeden.

${PODPISY}`,

  dovp: `# DOHODA O VYKONANÍ PRÁCE
uzatvorená podľa § 226 zákona č. 311/2001 Z. z. Zákonník práce

${HLAVICKA}

1. Pracovná úloha: {{zmluva.pozicia}}
2. Doba, v ktorej sa má úloha vykonať: od {{zmluva.zaciatok}} {{zmluva.koniec}}.
3. Predpokladaný rozsah práce nepresiahne 350 hodín v kalendárnom roku.
4. Dohodnutá odmena: {{zmluva.mzda}}.

${PODPISY}`,

  dopc: `# DOHODA O PRACOVNEJ ČINNOSTI
uzatvorená podľa § 228a zákona č. 311/2001 Z. z. Zákonník práce

${HLAVICKA}

1. Druh práce: {{zmluva.pozicia}}
2. Rozsah pracovného času: {{zmluva.uvazok}} (najviac 10 hodín týždenne).
3. Dohoda sa uzatvára od {{zmluva.zaciatok}} {{zmluva.koniec}}.
4. Dohodnutá odmena: {{zmluva.mzda}}.

${PODPISY}`,

  brigadnicka: `# DOHODA O BRIGÁDNICKEJ PRÁCI ŠTUDENTA
uzatvorená podľa § 228 zákona č. 311/2001 Z. z. Zákonník práce

${HLAVICKA}

1. Druh práce: {{zmluva.pozicia}}
2. Rozsah pracovného času: {{zmluva.uvazok}} (v priemere najviac 20 hodín týždenne).
3. Dohoda sa uzatvára od {{zmluva.zaciatok}} {{zmluva.koniec}}.
4. Dohodnutá odmena: {{zmluva.mzda}}.
5. Zamestnanec k dohode prikladá potvrdenie o štúdiu.

${PODPISY}`,

  vypoved: `# VÝPOVEĎ Z PRACOVNÉHO POMERU

${HLAVICKA}

Zamestnávateľ týmto dáva zamestnancovi výpoveď z pracovného pomeru podľa Zákonníka práce.

Dôvod výpovede: {{vypoved.dovod}}
Výpovedná doba: {{vypoved.vypovedna_doba}}. Začína plynúť prvým dňom kalendárneho mesiaca nasledujúceho po doručení výpovede.

${PODPISY}`,

  potvrdenie_prijmu: `# POTVRDENIE O PRÍJME

Zamestnávateľ {{firma.nazov}}, IČO {{firma.ico}}, so sídlom {{firma.adresa}}, potvrdzuje, že
{{zamestnanec.meno}}, nar. {{zamestnanec.datum_narodenia}}, bytom {{zamestnanec.adresa}},
je u neho zamestnaný od {{zmluva.zaciatok}} ako {{zmluva.pozicia}}.

Za obdobie {{prijem.obdobie}} dosiahol:
- priemerný mesačný hrubý príjem: {{prijem.hruba_mzda}}
- priemerný mesačný čistý príjem: {{prijem.cista_mzda}}

Zamestnanec nie je vo výpovednej dobe.

V {{miesto}} dňa {{dnes}}


.................................
pečiatka a podpis zamestnávateľa`,
};

/** Nahradí `{{token}}` hodnotami; neznámy alebo prázdny token ostane ako „…“. */
export function vyplnSablonu(text: string, hodnoty: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (_, token: string) => {
    const v = hodnoty[token];
    return v == null || v === "" ? "…" : v;
  });
}

type FirmaPreSablonu = {
  name: string;
  ico?: string | null;
  dic?: string | null;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
};

function adresa(x: { street?: string | null; zip?: string | null; city?: string | null }): string {
  return [x.street, [x.zip, x.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function mzdaSlovom(k: Zmluva | null): string {
  if (!k?.salary) return "";
  const suma = new Intl.NumberFormat("sk-SK", { style: "currency", currency: k.currency || "EUR" }).format(k.salary);
  return k.salary_period === "hodinovo"
    ? `${suma} za hodinu`
    : k.salary_period === "odmena"
      ? `${suma} za vykonanú prácu`
      : `${suma} mesačne`;
}

/** Hodnoty tokenov z firmy, zamestnanca a zmluvy. */
export function hodnotyTokenov(args: {
  firma: FirmaPreSablonu;
  zamestnanec: Zamestnanec;
  zmluva: Zmluva | null;
  rodneCislo?: string | null;
  dnes: string;
  doplnky?: Record<string, string>;
}): Record<string, string> {
  const { firma, zamestnanec: z, zmluva: k } = args;
  return {
    "firma.nazov": firma.name,
    "firma.ico": firma.ico ?? "",
    "firma.dic": firma.dic ?? "",
    "firma.adresa": adresa(firma),
    "zamestnanec.meno": celeMeno(z),
    "zamestnanec.datum_narodenia": z.birth_date ? datumSk(z.birth_date) : "",
    "zamestnanec.rodne_cislo": args.rodneCislo ?? "",
    "zamestnanec.adresa": adresa(z),
    "zmluva.cislo": k?.number ?? "",
    "zmluva.pozicia": k?.position ?? z.position ?? "",
    "zmluva.miesto_vykonu": k?.workplace ?? "",
    "zmluva.zaciatok": datumSk(k?.start_date ?? z.start_date),
    "zmluva.koniec": k?.end_date ? `na dobu určitú do ${datumSk(k.end_date)}` : "na dobu neurčitú",
    "zmluva.skusobna_doba": k?.probation_end ? datumSk(k.probation_end) : "",
    "zmluva.uvazok": k?.weekly_hours ? `${String(k.weekly_hours).replace(".", ",")} hodín týždenne` : "",
    "zmluva.mzda": mzdaSlovom(k),
    dnes: datumSk(args.dnes),
    miesto: firma.city ?? "",
    ...(args.doplnky ?? {}),
  };
}
