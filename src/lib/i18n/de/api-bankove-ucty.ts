// Dokumentácia API — bankové účty, stránkovanie pohybov, kedy príde invoice.paid.
export default {
  "(alebo": "(oder",
  "najviac 500 na stranu. Odpoveď má": "höchstens 500 pro Seite. Die Antwort enthält",
  "— čítajte, kým je has_more true, inak vám riadky z rušného dňa chýbajú.":
    "— lesen Sie weiter, solange has_more true ist, sonst fehlen Ihnen Zeilen eines umsatzstarken Tages.",
  "účtu je presne to": "des Kontos ist genau die",
  ", ktoré nesú pohyby. Vracajú sa aj odpojené účty (active: false), aby sa dalo priradiť každé id zo starších pohybov. Zostatok a jeho čas sú null, kým sa účet s bankou nesynchronizoval. Každý pohyb nesie aj iban a bank_name svojho účtu.":
    ", die die Umsätze tragen. Auch getrennte Konten werden zurückgegeben (active: false), damit sich jede id aus älteren Umsätzen zuordnen lässt. Saldo und Zeitpunkt sind null, solange das Konto nicht mit der Bank synchronisiert wurde. Jeder Umsatz enthält zusätzlich iban und bank_name seines Kontos.",
  "Neznáma cesta pod /api/v1/ vráti 404 s telom":
    "Ein unbekannter Pfad unter /api/v1/ liefert 404 mit dem Body",
  "Kedy príde invoice.paid": "Wann invoice.paid kommt",
  "Len keď faktúru niekto výslovne označí ako uhradenú: volaním POST /api/v1/invoices/…/mark-paid alebo zmenou stavu na „Uhradená“ v detaile faktúry vo Fakteri. Pri spárovaní bankového pohybu s faktúrou (automaticky ani ručne), pri hromadnom označení v zozname ani pri platbe cez platobnú bránu sa invoice.paid neposiela — úhradu z banky zistíte z /api/v1/bank-transactions (matched_invoice_id).":
    "Nur wenn jemand die Rechnung ausdrücklich als bezahlt markiert: per POST /api/v1/invoices/…/mark-paid oder durch Statuswechsel auf „Bezahlt“ im Rechnungsdetail in Faktero. Beim Abgleich eines Bankumsatzes mit der Rechnung (automatisch wie manuell), bei der Massenmarkierung in der Liste und bei Zahlung über ein Zahlungsgateway wird invoice.paid nicht gesendet — die Zahlung aus der Bank erkennen Sie in /api/v1/bank-transactions (matched_invoice_id).",
  "Bankové účty firmy (IBAN, banka, zostatok)": "Bankkonten des Unternehmens (IBAN, Bank, Saldo)",
  "<0>invoice.paid</0> príde len pri výslovnom označení faktúry ako uhradenej — cez API <1>mark-paid</1> alebo zmenou stavu v detaile faktúry. Spárovanie s bankovým pohybom ho nespúšťa; úhradu z banky nájdete v <2>/api/v1/bank-transactions</2> (pole <3>matched_invoice_id</3>).":
    "<0>invoice.paid</0> kommt nur, wenn die Rechnung ausdrücklich als bezahlt markiert wird — per API <1>mark-paid</1> oder durch Statuswechsel im Rechnungsdetail. Der Abgleich mit einem Bankumsatz löst es nicht aus; die Zahlung aus der Bank finden Sie in <2>/api/v1/bank-transactions</2> (Feld <3>matched_invoice_id</3>).",
};
