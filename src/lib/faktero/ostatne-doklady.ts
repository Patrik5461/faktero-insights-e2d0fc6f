/*
  Ostatné doklady — listy, predpisy, exekúcie, zmluvy a ďalšie podklady pre
  účtovníka, ktoré nie sú faktúra ani bloček. Neúčtujú sa automaticky (do
  Pohody nejdú), ale účtovník z nich účtuje, tak ich musí vidieť a odkliknúť.
*/

import { cislo, datum } from "./mail-prijem";

export const DRUHY_OSTATNYCH = [
  { kluc: "exekucia", nazov: "Exekúcia" },
  { kluc: "poistovna", nazov: "Poisťovňa — predpis" },
  { kluc: "danovy_urad", nazov: "Daňový úrad" },
  { kluc: "socialna_zdravotna", nazov: "Sociálna / zdravotná poisťovňa" },
  { kluc: "zmluva", nazov: "Zmluva" },
  { kluc: "leasing_uver", nazov: "Leasing a úver" },
  { kluc: "uradny_list", nazov: "Úradný list" },
  { kluc: "ine", nazov: "Iné" },
] as const;

export type DruhOstatneho = (typeof DRUHY_OSTATNYCH)[number]["kluc"];

export const DRUHY_KLUCE = DRUHY_OSTATNYCH.map((d) => d.kluc) as [DruhOstatneho, ...DruhOstatneho[]];

export function nazovDruhu(kluc: string | null | undefined): string {
  return DRUHY_OSTATNYCH.find((d) => d.kluc === kluc)?.nazov ?? "Iné";
}

/** Najviac 20 MB na súbor — rovnako ako strop kbelíka `other-docs`. */
export const MAX_VELKOST_PRILOHY = 20 * 1024 * 1024;

export const POVOLENE_TYPY_PRILOH = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"];

/**
 * Meno súboru do cesty v úložisku: bez diakritiky, medzier a lomiek. Pôvodné
 * meno sa pamätá zvlášť, človek ho uvidí nezmenené.
 */
export function bezpecneMeno(meno: string): string {
  const cisty = meno
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+/, "");
  return (cisty || "subor").slice(-100);
}

/** Cesta prílohy musí ležať v priečinku firmy a dokladu, inak ju server odmietne. */
export function jeCestaDokladu(path: string, companyId: string, documentId: string): boolean {
  const casti = path.split("/");
  return (
    casti.length === 3 &&
    casti[0] === companyId &&
    casti[1] === documentId &&
    casti[2].length > 0 &&
    !casti[2].includes("..")
  );
}

/** Lehota, ktorá už uplynula alebo príde do 7 dní — v zozname sa zvýrazní. */
export function stavLehoty(dueDate: string | null | undefined, dnes: string): "po" | "blizko" | null {
  if (!dueDate) return null;
  if (dueDate < dnes) return "po";
  const o7 = new Date(`${dnes}T00:00:00Z`);
  o7.setUTCDate(o7.getUTCDate() + 7);
  return dueDate <= o7.toISOString().slice(0, 10) ? "blizko" : null;
}


/** Čo AI prečítala z ostatného dokladu — už uprataté na hodnoty pre formulár. */
export type RozpoznanyOstatny = {
  kind: DruhOstatneho;
  sender: string | null;
  subject: string | null;
  document_date: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null;
  summary: string | null;
};

function textAI(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || /^(null|n\/a|neuvedené|-)$/i.test(t)) return null;
  return t.slice(0, max);
}

/**
 * Uprace odpoveď modelu. Neznámy druh je „Iné“, suma a dátumy prejdú tými
 * istými pravidlami ako pri doklade z e-mailu — prázdny reťazec nikdy nesmie
 * skončiť v date stĺpci.
 */
export function normalizujRozpoznanie(raw: unknown): RozpoznanyOstatny {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = DRUHY_KLUCE.includes(r.kind as DruhOstatneho) ? (r.kind as DruhOstatneho) : "ine";
  const mena = textAI(r.currency, 3)?.toUpperCase() ?? null;
  return {
    kind,
    sender: textAI(r.sender, 255),
    subject: textAI(r.subject, 500),
    document_date: datum(r.document_date),
    amount: cislo(r.amount),
    currency: mena && /^[A-Z]{3}$/.test(mena) ? mena : null,
    due_date: datum(r.due_date),
    summary: textAI(r.summary, 1000),
  };
}

/** Rozpoznanie je na niečo, keď model našiel aspoň odosielateľa alebo predmet. */
export function jeRozpoznaniePouzitelne(r: RozpoznanyOstatny): boolean {
  return Boolean(r.sender || r.subject);
}

/**
 * Príloha z e-mailu je ostatný doklad, keď to model povedal výslovne. Pri
 * pochybnosti ostáva faktúrou — zapadnutá faktúra v ostatných dokladoch by
 * sa nezaplatila ani nezaúčtovala, kým ostatný doklad v prijatých faktúrach
 * si účtovník všimne.
 */
export function jeOstatnyZMailu(ai: Record<string, unknown> | null): boolean {
  return ai?.document_type === "ostatny";
}

/** Riadok ostatného dokladu z toho, čo AI prečítala z prílohy e-mailu. */
export function ostatnyZMailu(args: {
  ai: Record<string, unknown> | null;
  odosielatel: string | null;
  predmet: string | null;
  nazovSuboru: string | null;
  dnes: string;
}) {
  const ai = args.ai ?? {};
  const r = normalizujRozpoznanie({
    kind: ai.other_kind,
    sender: ai.supplier_name,
    subject: ai.other_subject,
    document_date: ai.issue_date,
    amount: ai.amount_total,
    currency: ai.currency,
    due_date: ai.other_due_date ?? ai.due_date,
    summary: ai.summary,
  });
  const zMailu = [
    args.odosielatel ? `Prišlo e-mailom od ${args.odosielatel}` : "Prišlo e-mailom",
    args.predmet ? `predmet „${args.predmet}“` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    kind: r.kind,
    sender: r.sender ?? args.odosielatel,
    subject: r.subject ?? args.predmet ?? args.nazovSuboru,
    received_date: args.dnes,
    amount: r.amount,
    currency: r.currency ?? "EUR",
    due_date: r.due_date,
    note: [r.summary, `${zMailu}.`].filter(Boolean).join("\n\n"),
  };
}
