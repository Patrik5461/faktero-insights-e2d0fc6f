/**
 * Databázové funkcie (RPC) v demo vrstve — prepis tých, ktoré web volá.
 * Funkcia, ktorá tu nie je, vráti `null` a zapíše varovanie do konzoly
 * preview servera (`[demo] RPC „…" nie je v demo vrstve`).
 *
 * Výpočty sú prepísané zo SQL v `supabase/migrations` (uvedené pri funkcii),
 * aby demo súčty sedeli s tým, čo by vrátila skutočná databáza.
 */
import type { DemoDb, KontextPoziadavky, Riadok } from "./db";
import { dnes } from "./db";
import type { RpcObsluha } from "./postgrest";
import { suhrnVystavenychFaktur } from "./rpc-faktury";

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const dni = (a: string, b: string) =>
  Math.round((Date.parse(a.slice(0, 10) + "T00:00:00Z") - Date.parse(b.slice(0, 10) + "T00:00:00Z")) / 86400000);

function clenstvo(db: DemoDb, k: KontextPoziadavky, firma: string | undefined) {
  return db.tabulka("company_users").find((c) => c.user_id === k.pouzivatel && c.company_id === firma);
}

function posunMesiac(datum: string, mesiacov: number): string {
  const d = new Date(datum.slice(0, 10) + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + mesiacov);
  return d.toISOString().slice(0, 10);
}

