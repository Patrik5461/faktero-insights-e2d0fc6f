// Vzorové dáta pre testy importu číselníka z obrázka (nie produkčný kód).
/** 19 riadkov číselníka „Členenie KV DPH“ z Pohody (ako na screenshote v teste 5). */
export const KV_19: { kod: string; popis: string; kategoria: string }[] = [
  { kod: "A1", popis: "Dodanie tovarov a služieb", kategoria: "A1 Dodanie - Vydané faktúry" },
  { kod: "A2CN", popis: "Tovary - kovy, colný sadzobník", kategoria: "A2 Prenesenie - Vydané faktúry" },
  { kod: "A2IO", popis: "Integrované obvody", kategoria: "A2 Prenesenie - Vydané faktúry" },
  { kod: "A2MT", popis: "Mobilné telefóny", kategoria: "A2 Prenesenie - Vydané faktúry" },
  { kod: "A2SP", popis: "Stavebné práce", kategoria: "A2 Prenesenie - Vydané faktúry" },
  { kod: "B1", popis: "Prijaté plnenia s prenesením", kategoria: "B1 Prenesenie - Prijaté faktúry" },
  { kod: "B1-0", popis: "Prenesenie bez odpočtu", kategoria: "B1 Prenesenie - Prijaté faktúry" },
  { kod: "B2", popis: "Prijaté faktúry s odpočtom", kategoria: "B2 Odpočet - Prijaté faktúry" },
  { kod: "B3", popis: "Zjednodušené faktúry, ERP", kategoria: "B3 Zjednodušené - Prijaté faktúry" },
  { kod: "C1", popis: "Opravy vydaných faktúr", kategoria: "C1 Opravy - Vydané dobropisy" },
  { kod: "C1CN", popis: "Opravy - kovy", kategoria: "C1 Opravy - Vydané dobropisy" },
  { kod: "C1IO", popis: "Opravy - integrované obvody", kategoria: "C1 Opravy - Vydané dobropisy" },
  { kod: "C1MT", popis: "Opravy - mobilné telefóny", kategoria: "C1 Opravy - Vydané dobropisy" },
  { kod: "C2", popis: "Opravy prijatých faktúr", kategoria: "C2 Opravy - Prijaté dobropisy" },
  { kod: "C2B1", popis: "Opravy prenesenia", kategoria: "C2 Opravy - Prijaté dobropisy" },
  { kod: "C2B1-0", popis: "Opravy prenesenia bez odpočtu", kategoria: "C2 Opravy - Prijaté dobropisy" },
  { kod: "D1", popis: "Tržby ERP", kategoria: "D1 Súhrn - Vydané faktúry" },
  { kod: "D2", popis: "Ostatné vydané faktúry", kategoria: "D2 Súhrn - Vydané faktúry" },
  { kod: "KN", popis: "Nezahrnovať do KV DPH", kategoria: "Všetky doklady" },
];
