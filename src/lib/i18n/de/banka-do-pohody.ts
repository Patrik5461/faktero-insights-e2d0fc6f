// Bankové pohyby do POHODY cez konektor a mesačný balík — NastaveniaPosielaniaPohody.tsx,
// KontrolaPohody.tsx, bankove-ucty.vypisy.tsx, pomoc.pohoda.tsx.
export default {
  "Posielať bankové pohyby do Pohody (most a mesačný balík)": "Bankbewegungen an Pohoda senden (Konnektor und Monatspaket)",
  "Zapnite len ak si účtovníčka výpisy z banky do Pohody nenačítava sama — inak by boli pohyby v Pohode dvakrát. Účty musia mať skratku v Pohode (Firma → Bankové účty).":
    "Nur einschalten, wenn die Buchhalterin die Kontoauszüge nicht selbst aus der Bank in Pohoda einliest — sonst wären die Bewegungen in Pohoda doppelt. Die Konten brauchen ein Kürzel in Pohoda (Firma → Bankkonten).",
  "Bankový pohyb": "Bankbewegung",
  "Bankové pohyby: {c} čaká na odoslanie, {n} na ceste, {e} POHODA neprijala.":
    "Bankbewegungen: {c} warten auf den Versand, {n} unterwegs, {e} von POHODA abgelehnt.",
  "Účet {u} nemá skratku v Pohode — jeho pohyby konektor ani balík neposielajú. Doplňte ju vo Firma → Bankové účty.":
    "Das Konto {u} hat kein Kürzel in Pohoda — seine Bewegungen sendet weder der Konnektor noch das Paket. Ergänzen Sie es unter Firma → Bankkonten.",
  "{n} pohybov z tohto výpisu už do Pohody odišlo cez prepojenie alebo mesačný balík. POHODA ich pri importe odmietne ako duplicitu.":
    "{n} Bewegungen aus diesem Auszug sind bereits über die Anbindung oder das Monatspaket an Pohoda gegangen. POHODA lehnt sie beim Import als Duplikat ab.",
  "Ak si účtovníčka výpisy z banky do Pohody sama nenačítava, zapnite v Účtovníctvo → Predkontácie a členenie DPH/KV, sekcia Nastavenia exportu, <0>Posielať bankové pohyby do Pohody</0>. Pohyby potom idú priamym prepojením aj v mesačnom balíku (súbor pohoda-banka.xml) — za faktúrami a ostatnými dokladmi, aby doklad, ktorý platba uhrádza, už v Pohode bol — a každý len raz. Účet potrebuje skratku v Pohode (Firma → Bankové účty); pohyby účtu bez nej sa neposielajú a Kontrola Pohody to povie.":
    "Wenn die Buchhalterin die Kontoauszüge nicht selbst aus der Bank in Pohoda einliest, schalten Sie unter Buchhaltung → Vorkontierungen und MwSt.-/KV-Gliederung, Abschnitt Exporteinstellungen, <0>Bankbewegungen an Pohoda senden</0> ein. Die Bewegungen gehen dann über die direkte Anbindung und im Monatspaket (Datei pohoda-banka.xml) — nach den Rechnungen und übrigen Belegen, damit der bezahlte Beleg in Pohoda schon vorhanden ist — und jede nur einmal. Das Konto braucht ein Kürzel in Pohoda (Firma → Bankkonten); Bewegungen eines Kontos ohne Kürzel werden nicht gesendet, und die Pohoda-Prüfung weist darauf hin.",
};
