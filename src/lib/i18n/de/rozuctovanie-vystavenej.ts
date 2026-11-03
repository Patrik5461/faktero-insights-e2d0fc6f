// Deutsche Übersetzung. Aufteilung ausgestellter Rechnungen (Codes je Position, Betragsaufteilung).
export default {
  "Stredisko položky {n}": "Kostenstelle der Position {n}",
  "Činnosť položky {n}": "Tätigkeit der Position {n}",
  "Stredisko riadku {n}": "Kostenstelle der Zeile {n}",
  "Činnosť riadku {n}": "Tätigkeit der Zeile {n}",
  "Rozúčtovaná na {n} riadky": "Auf {n} Zeilen aufgeteilt",
  "Kódy pri položkách": "Codes je Position",
  "str.": "KSt.",
  "čin.": "Tät.",
  "Faktúra nemá položky.": "Die Rechnung hat keine Positionen.",
  "Faktúra má prenesenie daňovej povinnosti len pri niektorých položkách — rozúčtujte ju kódmi pri položkách.":
    "Die Rechnung hat Reverse Charge nur bei einigen Positionen — teilen Sie sie über Codes je Position auf.",
  "Položky majú colné údaje (Intrastat) — rozúčtujte faktúru kódmi pri položkách, aby sa colné údaje nestratili.":
    "Die Positionen haben Zolldaten (Intrastat) — teilen Sie die Rechnung über Codes je Position auf, damit die Zolldaten erhalten bleiben.",
  "Položka bez kódu dostane kód faktúry. Keď majú položky rôzne predkontácie, strediská alebo činnosti, hlavička v Pohode dostane „Rozúčtovať“.":
    "Eine Position ohne Code erhält den Code der Rechnung. Haben die Positionen unterschiedliche Vorkontierungen, Kostenstellen oder Tätigkeiten, erhält der Kopf in Pohoda „Rozúčtovať“ (Aufteilen).",
  "Faktúra je už v Pohode — najprv ju vráťte z Pohody.":
    "Die Rechnung ist bereits in Pohoda — holen Sie sie zuerst aus Pohoda zurück.",
} satisfies Record<string, string>;
