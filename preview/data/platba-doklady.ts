/**
 * Demo dáta: ikonka platby v Bločkoch (doklady platené prevodom).
 *
 * Štyri bločky s úhradou „prevod“ z modulu doklady dostanú pohyby tak, aby
 * zoznam ukázal všetky stavy: spárovaná (zelená), nájdená istá a nájdená na
 * potvrdenie (oranžová) a nenájdená (červená). Beží až po module banka.
 */
import type { DemoDb, Riadok } from "../server/db";
import { FIRMA } from "./zaklad";
import { UCET_HLAVNY } from "./banka";
import { pridajDni, r2, uid } from "./pomocne";

export function naplnPlatbaDoklady(db: DemoDb) {
  const blocek = (i: number) =>
    db.tabulka("expense_documents").find((e) => e.id === uid(`blocek:${i}`)) as Riadok | undefined;
  const pohyby: Riadok[] = [];
  const pohyb = (kluc: string, b: Riadok, p: Partial<Riadok>) => {
    pohyby.push({
      id: uid(`platba-doklady:${kluc}`),
      company_id: FIRMA,
      bank_account_id: UCET_HLAVNY,
      booking_date: pridajDni(String(b.issue_date), 1),
      amount: -r2(Number(b.total_amount)),
      currency: "EUR",
      transaction_reference: `DEMOPD-${kluc}`,
      zdroj: "banka",
      created_at: pridajDni(String(b.issue_date), 1) + "T06:00:00.000Z",
      ...p,
    });
  };
  // i % 9 === 4 → bločky platené prevodom (4, 13, 22, 31 sú v okne 60 dní).
  const sparovany = blocek(4);
  const isty = blocek(13);
  const navrh = blocek(22);
  if (sparovany?.payment_method === "prevod") {
    pohyb("sparovany", sparovany, {
      counterparty: sparovany.supplier_name,
      description: `Úhrada ${sparovany.document_number ?? ""}`.trim(),
      variable_symbol: sparovany.document_number,
      matched_expense_id: sparovany.id,
    });
  }
  if (isty?.payment_method === "prevod") {
    pohyb("isty", isty, { counterparty: isty.supplier_name, description: "SEPA prevod" });
  }
  if (navrh?.payment_method === "prevod") {
    pohyb("navrh", navrh, { counterparty: "Platba SEPA", description: "Prevod z účtu" });
  }
  // Blocek 31 ostáva bez pohybu → „Platba sa nenašla“.
  if (pohyby.length) db.vloz("bank_transactions", pohyby);
}
