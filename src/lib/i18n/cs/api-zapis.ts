// Zápis cez API (prijaté faktúry, bločky, prenos kontaktov, cenník, firmy, banka) a MCP.
export default {
  Cenník: "Ceník",
  "Firmy a používatelia": "Firmy a uživatelé",
  "Hromadný prenos adresára (do 1000)": "Hromadný přenos adresáře (do 1000)",
  "Hromadný prenos adresára": "Hromadný přenos adresáře",
  "Prenesie odberateľov aj dodávateľov z iného programu naraz. Páruje podľa external_id, potom IČO, bez IČO podľa mena. Existujúci kontakt sa len doplní o prázdne polia; s update_existing: true sa prepíše. Odpoveď povie, čo sa založilo, doplnilo alebo ostalo bez zmeny, a chyby po riadkoch.":
    "Přenese odběratele i dodavatele z jiného programu najednou. Páruje podle external_id, potom IČO, bez IČO podle názvu. Existující kontakt se jen doplní o prázdná pole; s update_existing: true se přepíše. Odpověď řekne, co se založilo, doplnilo nebo zůstalo beze změny, a chyby po řádcích.",
  "Zapísať prijatú faktúru (aj so súborom)": "Zapsat přijatou fakturu (i se souborem)",
  "Úprava, úhrada (payment_date), zaúčtovanie": "Úprava, úhrada (payment_date), zaúčtování",
  "Zapísať bloček": "Zapsat účtenku",
  "Úprava bločku": "Úprava účtenky",
  "Pridať účet bez napojenia na banku": "Přidat účet bez napojení na banku",
  "Preniesť pohyby na taký účet (do 2000)": "Přenést pohyby na takový účet (do 2000)",
  "Zápis prijatej faktúry": "Zápis přijaté faktury",
  "Sumy pošlite buď ako položky (ceny bez DPH, sadzba v %), alebo ako amount_total (+ amount_without_vat a vat_amount). Dodávateľ sa založí v adresári, ak tam nie je. S external_id je opakované volanie bezpečné; bez neho sa tá istá faktúra (IČO + číslo + suma) druhýkrát nezaloží (409). Súbor (PDF, JPG, PNG) ide ako base64 do 14 MB. Bez accounting.booked príde faktúra nezaúčtovaná.":
    "Částky pošlete buď jako položky (ceny bez DPH, sazba v %), nebo jako amount_total (+ amount_without_vat a vat_amount). Dodavatel se založí v adresáři, pokud tam není. S external_id je opakované volání bezpečné; bez něj se tatáž faktura (IČO + číslo + částka) podruhé nezaloží (409). Soubor (PDF, JPG, PNG) jde jako base64 do 14 MB. Bez accounting.booked přijde faktura nezaúčtovaná.",
  "Úhradu zapíšete cez PUT s payment_date. Bloček: issue_date, total_amount (s DPH), vat_breakdown [{ rate, base, vat }] a payment_method (hotovost, karta, prevod) — hotovosť sa započíta do pokladne, ak nepošlete cash_register: false.":
    "Úhradu zapíšete přes PUT s payment_date. Účtenka: issue_date, total_amount (s DPH), vat_breakdown [{ rate, base, vat }] a payment_method (hotovost, karta, prevod) — hotovost se započítá do pokladny, pokud nepošlete cash_register: false.",
  "Prenos bankového účtu": "Přenos bankovního účtu",
  "Pre banku, ku ktorej sa Faktero nepripojí, alebo pri prechode z iného programu: POST /bank-accounts založí účet (IBAN, mena, zostatok) a pohyby naň pošlete dávkou. Každý pohyb má mať reference (jedinečné id z banky); bez neho ho Faktero odvodí z dátumu, sumy a symbolov, takže opakované odoslanie nič nezdvojí. Na účet napojený priamo na banku pohyby cez API poslať nejde — vedie ich banka.":
    "Pro banku, ke které se Faktero nepřipojí, nebo při přechodu z jiného programu: POST /bank-accounts založí účet (IBAN, měna, zůstatek) a pohyby na něj pošlete dávkou. Každý pohyb má mít reference (jedinečné id z banky); bez něj ho Faktero odvodí z data, částky a symbolů, takže opakované odeslání nic nezdvojí. Na účet napojený přímo na banku pohyby přes API poslat nejde — vede je banka.",
  "Produkty a služby (q = hľadanie)": "Produkty a služby (q = hledání)",
  "Pridať do cenníka": "Přidat do ceníku",
  "Detail produktu": "Detail produktu",
  "Úprava produktu": "Úprava produktu",
  "Cena je bez DPH. S external_id sa ten istý produkt druhýkrát nezaloží — vhodné na synchronizáciu z e-shopu či skladového programu.":
    "Cena je bez DPH. S external_id se tentýž produkt podruhé nezaloží — vhodné pro synchronizaci z e-shopu či skladového programu.",
  "Firmy, ku ktorým kľúč smie": "Firmy, ke kterým klíč smí",
  "Založiť firmu (kľúč účtu)": "Založit firmu (klíč účtu)",
  "Detail firmy": "Detail firmy",
  "Úprava údajov firmy": "Úprava údajů firmy",
  "Používatelia a čakajúce pozvánky": "Uživatelé a čekající pozvánky",
  "Pozvať používateľa (kľúč účtu)": "Pozvat uživatele (klíč účtu)",
  "Pre účtovné kancelárie a integrátorov: kľúčom pre viac firiem založíte firmu nového klienta (stanete sa jej vlastníkom a kľúč k nej hneď smie) a pozvete do nej používateľov — účtovníka (accountant), admina alebo zamestnanca. Pozvánka príde e-mailom a platí 14 dní; v odpovedi je aj odkaz na prijatie. Firmu zakladať a pozývať smie len kľúč pre viac firiem, ktorého majiteľ je vo firme vlastník alebo admin — obyčajný firemný kľúč nie.":
    "Pro účetní kanceláře a integrátory: klíčem pro více firem založíte firmu nového klienta (stanete se jejím vlastníkem a klíč k ní hned smí) a pozvete do ní uživatele — účetního (accountant), admina nebo zaměstnance. Pozvánka přijde e-mailem a platí 14 dní; v odpovědi je i odkaz na přijetí. Firmu zakládat a zvát smí jen klíč pro více firem, jehož majitel je ve firmě vlastník nebo admin — obyčejný firemní klíč ne.",
  "Nástroje: faktúry a ich detail, faktúry po splatnosti, vystavenie faktúry, označenie úhrady, odberatelia aj ich hromadný prenos, cenové ponuky, cenník, prijaté faktúry a bločky (aj ich zápis a úhrada), bankové účty a pohyby (aj prenos na účet bez napojenia), založenie firmy, používatelia a pozvánky.":
    "Nástroje: faktury a jejich detail, faktury po splatnosti, vystavení faktury, označení úhrady, odběratelé i jejich hromadný přenos, cenové nabídky, ceník, přijaté faktury a účtenky (i jejich zápis a úhrada), bankovní účty a pohyby (i přenos na účet bez napojení), založení firmy, uživatelé a pozvánky.",
  "Asistent nič nemaže a nič neposiela odberateľom — faktúru vystaví, ale odoslanie e-mailom či ako eFaktúru je na vás. Jediný e-mail, ktorý odíde, je pozvánka používateľa, keď o ňu výslovne požiadate. Zapisujúce nástroje sú označené, aby si ich klient dal potvrdiť.":
    "Asistent nic nemaže a nic neposílá odběratelům — fakturu vystaví, ale odeslání e-mailem či jako eFakturu je na vás. Jediný e-mail, který odejde, je pozvánka uživatele, když o ni výslovně požádáte. Zapisující nástroje jsou označené, aby si je klient nechal potvrdit.",
  "čítať faktúry, odberateľov, ponuky, cenník, prijaté faktúry, bločky a bankové pohyby,":
    "číst faktury, odběratele, nabídky, ceník, přijaté faktury, účtenky a bankovní pohyby,",
  "vystaviť faktúru, zapísať prijatú faktúru či bloček, založiť odberateľa, produkt alebo firmu, preniesť kontakty a bankové pohyby, označiť úhradu a pozvať používateľa.":
    "vystavit fakturu, zapsat přijatou fakturu či účtenku, založit odběratele, produkt nebo firmu, přenést kontakty a bankovní pohyby, označit úhradu a pozvat uživatele.",
  "Prenos dát a zápis dokladov cez API": "Přenos dat a zápis dokladů přes API",
  "API nielen číta, ale aj zapisuje — hodí sa pri prechode z iného programu aj pri trvalom napojení e-shopu, skladu či účtovnej kancelárie:":
    "API nejen čte, ale i zapisuje — hodí se při přechodu z jiného programu i při trvalém napojení e-shopu, skladu či účetní kanceláře:",
  "<0>Prijaté faktúry a bločky</0> — zapíšete ich aj so súborom (PDF, fotka), dodávateľ sa sám založí v adresári. Úhrady (aj po častiach), zaúčtovanie, stav, štítky a komentár doplníte neskôr.":
    "<0>Přijaté faktury a účtenky</0> — zapíšete je i se souborem (PDF, fotka), dodavatel se sám založí v adresáři. Úhrady (i po částech), zaúčtování, stav, štítky a komentář doplníte později.",
  "<0>Adresár</0> — naraz prenesiete až 1000 odberateľov a dodávateľov. Existujúci kontakt sa nezdvojí, len sa doplní.":
    "<0>Adresář</0> — najednou přenesete až 1000 odběratelů a dodavatelů. Existující kontakt se nezdvojí, jen se doplní.",
  "<0>Cenník</0> — produkty a služby, ktoré sa dajú synchronizovať napríklad z e-shopu.":
    "<0>Ceník</0> — produkty a služby, které lze synchronizovat například z e-shopu.",
  "<0>Bankové účty</0> — účet banky, ku ktorej sa Faktero nepripojí, založíte cez API a pohyby naň posielate dávkami. Duplicity sa preskočia. Poplatok, mzdu či transakčnú daň označíte ako vybavené bez dokladu.":
    "<0>Bankovní účty</0> — účet banky, ke které se Faktero nepřipojí, založíte přes API a pohyby na něj posíláte dávkami. Duplicity se přeskočí. Poplatek, mzdu či transakční daň označíte jako vyřízené bez dokladu.",
  "<0>Firmy a používatelia</0> — kľúčom pre viac firiem založíte firmu nového klienta a pozvete do nej účtovníka či kolegu (pozvánka príde e-mailom).":
    "<0>Firmy a uživatelé</0> — klíčem pro více firem založíte firmu nového klienta a pozvete do ní účetního či kolegu (pozvánka přijde e-mailem).",
  "Pri každom zápise môžete poslať vlastné <0>external_id</0> — opakované odoslanie potom nič nezdvojí. Cez API sa maže len ručne pridaná úhrada prijatej faktúry; faktúra sa dá len stornovať. Presný tvar údajov je v <1>API dokumentácii</1>.":
    "Při každém zápisu můžete poslat vlastní <0>external_id</0> — opakované odeslání pak nic nezdvojí. Přes API se maže jen ručně přidaná úhrada přijaté faktury; fakturu lze jen stornovat. Přesný tvar údajů je v <1>API dokumentaci</1>.",
  "Faktero sa dá napojiť na AI asistenta cez <0>MCP</0> (Model Context Protocol). Asistent potom odpovie, kto vám dlhuje, nájde faktúru, vystaví novú, zapíše prijatú faktúru či bloček, založí odberateľa, produkt alebo firmu, prenesie kontakty a bankové pohyby, označí úhradu (aj čiastočnú), nastaví stav, štítky či zaúčtovanie dokladu, vybaví bankový pohyb bez dokladu, pozve kolegu alebo pozrie pohyby na účte. Zmaže nanajvýš ručne pridanú úhradu prijatej faktúry a nič neposiela odberateľom.":
    "Faktero lze napojit na AI asistenta přes <0>MCP</0> (Model Context Protocol). Asistent pak odpoví, kdo vám dluží, najde fakturu, vystaví novou, zapíše přijatou fakturu či účtenku, založí odběratele, produkt nebo firmu, přenese kontakty a bankovní pohyby, označí úhradu (i částečnou), nastaví stav, štítky či zaúčtování dokladu, vyřídí bankovní pohyb bez dokladu, pozve kolegu nebo se podívá na pohyby na účtu. Smaže nanejvýš ručně přidanou úhradu přijaté faktury a nic neposílá odběratelům.",
};
