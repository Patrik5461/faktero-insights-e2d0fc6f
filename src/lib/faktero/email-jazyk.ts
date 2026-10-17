/**
 * Predvolený e-mail s faktúrou v jazyku dokladu.
 *
 * Nemecký odberateľ dostal faktúru po nemecky, ale mail k nej po slovensky —
 * predmet „Faktúra RE-2026-0042“ a text, ktorému nerozumie. Jazyk mailu sa
 * preto berie z dokladu, rovnako ako jazyk PDF (`pdf-generator.server`).
 *
 * Platí to len pre **predvolený** text. Šablónu, ktorú si firma upravila
 * (Nastavenia → E-mailové šablóny, alebo predvolený predmet a text firmy),
 * Faktero nemení — firma ju napísala tak, ako ju chce mať.
 */
import {
  datumNaDoklade,
  jazykDokladu,
  localeDokladu,
  predvolenyJazykFirmy,
  type JazykDokladu,
} from "./faktura-jazyk";
import { formatujMenu } from "./mena";

type Mail = { predmet: string; text: string };

/* Premenné: {invoice_number}, {total}, {due_date}, {company_name}. */
const MAILY: Record<JazykDokladu, Mail> = {
  // Slovenčina ostáva presne taká, aká bola — existujúce firmy ju poznajú.
  sk: {
    predmet: "Faktúra {invoice_number}",
    text: "V prílohe posielame faktúru {invoice_number}.",
  },
  cs: {
    predmet: "Faktura {invoice_number}",
    text: "Dobrý den,\n\nv příloze zasíláme fakturu {invoice_number} na částku {total} se splatností {due_date}.\n\nS pozdravem\n{company_name}",
  },
  en: {
    predmet: "Invoice {invoice_number}",
    text: "Hello,\n\nplease find attached invoice {invoice_number} for {total}, due on {due_date}.\n\nKind regards\n{company_name}",
  },
  de: {
    predmet: "Rechnung {invoice_number}",
    text: "Guten Tag,\n\nanbei erhalten Sie unsere Rechnung {invoice_number} über {total}, zahlbar bis {due_date}.\n\nMit freundlichen Grüßen\n{company_name}",
  },
  hu: {
    predmet: "Számla {invoice_number}",
    text: "Tisztelt Partnerünk!\n\nMellékelten küldjük a(z) {invoice_number} számú számlát {total} összegben, fizetési határidő: {due_date}.\n\nÜdvözlettel\n{company_name}",
  },
};

/** Jazyk dokladu tak, ako ho určuje PDF: faktúra, inak krajina firmy. */
export function jazykFaktury(
  invoice: { language?: string | null } | null | undefined,
  company: { country?: string | null } | null | undefined,
): JazykDokladu {
  return jazykDokladu(invoice?.language || predvolenyJazykFirmy(company?.country));
}

/*
  Opravná faktúra (dobropis) po nemecky: „Rechnungskorrektur“, nie
  „Rechnung … zahlbar bis“ — peniaze idú opačným smerom. „Gutschrift“ je
  v Nemecku samofaktúra (§ 14 Abs. 2 S. 2 UStG), preto sa to slovo nepoužíva.
  Ostatné jazyky ostávajú, ako boli.
*/
const MAILY_DOBROPIS: Partial<Record<JazykDokladu, Mail>> = {
  de: {
    predmet: "Rechnungskorrektur {invoice_number}",
    text: "Guten Tag,\n\nanbei erhalten Sie unsere Rechnungskorrektur {invoice_number} über {total}.\n\nMit freundlichen Grüßen\n{company_name}",
  },
};

/** Predvolený predmet a text mailu s faktúrou (so zástupnými poliami). */
export function predvolenyMailFaktury(jazyk: unknown, typ?: string | null): Mail {
  const j = jazykDokladu(jazyk);
  if (typ === "credit_note" && MAILY_DOBROPIS[j]) return MAILY_DOBROPIS[j]!;
  return MAILY[j];
}

/** Hodnoty zástupných polí v jazyku dokladu — dátum „29.10.2026“, suma „1.297,00 €“. */
export function hodnotyMailu(
  invoice: {
    invoice_number?: string | null;
    total?: unknown;
    currency?: string | null;
    due_date?: string | null;
  },
  jazyk: unknown,
): { total: string; due_date: string } {
  return {
    total: formatujMenu(invoice.total, invoice.currency ?? "EUR", localeDokladu(jazyk)),
    due_date: invoice.due_date ? datumNaDoklade(invoice.due_date, jazyk) : "",
  };
}
