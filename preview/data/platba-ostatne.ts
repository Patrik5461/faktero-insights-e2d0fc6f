/**
 * Demo dáta: platba iných dokladov (predpis, výmer, pokuta…).
 *
 * K dokladom z modulu doklady doplní VS a IBAN na úhradu a pohyby na účte
 * tak, aby zoznam aj detail ukázali všetky stavy: spárovaná (Sociálna
 * poisťovňa), nájdená istá (predpis poistného — VS aj IBAN sedí), nájdená
 * na potvrdenie (platobný výmer — len suma pri lehote), nenájdená (miestny
 * poplatok) a zaplatená bez pohybu (poistná zmluva). Beží po module banka.
 */
import type { DemoDb, Riadok } from "../server/db";
import { FIRMA } from "./zaklad";
import { UCET_HLAVNY } from "./banka";
import { den, uid } from "./pomocne";

export function naplnPlatbaOstatne(db: DemoDb) {
  const doklady = db.tabulka("other_documents");
  const podla = (zaciatok: string) =>
    doklady.find((d) => String(d.subject ?? "").startsWith(zaciatok)) as Riadok | undefined;
  const pohyby: Riadok[] = [];
  const pohyb = (kluc: string, p: Partial<Riadok>) =>
    pohyby.push({
      id: uid(`platba-ostatne:${kluc}`),
      company_id: FIRMA,
      bank_account_id: UCET_HLAVNY,
      currency: "EUR",
      transaction_reference: `DEMOPO-${kluc}`,
      zdroj: "banka",
      created_at: `${p.booking_date}T06:00:00.000Z`,
      ...p,
    });

  const sp = podla("Výkaz poistného a príspevkov");
  if (sp) {
    Object.assign(sp, { variable_symbol: "2026100112", iban: "SK3181800000007000155733" });
    pohyb("sp", {
      booking_date: den(-1),
      amount: -Number(sp.amount),
      counterparty: "Socialna poistovna",
      counterparty_iban: "SK3181800000007000155733",
      variable_symbol: "2026100112",
      description: "Nedoplatok poistného",
      matched_other_document_id: sp.id,
    });
  }
  const predpis = podla("Predpis poistného – flotila");
  if (predpis) {
    Object.assign(predpis, { variable_symbol: "7712026", iban: "SK8975000000000012345671" });
    pohyb("predpis", {
      booking_date: den(-2),
      amount: -Number(predpis.amount),
      counterparty: "Demo Poistovna a.s.",
      counterparty_iban: "SK8975000000000012345671",
      variable_symbol: "7712026",
      description: "Poistné flotila 2027",
    });
  }
  const vymer = podla("Platobný výmer – daň z motorových");
  if (vymer) {
    pohyb("vymer", {
      booking_date: den(0),
      amount: -Number(vymer.amount),
      counterparty: "Platba SEPA",
      description: "Prevod z účtu",
    });
  }
  const zmluva = podla("Poistná zmluva – zodpovednosť");
  if (zmluva) zmluva.paid_at = den(-5);
  // „Rozhodnutie o miestnom poplatku“ ostáva bez pohybu → „Platba sa zatiaľ nenašla“.

  if (pohyby.length) db.vloz("bank_transactions", pohyby);
}
