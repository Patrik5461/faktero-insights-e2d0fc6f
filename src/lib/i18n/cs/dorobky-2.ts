// Dorobky 2 (30. 10. 2026): daňový režim podľa odberateľa, výkazy, storno dokladu k platbe, zvonček, vrátenie z iného programu, Excel, prístupnosť.
export default {
  // Daňový režim podľa odberateľa (faktúra do EÚ a mimo EÚ) — formulár faktúry a API.
  "Odberateľ mimo EÚ — vývoz tovaru alebo služba mimo EÚ":
    "Odběratel mimo EU — vývoz zboží nebo služba mimo EU",
  "Vývoz tovaru (oslobodené podľa § 47)": "Vývoz zboží (osvobozeno od daně)",
  "Služba mimo EÚ (miesto dodania podľa § 15 ods. 1)": "Služba mimo EU (místo plnění u odběratele)",
  "Vývoz tovaru ide do priznania (r. 13 a 15), služba s miestom dodania mimo EÚ do priznania nepatrí.":
    "Vývoz zboží patří do přiznání jako osvobozené plnění, služba s místem plnění mimo EU jako plnění s místem plnění mimo tuzemsko.",
  "Odberateľ z krajiny {krajina} nemá IČ DPH — ako spotrebiteľovi mu fakturujete s DPH. Ak ste za rok prekročili 10 000 € predaja spotrebiteľom v celej EÚ alebo ste prihlásený do OSS, zapnite Predaj spotrebiteľovi v EÚ (OSS). Ak ide o firmu, doplňte jej IČ DPH v karte odberateľa.":
    "Odběratel ze státu {krajina} nemá DIČ — jako spotřebiteli mu fakturujete s DPH. Pokud jste za rok překročili 10 000 € prodeje spotřebitelům v celé EU nebo jste registrováni do OSS, zapněte Prodej spotřebiteli v EU (OSS). Pokud jde o firmu, doplňte její DIČ v kartě odběratele.",
  "Odberateľ má IČ DPH iného štátu EÚ ({ic}), faktúra však nie je nastavená ako dodanie do EÚ. Firme z EÚ sa DPH zvyčajne neúčtuje — tovar je oslobodený podľa § 43, pri službe daň prizná odberateľ.":
    "Odběratel má DIČ jiného státu EU ({ic}), faktura ale není nastavená jako dodání do EU. Firmě z EU se DPH obvykle neúčtuje — zboží je osvobozené, u služby daň přizná odběratel.",
  "Odberateľ je mimo EÚ ({krajina}), faktúra však nie je nastavená ako vývoz ani služba mimo EÚ. DPH sa mu zvyčajne neúčtuje.":
    "Odběratel je mimo EU ({krajina}), faktura ale není nastavená jako vývoz ani služba mimo EU. DPH se mu obvykle neúčtuje.",
  "Nastaviť dodanie do EÚ": "Nastavit dodání do EU",
  "Nastaviť plnenie mimo EÚ": "Nastavit plnění mimo EU",
  "Odberateľ má IČ DPH iného štátu EÚ ({ic}) — faktúra je bez DPH: služba s miestom dodania u odberateľa (§ 15 ods. 1), daň prizná odberateľ (prenesenie daňovej povinnosti). Veta o tom sa vytlačí na faktúru.":
    "Odběratel má DIČ jiného státu EU ({ic}) — faktura je bez DPH: služba s místem plnění u odběratele, daň přizná odběratel (přenesení daňové povinnosti). Věta o tom se vytiskne na fakturu.",
  "Odberateľ má IČ DPH iného štátu EÚ ({ic}) — faktúra je bez DPH ako trojstranný obchod.":
    "Odběratel má DIČ jiného státu EU ({ic}) — faktura je bez DPH jako třístranný obchod.",
  "Odberateľ má IČ DPH iného štátu EÚ ({ic}) — faktúra je bez DPH: dodanie tovaru do iného členského štátu oslobodené podľa § 43. Veta o tom sa vytlačí na faktúru.":
    "Odběratel má DIČ jiného státu EU ({ic}) — faktura je bez DPH: dodání zboží do jiného členského státu osvobozené od daně. Věta o tom se vytiskne na fakturu.",
  "Odberateľ je mimo EÚ ({krajina}) — faktúra je bez DPH: služba s miestom dodania mimo EÚ (§ 15 ods. 1). Veta o tom sa vytlačí na faktúru.":
    "Odběratel je mimo EU ({krajina}) — faktura je bez DPH: služba s místem plnění mimo EU. Věta o tom se vytiskne na fakturu.",
  "Odberateľ je mimo EÚ ({krajina}) — faktúra je bez DPH: vývoz tovaru oslobodený podľa § 47. Doklad o vývoze (colné vyhlásenie) si odložte.":
    "Odběratel je mimo EU ({krajina}) — faktura je bez DPH: vývoz zboží osvobozený od daně. Doklad o vývozu (celní prohlášení) si uschovejte.",
  "Z položiek nevieme, či ide o tovar — navrhli sme službu. Ak dodávate tovar, zmeňte druh plnenia nižšie.":
    "Z položek nepoznáme, zda jde o zboží — navrhli jsme službu. Pokud dodáváte zboží, změňte druh plnění níže.",
  'Daňový režim: bez poľa reverse_charge ho Faktero určí podľa odberateľa. Firma s IČ DPH iného štátu EÚ dostane faktúru bez DPH ako dodanie do EÚ (reverse_charge_type "eu_b2b"), odberateľ mimo EÚ ako vývoz ("export"); tovar alebo službu povie eu_plnenie ("tovar", "sluzba"; predvolene tovar). Ak niektorá položka nesie nenulovú sadzbu DPH, režim sa nemení — počíta sa s tým, že DPH ste účtovali zámerne. Režim nastavíte aj sami: "reverse_charge": true s reverse_charge_type ("domestic_69", "eu_b2b", "export"), alebo "reverse_charge": false pre tuzemskú DPH.':
    'Daňový režim: bez pole reverse_charge ho Faktero určí podle odběratele. Firma s DIČ jiného státu EU dostane fakturu bez DPH jako dodání do EU (reverse_charge_type "eu_b2b"), odběratel mimo EU jako vývoz ("export"); zboží nebo službu určí eu_plnenie ("tovar", "sluzba"; výchozí je zboží). Pokud některá položka nese nenulovou sazbu DPH, režim se nemění — počítá se s tím, že DPH jste účtovali záměrně. Režim nastavíte i sami: "reverse_charge": true s reverse_charge_type ("domestic_69", "eu_b2b", "export"), nebo "reverse_charge": false pro tuzemskou DPH.',
  // Odpočet bez DIČ dodavatele (výkazy DPH) a storno daňového dokladu k platbě (POHODA).
  "Chýba IČ DPH dodávateľa — bez neho sa DPH odpočítať nedá, faktúra preto nie je v odpočte priznania (r. 18–21) ani v časti B.2. Doplňte IČ DPH dodávateľa na faktúre.":
    "Chybí IČ DPH dodavatele — bez něj nelze DPH odečíst, faktura proto není v odpočtu přiznání (ř. 18–21) ani v části B.2. Doplňte IČ DPH dodavatele na faktuře.",
  "Doklad označený pre B.2 nemá číslo alebo IČ DPH dodávateľa — nie je v odpočte priznania ani v kontrolnom výkaze. Doplňte ich, alebo doklad preraďte do B.3 (zjednodušená faktúra).":
    "Doklad označený pro B.2 nemá číslo nebo IČ DPH dodavatele — není v odpočtu přiznání ani v kontrolním výkazu. Doplňte je, nebo doklad přeřaďte do B.3 (zjednodušená faktura).",
  "Daňový doklad k platbe {cislo} je už v Pohode ako interný doklad. Interný doklad sa cez XML stornovať nedá, preto storno do Pohody nepošleme. Po stornovaní tu ho zrušte aj v Pohode: Účtovníctvo → Interné doklady, nájdite doklad {cislo} a zvoľte Záznam → Storno. Stornovať doklad vo Fakteri?":
    "Daňový doklad k platbě {cislo} je už v Pohodě jako interní doklad. Interní doklad nelze přes XML stornovat, proto storno do Pohody nepošleme. Po stornování zde jej zrušte i v Pohodě: Účetnictví → Interní doklady, najděte doklad {cislo} a zvolte Záznam → Storno. Stornovat doklad ve Fakteru?",
  // Zvonek (notifications.ts) a vrácení dokladu z jiného programu než Pohoda (stav-odovzdania.ts).
  "{termin} {vozidlo}: platnosť skončila": "{termin} {vozidlo}: platnost skončila",
  "{termin} {vozidlo}: platnosť končí dnes": "{termin} {vozidlo}: platnost končí dnes",
  "{termin} {vozidlo}: platnosť končí o 1 deň": "{termin} {vozidlo}: platnost končí za 1 den",
  "{termin} {vozidlo}: platnosť končí o {dni} dni":
    "{termin} {vozidlo}: platnost končí za {dni} dny",
  "{termin} {vozidlo}: platnosť končí o {dni} dní":
    "{termin} {vozidlo}: platnost končí za {dni} dní",
  "{nazov} · platnosť do {datum}": "{nazov} · platnost do {datum}",
  "platnosť do {datum}": "platnost do {datum}",
  "zvoncek::vozidla": "vozidla",
  "Z účtu {ucet} sa nesťahujú pohyby": "Z účtu {ucet} se nestahují pohyby",
  "Z účtu sa nesťahujú pohyby": "Z účtu se nestahují pohyby",
  "naposledy {naposledy} · {chyba}": "naposledy {naposledy} · {chyba}",
  "Súhlas banky na čítanie pohybov vypršal — obnovte ho (Obnoviť súhlas).":
    "Souhlas banky se čtením pohybů vypršel — obnovte ho (Obnovit souhlas).",
  "Súhlas s prístupom k účtu už neplatí — obnovte ho (Obnoviť súhlas).":
    "Souhlas s přístupem k účtu už neplatí — obnovte ho (Obnovit souhlas).",
  "Banka odmietla prístup k pohybom (401) — ak to trvá, obnovte súhlas.":
    "Banka odmítla přístup k pohybům (401) — pokud to trvá, obnovte souhlas.",
  "Banka je dočasne nedostupná — pohyby sa skúsia stiahnuť znova.":
    "Banka je dočasně nedostupná — pohyby se zkusí stáhnout znovu.",
  "Pohyby sa nepodarilo stiahnuť.": "Pohyby se nepodařilo stáhnout.",
  "{prijemca} · {dovod}": "{prijemca} · {dovod}",
  "Neznámy príjemca · {dovod}": "Neznámý příjemce · {dovod}",
  "nesprávne číslo účtu": "nesprávné číslo účtu",
  "účet je zrušený": "účet je zrušen",
  "účet je zablokovaný": "účet je zablokován",
  "na účte nie je táto platba povolená": "na účtu není tato platba povolena",
  "suma prekračuje povolený limit": "částka překračuje povolený limit",
  "nedostatok prostriedkov na účte": "nedostatek prostředků na účtu",
  "duplicitná platba": "duplicitní platba",
  "neznámy príkazca": "neznámý příkazce",
  "neplatný formát platby": "neplatný formát platby",
  "dôvod neuviedol klient": "důvod neuvedl klient",
  "dôvod neuviedla banka": "důvod neuvedla banka",
  "nesprávny kód banky (BIC)": "nesprávný kód banky (BIC)",
  "chýbajú údaje vyžadované predpismi": "chybí údaje vyžadované předpisy",
  "zrušené na žiadosť klienta": "zrušeno na žádost klienta",
  "podozrenie na podvod": "podezření na podvod",
  "banka platbu zamietla": "banka platbu zamítla",
  "odoslanie zlyhalo": "odeslání selhalo",
  "platnosť karty vypršala": "platnost karty vypršela",
  "platba vypršala": "platba vypršela",
  "banka neodpovedala včas": "banka neodpověděla včas",
  "platba bola zrušená": "platba byla zrušena",
  "platba bola vrátená": "platba byla vrácena",
  "overenie platby (3-D Secure) zlyhalo": "ověření platby (3-D Secure) selhalo",
  "neznámy stav": "neznámý stav",
  "Zmeškaná lehota: {druh}": "Zmeškaná lhůta: {druh}",
  "Blíži sa lehota: {druh}": "Blíží se lhůta: {druh}",
  "{odosielatel} · {predmet} · lehota {datum}": "{odosielatel} · {predmet} · lhůta {datum}",
  "{odosielatel} · lehota {datum}": "{odosielatel} · lhůta {datum}",
  "{predmet} · lehota {datum}": "{predmet} · lhůta {datum}",
  "lehota {datum}": "lhůta {datum}",
  "{odberatel} ponuku prijal — dá sa premeniť na faktúru.":
    "{odberatel} nabídku přijal — lze ji převést na fakturu.",
  "Odberateľ ponuku prijal — dá sa premeniť na faktúru.":
    "Odběratel nabídku přijal — lze ji převést na fakturu.",
  "{odberatel}: {poznamka}": "{odberatel}: {poznamka}",
  "Odberateľ: {poznamka}": "Odběratel: {poznamka}",
  "{odberatel} ponuku zamietol.": "{odberatel} nabídku zamítl.",
  "Odberateľ ponuku zamietol.": "Odběratel nabídku zamítl.",
  // Vrátenie dokladu z iného programu než Pohoda (stav-odovzdania.ts).
  "Vrátené z účtovníctva ({program}) — opravte doklad a odovzdajte ho znova":
    "Vráceno z účetnictví ({program}) — opravte doklad a předejte ho znovu",
  "Poslať opravu do účtovníctva ({program})": "Poslat opravu do účetnictví ({program})",
  "Faktúra sa vráti z účtovníctva ({program}), aby sa dala opraviť a odovzdať znova":
    "Faktura se vrátí z účetnictví ({program}), aby se dala opravit a předat znovu",
  "Doklad je odovzdaný do účtovníctva ({program}) — zmeny sa tam už neprenesú.":
    "Doklad je předán do účetnictví ({program}) — změny se tam už nepřenesou.",
  // Export dat firmy (koš v balíku), odkaz „Přeskočit na obsah“.
  "Preskočiť na obsah": "Přeskočit na obsah",
  "Doklady a karty z koša balík nevynechá — sú v samostatnom priečinku „kos“ a do hlavných súborov sa nezapočítavajú. Zmazaná faktúra mohla byť už vystavená a zaúčtovaná, preto ju archivujte rovnako ako ostatné doklady.":
    "Doklady a karty z koše balík nevynechá — jsou v samostatné složce „kos“ a do hlavních souborů se nezapočítávají. Smazaná faktura už mohla být vystavená a zaúčtovaná, proto ji archivujte stejně jako ostatní doklady.",
  "kôš — faktúry": "koš — faktury",
  "kôš — položky faktúr": "koš — položky faktur",
  "kôš — prijaté faktúry": "koš — přijaté faktury",
  "kôš — doklady": "koš — doklady",
  "kôš — iné doklady": "koš — jiné doklady",
  "kôš — odberatelia": "koš — odběratelé",
  "kôš — produkty": "koš — produkty",
  "kôš — pokladňa": "koš — pokladna",
  "kôš — banka": "koš — banka",
  "kôš — jazdy": "koš — jízdy",
  "kôš — zákazky": "koš — zakázky",
};
