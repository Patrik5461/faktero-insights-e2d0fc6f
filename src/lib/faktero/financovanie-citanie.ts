/**
 * Prečítané údaje zo zmluvy o financovaní — čistá časť.
 *
 * Model vracia čísla ako string, riadky v ľubovoľnom poradí a občas aj riadok
 * navyše (hlavičku tabuľky, akontáciu). Táto vrstva to upratuje a je bez
 * databázy aj bez siete, takže sa dá otestovať. Volanie modelu je vedľa v
 * `financovanie-citanie.server.ts`.
 */

export type PrecitanaSplatka = {
  number: number;
  due_date: string;
  amount: number;
  principal_part: number;
  interest_part: number;
  vat_amount: number;
  remaining_principal: number;
};

export type PrecitanaZmluva = {
  kind: "leasing" | "uver" | "kontokorent" | null;
  provider_name: string | null;
  contract_number: string | null;
  variable_symbol: string | null;
  currency: string | null;
  principal: number | null;
  interest_rate: number | null;
  term_months: number | null;
  first_due_date: string | null;
  interest_from: string | null;
  payment_amount: number | null;
  vat_rate: number | null;
  down_payment: number | null;
  residual_value: number | null;
  /*
   * Kontokorent — úverový rámec na účte. Pri leasingu a úvere ostávajú null.
   */
  credit_limit: number | null;
  /** Poplatok za rámec za rok (mesačný sa prepočíta ×12). */
  limit_fee_yearly: number | null;
  valid_until: string | null;
  interest_period: "mesacne" | "stvrtrocne" | null;
  /** IBAN účtu, ku ktorému je rámec — podľa neho sa priradí napojený účet. */
  account_iban: string | null;
  /** Popis, ktorý patrí do poznámky zmluvy (poplatok v %, nerozpoznaný index…). */
  note: string | null;
  /*
   * Pohyblivá sadzba — index + marža. Pri pevnej `rate_type = "pevna"` a
   * ostatné null. `day_count` platí pre oboje (null = v zmluve nie je).
   */
  rate_type: "pevna" | "pohybliva";
  reference_index: ReferencnyIndex | null;
  rate_margin: number | null;
  index_floor: number | null;
  fixing_rule: PravidloFixingu | null;
  fixing_offset_days: number | null;
  rate_reset: FrekvenciaZmeny | null;
  day_count: "ACT/365" | "ACT/360" | "30E/360" | null;
  splatky: PrecitanaSplatka[];
  /** Čo v dokumente nesedelo — ukáže sa človeku, nie je to chyba. */
  vyhrady: string[];
};

import {
  predvolenaFrekvencia,
  type FrekvenciaZmeny,
  type PravidloFixingu,
  type ReferencnyIndex,
} from "./pohybliva-sadzba";

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

const VYHRADA_BEZ_SPLATNOSTI =
  "Splatnosť prvej splátky sa v dokumente nenašla — doplňte ju, inak sa kalendár dopočíta od zlého dátumu.";

function cislo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function datum(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().slice(0, 10) : "";
  return DATUM.test(s) ? s : null;
}

function text(v: unknown, max = 200): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

