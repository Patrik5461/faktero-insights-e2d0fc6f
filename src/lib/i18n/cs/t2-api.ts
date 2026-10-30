// Dokumentace API: testovací režim, pole faktury, stavové kódy, webhooky (test 30. 10.).
export default {
  "testovací režim — kľúč smie len čítať (GET). Zápis, odoslanie či úhrada vráti 403 s kódom test_key_read_only, takže skúšanie integrácie nič nezmení.":
    "testovací režim — klíč smí jen číst (GET). Zápis, odeslání či úhrada vrátí 403 s kódem test_key_read_only, takže zkoušení integrace nic nezmění.",
  "Odberateľa pošlite ako customer_id z adresára alebo ako objekt customer (name, ico, dic, ic_dph, street, city, zip, country, email). Položka má name, quantity, unit, unit_price (bez DPH), vat_rate a voliteľne discount_percent (zľava riadku v %) a prenesenie (prenesenie daňovej povinnosti len pri tejto položke). Bez vat_rate platí základná sadzba krajiny firmy (neplatiteľ DPH 0 %), bez currency mena firmy. S external_id sa tá istá faktúra druhýkrát nevystaví — opakovaná požiadavka vráti existujúcu (200).":
    "Odběratele pošlete jako customer_id z adresáře nebo jako objekt customer (name, ico, dic, ic_dph, street, city, zip, country, email). Položka má name, quantity, unit, unit_price (bez DPH), vat_rate a volitelně discount_percent (sleva řádku v %) a prenesenie (přenesení daňové povinnosti jen u této položky). Bez vat_rate platí základní sazba země firmy (neplátce DPH 0 %), bez currency měna firmy. S external_id se tatáž faktura podruhé nevystaví — opakovaný požadavek vrátí existující (200).",
  "zľava na celý doklad; rozpočíta sa pomerne medzi sadzby DPH a v odpovedi je discount_total.":
    "sleva na celý doklad; rozpočítá se poměrně mezi sazby DPH a v odpovědi je discount_total.",
  "prenesenie daňovej povinnosti; DPH faktúry je nula a PDF uvedie zákonnú vetu. Pri eu_b2b musí mať odberateľ IČ DPH z iného členského štátu (eu_plnenie: tovar, sluzba, trojstranny).":
    "přenesení daňové povinnosti; DPH faktury je nula a PDF uvede zákonnou větu. U eu_b2b musí mít odběratel DIČ z jiného členského státu (eu_plnenie: tovar, sluzba, trojstranny).",
  "v cudzej mene Faktero doplní kurz (slovenská firma ECB zo dňa pred dodaním, česká ČNB) a sumy v domácej mene: exchange_rate, exchange_rate_date, vat_total_eur.":
    "v cizí měně Faktero doplní kurz (slovenská firma ECB ze dne před dodáním, česká ČNB) a částky v domácí měně: exchange_rate, exchange_rate_date, vat_total_eur.",
  "pri položke — presné sumy z e-shopu (pri všetkých položkách alebo pri žiadnej). Musia sedieť s cenou a sadzbou, inak 400; so zľavou sa nekombinujú.":
    "u položky — přesné částky z e-shopu (u všech položek, nebo u žádné). Musí odpovídat ceně a sazbě, jinak 400; se slevou se nekombinují.",
  "predvolene o 14 dní": "výchozí za 14 dní",
  "GET /invoices vráti najviac 200 faktúr (limit, offset, status) a has_more s next_offset. GET /invoices/{id}/pdf vráti url (podpísaný odkaz na PDF) a expires_in v sekundách — odkaz platí hodinu.":
    "GET /invoices vrátí nejvýše 200 faktur (limit, offset, status) a has_more s next_offset. GET /invoices/{id}/pdf vrátí url (podepsaný odkaz na PDF) a expires_in v sekundách — odkaz platí hodinu.",
  "Ponuka prijíma rovnakého odberateľa a položky ako faktúra (bez vat_rate platí sadzba firmy, bez currency mena firmy). Konverzia vystaví faktúru s dnešným dátumom; opakovaná konverzia vráti tú istú faktúru.":
    "Nabídka přijímá stejného odběratele a položky jako faktura (bez vat_rate platí sazba firmy, bez currency měna firmy). Převod vystaví fakturu s dnešním datem; opakovaný převod vrátí tutéž fakturu.",
  "Voliteľné pole buyer { name, ico, dic, ic_dph } je odberateľ uvedený na doklade. Keď nesedí s firmou kľúča (iné IČO, IČ DPH alebo názov), faktúra sa zapíše s príznakom odberatel_nesedi a nezaúčtuje sa ani s accounting.booked. Kým vo Fakteri nepotvrdíte, že patrí tejto firme, zaúčtovanie cez PUT vráti 409 s kódom buyer_mismatch.":
    "Volitelné pole buyer { name, ico, dic, ic_dph } je odběratel uvedený na dokladu. Když neodpovídá firmě klíče (jiné IČO, DIČ nebo název), faktura se zapíše s příznakem odberatel_nesedi a nezaúčtuje se ani s accounting.booked. Dokud ve Fakteru nepotvrdíte, že patří této firmě, zaúčtování přes PUT vrátí 409 s kódem buyer_mismatch.",
  "Ostatné udalosti faktúry (invoice.created, invoice.sent, invoice.cancelled) majú rovnaké data bez paid_at a bank_transaction_id; customer.created nesie customer_id, name, email, ico a external_id.":
    "Ostatní události faktury (invoice.created, invoice.sent, invoice.cancelled) mají stejná data bez paid_at a bank_transaction_id; customer.created nese customer_id, name, email, ico a external_id.",
  "Názov udalosti nesie aj hlavička": "Název události nese i hlavička",
  "Ak váš endpoint nevráti 2xx do 10 sekúnd, Faktero doručenie hneď zopakuje — celkovo 3 pokusy počas niekoľkých sekúnd. Neskôr sa už neposiela, preto pri výpadku dočítajte zmeny cez API (napr. updated_since alebo GET /bank-transactions). Všetky pokusy a ich stavy nájdete v sekcii Webhooky → Logy. Adresa musí byť https na verejnom serveri (port 443).":
    "Pokud váš endpoint nevrátí 2xx do 10 sekund, Faktero doručení hned zopakuje — celkem 3 pokusy během několika sekund. Později se už neposílá, proto po výpadku dočtěte změny přes API (např. updated_since nebo GET /bank-transactions). Všechny pokusy a jejich stavy najdete v sekci Webhooky → Logy. Adresa musí být https na veřejném serveru (port 443).",
  "Payment Required — predplatné firmy nie je aktívne (plan_inactive)":
    "Payment Required — předplatné firmy není aktivní (plan_inactive)",
  "Forbidden — kľúč nemá oprávnenie (test_key_read_only, company_forbidden, account_key_required)":
    "Forbidden — klíč nemá oprávnění (test_key_read_only, company_forbidden, account_key_required)",
  "Not Found — zdroj neexistuje (aj neplatné id v adrese)":
    "Not Found — zdroj neexistuje (i neplatné id v adrese)",
  "Method Not Allowed — koncový bod túto metódu neprijíma":
    "Method Not Allowed — koncový bod tuto metodu nepřijímá",
  "Conflict — konflikt stavu: duplicate, invalid_state, locked, issue_date_in_past, approval_pending, buyer_mismatch, already_matched, bank_payment":
    "Conflict — konflikt stavu: duplicate, invalid_state, locked, issue_date_in_past, approval_pending, buyer_mismatch, already_matched, bank_payment",
  "Too Many Requests — odosielanie e-mailov je dočasne zastavené (sending_blocked)":
    "Too Many Requests — odesílání e-mailů je dočasně zastaveno (sending_blocked)",
  "Bad Gateway — e-mail sa nepodarilo odoslať (send_failed)":
    "Bad Gateway — e-mail se nepodařilo odeslat (send_failed)",
};
