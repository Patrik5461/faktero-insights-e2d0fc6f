/* Vlna „na 100 %“ — web: české výkazy DPH (kľúče po slovensky), 404, prístupnosť. */
const slovnik: Record<string, string> = {
  "Hlavné menu": "Hlavní menu",
  Oznam: "Oznámení",
  Výber: "Výběr",
  "Stránka sa nenašla — Faktero": "Stránka nenalezena — Faktero",
  "Zabudli ste heslo do Faktera? Zadajte e-mail a pošleme vám odkaz na nastavenie nového hesla.":
    "Zapomněli jste heslo do Faktera? Zadejte e-mail a pošleme vám odkaz na nastavení nového hesla.",
  "Výkazy sa nepodarilo zostaviť.": "Výkazy se nepodařilo sestavit.",
  "Vyplňte kód finančného úradu (3 číslice, napr. 451 pre Prahu).":
    "Vyplňte kód finančního úřadu (3 číslice, např. 451 pro Prahu).",
  "Firma nemá DIČ — doplňte ho v Nastaveniach firmy.":
    "Firma nemá DIČ — doplňte ho v Nastavení firmy.",
  "Priznanie k DPH a kontrolné hlásenie zostavené z dokladov, v XML pre portál MOJE daně.":
    "Přiznání k DPH a kontrolní hlášení sestavené z dokladů, v XML pro portál MOJE daně.",
  "Finančný úrad (kód)": "Finanční úřad (kód)",
  "Územné pracovisko (kód)": "Územní pracoviště (kód)",
  "CZ-NACE (hlavná činnosť)": "CZ-NACE (hlavní činnost)",
  "Podáva — meno": "Podává — jméno",
  "Podáva — priezvisko": "Podává — příjmení",
  "Vzťah k firme": "Vztah k firmě",
  "Kód predmetu plnenia (prenesenie daňovej povinnosti § 92a)":
    "Kód předmětu plnění (přenesení daňové povinnosti § 92a)",
  "— nevybrané —": "— nevybráno —",
  "Kódy finančných úradov a pracovísk nájdete v číselníkoch na portáli MOJE daně (napr. 451 = Finanční úřad pro hlavní město Prahu). Kontrolné hlásenie podáva právnická osoba vždy za mesiac — pri štvrťročnom priznaní sa zostaví za každý mesiac zvlášť.":
    "Kódy finančních úřadů a pracovišť najdete v číselnících na portálu MOJE daně (např. 451 = Finanční úřad pro hlavní město Prahu). Kontrolní hlášení podává právnická osoba vždy za měsíc — u čtvrtletního přiznání se sestaví za každý měsíc zvlášť.",
  "Pred podaním doplňte ({n})": "Před podáním doplňte ({n})",
  "DPHDP3 · sumy v celých korunách": "DPHDP3 · částky v celých korunách",
  Riadne: "Řádné",
  "Riadne opravné": "Řádné opravné",
  Dodatočné: "Dodatečné",
  "Dodatočné opravné": "Dodatečné opravné",
  "r. {r}": "ř. {r}",
  "Súhrnné hlásenie": "Souhrnné hlášení",
  "DPHSHV · dodanie tovaru a služieb do EÚ · v celých korunách":
    "DPHSHV · dodání zboží a služeb do EU · v celých korunách",
  "V období nie sú žiadne dodávky do EÚ — súhrnné hlásenie sa nepodáva.":
    "V období nejsou žádné dodávky do EU — souhrnné hlášení se nepodává.",
  "Odberateľ (IČ DPH)": "Odběratel (VAT ID)",
  "Kód plnenia": "Kód plnění",
  "0 – dodanie tovaru": "0 – dodání zboží",
  "2 – trojstranný obchod": "2 – třístranný obchod",
  "Pri dodaní tovaru sa súhrnné hlásenie podáva za každý mesiac — prepnite obdobie na mesiac.":
    "Při dodání zboží se souhrnné hlášení podává za každý měsíc — přepněte období na měsíc.",
  "Vyberte kód predmetu plnenia pre prenesenie daňovej povinnosti.":
    "Vyberte kód předmětu plnění pro přenesení daňové povinnosti.",
  "Kontrolné hlásenie — {mesic}": "Kontrolní hlášení — {mesic}",
  "DPHKH1 · sumy na halier": "DPHKH1 · částky na haléře",
  "Tuzemské plnenia — základná sadzba, základ": "Tuzemská plnění — základní sazba, základ",
  "Tuzemské plnenia — základná sadzba, daň": "Tuzemská plnění — základní sazba, daň",
  "Tuzemské plnenia — znížená sadzba, základ": "Tuzemská plnění — snížená sazba, základ",
  "Tuzemské plnenia — znížená sadzba, daň": "Tuzemská plnění — snížená sazba, daň",
  "Nadobudnutie tovaru z EÚ — základná sadzba, základ":
    "Pořízení zboží z EU — základní sazba, základ",
  "Prijatie služby z EÚ (§ 9/1) — základ": "Přijetí služby z EU (§ 9/1) — základ",
  "Prijatie služby z EÚ (§ 9/1) — daň": "Přijetí služby z EU (§ 9/1) — daň",
  "Prenesenie daňovej povinnosti — odberateľ, základ":
    "Přenesení daňové povinnosti — odběratel, základ",
  "Prenesenie daňovej povinnosti — odberateľ, daň": "Přenesení daňové povinnosti — odběratel, daň",
  "Plnenie od osoby neusadenej v tuzemsku — základ": "Plnění od osoby neusazené — základ",
  "Plnenie od osoby neusadenej v tuzemsku — daň": "Plnění od osoby neusazené — daň",
  "Dodanie tovaru do EÚ (§ 64)": "Dodání zboží do EU (§ 64)",
  "Služby do EÚ (§ 9/1)": "Služby do EU (§ 9/1)",
  "Vývoz tovaru (§ 66)": "Vývoz zboží (§ 66)",
  "Prenesenie daňovej povinnosti — dodávateľ (§ 92a)":
    "Přenesení daňové povinnosti — dodavatel (§ 92a)",
  "Trojstranný obchod — dodanie": "Třístranný obchod — dodání",
  "Odpočet z tuzemska — základná sadzba, základ": "Odpočet z tuzemska — základní sazba, základ",
  "Odpočet z tuzemska — základná sadzba, daň": "Odpočet z tuzemska — základní sazba, daň",
  "Odpočet z tuzemska — znížená sadzba, základ": "Odpočet z tuzemska — snížená sazba, základ",
  "Odpočet z tuzemska — znížená sadzba, daň": "Odpočet z tuzemska — snížená sazba, daň",
  "Dovoz tovaru (colný úrad) — základ": "Dovoz zboží (celní úřad) — základ",
  "Dovoz tovaru (colný úrad) — odpočet": "Dovoz zboží (celní úřad) — odpočet",
  "Odpočet zo samovymerania — základná sadzba, základ":
    "Odpočet ze samovyměření — základní sazba, základ",
  "Odpočet zo samovymerania — základná sadzba, daň":
    "Odpočet ze samovyměření — základní sazba, daň",
  "Odpočet dane celkom": "Odpočet daně celkem",
  "Daň na výstupe celkom": "Daň na výstupu celkem",
  "A.1 Prenesenie daňovej povinnosti — dodávateľ": "A.1 Přenesení daňové povinnosti — dodavatel",
  "A.2 Prijaté plnenia zo zahraničia": "A.2 Přijatá plnění ze zahraničí",
  "A.4 Vystavené doklady nad 10 000 Kč": "A.4 Vydané doklady nad 10 000 Kč",
  "A.5 Ostatné vystavené (súhrnne)": "A.5 Ostatní vydané (souhrnně)",
  "B.1 Prenesenie daňovej povinnosti — odberateľ": "B.1 Přenesení daňové povinnosti — odběratel",
  "B.2 Prijaté doklady nad 10 000 Kč": "B.2 Přijaté doklady nad 10 000 Kč",
  "B.3 Ostatné prijaté (súhrnne)": "B.3 Ostatní přijaté (souhrnně)",
  "Doplňte DIČ pri doklade {doklady} — pri prenesení daňovej povinnosti je povinné.":
    "Doplňte DIČ u dokladu {doklady} — v přenesení daňové povinnosti je povinné.",
  "Doplňte DIČ pri dokladoch {doklady} — pri prenesení daňovej povinnosti je povinné.":
    "Doplňte DIČ u dokladů {doklady} — v přenesení daňové povinnosti je povinné.",
  "mesiac::Január": "Leden",
  "mesiac::Február": "Únor",
  "mesiac::Marec": "Březen",
  "mesiac::Apríl": "Duben",
  "mesiac::Máj": "Květen",
  "mesiac::Jún": "Červen",
  "mesiac::Júl": "Červenec",
  "mesiac::August": "Srpen",
  "mesiac::September": "Září",
  "mesiac::Október": "Říjen",
  "mesiac::November": "Listopad",
  "mesiac::December": "Prosinec",
};

export default slovnik;
