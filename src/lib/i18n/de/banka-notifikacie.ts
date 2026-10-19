// Párovanie cez e-mailové notifikácie banky: /bankove-ucty/notifikacie, tlačidlá
// v Bankové účty a Pripojiť banku, značka „z e-mailu" v transakciách, návody bánk
// (BANKY v banka-notifikacie.ts) a sekcia v manuáli /pomoc/banka.
export default {
  "Adresa skopírovaná": "Adresse kopiert",
  "Kopírovanie sa nepodarilo — označte adresu a skopírujte ju ručne.":
    "Kopieren fehlgeschlagen — markieren Sie die Adresse und kopieren Sie sie manuell.",
  "Párovanie cez e-mailové notifikácie": "Zuordnung über E-Mail-Benachrichtigungen",
  "Párovanie cez e-mailové notifikácie — Faktero":
    "Zuordnung über E-Mail-Benachrichtigungen — Faktero",
  "Pre banky bez priameho pripojenia: banka vám o každej platbe pošle e-mail na tajnú adresu a Faktero z neho založí pohyb a spáruje ho s faktúrou.":
    "Für Banken ohne direkte Anbindung: Die Bank sendet Ihnen zu jeder Zahlung eine E-Mail an eine geheime Adresse, und Faktero legt daraus eine Buchung an und ordnet sie der Rechnung zu.",
  "Každý účet má vlastnú adresu. Nikomu ju nedávajte — kto ju pozná, môže na ňu poslať e-mail.":
    "Jedes Konto hat eine eigene Adresse. Geben Sie sie niemandem weiter — wer sie kennt, kann eine E-Mail an sie senden.",
  "Pohyb sa založí sám len z e-mailu, ktorý banka podpísala (DKIM). Ručne preposlané alebo nepodpísané e-maily čakajú nižšie na kontrolu.":
    "Eine Buchung wird nur aus einer von der Bank signierten E-Mail (DKIM) automatisch angelegt. Manuell weitergeleitete oder nicht signierte E-Mails warten unten auf Prüfung.",
  "Faktúra sa označí ako zaplatená automaticky len vtedy, keď sedí variabilný symbol aj suma. Ostatné uvidíte ako návrhy v párovaní.":
    "Eine Rechnung wird nur dann automatisch als bezahlt markiert, wenn Verwendungszweck-Nummer (VS) und Betrag übereinstimmen. Alles andere sehen Sie als Vorschläge in der Zuordnung.",
  Prijíma: "Empfängt",
  "Posledný e-mail: {cas}": "Letzte E-Mail: {cas}",
  "Zatiaľ neprišiel žiadny e-mail.": "Bisher ist keine E-Mail eingegangen.",
  "Za 90 dní: pohybov {p}, na kontrolu {k}, chýb {c}":
    "In 90 Tagen: Buchungen {p}, zur Prüfung {k}, Fehler {c}",
  "Potvrdenie preposielania z Gmailu": "Bestätigung der Gmail-Weiterleitung",
  "Gmail ({schranka}) čaká na potvrdenie, že sem smie preposielať.":
    "Gmail ({schranka}) wartet auf die Bestätigung, dass hierher weitergeleitet werden darf.",
  "Gmail čaká na potvrdenie, že sem smie preposielať.":
    "Gmail wartet auf die Bestätigung, dass hierher weitergeleitet werden darf.",
  "Kód:": "Code:",
  "Potvrdiť v Gmaile": "In Gmail bestätigen",
  "Iná banka": "Andere Bank",
  "Príjem notifikácií vypnutý.": "Empfang von Benachrichtigungen ausgeschaltet.",
  "Príjem notifikácií zapnutý.": "Empfang von Benachrichtigungen eingeschaltet.",
  "Vypnúť príjem": "Empfang ausschalten",
  "Zapnúť príjem": "Empfang einschalten",
  "Vytvoriť novú adresu? Stará prestane fungovať hneď a v banke ju budete musieť zmeniť.":
    "Neue Adresse erstellen? Die alte funktioniert sofort nicht mehr, und Sie müssen sie bei der Bank ändern.",
  "Nová adresa je pripravená — zmeňte ju aj v banke.":
    "Die neue Adresse ist bereit — ändern Sie sie auch bei der Bank.",
  "Pridať ďalší účet": "Weiteres Konto hinzufügen",
  "Zapnúť pre účet": "Für ein Konto einschalten",
  "Nový účet (zadám IBAN)": "Neues Konto (IBAN eingeben)",
  "Názov účtu": "Kontoname",
  "napr. Bežný účet": "z. B. Girokonto",
  "Adresa je pripravená — skopírujte ju do internetbankingu.":
    "Die Adresse ist bereit — kopieren Sie sie ins Online-Banking.",
  "Vytvoriť adresu": "Adresse erstellen",
  "Účet napojený na banku cez API tu nie je — pohyby z neho už chodia priamo a notifikácie by ich zdvojili.":
    "Per API angebundene Konten erscheinen hier nicht — ihre Buchungen kommen bereits direkt, Benachrichtigungen würden sie verdoppeln.",
  "Všetky prijaté e-maily": "Alle empfangenen E-Mails",
  "E-maily na kontrolu": "E-Mails zur Prüfung",
  "Len na kontrolu": "Nur zur Prüfung",
  "Nič nečaká na kontrolu.": "Nichts wartet auf Prüfung.",
  "Ako to zapnúť v banke": "So schalten Sie es bei der Bank ein",
  "V internetbankingu nájdite nastavenie notifikácií (avíz, upozornení) o pohyboch na účte, zvoľte posielanie e-mailom pri prijatých aj odoslaných platbách a ako adresu zadajte tú vyššie.":
    "Suchen Sie im Online-Banking die Einstellungen für Benachrichtigungen über Kontobewegungen, wählen Sie den Versand per E-Mail für eingehende und ausgehende Zahlungen und geben Sie die obige Adresse an.",
  "Ak banka dovolí len jednu adresu, nechajte notifikácie chodiť vám a v Gmaile si nastavte automatické preposielanie sem. Overovací kód od Gmailu sa potom zobrazí tu.":
    "Erlaubt die Bank nur eine Adresse, lassen Sie die Benachrichtigungen an sich senden und richten Sie in Gmail eine automatische Weiterleitung hierher ein. Der Bestätigungscode von Gmail erscheint dann hier.",
  "Zdroj návodu": "Quelle der Anleitung",
  "Rovnaký pohyb (deň, suma, VS) už na účte je. Založiť aj tak?":
    "Dieselbe Buchung (Tag, Betrag, VS) ist bereits auf dem Konto. Trotzdem anlegen?",
  "Pohyb založený.": "Buchung angelegt.",
  "E-mail zahodený.": "E-Mail verworfen.",
  "(bez predmetu)": "(ohne Betreff)",
  "prečítala AI": "von KI gelesen",
  "prečítané pravidlom banky": "per Bankregel gelesen",
  "Skontrolovať a zaradiť": "Prüfen und zuordnen",
  "Zobraziť e-mail": "E-Mail anzeigen",
  "Text e-mailu nie je uložený.": "Der E-Mail-Text ist nicht gespeichert.",
  "Prijatá platba": "Eingegangene Zahlung",
  "Odoslaná platba": "Ausgehende Zahlung",
  "Účet protistrany": "Konto der Gegenpartei",
  "Správa pre príjemcu": "Nachricht für den Empfänger",
  "Zakladám…": "Wird angelegt…",
  "Založiť pohyb": "Buchung anlegen",
  "E-mailové notifikácie": "E-Mail-Benachrichtigungen",
  "Nastavenie notifikácií": "Einstellungen der Benachrichtigungen",
  "Iná banka — e-mailové notifikácie": "Andere Bank — E-Mail-Benachrichtigungen",
  "VÚB, Slovenská sporiteľňa, ČSOB, Prima banka, Česká spořitelna, KB, Air Bank a ďalšie.":
    "VÚB, Slovenská sporiteľňa, ČSOB, Prima banka, Česká spořitelna, KB, Air Bank und weitere.",
  "V internetbankingu si zapnete posielanie e-mailu o každej platbe na tajnú adresu, ktorú vám Faktero vytvorí. Z každého e-mailu vznikne pohyb na účte a spáruje sa s faktúrou.":
    "Im Online-Banking schalten Sie den E-Mail-Versand zu jeder Zahlung an eine geheime Adresse ein, die Faktero für Sie erstellt. Aus jeder E-Mail entsteht eine Kontobuchung, die der Rechnung zugeordnet wird.",
  "Nastaviť e-mailové notifikácie": "E-Mail-Benachrichtigungen einrichten",
  "Pohyb vznikol z e-mailovej notifikácie banky.":
    "Die Buchung stammt aus einer E-Mail-Benachrichtigung der Bank.",
  "z e-mailu": "aus E-Mail",
  // Návody bánk — názvy položiek v internetbankingu ostávajú v jazyku banky.
  "V internetbankingu otvorte Nastavenia → B-mail → Vytvoriť nový.":
    "Öffnen Sie im Online-Banking Nastavenia → B-mail → Vytvoriť nový.",
  "Spôsob doručenia správy: E-mail, zaškrtnite „Vklad“ aj „Výber“ a zadajte sumu, od ktorej sa má správa posielať.":
    "Zustellart: E-Mail, haken Sie „Vklad“ und „Výber“ an und geben Sie den Betrag ein, ab dem die Nachricht gesendet wird.",
  "V Business24: Nastavenia → Notifikácie → Pridať notifikáciu, typ „20401 | Notifikácia o obrate na účte“, odoslanie e-mailom, Bez šifrovania, Ďalej a Podpísať.":
    "In Business24: Nastavenia → Notifikácie → Pridať notifikáciu, Typ „20401 | Notifikácia o obrate na účte“, Versand per E-Mail, Bez šifrovania, Ďalej und Podpísať.",
  "V Georgi sa iná e-mailová adresa zadať nedá — notifikáciu na túto adresu vám nastavia na pobočke alebo na telefóne.":
    "In George lässt sich keine andere E-Mail-Adresse eingeben — die Benachrichtigung an diese Adresse richtet Ihnen die Filiale oder die Hotline ein.",
  "V službe ČSOB Info 24 si zapnite avízo o zaúčtovaní platby a ako adresu zadajte túto.":
    "Schalten Sie im Dienst ČSOB Info 24 die Avisierung gebuchter Zahlungen ein und geben Sie diese Adresse an.",
  "Nastavení → Notifikace → Vytvořit notifikace pro transakce → Všechny transakce nad 1 Kč → e-mail.":
    "Nastavení → Notifikace → Vytvořit notifikace pro transakce → Všechny transakce nad 1 Kč → E-Mail.",
  "V internetbankingu otvorte Nastavení → Oznámení → Pohyby → Přidat Oznámení.":
    "Öffnen Sie im Online-Banking Nastavení → Oznámení → Pohyby → Přidat Oznámení.",
  "Kam posílat: E-mail, kontaktný e-mail „Jiný email“ (táto adresa), Částka 0,01, zapnite „Posílat online“ a potvrďte Odeslat.":
    "Kam posílat: E-Mail, Kontakt-E-Mail „Jiný email“ (diese Adresse), Částka 0,01, schalten Sie „Posílat online“ ein und bestätigen Sie mit Odeslat.",
  "V Georgi kliknite na ozubené koliesko → Kontaktní údaje a doplňte túto adresu.":
    "Klicken Sie in George auf das Zahnrad → Kontaktní údaje und tragen Sie diese Adresse ein.",
  "Potom Informační zprávy → Příchozí platby (prípadne Odchozí platby) → Aktivovat.":
    "Danach Informační zprávy → Příchozí platby (ggf. Odchozí platby) → Aktivovat.",
  "V KB+: Nastavení → Oznámení → Příchozí/Odchozí platby → prepínač „E-mailem“.":
    "In KB+: Nastavení → Oznámení → Příchozí/Odchozí platby → Schalter „E-mailem“.",
  "ČSOB Internetbanking: Nastavení → Moje info → Účty a platby → Telefonní číslo a e-mail, potom Platby → Zaúčtovaná platba (příchozí aj odchozí).":
    "ČSOB Internetbanking: Nastavení → Moje info → Účty a platby → Telefonní číslo a e-mail, dann Platby → Zaúčtovaná platba (příchozí und odchozí).",
  "ČSOB CEB: Nastavení → CEB info → Účty a platby → nová notifikácia „Zaúčtování platby“ → Všechny pohyby.":
    "ČSOB CEB: Nastavení → CEB info → Účty a platby → neue Benachrichtigung „Zaúčtování platby“ → Všechny pohyby.",
  "Nastavení → Upozornění Informuj mě → Nové upozornění: Směr pohybu Příchozí alebo Všechny, Částka od 0 CZK.":
    "Nastavení → Upozornění Informuj mě → Nové upozornění: Směr pohybu Příchozí oder Všechny, Částka od 0 CZK.",
  "V internetbankingu na počítači: Účty a karty → účet → Možnosti → Info o dění na účtu → Jiný kontakt → Mail.":
    "Im Online-Banking am Computer: Účty a karty → Konto → Možnosti → Info o dění na účtu → Jiný kontakt → Mail.",
  "Zapnite „Informace o změně zůstatku: posílejte mailem“.":
    "Schalten Sie „Informace o změně zůstatku: posílejte mailem“ ein.",
  "Nastavení → Osobní → Upozornění – Info Servis → Přidat upozornění → Účty → E-mail pri Odchozí a Příchozí platba.":
    "Nastavení → Osobní → Upozornění – Info Servis → Přidat upozornění → Účty → E-Mail bei Odchozí und Příchozí platba.",
  "Zaheslovaný ZIP v prílohe neprečítame — notifikácia musí prísť ako text.":
    "Ein passwortgeschütztes ZIP im Anhang können wir nicht lesen — die Benachrichtigung muss als Text kommen.",
  "Notifikácie o pohyboch posiela VÚB podľa svojho sprievodcu ako push alebo SMS; e-mailovú podobu sme nenašli. Ak vám e-mail chodí, prepošlite ho sem.":
    "Laut ihrem Leitfaden sendet die VÚB Benachrichtigungen über Bewegungen als Push oder SMS; eine E-Mail-Variante haben wir nicht gefunden. Wenn Sie E-Mails erhalten, leiten Sie sie hierher weiter.",
  "Podľa SuperFaktúry UniCredit v e-mailových notifikáciách neposiela variabilný symbol — platby sa potom spárujú len ako návrhy.":
    "Laut SuperFaktúra sendet UniCredit in E-Mail-Benachrichtigungen keinen Verwendungszweck (VS) — Zahlungen werden dann nur als Vorschläge zugeordnet.",
  "iDoklad aj Fakturoid uvádzajú, že notifikácie mBank nemajú údaje potrebné na párovanie. Skúsiť sa to dá, ale počítajte s ručnou kontrolou.":
    "iDoklad und Fakturoid geben an, dass mBank-Benachrichtigungen nicht die für die Zuordnung nötigen Angaben enthalten. Ein Versuch ist möglich, rechnen Sie aber mit manueller Prüfung.",
  "Fio sa dá pripojiť aj priamo tokenom (Pripojiť banku → Fio) — to je presnejšie než e-maily.":
    "Fio lässt sich auch direkt per Token anbinden (Bank verbinden → Fio) — das ist genauer als E-Mails.",
  "Banka dovolí len jednu adresu. Ak ju potrebujete pre seba, nechajte notifikácie chodiť vám a automaticky ich preposielajte sem.":
    "Die Bank erlaubt nur eine Adresse. Wenn Sie sie selbst brauchen, lassen Sie die Benachrichtigungen an sich senden und leiten Sie sie automatisch hierher weiter.",
  "Revolut Business sa dá pripojiť priamo (Pripojiť banku → Revolut) — to je presnejšie než e-maily.":
    "Revolut Business lässt sich direkt anbinden (Bank verbinden → Revolut) — das ist genauer als E-Mails.",
  // Stavy prijatých e-mailov
  "Pohyb založený": "Buchung angelegt",
  "Na kontrolu": "Zur Prüfung",
  Duplicita: "Duplikat",
  Zahodené: "Verworfen",
  "Nie je o pohybe": "Keine Kontobewegung",
  "Ten istý pohyb už na účte je.": "Dieselbe Buchung ist bereits auf dem Konto.",
  // Manuál /pomoc/banka — sekcia „notifikacie"
  "Iná banka: párovanie cez e-mailové notifikácie":
    "Andere Bank: Zuordnung über E-Mail-Benachrichtigungen",
  "Banku, ktorú Faktero nevie pripojiť priamo (VÚB, Slovenská sporiteľňa, ČSOB, Prima banka, Česká spořitelna, Komerční banka, Air Bank a ďalšie), spárujete cez <0>e-maily, ktoré banka posiela o každej platbe</0>. V <1>Bankové účty → E-mailové notifikácie</1> vyberte banku a účet (alebo zadajte IBAN) a Faktero vytvorí tajnú adresu v tvare <2>banka-…@doklady.faktero.sk</2>.":
    "Eine Bank, die Faktero nicht direkt anbinden kann (VÚB, Slovenská sporiteľňa, ČSOB, Prima banka, Česká spořitelna, Komerční banka, Air Bank und weitere), ordnen Sie über <0>E-Mails zu, die die Bank zu jeder Zahlung sendet</0>. Wählen Sie unter <1>Bankkonten → E-Mail-Benachrichtigungen</1> die Bank und das Konto (oder geben Sie die IBAN ein), und Faktero erstellt eine geheime Adresse der Form <2>banka-…@doklady.faktero.sk</2>.",
  "Adresu skopírujte do internetbankingu do nastavenia notifikácií (avíz, upozornení) o pohyboch na účte a zapnite prijaté aj odoslané platby. Pri bankách, kde to vieme, je na stránke návod krok za krokom.":
    "Kopieren Sie die Adresse im Online-Banking in die Einstellungen für Benachrichtigungen über Kontobewegungen und schalten Sie eingehende und ausgehende Zahlungen ein. Für Banken, bei denen wir es wissen, finden Sie auf der Seite eine Schritt-für-Schritt-Anleitung.",
  "<0>Banka dovolí len jednu adresu?</0> Nechajte notifikácie chodiť vám a v Gmaile si nastavte automatické preposielanie na adresu z Faktera. Gmail najprv pošle overovací kód — Faktero ho zachytí a ukáže pri účte, odkiaľ ho potvrdíte.":
    "<0>Erlaubt die Bank nur eine Adresse?</0> Lassen Sie die Benachrichtigungen an sich senden und richten Sie in Gmail eine automatische Weiterleitung an die Adresse von Faktero ein. Gmail sendet zuerst einen Bestätigungscode — Faktero fängt ihn ab und zeigt ihn beim Konto an, wo Sie ihn bestätigen.",
  "<0>Čo sa s e-mailom stane.</0> Faktero z neho prečíta sumu, smer, dátum, symboly, protistranu a správu a založí pohyb označený „z e-mailu“. Faktúra sa označí ako zaplatená automaticky len vtedy, keď sedí variabilný symbol aj suma; inak uvidíte návrh v párovaní.":
    "<0>Was mit der E-Mail passiert.</0> Faktero liest daraus Betrag, Richtung, Datum, Symbole, Gegenpartei und Nachricht und legt eine Buchung mit der Kennzeichnung „aus E-Mail“ an. Eine Rechnung wird nur dann automatisch als bezahlt markiert, wenn VS und Betrag übereinstimmen; sonst sehen Sie einen Vorschlag in der Zuordnung.",
  "<0>Na kontrolu.</0> Pohyb sa sám založí len z e-mailu, ktorý banka elektronicky podpísala. Ručne preposlaný e-mail, e-mail z neznámej adresy alebo taký, ktorému Faktero celkom nerozumie, čaká v zozname na kontrolu — údaje skontrolujete, prípadne opravíte, a pohyb založíte jedným klikom, alebo e-mail zahodíte. Ten istý e-mail ani ten istý pohyb sa dvakrát nezaloží.":
    "<0>Zur Prüfung.</0> Eine Buchung wird nur aus einer von der Bank elektronisch signierten E-Mail automatisch angelegt. Eine manuell weitergeleitete E-Mail, eine E-Mail von unbekannter Adresse oder eine, die Faktero nicht ganz versteht, wartet in der Liste zur Prüfung — Sie prüfen und korrigieren die Angaben und legen die Buchung mit einem Klick an oder verwerfen die E-Mail. Dieselbe E-Mail und dieselbe Buchung werden nie doppelt angelegt.",
  "Adresu nikomu nedávajte. Ak unikne, vytvorte pri účte novú — stará prestane fungovať hneď. Keď na ten istý účet nahráte aj výpis, pohyby, ktoré už prišli z e-mailov, sa preskočia a nezdvoja sa.":
    "Geben Sie die Adresse niemandem weiter. Falls sie bekannt wird, erstellen Sie beim Konto eine neue — die alte funktioniert sofort nicht mehr. Wenn Sie für dasselbe Konto auch einen Auszug hochladen, werden Buchungen, die bereits per E-Mail kamen, übersprungen und nicht verdoppelt.",
};
