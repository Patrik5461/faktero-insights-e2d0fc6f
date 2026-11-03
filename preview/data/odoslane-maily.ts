/**
 * Demo dáta: evidencia odoslaných e-mailov (strážca odosielania) pre
 * Nastavenia → Odoslané e-maily. Faktúry a upomienky zrkadlia demo
 * `invoice_email_logs` a `invoice_reminders`, k nim pár ponúk, podklady
 * účtovníkovi, pozvánka, jeden e-mail cez vlastný SMTP, jedna chyba
 * a jeden pokus zastavený strážcom.
 */
import type { DemoDb, Riadok } from "../server/db";
import { FIRMA, MAJITEL, UCTOVNIK } from "./zaklad";
import { cas, uid } from "./pomocne";

export function naplnOdoslaneMaily(db: DemoDb) {
  const riadky: Riadok[] = [];
  const faktury = new Map(db.tabulka("invoices").map((f) => [f.id, f]));

  for (const m of db.tabulka("invoice_email_logs")) {
    if (m.company_id !== FIRMA) continue;
    riadky.push({
      id: uid(`om:f:${m.id}`),
      company_id: FIRMA,
      user_id: MAJITEL,
      druh: "faktura",
      doklad_id: m.invoice_id,
      adresati: [String(m.recipient_email ?? "").toLowerCase()].filter(Boolean),
      pocet: 1,
      predmet: m.subject,
      stav: m.status === "failed" ? "zlyhalo" : "odoslane",
      chyba: m.status === "failed" ? (m.error_message ?? "Poštová služba e-mail odmietla.") : null,
      cez: m.status === "failed" ? null : "resend",
      created_at: m.created_at,
    });
  }
  for (const u of db.tabulka("invoice_reminders")) {
    if (u.company_id !== FIRMA) continue;
    riadky.push({
      id: uid(`om:u:${u.id}`),
      company_id: FIRMA,
      user_id: u.sent_by ?? null,
      druh: "upomienka",
      doklad_id: u.invoice_id,
      adresati: [String(u.email_to ?? "").toLowerCase()].filter(Boolean),
      pocet: 1,
      predmet: u.subject,
      stav: u.status === "failed" ? "zlyhalo" : "odoslane",
      chyba: u.status === "failed" ? (u.error_message ?? null) : null,
      cez: u.status === "failed" ? null : "resend",
      created_at: u.sent_at ?? u.created_at,
    });
  }

  const ponuky = db.tabulka("quotes").filter((q) => q.company_id === FIRMA && q.customer_email);
  ponuky.slice(0, 4).forEach((q, i) => {
    riadky.push({
      id: uid(`om:p:${q.id}`),
      company_id: FIRMA,
      user_id: i % 2 ? UCTOVNIK : MAJITEL,
      druh: "ponuka",
      doklad_id: q.id,
      adresati: [String(q.customer_email).toLowerCase()],
      pocet: 1,
      predmet: `Cenová ponuka ${q.quote_number}`,
      stav: "odoslane",
      cez: "resend",
      created_at: cas(-(i * 5 + 2), 9 + i, 15),
    });
  });

  // Faktúra s kópiou dvom adresátom cez vlastný SMTP.
  const dvaja = faktures(faktury).find((f) => f.customer_email);
  if (dvaja) {
    riadky.push({
      id: uid("om:smtp"),
      company_id: FIRMA,
      user_id: MAJITEL,
      druh: "faktura",
      doklad_id: dvaja.id,
      adresati: [String(dvaja.customer_email).toLowerCase(), "uctovnictvo@gama-soft.example"],
      pocet: 2,
      predmet: `Faktúra ${dvaja.invoice_number}`,
      stav: "odoslane",
      cez: "smtp",
      created_at: cas(-1, 14, 20),
    });
  }

  riadky.push(
    {
      id: uid("om:podklady"),
      company_id: FIRMA,
      user_id: MAJITEL,
      druh: "podklady",
      doklad_id: null,
      adresati: ["kancelaria@uctovnici.example"],
      pocet: 1,
      predmet: "Podklady za október 2026 — Demo s.r.o.",
      stav: "odoslane",
      cez: "resend",
      created_at: cas(-2, 8, 5),
    },
    {
      id: uid("om:pozvanka"),
      company_id: FIRMA,
      user_id: MAJITEL,
      druh: "pozvanka",
      doklad_id: null,
      adresati: ["novy.kolega@demo.example"],
      pocet: 1,
      predmet: "Pozvánka do firmy Demo s.r.o. vo Faktero",
      stav: "odoslane",
      cez: "resend",
      created_at: cas(-4, 16, 40),
    },
    {
      id: uid("om:chyba"),
      company_id: FIRMA,
      user_id: UCTOVNIK,
      druh: "upomienka",
      doklad_id: null,
      adresati: ["neexistuje@zla-domena.example"],
      pocet: 1,
      predmet: "Upomienka k faktúre",
      stav: "zlyhalo",
      chyba: "550 5.1.1 Recipient address rejected: User unknown",
      created_at: cas(0, 7, 30),
    },
  );
  db.vloz("odosielanie_mailov", riadky);

  db.vloz("odosielanie_zablokovane", [
    {
      id: uid("oz:1"),
      company_id: FIRMA,
      user_id: MAJITEL,
      druh: "faktura",
      dovod: "strop_mail",
      detail: "24 adresátov v jednom e-maile (strop 20)",
      predmet: "Faktúra — hromadné odoslanie",
      adresati_pocet: 24,
      len_vystraha: false,
      created_at: cas(-3, 11, 0),
    },
  ]);
}

function faktures(m: Map<unknown, Riadok>): Riadok[] {
  return [...m.values()].filter((f) => f.company_id === FIRMA && f.status !== "draft");
}
