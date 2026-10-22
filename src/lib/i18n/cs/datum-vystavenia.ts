// Dátum vystavenia pred prvým odoslaním faktúry (okno, hromadné odoslanie, API, manuál).
export default {
  "Dátum vystavenia nie je dnešný": "Datum vystavení není dnešní",
  "Dátum vystavenia je {datum}. Faktúra sa odosiela dnes — dátum vystavenia by mal byť aktuálny.":
    "Datum vystavení je {datum}. Faktura se odesílá dnes — datum vystavení by mělo být aktuální.",
  "Dátum vystavenia: {stary} → {novy}": "Datum vystavení: {stary} → {novy}",
  "Splatnosť: {stara} → {nova} (lehota ostáva rovnaká)":
    "Splatnost: {stara} → {nova} (lhůta zůstává stejná)",
  "Dátum dodania ostáva {datum}.": "Datum zdanitelného plnění zůstává {datum}.",
  "Faktúra sa presunie do iného roka. Číslo {cislo} ostáva pôvodné.":
    "Faktura se přesune do jiného roku. Číslo {cislo} zůstává původní.",
  "Faktúra sa presunie do iného mesiaca. Číslo {cislo} ostáva pôvodné.":
    "Faktura se přesune do jiného měsíce. Číslo {cislo} zůstává původní.",
  "Obdobie je uzamknuté uzávierkou do {datum}, dátum vystavenia sa už zmeniť nedá.":
    "Období je uzamčeno uzávěrkou do {datum}, datum vystavení už nelze změnit.",
  "Faktúra je už vyvezená do účtovníctva — zmena dátumu by v účtovníctve nesedela.":
    "Faktura je už exportována do účetnictví — změna data by v účetnictví neseděla.",
  "Dátum vystavenia sa zmeniť nedá.": "Datum vystavení nelze změnit.",
  "Faktúru môžete odoslať len s pôvodným dátumom {datum}.":
    "Fakturu můžete odeslat jen s původním datem {datum}.",
  "Mením dátum…": "Měním datum…",
  "Zmeniť dátum vystavenia na dnes a odoslať": "Změnit datum vystavení na dnes a odeslat",
  "Odoslať s dátumom {datum}": "Odeslat s datem {datum}",
  "Dátum sa nepodarilo zmeniť.": "Datum se nepodařilo změnit.",
  "Faktúru sa nepodarilo zmeniť — skontrolujte oprávnenie alebo ju otvorte znova.":
    "Fakturu se nepodařilo změnit — zkontrolujte oprávnění nebo ji otevřete znovu.",
  "Dátum vystavenia je zmenený na dnes.": "Datum vystavení je změněno na dnešek.",
  "Faktúry so starším dátumom vystavenia: {n}. Faktúra sa odosiela dnes — dátum vystavenia by mal byť aktuálny.":
    "Faktury se starším datem vystavení: {n}. Faktura se odesílá dnes — datum vystavení by mělo být aktuální.",
  "Dátum vystavenia sa zmení na dnes pri {n} z nich, splatnosť sa posunie o rovnaký počet dní a dátum dodania ostáva.":
    "U {n} z nich se datum vystavení změní na dnes, splatnost se posune o stejný počet dní a datum zdanitelného plnění zůstává.",
  "Faktúry, ktorým sa dátum zmeniť nedá (uzamknuté obdobie alebo export do účtovníctva): {n}. Hromadne sa neodošlú — pošlite ich jednotlivo z detailu faktúry.":
    "Faktury, u kterých datum nelze změnit (uzamčené období nebo export do účetnictví): {n}. Hromadně se neodešlou — pošlete je jednotlivě z detailu faktury.",
  "Odoslať ostatné": "Odeslat ostatní",
  'Pri prvom odoslaní musí byť dátum vystavenia dnešný. Faktúru so starším dátumom API odmietne odpoveďou 409 s kódom issue_date_in_past (v details je issue_date, today, new_due_date a can_update). Pošlite požiadavku znova s "update_issue_date": true — dátum vystavenia sa zmení na dnes, splatnosť sa posunie o rovnaký počet dní a dátum dodania ostáva. Keď sa dátum zmeniť nedá (can_update: false — uzamknuté obdobie alebo export do účtovníctva), faktúru odošle s pôvodným dátumom až "keep_issue_date": true. Upomienky a opätovné odoslanie sa nekontrolujú.':
    'Při prvním odeslání musí být datum vystavení dnešní. Fakturu se starším datem API odmítne odpovědí 409 s kódem issue_date_in_past (v details je issue_date, today, new_due_date a can_update). Pošlete požadavek znovu s "update_issue_date": true — datum vystavení se změní na dnes, splatnost se posune o stejný počet dní a datum zdanitelného plnění zůstává. Když datum nelze změnit (can_update: false — uzamčené období nebo export do účetnictví), fakturu odešle s původním datem až "keep_issue_date": true. Upomínky a opakované odeslání se nekontrolují.',
  "Pri <0>prvom odoslaní</0> (e-mailom aj eFaktúrou) musí byť dátum vystavenia dnešný. Keď ste faktúru vystavili skôr a posielate ju až dnes, Faktero to oznámi a ponúkne <1>Zmeniť dátum vystavenia na dnes a odoslať</1> — splatnosť sa posunie o rovnaký počet dní, dátum dodania aj číslo faktúry ostávajú. Faktúru z uzamknutého obdobia alebo už vyvezenú do účtovníctva zmeniť nemožno; tá sa odošle s pôvodným dátumom až po výslovnom potvrdení.":
    "Při <0>prvním odeslání</0> (e-mailem i e-fakturou) musí být datum vystavení dnešní. Když jste fakturu vystavili dříve a posíláte ji až dnes, Faktero na to upozorní a nabídne <1>Změnit datum vystavení na dnes a odeslat</1> — splatnost se posune o stejný počet dní, datum zdanitelného plnění i číslo faktury zůstávají. Fakturu z uzamčeného období nebo už exportovanou do účetnictví změnit nelze; ta se odešle s původním datem až po výslovném potvrzení.",
};
