// API-Dokumentation: Testmodus, Rechnungsfelder, Statuscodes, Webhooks (Test 30.10.).
export default {
  "testovací režim — kľúč smie len čítať (GET). Zápis, odoslanie či úhrada vráti 403 s kódom test_key_read_only, takže skúšanie integrácie nič nezmení.":
    "Testmodus — der Schlüssel darf nur lesen (GET). Schreiben, Versand oder Zahlung liefert 403 mit dem Code test_key_read_only, das Ausprobieren einer Integration ändert also nichts.",
  "Odberateľa pošlite ako customer_id z adresára alebo ako objekt customer (name, ico, dic, ic_dph, street, city, zip, country, email). Položka má name, quantity, unit, unit_price (bez DPH), vat_rate a voliteľne discount_percent (zľava riadku v %) a prenesenie (prenesenie daňovej povinnosti len pri tejto položke). Bez vat_rate platí základná sadzba krajiny firmy (neplatiteľ DPH 0 %), bez currency mena firmy. S external_id sa tá istá faktúra druhýkrát nevystaví — opakovaná požiadavka vráti existujúcu (200).":
    "Den Kunden senden Sie als customer_id aus dem Adressbuch oder als Objekt customer (name, ico, dic, ic_dph, street, city, zip, country, email). Eine Position hat name, quantity, unit, unit_price (netto), vat_rate und optional discount_percent (Positionsrabatt in %) und prenesenie (Reverse Charge nur für diese Position). Ohne vat_rate gilt der Normalsatz des Firmenlandes (Nicht-Umsatzsteuerpflichtige 0 %), ohne currency die Firmenwährung. Mit external_id wird dieselbe Rechnung kein zweites Mal ausgestellt — eine wiederholte Anfrage liefert die bestehende (200).",
  "zľava na celý doklad; rozpočíta sa pomerne medzi sadzby DPH a v odpovedi je discount_total.":
    "Rabatt auf den ganzen Beleg; er wird anteilig auf die Steuersätze verteilt, die Antwort enthält discount_total.",
  "prenesenie daňovej povinnosti; DPH faktúry je nula a PDF uvedie zákonnú vetu. Pri eu_b2b musí mať odberateľ IČ DPH z iného členského štátu (eu_plnenie: tovar, sluzba, trojstranny).":
    "Reverse Charge; die Umsatzsteuer der Rechnung ist null und das PDF enthält den gesetzlichen Hinweis. Bei eu_b2b braucht der Kunde eine USt-IdNr. aus einem anderen Mitgliedstaat (eu_plnenie: tovar, sluzba, trojstranny).",
  "v cudzej mene Faktero doplní kurz (slovenská firma ECB zo dňa pred dodaním, česká ČNB) a sumy v domácej mene: exchange_rate, exchange_rate_date, vat_total_eur.":
    "In Fremdwährung ergänzt Faktero den Kurs (slowakische Firma EZB vom Vortag der Lieferung, tschechische ČNB) und die Beträge in Inlandswährung: exchange_rate, exchange_rate_date, vat_total_eur.",
  "pri položke — presné sumy z e-shopu (pri všetkých položkách alebo pri žiadnej). Musia sedieť s cenou a sadzbou, inak 400; so zľavou sa nekombinujú.":
    "bei der Position — exakte Beträge aus dem Onlineshop (bei allen Positionen oder bei keiner). Sie müssen zu Preis und Steuersatz passen, sonst 400; mit Rabatt werden sie nicht kombiniert.",
  "predvolene o 14 dní": "standardmäßig in 14 Tagen",
  "GET /invoices vráti najviac 200 faktúr (limit, offset, status) a has_more s next_offset. GET /invoices/{id}/pdf vráti url (podpísaný odkaz na PDF) a expires_in v sekundách — odkaz platí hodinu.":
    "GET /invoices liefert höchstens 200 Rechnungen (limit, offset, status) sowie has_more mit next_offset. GET /invoices/{id}/pdf liefert url (signierter Link zum PDF) und expires_in in Sekunden — der Link gilt eine Stunde.",
  "Ponuka prijíma rovnakého odberateľa a položky ako faktúra (bez vat_rate platí sadzba firmy, bez currency mena firmy). Konverzia vystaví faktúru s dnešným dátumom; opakovaná konverzia vráti tú istú faktúru.":
    "Ein Angebot nimmt denselben Kunden und dieselben Positionen wie eine Rechnung an (ohne vat_rate gilt der Satz der Firma, ohne currency die Firmenwährung). Die Umwandlung stellt eine Rechnung mit heutigem Datum aus; eine wiederholte Umwandlung liefert dieselbe Rechnung.",
  "Voliteľné pole buyer { name, ico, dic, ic_dph } je odberateľ uvedený na doklade. Keď nesedí s firmou kľúča (iné IČO, IČ DPH alebo názov), faktúra sa zapíše s príznakom odberatel_nesedi a nezaúčtuje sa ani s accounting.booked. Kým vo Fakteri nepotvrdíte, že patrí tejto firme, zaúčtovanie cez PUT vráti 409 s kódom buyer_mismatch.":
    "Das optionale Feld buyer { name, ico, dic, ic_dph } ist der auf dem Beleg angegebene Empfänger. Passt er nicht zur Firma des Schlüssels (andere ID-Nummer, USt-IdNr. oder anderer Name), wird die Rechnung mit dem Kennzeichen odberatel_nesedi gespeichert und auch mit accounting.booked nicht gebucht. Solange Sie in Faktero nicht bestätigen, dass sie zu dieser Firma gehört, liefert das Buchen per PUT 409 mit dem Code buyer_mismatch.",
  "Ostatné udalosti faktúry (invoice.created, invoice.sent, invoice.cancelled) majú rovnaké data bez paid_at a bank_transaction_id; customer.created nesie customer_id, name, email, ico a external_id.":
    "Die übrigen Rechnungsereignisse (invoice.created, invoice.sent, invoice.cancelled) haben dieselben Daten ohne paid_at und bank_transaction_id; customer.created enthält customer_id, name, email, ico und external_id.",
  "Názov udalosti nesie aj hlavička": "Den Ereignisnamen trägt auch der Header",
  "Ak váš endpoint nevráti 2xx do 10 sekúnd, Faktero doručenie hneď zopakuje — celkovo 3 pokusy počas niekoľkých sekúnd. Neskôr sa už neposiela, preto pri výpadku dočítajte zmeny cez API (napr. updated_since alebo GET /bank-transactions). Všetky pokusy a ich stavy nájdete v sekcii Webhooky → Logy. Adresa musí byť https na verejnom serveri (port 443).":
    "Liefert Ihr Endpunkt innerhalb von 10 Sekunden kein 2xx, wiederholt Faktero die Zustellung sofort — insgesamt 3 Versuche innerhalb weniger Sekunden. Später wird nicht mehr gesendet; holen Sie Änderungen nach einem Ausfall daher über die API nach (z. B. updated_since oder GET /bank-transactions). Alle Versuche und ihren Status finden Sie unter Webhooks → Logs. Die Adresse muss https auf einem öffentlichen Server sein (Port 443).",
  "Payment Required — predplatné firmy nie je aktívne (plan_inactive)":
    "Payment Required — das Abonnement der Firma ist nicht aktiv (plan_inactive)",
  "Forbidden — kľúč nemá oprávnenie (test_key_read_only, company_forbidden, account_key_required)":
    "Forbidden — der Schlüssel hat keine Berechtigung (test_key_read_only, company_forbidden, account_key_required)",
  "Not Found — zdroj neexistuje (aj neplatné id v adrese)":
    "Not Found — die Ressource existiert nicht (auch ungültige ID in der Adresse)",
  "Method Not Allowed — koncový bod túto metódu neprijíma":
    "Method Not Allowed — der Endpunkt nimmt diese Methode nicht an",
  "Conflict — konflikt stavu: duplicate, invalid_state, locked, issue_date_in_past, approval_pending, buyer_mismatch, already_matched, bank_payment":
    "Conflict — Zustandskonflikt: duplicate, invalid_state, locked, issue_date_in_past, approval_pending, buyer_mismatch, already_matched, bank_payment",
  "Too Many Requests — odosielanie e-mailov je dočasne zastavené (sending_blocked)":
    "Too Many Requests — der E-Mail-Versand ist vorübergehend gestoppt (sending_blocked)",
  "Bad Gateway — e-mail sa nepodarilo odoslať (send_failed)":
    "Bad Gateway — die E-Mail konnte nicht gesendet werden (send_failed)",
};