/** Prepis `prehlad_suhrn` (migrácia 20261031140041). */
function prehladSuhrn(a: Record<string, any>, db: DemoDb) {
  const firma = a.p_company_id;
  const pDnes: string = a.p_dnes ?? dnes();
  const mena: string = a.p_mena ?? "EUR";
  const mesOd = pDnes.slice(0, 8) + "01";
  const minOd = posunMesiac(mesOd, -1);
  const rokOd = pDnes.slice(0, 4) + "-01-01";
  const fakOd = posunMesiac(pDnes, -13);
  const kos = (due: string | null) => {
    if (!due) return 0;
    const n = dni(pDnes, due);
    return n <= 0 ? 0 : n <= 30 ? 1 : n <= 60 ? 2 : n <= 90 ? 3 : 4;
  };
  const fakt = db
    .tabulka("invoices")
    .filter((i) => i.company_id === firma && !i.deleted_at && i.issue_date >= fakOd)
    .map((i): Riadok => {
      const cudzia = (i.currency || mena) !== mena && i.total_eur != null;
      const celkom = Number(cudzia ? i.total_eur : i.total) || 0;
      const zaklad = Number(cudzia ? (i.subtotal_eur ?? i.subtotal) : i.subtotal) || 0;
      const dph = Number(cudzia ? (i.vat_total_eur ?? i.vat_total) : i.vat_total) || 0;
      const typ = String(i.type);
      const stav = String(i.status);
      const zap = !["draft", "cancelled"].includes(stav) && !["proforma", "advance_payment"].includes(typ);
      const zn = typ === "credit_note" && !(celkom < 0) ? -1 : 1;
      const otv = zap && typ !== "credit_note" && !i.paid_at && stav !== "paid";
      const poSpl = otv && !!i.due_date && i.due_date < pDnes;
      return { ...i, typ, stav, celkom, zaklad, dph, zap, zn, otv, poSpl, kos: kos(i.due_date) };
    });
  const pi = db.tabulka("purchase_invoices").filter((p) => p.company_id === firma && !p.deleted_at);
  const zuctovaneZalohy = new Set(pi.map((p) => p.advance_invoice_id).filter(Boolean));
  const pd = pi
    .filter((p) => !(p.type === "proforma" && zuctovaneZalohy.has(p.id)))
    .map((p): Riadok => {
      const cudzia = (p.currency || mena) !== mena && p.amount_without_vat_eur != null;
      const celkomD = cudzia
        ? Number(p.amount_without_vat_eur) + Number(p.vat_amount_eur ?? 0)
        : Number(p.amount_total) || 0;
      return { ...p, celkomD, kos: kos(p.due_date) };
    });
  const sum = (xs: number[]) => r2(xs.reduce((s, x) => s + x, 0));
  const stavy: Record<string, number> = {};
  for (const f of fakt) {
    const k = f.poSpl ? "overdue" : f.stav;
    stavy[k] = (stavy[k] ?? 0) + 1;
  }
  const dlzniciMapa = new Map<string, number>();
  for (const f of fakt.filter((x) => x.otv)) {
    const k = f.customer_name ?? "";
    dlzniciMapa.set(k, (dlzniciMapa.get(k) ?? 0) + f.celkom);
  }
  const dlznici = [...dlzniciMapa.entries()]
    .sort((a2, b) => b[1] - a2[1])
    .slice(0, 4)
    .map(([meno, suma]) => ({ meno, suma: r2(suma) }));
  const vek = (rows: { kos: number; s: number }[]) =>
    [0, 1, 2, 3, 4].map((k) => {
      const x = rows.filter((r) => r.kos === k);
      return { pocet: x.length, suma: sum(x.map((r) => r.s)) };
    });
  const zavazkyOtv = pd.filter((p) => ["received", "booked"].includes(p.status) && p.due_date);
  const zaplatene = fakt.filter((f) => f.stav === "paid" && f.paid_at && f.issue_date);
  const api = db.tabulka("api_logs").filter((l) => l.company_id === firma);
  const pred31 = new Date(Date.now() - 31 * 86400000).toISOString();
  const pdRok = pd.filter(
    (p) => p.type !== "proforma" && p.status !== "cancelled" && (p.delivery_date ?? p.issue_date) >= rokOd,
  );
  const stockItems = db.tabulka("stock_items").filter((s) => s.company_id === firma && s.track_stock);
  const levels = db.tabulka("stock_levels");
  return {
    pocet_faktur: fakt.length,
    ma_zaplatenu: fakt.some((f) => f.stav === "paid"),
    mesiac_obrat: sum(fakt.filter((f) => f.zap && f.issue_date >= mesOd).map((f) => f.zn * f.celkom)),
    minuly_obrat: sum(fakt.filter((f) => f.zap && f.issue_date >= minOd && f.issue_date < mesOd).map((f) => f.zn * f.celkom)),
    neuhradene_suma: sum(fakt.filter((f) => f.otv).map((f) => f.zn * f.celkom)),
    neuhradene_pocet: fakt.filter((f) => f.otv).length,
    po_splatnosti_suma: sum(fakt.filter((f) => f.poSpl).map((f) => f.zn * f.celkom)),
    po_splatnosti_pocet: fakt.filter((f) => f.poSpl).length,
    dlznikov: new Set(fakt.filter((f) => f.otv).map((f) => f.customer_id ?? f.customer_name)).size,
    priemer_dni_uhrady: zaplatene.length
      ? zaplatene.reduce((s, f) => s + (Date.parse(f.paid_at) - Date.parse(f.issue_date + "T00:00:00Z")) / 86400000, 0) /
        zaplatene.length
      : null,
    dph_odvod: sum(fakt.filter((f) => f.zap && f.issue_date >= rokOd).map((f) => f.zn * f.dph)),
    prijmy_rok: sum(fakt.filter((f) => f.zap && f.issue_date >= rokOd).map((f) => f.zn * f.zaklad)),
    trzby_365: sum(fakt.filter((f) => f.zap && dni(pDnes, f.issue_date) <= 365).map((f) => f.zn * f.celkom)),
    stavy,
    dlznici,
    vek_pohladavok: vek(fakt.filter((f) => f.otv && f.due_date).map((f) => ({ kos: f.kos, s: f.celkom }))),
    vek_zavazkov: vek(zavazkyOtv.map((p) => ({ kos: p.kos, s: p.celkomD }))),
    vyhlad: [0, 1, 2, 3].map((w) => ({
      prijem: sum(
        fakt
          .filter((f) => f.otv && f.due_date && dni(f.due_date, pDnes) >= 7 * w && dni(f.due_date, pDnes) < 7 * (w + 1))
          .map((f) => f.celkom),
      ),
      vydaj: sum(
        zavazkyOtv
          .filter((p) => dni(p.due_date, pDnes) >= 7 * w && dni(p.due_date, pDnes) < 7 * (w + 1))
          .map((p) => p.celkomD),
      ),
    })),
    zaplatene_30: sum(
      db
        .tabulka("payments")
        .filter((p) => p.company_id === firma && Date.parse(p.paid_at) >= Date.now() - 30 * 86400000)
        .map((p) => Number(p.amount) || 0),
    ),
    zavazky_neuhradene: sum(pd.filter((p) => !["paid", "cancelled", "draft"].includes(p.status)).map((p) => p.celkomD)),
    zavazky_po_splatnosti: pd.filter((p) => !["paid", "cancelled", "draft"].includes(p.status) && p.due_date && p.due_date < pDnes).length,
    zavazky_pocet: pd.length,
    dph_odpocet: sum(pdRok.filter((p) => p.odpocet !== false).map((p) => Number(p.vat_amount_eur ?? p.vat_amount ?? 0))),
    vydavky_rok: sum(pdRok.map((p) => Number(p.amount_without_vat_eur ?? p.amount_without_vat ?? 0))),
    sklad_pod_minimom: stockItems.filter(
      (s) =>
        levels.filter((l) => l.stock_item_id === s.id).reduce((x, l) => x + Number(l.quantity || 0), 0) <
        Number(s.min_stock || 0),
    ).length,
    km_mesiac: r2(
      db
        .tabulka("trips")
        .filter((t) => t.company_id === firma && t.trip_date >= mesOd)
        .reduce((s, t) => s + Number(t.distance_km || 0), 0),
    ),
    api_dnes: api.filter((l) => l.created_at >= (a.p_dnes_od ?? pDnes)).length,
    api_mesiac: api.filter((l) => l.created_at >= pred31).length,
    api_uspesne: api.filter((l) => l.created_at >= pred31 && l.status >= 200 && l.status < 400).length,
  };
}