/** Zaokrúhlenie na centy — model občas vráti 12.340000000000002. */
function centy(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Riadky kalendára: zoradia sa, prečíslujú od jednotky a doplnia sa nuly.
 * Číslovanie z dokumentu sa nepreberá — pri kalendároch, kde je prvý riadok
 * akontácia alebo hlavička, by sa poradie rozsypalo.
 */
export function normalizujSplatky(surove: unknown): PrecitanaSplatka[] {
  if (!Array.isArray(surove)) return [];
  return surove
    .map((r: any) => ({
      due_date: datum(r?.due_date),
      amount: cislo(r?.amount),
      principal_part: cislo(r?.principal_part) ?? 0,
      interest_part: cislo(r?.interest_part) ?? 0,
      vat_amount: cislo(r?.vat_amount) ?? 0,
      remaining_principal: cislo(r?.remaining_principal) ?? 0,
      poradie: cislo(r?.number) ?? 0,
    }))
    .filter((r) => r.due_date && r.amount !== null && r.amount > 0)
    .sort((a, b) =>
      a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : a.poradie - b.poradie,
    )
    .map((r, i) => ({
      number: i + 1,
      due_date: r.due_date!,
      amount: centy(r.amount!),
      principal_part: centy(r.principal_part),
      interest_part: centy(r.interest_part),
      vat_amount: centy(r.vat_amount),
      remaining_principal: centy(r.remaining_principal),
    }));
}

/**
 * Kontroly, ktoré vie spraviť aj človek očami — a preto ich má vidieť.
 * Nič neopravujú, len povedia, čo v prečítanom nesedí.
 */
export function vyhradyKuKalendaru(z: {
  principal: number | null;
  splatky: PrecitanaSplatka[];
  term_months: number | null;
}): string[] {
  const vyhrady: string[] = [];
  if (z.splatky.length === 0) {
    vyhrady.push("V dokumente sa nenašiel splátkový kalendár — kalendár dopočíta Faktero.");
    return vyhrady;
  }
  const istiny = centy(z.splatky.reduce((s, r) => s + r.principal_part, 0));
  if (z.principal && Math.abs(istiny - z.principal) > 1) {
    vyhrady.push(
      `Súčet istín v kalendári je ${istiny.toFixed(2)}, financovaná suma ${z.principal.toFixed(2)} — skontrolujte to.`,
    );
  }
  if (z.term_months && z.term_months !== z.splatky.length) {
    vyhrady.push(
      `Zmluva hovorí o ${z.term_months} splátkach, kalendár má ${z.splatky.length} riadkov.`,
    );
  }
  const bezRozpadu = z.splatky.filter(
    (r) => r.principal_part === 0 && r.interest_part === 0,
  ).length;
  if (bezRozpadu === z.splatky.length) {
    vyhrady.push(
      "Kalendár nemá rozpad na istinu a úrok — na zaúčtovanie ho budete musieť doplniť.",
    );
  }
  /*
   * Zle prečítaný rok v jednom riadku sa inak nikde neprejaví: riadky sa
   * zoraďujú podľa dátumu, takže taký riadok sa ticho presunie inam a kalendár
   * vyzerá v poriadku. Prezradia ho dva zvyšky — dvakrát ten istý deň a diera
   * na mieste, odkiaľ riadok odišiel.
   */
  const dupli = z.splatky
    .map((r) => r.due_date)
    .filter((d, i, p) => p.indexOf(d) !== i)
    .filter((d, i, p) => p.indexOf(d) === i);
  if (dupli.length) {
    vyhrady.push(
      `Dva riadky kalendára majú rovnakú splatnosť (${dupli.slice(0, 3).join(", ")}) — skontrolujte v nich rok.`,
    );
  }
  for (let i = 1; i < z.splatky.length; i++) {
    const dni =
      (Date.parse(z.splatky[i].due_date) - Date.parse(z.splatky[i - 1].due_date)) / 86_400_000;
    if (dni > 45) {
      vyhrady.push(
        `Medzi splátkami č. ${i} a ${i + 1} je odstup ${Math.round(dni)} dní — skontrolujte dátumy.`,
      );
      break;
    }
  }
  return vyhrady;
}

/* ------------------------------------------------------------------ *
 * Kontokorent
 * ------------------------------------------------------------------ */

function holy(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Pomenovania kontokorentu v slovenských a českých zmluvách. Holé „úver"
 * nestačí — kontokorent je úver tiež; rozhoduje rámec na bežnom účte.
 */
const KONTOKORENT =
  /kontokorent|povolen\w* precerpan|precerpanie uctu|povolen\w* debet|revolving\w* uver k (beznemu )?uct|uverov\w* ramec k (beznemu )?uct|ramec k (beznemu )?uct|\boverdraft\b/;

/**
 * Druh zmluvy. Model dostane tri možnosti, ale kontokorent si občas pomýli
 * s úverom — veď to aj je úver. Preto sa pozerá aj na názov produktu a na to,
 * čo v dokumente je: **úver bez splátkového kalendára s úverovým rámcom je
 * kontokorent.** Leasing kontokorentom nebýva nikdy, ten sa neprepisuje.
 */
export function rozpoznajDruh(parsed: any): PrecitanaZmluva["kind"] {
  const kind = typeof parsed?.kind === "string" ? parsed.kind.trim() : "";
  const nazov = holy(`${kind} ${parsed?.product_name ?? ""}`);
  if (kind === "kontokorent" || KONTOKORENT.test(nazov)) return "kontokorent";
  if (kind === "leasing") return "leasing";

  const maRamec = (cislo(parsed?.credit_limit) ?? 0) > 0;
  const maKalendar =
    (Array.isArray(parsed?.splatky) && normalizujSplatky(parsed.splatky).length > 0) ||
    !!cislo(parsed?.term_months) ||
    !!datum(parsed?.first_due_date);
  if ((kind === "uver" || !kind) && maRamec && !maKalendar) return "kontokorent";
  return kind === "uver" ? "uver" : null;
}

function iban(v: unknown): string | null {
  const s = String(v ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s) ? s : null;
}

const VYHRADA_POHYBLIVA = "Sadzba je pohyblivá";

function obdobie(v: unknown): "mesacne" | "stvrtrocne" | null {
  const s = holy(v);
  if (/mesac|month|mesic/.test(s)) return "mesacne";
  if (/stvrt|quarter|ctvrt/.test(s)) return "stvrtrocne";
  return null;
}

function percento(n: number): string {
  return `${String(n).replace(".", ",")} %`;
}

/**
 * Názov referenčnej sadzby zo zmluvy → index, ktorý Faktero vie dopĺňať.
 * „EURIBOR 1-mesačný", „1M EURIBOR", „one-month EURIBOR", „3M PRIBOR",
 * „€STR"… Nerozpoznaný názov vráti null — vtedy sa sadzba berie postaru.
 */
export function rozpoznajIndex(v: unknown): ReferencnyIndex | null {
  const s = holy(v).replace(/[-_]/g, " ");
  if (!s.trim()) return null;
  if (/€str|\bestr\b|euro short term/.test(s)) return "ESTR";
  const euribor = /euribor/.test(s);
  const pribor = /pribor/.test(s);
  if (!euribor && !pribor) return null;
  const splatnost =
    /\b12 ?m\b|\b1 ?y\b|\b1 ?r\b|12 ?mesa|12 ?mesi|rocn|ročn|\bone year|1 ?rok|12 month|\b1 ?year/.test(
      s,
    )
      ? "12"
      : /\b6 ?m\b|6 ?mesa|6 ?mesi|polroc|pololet|six month|6 month/.test(s)
        ? "6"
        : /\b3 ?m\b|3 ?mesa|3 ?mesi|stvrtroc|ctvrtlet|three month|3 month/.test(s)
          ? "3"
          : /\b1 ?m\b|1 ?mesa|1 ?mesi|jednomesa|jednomesi|one month|1 month|mesacn|mesicni/.test(s)
            ? "1"
            : null;
  if (!splatnost) return null;
  if (euribor) return `EURIBOR_${splatnost}M` as ReferencnyIndex;
  return (splatnost === "12" ? "PRIBOR_1R" : `PRIBOR_${splatnost}M`) as ReferencnyIndex;
}

function konvenciaDni(v: unknown): PrecitanaZmluva["day_count"] {
  const s = holy(v).replace(/\s/g, "");
  if (!s) return null;
  if (/30e?\/360|30\/360/.test(s)) return "30E/360";
  if (/360/.test(s)) return "ACT/360";
  if (/365/.test(s)) return "ACT/365";
  return null;
}

function frekvencia(v: unknown): FrekvenciaZmeny | null {
  const s = holy(v);
  if (/mesac|month|mesic/.test(s)) return "mesacne";
  if (/stvrt|quarter|ctvrt/.test(s)) return "stvrtrocne";
  if (/polro|pololet|semi|half/.test(s)) return "polrocne";
  if (/rocn|year|annual|rok/.test(s)) return "rocne";
  return null;
}

type PohyblivaZOdpovede = Pick<
  PrecitanaZmluva,
  | "rate_type"
  | "reference_index"
  | "rate_margin"
  | "index_floor"
  | "fixing_rule"
  | "fixing_offset_days"
  | "rate_reset"
>;

const PEVNA: PohyblivaZOdpovede = {
  rate_type: "pevna",
  reference_index: null,
  rate_margin: null,
  index_floor: null,
  fixing_rule: null,
  fixing_offset_days: null,
  rate_reset: null,
};

/**
 * Pohyblivá sadzba z odpovede modelu. Keď index Faktero pozná, vyplnia sa
 * polia zmluvy a výslednú sadzbu dopočíta Faktero z ECB/ČNB; keď nie, vráti
 * sa `pevna` a o sadzbu sa postará pôvodná cesta (marža + poznámka).
 */
function udajePohyblivej(parsed: any): PohyblivaZOdpovede {
  const index = rozpoznajIndex(parsed?.reference_rate_name);
  const marza = cislo(parsed?.interest_margin);
  if (!index || marza === null) return PEVNA;
  const pravidlo: PravidloFixingu = /priemer|average|prumer/.test(holy(parsed?.fixing_rule))
    ? "mesacny_priemer"
    : "pred_zaciatkom_obdobia";
  const posun = cislo(parsed?.fixing_offset_days);
  return {
    rate_type: "pohybliva",
    reference_index: index,
    rate_margin: marza,
    index_floor: cislo(parsed?.index_floor),
    fixing_rule: pravidlo,
    fixing_offset_days:
      pravidlo === "pred_zaciatkom_obdobia"
        ? posun !== null && posun >= 0 && posun <= 10
          ? Math.round(posun)
          : 2
        : null,
    rate_reset: frekvencia(parsed?.rate_reset_period) ?? predvolenaFrekvencia(index),
  };
}

/**
 * Údaje kontokorentu z odpovede modelu. Sadzba býva pohyblivá („3M EURIBOR +
 * 2,5 %"). Keď index Faktero pozná, uloží sa ako pohyblivá (index + marža) a
 * výslednú sadzbu dopočíta Faktero; inak sa uloží súčet referenčnej a marže,
 * a keď nie je ani hodnota referenčnej, aspoň marža — s popisom v poznámke.
 */
function udajeKontokorentu(
  parsed: any,
  pohybliva: PohyblivaZOdpovede,
): {
  credit_limit: number | null;
  interest_rate: number | null;
  limit_fee_yearly: number | null;
  note: string | null;
  vyhrady: string[];
} {
  const vyhrady: string[] = [];
  const limit = cislo(parsed?.credit_limit) ?? cislo(parsed?.principal);
  const poplatky = poplatokZaRamec(parsed, limit);
  const sadzba = sadzbaAPoznamka(parsed, pohybliva, vyhrady);
  return {
    credit_limit: limit ? centy(limit) : null,
    interest_rate: sadzba.interest_rate,
    limit_fee_yearly: poplatky.poplatok,
    note: [sadzba.note, poplatky.poznamka].filter(Boolean).join(" ") || null,
    vyhrady,
  };
}

function sadzbaAPoznamka(
  parsed: any,
  pohybliva: PohyblivaZOdpovede,
  vyhrady: string[],
): { interest_rate: number | null; note: string | null } {
  const marza = cislo(parsed?.interest_margin);
  const refNazov = text(parsed?.reference_rate_name, 60);
  const refHodnota = cislo(parsed?.reference_rate_value);
  let sadzba = cislo(parsed?.interest_rate);

  if (pohybliva.rate_type === "pohybliva") {
    // Výslednú sadzbu dopočíta Faktero z indexu pri uložení; tu len náhľad.
    if (sadzba === null && refHodnota !== null) sadzba = centy(refHodnota + pohybliva.rate_margin!);
    return { interest_rate: sadzba, note: null };
  }

  let note: string | null = null;
  if (refNazov || marza !== null) {
    note = `Pohyblivá sadzba: ${[
      refNazov ?? "referenčná sadzba",
      marza !== null ? `marža ${percento(marza)}` : null,
    ]
      .filter(Boolean)
      .join(" + ")} p. a.`;
  }
  if (sadzba === null && marza !== null) {
    if (refHodnota !== null) {
      sadzba = centy(refHodnota + marza);
    } else {
      sadzba = marza;
      vyhrady.push(
        `${VYHRADA_POHYBLIVA} a hodnota referenčnej sadzby v dokumente nie je — uložená je len marža ${percento(marza)}. Doplňte výslednú sadzbu.`,
      );
    }
  }
  return { interest_rate: sadzba, note };
}

function poplatokZaRamec(
  parsed: any,
  limit: number | null,
): { poplatok: number | null; poznamka: string | null } {
  const fee = cislo(parsed?.limit_fee);
  const feePct = cislo(parsed?.limit_fee_percent);
  if (fee !== null) {
    const p = holy(parsed?.limit_fee_period);
    return {
      poplatok: centy(
        /mesac|month|mesic/.test(p) ? fee * 12 : /stvrt|quarter|ctvrt/.test(p) ? fee * 4 : fee,
      ),
      poznamka: null,
    };
  }
  if (feePct !== null && limit) {
    return {
      poplatok: centy((limit * feePct) / 100),
      poznamka: `Poplatok za rámec ${percento(feePct)} z limitu ročne.`,
    };
  }
  return { poplatok: null, poznamka: null };
}

/**
 * Zmluva a splátkový kalendár chodia často ako dva samostatné PDF — v zmluve
 * je úrok a akontácia, v kalendári riadky. Nahrať sa dajú naraz a tu sa spoja
 * do jednej prečítanej zmluvy.
 *
 * Riadky vyhrávajú z toho dokumentu, ktorý ich má najviac; hlavičkové údaje sa
 * dopĺňajú prvou nájdenou hodnotou, takže prázdno v jednom dokumente vyplní
 * druhý. Nič sa nepriemeruje ani nedopočítava — to by už bola domnienka.
 */
export function spojPrecitane(dokumenty: PrecitanaZmluva[]): PrecitanaZmluva {
  if (dokumenty.length === 1) return dokumenty[0];

  const skalar = <K extends keyof PrecitanaZmluva>(k: K): PrecitanaZmluva[K] => {
    for (const d of dokumenty) if (d[k] !== null && d[k] !== undefined) return d[k];
    return dokumenty[0][k];
  };

  const riadky = dokumenty.reduce<PrecitanaSplatka[]>(
    (najviac, d) => (d.splatky.length > najviac.length ? d.splatky : najviac),
    [],
  );

  // Keď čo len jeden dokument hovorí o kontokorente, je to kontokorent — a ten
  // splátkový kalendár nemá, takže druhý dokument mu ho nepridá.
  const kontokorent = dokumenty.some((d) => d.kind === "kontokorent");
  if (kontokorent) {
    const k: PrecitanaZmluva = {
      ...prazdnyKalendar(dokumenty.find((d) => d.kind === "kontokorent")!),
      provider_name: skalar("provider_name"),
      contract_number: skalar("contract_number"),
      currency: skalar("currency") ?? "EUR",
      interest_rate: skalar("interest_rate"),
      credit_limit: skalar("credit_limit"),
      limit_fee_yearly: skalar("limit_fee_yearly"),
      valid_until: skalar("valid_until"),
      interest_period: skalar("interest_period"),
      account_iban: skalar("account_iban"),
      note: skalar("note"),
      ...pohyblivaZoSpojenych(dokumenty),
      day_count: skalar("day_count"),
    };
    // Chýbajúce údaje sa počítajú nanovo zo spojeného — druhý dokument ich
    // mohol doplniť. Výhrada o pohyblivej sadzbe sa z dokumentov prenáša.
    const pohyblive = dokumenty.flatMap((d) =>
      d.vyhrady.filter((v) => v.startsWith(VYHRADA_POHYBLIVA)),
    );
    k.vyhrady = [...new Set(pohyblive), ...vyhradyKontokorentu(k)];
    return k;
  }

  const spojena: PrecitanaZmluva = {
    kind: skalar("kind"),
    provider_name: skalar("provider_name"),
    contract_number: skalar("contract_number"),
    variable_symbol: skalar("variable_symbol"),
    currency: skalar("currency") ?? "EUR",
    principal: skalar("principal"),
    interest_rate: skalar("interest_rate"),
    term_months: riadky.length || skalar("term_months"),
    first_due_date: riadky[0]?.due_date ?? skalar("first_due_date"),
    interest_from: skalar("interest_from"),
    payment_amount: skalar("payment_amount") ?? riadky[0]?.amount ?? null,
    vat_rate: skalar("vat_rate"),
    down_payment: skalar("down_payment"),
    residual_value: skalar("residual_value"),
    credit_limit: null,
    limit_fee_yearly: null,
    valid_until: null,
    interest_period: null,
    account_iban: skalar("account_iban"),
    note: skalar("note"),
    ...pohyblivaZoSpojenych(dokumenty),
    day_count: skalar("day_count"),
    splatky: riadky,
    vyhrady: [],
  };

  // Výhrady sa počítajú nanovo zo spojeného — tie z jednotlivých dokumentov
  // hovoria o tom, čo v nich chýbalo, a druhý dokument to práve doplnil.
  spojena.vyhrady = vyhradyKuKalendaru({
    principal: spojena.principal,
    splatky: riadky,
    term_months: null,
  });
  if (!spojena.first_due_date) {
    spojena.vyhrady.push(VYHRADA_BEZ_SPLATNOSTI);
  }
  return spojena;
}

/** Pohyblivú sadzbu berie celú z prvého dokumentu, ktorý ju má — polia sa nemiešajú. */
function pohyblivaZoSpojenych(dokumenty: PrecitanaZmluva[]): PohyblivaZOdpovede {
  const d = dokumenty.find((x) => x.rate_type === "pohybliva");
  if (!d) return PEVNA;
  return {
    rate_type: d.rate_type,
    reference_index: d.reference_index,
    rate_margin: d.rate_margin,
    index_floor: d.index_floor,
    fixing_rule: d.fixing_rule,
    fixing_offset_days: d.fixing_offset_days,
    rate_reset: d.rate_reset,
  };
}

/** Kontokorent nemá kalendár — všetko, čo k nemu patrí, je prázdne. */
function prazdnyKalendar(z: PrecitanaZmluva): PrecitanaZmluva {
  return {
    ...z,
    kind: "kontokorent",
    principal: null,
    term_months: null,
    first_due_date: null,
    interest_from: null,
    payment_amount: null,
    vat_rate: 0,
    down_payment: null,
    residual_value: null,
    variable_symbol: null,
    splatky: [],
  };
}

function vyhradyKontokorentu(z: PrecitanaZmluva): string[] {
  const v: string[] = [];
  if (!z.credit_limit) v.push("Úverový rámec (limit) sa v dokumente nenašiel — doplňte ho.");
  if (!z.account_iban) {
    v.push("Číslo účtu, ku ktorému je rámec, sa v dokumente nenašlo — vyberte účet ručne.");
  }
  if (z.interest_rate === null && z.rate_type !== "pohybliva") {
    v.push("Úroková sadzba sa v dokumente nenašla — doplňte ju.");
  }
  return v;
}

export function normalizujOdpoved(parsed: any): PrecitanaZmluva {
  const kind = rozpoznajDruh(parsed);
  const pohybliva = udajePohyblivej(parsed);
  const dayCount = konvenciaDni(parsed?.day_count);

  if (kind === "kontokorent") {
    const k = udajeKontokorentu(parsed, pohybliva);
    const zmluva = prazdnyKalendar({
      kind,
      provider_name: text(parsed?.provider_name),
      contract_number: text(parsed?.contract_number, 100),
      variable_symbol: null,
      currency: text(parsed?.currency, 3) ?? "EUR",
      principal: null,
      interest_rate: k.interest_rate,
      term_months: null,
      first_due_date: null,
      interest_from: null,
      payment_amount: null,
      vat_rate: 0,
      down_payment: null,
      residual_value: null,
      credit_limit: k.credit_limit,
      limit_fee_yearly: k.limit_fee_yearly,
      valid_until: datum(parsed?.valid_until),
      interest_period: obdobie(parsed?.interest_period),
      account_iban: iban(parsed?.account_iban),
      note: k.note,
      ...pohybliva,
      day_count: dayCount,
      splatky: [],
      vyhrady: [],
    });
    zmluva.vyhrady = [...k.vyhrady, ...vyhradyKontokorentu(zmluva)];
    return zmluva;
  }

  const riadky = normalizujSplatky(parsed?.splatky);
  const principal = cislo(parsed?.principal);
  const term = cislo(parsed?.term_months);

  const vyhradySadzby: string[] = [];
  const sadzbaUveru =
    cislo(parsed?.interest_rate) ?? sadzbaAPoznamka(parsed, pohybliva, vyhradySadzby).interest_rate;
  const zmluva: PrecitanaZmluva = {
    kind,
    provider_name: text(parsed?.provider_name),
    contract_number: text(parsed?.contract_number, 100),
    variable_symbol: text(parsed?.variable_symbol, 30),
    currency: text(parsed?.currency, 3) ?? "EUR",
    principal,
    interest_rate: sadzbaUveru,
    // Počet mesiacov z kalendára je spoľahlivejší než veta v zmluve.
    term_months: riadky.length || (term ? Math.round(term) : null),
    first_due_date: riadky[0]?.due_date ?? datum(parsed?.first_due_date),
    interest_from: datum(parsed?.interest_from),
    payment_amount: cislo(parsed?.payment_amount) ?? riadky[0]?.amount ?? null,
    vat_rate: cislo(parsed?.vat_rate),
    down_payment: cislo(parsed?.down_payment),
    residual_value: cislo(parsed?.residual_value),
    credit_limit: null,
    limit_fee_yearly: null,
    valid_until: null,
    interest_period: null,
    // Pri úvere sa nepoužije, ale pri spájaní dokumentov môže doplniť účet
    // kontokorentu, keď je IBAN len v druhom súbore.
    account_iban: iban(parsed?.account_iban),
    note: null,
    ...pohybliva,
    day_count: dayCount,
    splatky: riadky,
    vyhrady: [],
  };

  zmluva.vyhrady = [
    ...vyhradySadzby,
    ...vyhradyKuKalendaru({
      principal: zmluva.principal,
      splatky: riadky,
      term_months: term ? Math.round(term) : null,
    }),
  ];
  if (!zmluva.first_due_date) {
    zmluva.vyhrady.push(VYHRADA_BEZ_SPLATNOSTI);
  }
  return zmluva;
}

/** Prázdna odpoveď vyzerá ako úspech, ale nie je. */
export function jePouzitelna(z: PrecitanaZmluva): boolean {
  return !!z.principal || !!z.credit_limit || z.splatky.length > 0 || !!z.provider_name;
}
