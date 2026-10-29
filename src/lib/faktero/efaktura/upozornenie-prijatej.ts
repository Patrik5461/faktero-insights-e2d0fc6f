/*
  Upozornenie na prijatú eFaktúru — zvonček, počítadlo v menu, Moje úlohy
  a e-mail firme.

  Doklad doručený cez Peppol (ePošták) sa uloží do `efaktura_received_documents`
  a čaká, kým ho niekto zaeviduje ako prijatú faktúru. Kým nebolo toto
  upozornenie, nedozvedel sa o ňom nikto — v zvončeku ani v menu po ňom
  nebola stopa a človek musel sám otvoriť Prijaté eFaktúry.

  „Čaká na zaevidovanie“ znamená: nemá prijatú faktúru
  (`matched_supplier_invoice_id`), nie je zamietnutá ani archivovaná a nie je
  to samofaktúra — tú za nás vyhotovil odberateľ, je to naša vydaná faktúra
  a medzi prijaté sa zaevidovať nedá, takže by v počítadle visela navždy.

  Tento súbor je čistý (žiadny serverový kód) — berie ho menu v prehliadači,
  appka aj server.
*/

import { escHtml } from "@/lib/bezpecny-text";
import { formatujMenu } from "../mena";
import type { AppNotification } from "../notifications";

export const CESTA_PRIJATYCH_EFAKTUR = "/efaktura/prijate";

/** Stavy, v ktorých doklad ešte nikto nevybavil. */
export const STAVY_NA_ZAEVIDOVANIE = ["received", "parsed"] as const;

const SAMOFAKTURY = ["self_billing", "self_billing_credit_note"];

/** Od koľkých eFaktúr sa v zvončeku zlúčia do jednej položky. */
export const ZLUCIT_OD = 3;

export type PrijataEfaktura = {
  id: string;
  sender_name: string | null;
  document_number: string | null;
  total: number | string | null;
  currency: string | null;
  received_at: string | null;
  status: string | null;
  matched_supplier_invoice_id: string | null;
  /** `parsed_data->>documentKind` (alias v `STLPCE_UPOZORNENIA`). */
  druh?: string | null;
};

/** Stĺpce, ktoré si upozornenie pýta (bez XML — to môže mať megabajty). */
export const STLPCE_UPOZORNENIA =
  "id, sender_name, document_number, total, currency, received_at, status, matched_supplier_invoice_id, druh:parsed_data->>documentKind";

export function cakaNaZaevidovanie(r: PrijataEfaktura): boolean {
  if (r.matched_supplier_invoice_id) return false;
  if (!(STAVY_NA_ZAEVIDOVANIE as readonly string[]).includes(String(r.status ?? ""))) return false;
  return !(r.druh && SAMOFAKTURY.includes(r.druh));
}

/**
 * Dotaz na nezaevidované eFaktúry firmy. Rovnaké podmienky ako
 * `cakaNaZaevidovanie`, len v PostgREST — nech menu, appka, Moje úlohy aj
 * zvonček počítajú to isté. Klienta dodá volajúci: v prehliadači prihlásený
 * (RLS a vlastný prístup), na serveri servisný.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dotazNezaevidovanych(
  supabase: any,
  companyId: string,
  stlpce: string,
  pocet = false,
) {
  return supabase
    .from("efaktura_received_documents")
    .select(stlpce, pocet ? { count: "exact", head: true } : undefined)
    .eq("company_id", companyId)
    .is("matched_supplier_invoice_id", null)
    .in("status", [...STAVY_NA_ZAEVIDOVANIE])
    .or(
      `parsed_data->>documentKind.is.null,parsed_data->>documentKind.not.in.(${SAMOFAKTURY.join(",")})`,
    );
}

function suma(r: PrijataEfaktura): string {
  const n = r.total == null || r.total === "" ? NaN : Number(r.total);
  return Number.isFinite(n) ? formatujMenu(n, r.currency || "EUR") : "—";
}

/** „3 nové eFaktúry“ / „5 nových eFaktúr“ — šablóna pre `t()`. */
export function nadpisZluceny(n: number): string {
  return n >= 2 && n <= 4 ? "{n} nové eFaktúry" : "{n} nových eFaktúr";
}

/**
 * Notifikácie zvončeka z prijatých eFaktúr.
 *
 * Každá eFaktúra má vlastný kľúč `efaktura_prijata:<id>`. Keď ich je
 * `ZLUCIT_OD` a viac, ukáže sa jedna položka, ktorá si pamätá kľúče svojich
 * členov (`kluceClenov`) — prečítaná je, keď sú prečítaní všetci. Takto sa
 * nevráti ako nová, keď jednu z nich niekto zaeviduje, a ozve sa znova, len
 * keď pribudne ďalšia.
 */