/** Ďalšie číslo dokladu — formát `{YYYY}{NNNN}` alebo z číselného radu. */
function dalsieCislo(db: DemoDb, firma: string, druh: string, seriaId: string | null, datum: string) {
  const rad = db
    .tabulka("number_series")
    .find((s) => s.company_id === firma && (seriaId ? s.id === seriaId : s.kind === druh && s.is_default));
  const rok = (datum || dnes()).slice(0, 4);
  const format: string = rad?.format ?? (rad?.prefix ? `${rad.prefix}{YYYY}{NNNN}` : "{YYYY}{NNNN}");
  const tabulky: Record<string, [string, string]> = {
    invoice: ["invoices", "invoice_number"],
    quote: ["quotes", "quote_number"],
    sales_order: ["sales_orders", "order_number"],
    purchase_order: ["purchase_orders", "order_number"],
  };
  const [tab, stlpec] = tabulky[druh] ?? ["invoices", "invoice_number"];
  const existujuce = new Set(db.tabulka(tab).filter((r) => r.company_id === firma).map((r) => String(r[stlpec])));
  for (let n = Number(rad?.start_from ?? 1); n < 100000; n++) {
    const cislo = format
      .replace("{YYYY}", rok)
      .replace("{YY}", rok.slice(2))
      .replace(/\{N+\}/, (m) => String(n).padStart(m.length - 2, "0"));
    if (!existujuce.has(cislo)) return { number: cislo, invoice_number: cislo, series_id: rad?.id ?? null };
  }
  return { number: `${rok}9999`, invoice_number: `${rok}9999`, series_id: rad?.id ?? null };
}

export const RPC: Record<string, RpcObsluha> = {
  stav_relacie: () => ({ aktivna: true, mfa_ok: true }),
  is_platform_admin: () => false,
  is_company_member: (a, db, k) => k.servis || !!clenstvo(db, k, a._company_id ?? a.company_id),
  is_company_admin: (a, db, k) =>
    ["owner", "admin"].includes(clenstvo(db, k, a._company_id ?? a.company_id)?.role ?? ""),
  faktero_can_write: () => true,
  get_company_role: (a, db) =>
    db.tabulka("company_users").find((c) => c.company_id === a._company_id && c.user_id === a._user_id)?.role ?? null,
  firmy_s_pravom: (_a, db, k) =>
    db
      .tabulka("company_users")
      .filter((c) => c.user_id === k.pouzivatel)
      .map((c) => c.company_id),
  faktero_stav_prihlaseni: (a, db) =>
    ((a._ids as string[]) ?? []).map((id) => ({
      id,
      banned_until: null,
      email_confirmed_at: "2025-01-15T08:00:00Z",
      last_sign_in_at: new Date(Date.now() - 3600000).toISOString(),
    })),
  prehlad_suhrn: (a, db) => prehladSuhrn(a, db),
  suhrn_vystavenych_faktur: (a, db) => suhrnVystavenychFaktur(a, db),
  faktero_next_invoice_number: (a, db) =>
    dalsieCislo(db, a._company_id, a._type === "proforma" ? "proforma" : "invoice", a._series_id ?? null, a._issue_date),
  faktero_next_series_number: (a, db) => dalsieCislo(db, a._company_id, a._kind, a._series_id ?? null, a._date ?? dnes()),
  faktero_reserve_invoice_numbers: () => [],
  faktero_release_invoice_numbers: () => null,
  faktero_recurring_cron_status: () => ({ last_run: new Date(Date.now() - 3600000).toISOString(), ok: true }),
  faktero_invoice_pdf_hash: () => "demo",
  employee_pii_present: () => true,
  employee_get_pii: () => ({ birth_number: "XXXXXX/XXXX", id_card_number: "DEMO000000" }),
  employee_set_pii: () => null,
  employee_log_access: () => null,
  employee_log_export: () => null,
  hladaj_colne_kody: (a) =>
    [
      { kod: "84713000", popis: "Prenosné počítače (demo)", rok: 2026 },
      { kod: "94033011", popis: "Kancelársky nábytok (demo)", rok: 2026 },
    ].filter((x) => !a._q || x.popis.toLowerCase().includes(String(a._q).toLowerCase()) || x.kod.startsWith(String(a._q))),
  recompute_stock_avg_cost: () => null,
  uplatni_pravidla_uctovania: () => 0,
  faktero_vybav_pohyby_pravidlami: () => 0,
  odosielanie_rezervuj: () => ({ ok: true }),
  odosielanie_zapis_blok: () => null,
  zapis_systemovu_chybu: () => null,
  pouzivatel_podla_emailu: () => null,
  ai_pouzitie_suhrn: () => [],
  create_company_with_owner: () => null,
  faktero_zmaz_firmu: () => null,
};

/** Pomocník pre dáta — prehľad súčtov rovnakým výpočtom ako dashboard. */
export const _prehladSuhrn = prehladSuhrn as (a: Record<string, any>, db: DemoDb) => Riadok;

/**
 * Doplnenie RPC z modulu demo dát (`preview/data/<agenda>.ts`), aby moduly
 * nemuseli meniť tento súbor: `registrujRpc("nazov", (args, db, k) => …)`.
 */
export function registrujRpc(meno: string, f: RpcObsluha) {
  RPC[meno] = f;
}
