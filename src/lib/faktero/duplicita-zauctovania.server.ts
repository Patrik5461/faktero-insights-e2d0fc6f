/*
  Hľadanie duplicít v databáze pre pravidlo z `duplicita-zauctovania.ts`.

  Kandidáti sa vyberajú úzko (číslo či IČO pri faktúrach, QR či deň pri
  bločkoch), o zhode rozhoduje čistá funkcia `suDuplicitne`. Funguje s
  klientom prihláseného (RLS) aj so servisným kľúčom (automat, konektor) —
  vždy sa filtruje podľa firmy.
*/
import {
  chybaUlozenejPrijatej,
  duplicityDokladu,
  moznaDuplicita,
  naPorovnanie,
  suDuplicitne,
  textDuplicity,
  type DruhDuplicity,
  type Duplicita,
} from "./duplicita-zauctovania";
import { poDavkach, riadkyPreIds } from "./strankovanie";

type Klient = any;
type Riadok = Record<string, any>;

const STLPCE: Record<DruhDuplicity, string> = {
  prijata:
    "id, company_id, invoice_number, type, status, supplier_ico, supplier_name, amount_total, currency, issue_date, opravuje_cislo, opravuje_id, deleted_at, zauctovane_at, exported_at",
  blocek:
    "id, company_id, document_number, status, supplier_ico, supplier_name, total_amount, currency, issue_date, qr_raw, zauctovane_at, exported_at",
};

const neprazdne = (xs: unknown[]) =>
  [...new Set(xs.map((x) => String(x ?? "").trim()).filter(Boolean))];

/** Doklady firmy, medzi ktorými môžu byť duplicity zadaných riadkov. */
export async function kandidatiDuplicit(
  sb: Klient,
  companyId: string,
  druh: DruhDuplicity,
  riadky: Riadok[],
): Promise<Riadok[]> {
  const out = new Map<string, Riadok>();
  const pridaj = (rs: Riadok[]) => {
    for (const r of rs ?? []) if (r?.id) out.set(r.id, r);
  };
  if (druh === "prijata") {
    const cisla = neprazdne(riadky.map((r) => r.invoice_number));
    const ica = neprazdne(riadky.map((r) => r.supplier_ico));
    const [podlaCisla, podlaIco] = await Promise.all([
      cisla.length
        ? poDavkach(cisla, (kus) =>
            sb
              .from("purchase_invoices")
              .select(STLPCE.prijata)
              .eq("company_id", companyId)
              .is("deleted_at", null)
              .in("invoice_number", kus),
          )
        : Promise.resolve([]),
      // Číslo zapísané inak (nuly, pomlčky) — kandidáti od toho istého dodávateľa.
      ica.length
        ? riadkyPreIds(ica, (kus, od, po) =>
            sb
              .from("purchase_invoices")
              .select(STLPCE.prijata)
              .eq("company_id", companyId)
              .is("deleted_at", null)
              .in("supplier_ico", kus)
              .order("id")
              .range(od, po),
          )
        : Promise.resolve([]),
    ]);
    pridaj(podlaCisla);
    pridaj(podlaIco);
  } else {
    const qr = neprazdne(riadky.map((r) => r.qr_raw));
    const dni = neprazdne(riadky.map((r) => String(r.issue_date ?? "").slice(0, 10)));
    const [podlaQr, podlaDna] = await Promise.all([
      qr.length
        ? poDavkach(
            qr,
            (kus) =>
              sb.from("expense_documents").select(STLPCE.blocek).eq("company_id", companyId).in("qr_raw", kus),
            50,
          )
        : Promise.resolve([]),
      dni.length
        ? riadkyPreIds(dni, (kus, od, po) =>
            sb
              .from("expense_documents")
              .select(STLPCE.blocek)
              .eq("company_id", companyId)
              .in("issue_date", kus)
              .order("id")
              .range(od, po),
          )
        : Promise.resolve([]),
    ]);
    pridaj(podlaQr);
    pridaj(podlaDna);
  }
  return [...out.values()];
}

/**
 * Duplicity zadaných dokladov (id → druhé doklady). Doklad bez duplicity v
 * mape nie je. Riadky musia niesť stĺpce z `STLPCE` (stačí `select("*")`).
 */
export async function duplicityDokladov(
  sb: Klient,
  companyId: string,
  druh: DruhDuplicity,
  riadky: Riadok[],
): Promise<Map<string, Duplicita[]>> {
  const out = new Map<string, Duplicita[]>();
  if (!riadky.length) return out;
  const kandidati = (await kandidatiDuplicit(sb, companyId, druh, riadky)).map((r) =>
    naPorovnanie(druh, r),
  );
  for (const r of riadky) {
    const d = duplicityDokladu(naPorovnanie(druh, r), kandidati);
    if (d.length) out.set(String(r.id), d);
  }
  return out;
}

/**
 * Pre kontrolu pred Pohodou: riadkom s duplicitou dopíše `_duplicita` (text
 * hlášky), ktorý `prekazkaDokladu` zastaví. Vracia tie isté riadky.
 */