export function notifikacieEfaktur(riadky: PrijataEfaktura[], dnes: string): AppNotification[] {
  const cakajuce = riadky
    .filter(cakaNaZaevidovanie)
    .sort((a, b) => String(b.received_at ?? "").localeCompare(String(a.received_at ?? "")));
  if (!cakajuce.length) return [];

  const datum = (r: PrijataEfaktura) => String(r.received_at ?? "").slice(0, 10) || dnes;
  const jednotlive = cakajuce.map<AppNotification>((r) => ({
    key: `efaktura_prijata:${r.id}`,
    severity: "info",
    title: "Nová eFaktúra od {dodavatel} — {cislo}, {suma}",
    detail: "Zaevidujte ju v Prijatých eFaktúrach.",
    params: {
      dodavatel: r.sender_name?.trim() || "neznámeho dodávateľa",
      cislo: r.document_number?.trim() || "bez čísla",
      suma: suma(r),
    },
    to: CESTA_PRIJATYCH_EFAKTUR,
    // Priamo na doklad: zoznam sa otvorí vyhľadaný podľa čísla eFaktúry.
    search: r.document_number?.trim() ? { q: r.document_number.trim() } : undefined,
    date: datum(r),
  }));
  if (cakajuce.length < ZLUCIT_OD) return jednotlive;

  const najnovsia = cakajuce[0]!;
  const dodavatelia = [...new Set(cakajuce.map((r) => r.sender_name?.trim()).filter(Boolean))];
  return [
    {
      key: `efaktury_prijate:${najnovsia.id}`,
      severity: "info",
      title: nadpisZluceny(cakajuce.length),
      detail:
        dodavatelia.length > 2
          ? "Od {prvy}, {druhy} a ďalších — čakajú na zaevidovanie."
          : dodavatelia.length === 2
            ? "Od {prvy} a {druhy} — čakajú na zaevidovanie."
            : dodavatelia.length === 1
              ? "Od {prvy} — čakajú na zaevidovanie."
              : "Čakajú na zaevidovanie v Prijatých eFaktúrach.",
      params: {
        n: cakajuce.length,
        prvy: dodavatelia[0] ?? "",
        druhy: dodavatelia[1] ?? "",
      },
      to: CESTA_PRIJATYCH_EFAKTUR,
      date: datum(najnovsia),
      kluceClenov: jednotlive.map((n) => n.key),
    },
  ];
}

/** Riadok do e-mailu: „SFC, s.r.o. — 20260001, 1,23 €“. */
export function riadokEmailu(r: PrijataEfaktura): string {
  return `${r.sender_name?.trim() || "Neznámy dodávateľ"} — ${r.document_number?.trim() || "bez čísla"}, ${suma(r)}`;
}

/** Predmet e-mailu firme. Bez mena dodávateľa — to je cudzí text a predmet kontroluje strážca odosielania. */
export function predmetEmailu(n: number, firma: string | null): string {
  const kto = firma?.trim() ? ` — ${firma.trim()}` : "";
  if (n === 1) return `Prišla vám eFaktúra${kto}`;
  return n >= 2 && n <= 4 ? `Prišli vám ${n} eFaktúry${kto}` : `Prišlo vám ${n} eFaktúr${kto}`;
}

/** Najviac toľko eFaktúr sa v e-maile vypíše po jednej, zvyšok ako „…a ďalšie“. */
const V_EMAILE_NAJVIAC = 10;

/**
 * E-mail firme o prijatých eFaktúrach. Meno dodávateľa a číslo sú text
 * odosielateľa eFaktúry — do HTML idú len cez `escHtml`.
 */
export function zostavEmailPrijatych(v: {
  firma: string | null;
  riadky: PrijataEfaktura[];
  odkaz: string;
  odkazNastavenia: string;
}): { predmet: string; text: string; html: string } {
  const n = v.riadky.length;
  const vypis = v.riadky.slice(0, V_EMAILE_NAJVIAC).map(riadokEmailu);
  const zvysok = n - vypis.length;
  const uvod =
    n === 1
      ? "do Faktera vám cez sieť Peppol prišla nová eFaktúra:"
      : `do Faktera vám cez sieť Peppol prišli nové eFaktúry (${n}):`;
  const vyzva =
    n === 1
      ? "Zaevidujte ju v Prijatých eFaktúrach — jedným klikom z nej bude prijatá faktúra."
      : "Zaevidujte ich v Prijatých eFaktúrach — jedným klikom z nich budú prijaté faktúry.";
  const text = [
    "Dobrý deň,",
    "",
    uvod,
    "",
    ...vypis.map((r) => `• ${r}`),
    ...(zvysok > 0 ? [`• …a ďalšie (${zvysok})`] : []),
    "",
    vyzva,
    v.odkaz,
    "",
    `Tieto upozornenia vypnete v nastaveniach firmy (časť E-mail): ${v.odkazNastavenia}`,
    "",
    "Faktero",
  ].join("\n");
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.55;color:#111;max-width:560px">
      <p>Dobrý deň,</p>
      <p>${escHtml(uvod)}</p>
      <ul style="padding-left:18px;margin:0 0 12px">${vypis.map((r) => `<li>${escHtml(r)}</li>`).join("")}${
        zvysok > 0 ? `<li>…a ďalšie (${zvysok})</li>` : ""
      }</ul>
      <p>${escHtml(vyzva)}</p>
      <p><a href="${escHtml(v.odkaz)}" style="background:#12734f;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Otvoriť Prijaté eFaktúry</a></p>
      <p style="color:#555;font-size:12px">Tieto upozornenia vypnete v <a href="${escHtml(v.odkazNastavenia)}" style="color:#555">nastaveniach firmy</a> (časť E-mail).<br/>Faktero</p>
    </div>`;
  return { predmet: predmetEmailu(n, v.firma), text, html };
}
