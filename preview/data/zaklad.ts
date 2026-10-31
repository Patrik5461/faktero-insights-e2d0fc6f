/**
 * Základ demo dát: firmy, používatelia, členstvá, predplatné.
 *
 * - „Demo s.r.o.“ — hlavná firma so všetkými agendami (SK, platiteľ DPH),
 * - „Demo Česko s.r.o.“ — česká firma (CZK) pre české výkazy a texty,
 * - „Prázdna firma s.r.o.“ — bez dokladov, na prázdne stavy.
 */
import type { DemoDb } from "../server/db";
import { DEMO_UCTY } from "../server/ucty";
import { cas, den, uid } from "./pomocne";

export const FIRMA = uid("firma:demo");
export const FIRMA_CZ = uid("firma:cz");
export const FIRMA_PRAZDNA = uid("firma:prazdna");
export const MAJITEL = DEMO_UCTY[0].id;
export const UCTOVNIK = DEMO_UCTY[1].id;
export const VLASTNY = DEMO_UCTY[2].id;

export function naplnZaklad(db: DemoDb) {
  db.vloz("profiles", [
    ...DEMO_UCTY.map((u, i) => ({
      id: u.id,
      email: u.email,
      full_name: u.meno,
      product_mode: "both",
      created_at: cas(-400 + i),
    })),
  ]);

  const spolocne = {
    email_sender_name: "Demo s.r.o.",
    invoice_footer: "Spoločnosť je zapísaná v Obchodnom registri Okresného súdu Demo, oddiel Sro, vložka č. 00000/X (vymyslené údaje).",
    uctovnik_email: "uctovnik@demo.faktero.sk",
  };
  db.vloz("companies", [
    {
      id: FIRMA,
      name: "Demo s.r.o.",
      ico: "00000001",
      dic: "2020000001",
      ic_dph: "SK2020000001",
      street: "Ukážková 12",
      city: "Bratislava",
      zip: "811 01",
      country: "SK",
      email: "fakturacia@demo-sro.example",
      phone: "+421 900 000 001",
      website: "https://demo-sro.example",
      iban: "SK00 0000 0000 0000 0000 0001",
      swift: "DEMOSKBX",
      vat_payer: true,
      vat_scheme: "standard",
      default_currency: "EUR",
      logo_url: null,
      created_by: MAJITEL,
      created_at: cas(-420),
      ...spolocne,
    },
    {
      id: FIRMA_CZ,
      name: "Demo Česko s.r.o.",
      ico: "00000002",
      dic: "CZ00000002",
      ic_dph: "CZ00000002",
      street: "Vzorová 5",
      city: "Praha",
      zip: "110 00",
      country: "CZ",
      email: "faktury@demo-cesko.example",
      iban: "CZ00 0000 0000 0000 0000 0002",
      vat_payer: true,
      default_currency: "CZK",
      created_by: MAJITEL,
      created_at: cas(-300),
      ...spolocne,
      email_sender_name: "Demo Česko s.r.o.",
    },
    {
      id: FIRMA_PRAZDNA,
      name: "Prázdna firma s.r.o.",
      ico: "00000003",
      dic: "2020000003",
      street: "Nová 1",
      city: "Košice",
      zip: "040 01",
      country: "SK",
      vat_payer: false,
      default_currency: "EUR",
      created_by: MAJITEL,
      created_at: cas(-5),
    },
  ]);

  for (const firma of [FIRMA, FIRMA_CZ, FIRMA_PRAZDNA]) {
    db.vloz(
      "company_users",
      DEMO_UCTY.map((u, i) => ({
        id: uid(`clen:${firma}:${u.id}`),
        company_id: firma,
        user_id: u.id,
        role: u.rola,
        permissions: u.rola === "custom" ? u.opravnenia : {},
        telefon: `+421 900 000 1${i}0`,
        created_at: cas(-400 + i),
      })),
    );
  }

  db.vloz("subscription_plans", [
    { id: uid("plan:starter"), slug: "starter", name: "Starter", price_monthly_cents: 0, invoice_limit: 10, user_limit: 1, company_limit: 1, sort_order: 1 },
    { id: uid("plan:premium"), slug: "premium", name: "Premium", price_monthly_cents: 990, invoice_limit: null, user_limit: 5, company_limit: 3, accountant_seats: 1, api_enabled: true, webhooks_enabled: true, recurring_enabled: true, efaktura_enabled: true, bank_matching_enabled: true, import_enabled: true, sort_order: 2 },
    { id: uid("plan:business"), slug: "business", name: "Business", price_monthly_cents: 2490, invoice_limit: null, user_limit: null, company_limit: null, accountant_seats: 3, api_enabled: true, webhooks_enabled: true, recurring_enabled: true, efaktura_enabled: true, bank_matching_enabled: true, import_enabled: true, audit_log_enabled: true, priority_support: true, sort_order: 3 },
  ]);
  db.vloz("subscriptions", [
    { company_id: FIRMA, plan: "business", plan_id: uid("plan:business"), status: "active", current_period_start: den(-12), current_period_end: den(18), next_billing_at: cas(18), monthly_price_cents: 2490 },
    { company_id: FIRMA_CZ, plan: "premium", plan_id: uid("plan:premium"), status: "active", current_period_start: den(-3), current_period_end: den(27), next_billing_at: cas(27), monthly_price_cents: 990 },
    { company_id: FIRMA_PRAZDNA, plan: "premium", plan_id: uid("plan:premium"), status: "trialing", trial_ends_at: cas(25) },
  ]);
}