export async function oznacDuplicity<T extends Riadok>(
  sb: Klient,
  companyId: string,
  druh: DruhDuplicity,
  riadky: T[],
): Promise<T[]> {
  if (!riadky.length) return riadky;
  const mapa = await duplicityDokladov(sb, companyId, druh, riadky);
  for (const r of riadky) (r as Riadok)._duplicita = textDuplicity(mapa.get(String(r.id)) ?? []);
  return riadky;
}

/**
 * Už uložený bloček, ktorý je ten istý ako `blocek` (null = žiadny). Pred
 * zápisom nového bločku — duplicitný sa neuloží.
 */
export async function najdiUlozenyBlocek(
  sb: Klient,
  companyId: string,
  blocek: Riadok,
  vylucitId?: string | null,
): Promise<Riadok | null> {
  const novy = naPorovnanie("blocek", { ...blocek, id: blocek.id ?? "novy-blocek" });
  const kandidati = await kandidatiDuplicit(sb, companyId, "blocek", [blocek]);
  return (
    kandidati.find(
      (k) => k.id !== vylucitId && k.id !== blocek.id && suDuplicitne(novy, naPorovnanie("blocek", k)),
    ) ?? null
  );
}

export type VynechanaDuplicita = { id: string; cislo: string; druhe: Duplicita[] };

/**
 * Rozdelí doklady na zaúčtovania schopné a duplicitné — jedno miesto pre
 * zaúčtovanie jednotlivo aj hromadne. `preskocene` sú „číslo: dôvod“ ako
 * ostatné vynechané doklady.
 */
export async function vynechajDuplicity(
  sb: Klient,
  companyId: string,
  druh: DruhDuplicity,
  riadky: Riadok[],
): Promise<{ ok: string[]; duplicity: VynechanaDuplicita[]; preskocene: string[] }> {
  const mapa = await duplicityDokladov(sb, companyId, druh, riadky);
  const duplicity: VynechanaDuplicita[] = [];
  const preskocene: string[] = [];
  for (const r of riadky) {
    const druhe = mapa.get(String(r.id));
    if (!druhe) continue;
    const cislo = String(
      (druh === "prijata" ? r.invoice_number : r.document_number || r.supplier_name) || "doklad",
    );
    duplicity.push({ id: String(r.id), cislo, druhe });
    preskocene.push(`${cislo}: ${textDuplicity(druhe)}`);
  }
  return { ok: riadky.map((r) => String(r.id)).filter((x) => !mapa.has(x)), duplicity, preskocene };
}

/**
 * Už uložená prijatá faktúra, ktorá je tá istá ako `faktura` (`blok` —
 * nesmie sa uložiť), alebo len s rovnakým číslom od toho istého dodávateľa
 * (`mozna` — iná suma či rok, uloží sa po potvrdení). `vylucitId` = upravovaná.
 */
export async function najdiUlozenuPrijatu(
  sb: Klient,
  companyId: string,
  faktura: Riadok,
  vylucitId?: string | null,
): Promise<{ blok: Riadok | null; mozna: Riadok | null }> {
  const novy = naPorovnanie("prijata", {
    status: "received",
    ...faktura,
    deleted_at: null,
    id: vylucitId || faktura.id || "nova-prijata",
  });
  if (!novy.cislo) return { blok: null, mozna: null };
  const kandidati = (await kandidatiDuplicit(sb, companyId, "prijata", [faktura])).filter(
    (k) => k.id !== novy.id && (!vylucitId || k.id !== vylucitId),
  );
  // Zaúčtovaná či odovzdaná navrch — odkaz ukáže tú, ktorá platí.
  kandidati.sort((x, y) => Number(Boolean(y.exported_at || y.zauctovane_at)) - Number(Boolean(x.exported_at || x.zauctovane_at)));
  const blok = kandidati.find((k) => suDuplicitne(novy, naPorovnanie("prijata", k))) ?? null;
  const mozna = blok ? null : (kandidati.find((k) => moznaDuplicita(novy, naPorovnanie("prijata", k))) ?? null);
  return { blok, mozna };
}

/**
 * Pred zápisom prijatej faktúry: duplicitu odmietne vždy, možnú duplicitu
 * (iná suma či rok), kým ju človek nepotvrdí (`ajMoznu`). Chyby nesú
 * predpony, podľa ktorých rozhranie ukáže odkaz alebo potvrdenie.
 */
export async function overUlozeniePrijatej(
  sb: Klient,
  companyId: string,
  faktura: Riadok,
  volby: { vylucitId?: string | null; ajMoznu?: boolean } = {},
): Promise<void> {
  const { blok, mozna } = await najdiUlozenuPrijatu(sb, companyId, faktura, volby.vylucitId);
  if (blok) throw new Error(chybaUlozenejPrijatej(blok));
  if (mozna && !volby.ajMoznu) {
    const { PREDPONA_DUPLICITY } = await import("./prijate-duplicity");
    const { textMoznejDuplicity } = await import("./duplicita-zauctovania");
    throw new Error(`${PREDPONA_DUPLICITY}${textMoznejDuplicity(mozna)}`);
  }
}
