// Automatische Prüfung empfangener E-Rechnungen (efaktura.prijate.tsx, NalezyKontrolyEfaktury.tsx).
export default {
  Kontrola: "Prüfung",
  "Kontrola: —": "Prüfung: —",
  "Kontrola: OK": "Prüfung: OK",
  "Kontrola: {c} chýb, {v} varovaní": "Prüfung: {c} Fehler, {v} Warnungen",
  "Kontrola: {n} chýb": "Prüfung: {n} Fehler",
  "Kontrola: {n} varovaní": "Prüfung: {n} Warnungen",
  "Zobraziť nálezy kontroly": "Prüfergebnisse anzeigen",
  "eFaktúra, z ktorej doklad vznikol, má podľa automatickej kontroly chyby ({n}).":
    "Die E-Rechnung, aus der dieser Beleg entstanden ist, enthält laut automatischer Prüfung Fehler ({n}).",
  "Skontrolujte sumy, DPH a povinné údaje. Nálezy nájdete v Prijatých eFaktúrach.":
    "Prüfen Sie Beträge, USt und Pflichtangaben. Die Ergebnisse finden Sie unter Empfangene E-Rechnungen.",
  "Výsledok kontroly nie je k dispozícii.": "Kein Prüfergebnis verfügbar.",
  "Automatická kontrola podľa EN 16931 a Peppol BIS Billing 3.0 pri prijatí. eFaktúra je prijatá aj s chybami — chyby sú na strane dodávateľa, dajte mu o nich vedieť.":
    "Automatische Prüfung nach EN 16931 und Peppol BIS Billing 3.0 beim Empfang. Die E-Rechnung wurde trotz Fehlern angenommen — die Fehler liegen beim Lieferanten, informieren Sie ihn darüber.",
  "Skontrolované {kedy}.": "Geprüft am {kedy}.",
  "Ďalšie nálezy sa neuložili: {n}.": "Weitere nicht gespeicherte Ergebnisse: {n}.",
  "Automatická kontrola našla v tejto eFaktúre chyby ({n}). Sumy, DPH alebo povinné údaje nemusia byť správne. Zaevidovať ju aj tak ako prijatú faktúru?":
    "Die automatische Prüfung hat in dieser E-Rechnung Fehler gefunden ({n}). Beträge, USt oder Pflichtangaben sind möglicherweise nicht korrekt. Trotzdem als Eingangsrechnung erfassen?",
  "Zaevidovať aj tak": "Trotzdem erfassen",
  "Pozor: eFaktúra má podľa automatickej kontroly chyby ({n}) — skontrolujte sumy a DPH na prijatej faktúre.":
    "Achtung: Die E-Rechnung enthält laut automatischer Prüfung Fehler ({n}) — prüfen Sie Beträge und USt auf der Eingangsrechnung.",
  // Manuál pomoc.efaktura.tsx, časť Prijaté eFaktúry.
  "<0>Kontrola</0> — každú prijatú eFaktúru Faktero hneď skontroluje podľa EN 16931 a Peppol BIS 3.0 a v zozname ukáže „Kontrola: OK“, počet varovaní alebo chýb. Kliknutím na odznak uvidíte nálezy s kódom pravidla. eFaktúra s chybami sa prijme tiež; pri zaevidovaní sa Faktero opýta, či ju naozaj chcete zaevidovať, a na prijatej faktúre ostane upozornenie. Chyby sú na strane dodávateľa — dajte mu o nich vedieť.":
    "<0>Prüfung</0> — jede empfangene E-Rechnung prüft Faktero sofort nach EN 16931 und Peppol BIS 3.0 und zeigt in der Liste „Prüfung: OK“, die Anzahl der Warnungen oder Fehler. Ein Klick auf das Abzeichen zeigt die Ergebnisse mit Regelcode. Eine E-Rechnung mit Fehlern wird trotzdem angenommen; beim Erfassen fragt Faktero nach, ob Sie sie wirklich erfassen möchten, und auf der Eingangsrechnung bleibt ein Hinweis. Die Fehler liegen beim Lieferanten — informieren Sie ihn darüber.",
};
