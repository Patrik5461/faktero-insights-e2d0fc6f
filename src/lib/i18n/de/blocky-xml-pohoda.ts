// Bločky: Export nach Pohoda als reine XML-Datei oder als ZIP mit Scans (doklady.index.tsx, VolbyExportuOkno).
export default {
  "XML pre Pohodu: {n} dokladov": "XML für Pohoda: {n} Belege",
  "V ZIP-e nie je XML pre Pohodu — žiadny doklad neprešiel kontrolou":
    "Im ZIP ist kein XML für Pohoda — kein Beleg hat die Prüfung bestanden",
  "v XML pre Pohodu {n}": "im XML für Pohoda {n}",
  "pohoda.xml, súpiska CSV a skeny dokladov": "pohoda.xml, CSV-Liste und Belegscans",
  "Len pohoda.xml na import do Pohody, bez skenov (tie sú v ZIP-e)":
    "Nur pohoda.xml für den Import in Pohoda, ohne Scans (die sind im ZIP)",
  "Bločky do Pohody — samotné XML na import, alebo ZIP so XML a skenmi":
    "Kassenbons nach Pohoda — nur die XML-Datei für den Import oder ein ZIP mit XML und Scans",
  "Len pohoda.xml na import, bez skenov.": "Nur pohoda.xml für den Import, ohne Scans.",
  "ZIP (XML + skeny)": "ZIP (XML + Scans)",
  "pohoda.xml, súpiska CSV a skeny dokladov.": "pohoda.xml, CSV-Liste und Belegscans.",
  // Manuál Prepojenie s Pohodou (pomoc.pohoda.tsx), voľby exportu.
  "<0>Súbor</0> (bločky) — <1>XML pre Pohodu</1> stiahne len pohoda.xml na import (Súbor → Dátová komunikácia → XML import/export), <2>ZIP (XML + skeny)</2> k nemu pridá súpisku v CSV a skeny dokladov. Obe tlačidlá sú aj priamo nad zoznamom Bločkov a v ponuke Hromadná akcia.":
    "<0>Datei</0> (Kassenbons) — <1>XML für Pohoda</1> lädt nur pohoda.xml für den Import herunter (Datei → Datenkommunikation → XML-Import/Export), <2>ZIP (XML + Scans)</2> fügt eine CSV-Liste und die Belegscans hinzu. Beide Schaltflächen gibt es auch direkt über der Liste der Kassenbons und im Menü Sammelaktion.",
  "Doklad, ktorý by Pohoda mohla zaúčtovať zle, export pred stiahnutím ukáže v okne ako závažnú chybu a povie prečo — napríklad hotovostný bloček, keď sa bločky posielajú podľa platby a firma nemá vyplnenú skratku pokladne. Tlačidlom Exportovať aj tak pôjde do XML aj tak a v ZIP-e je ten zoznam v súbore pohoda-skontrolovat.txt; tlačidlom Opravím to sa nič nevyvezie. Automatický konektor taký doklad nepošle, kým ho neopravíte. Doklad, ktorý je v evidencii dvakrát, alebo faktúra inej firmy do XML nejdú nikdy — tie sú v pohoda-nevyvezene.txt.":
    "Einen Beleg, den Pohoda falsch verbuchen könnte, zeigt der Export vor dem Herunterladen im Fenster als schwerwiegenden Fehler an und sagt warum — zum Beispiel ein Barbeleg, wenn Kassenbons nach Zahlungsart übertragen werden und die Firma kein Kassenkürzel ausgefüllt hat. Mit der Schaltfläche Trotzdem exportieren kommt er trotzdem ins XML, und im ZIP steht diese Liste in der Datei pohoda-skontrolovat.txt; mit Ich korrigiere es wird nichts exportiert. Der automatische Konnektor sendet einen solchen Beleg erst, wenn Sie ihn korrigiert haben. Ein doppelt erfasster Beleg oder eine Rechnung einer anderen Firma kommt nie ins XML — diese stehen in pohoda-nevyvezene.txt.",
};
