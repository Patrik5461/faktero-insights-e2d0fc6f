// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.banka.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Bankové účty — Faktero": "Hilfe — Bankkonten — Faktero",
  "Pripojenie banky, sťahovanie transakcií, párovanie úhrad s faktúrami a bankové výpisy vo Faktere.":
    "Bankanbindung, Abruf von Transaktionen, Zahlungsabgleich mit Rechnungen und Kontoauszüge in Faktero.",
  "Bankové účty a párovanie úhrad": "Bankkonten und Zahlungsabgleich",
  "Pripojenie banky, sťahovanie pohybov, automatické párovanie faktúr a výpisy.":
    "Bankanbindung, Abruf von Umsätzen, automatischer Rechnungsabgleich und Kontoauszüge.",
  "Načo pripájať banku": "Wozu die Bank anbinden",
  "Aby ste nemuseli ručne označovať, ktorá faktúra je zaplatená. Faktero stiahne pohyby z účtu a spáruje ich s faktúrami podľa variabilného symbolu a sumy.":
    "Damit Sie nicht manuell markieren müssen, welche Rechnung bezahlt ist. Faktero ruft die Umsätze vom Konto ab und gleicht sie anhand von Verwendungszweck (VS) und Betrag mit den Rechnungen ab.",
  "Účty sa spravujú v <0>Účtovníctvo → Bankové účty</0>.":
    "Konten werden unter <0>Bank → Bankkonten</0> verwaltet.",
  "Pripojenie účtu": "Konto anbinden",
  "V <0>Pripojiť banku</0> vyberte banku a prejdite jej prihlásením. Súhlas na prístup k účtu má obmedzenú platnosť — po jej uplynutí ho treba obnoviť, Faktero na to upozorní.":
    "Wählen Sie unter <0>Bank verbinden</0> die Bank aus und durchlaufen Sie deren Anmeldung. Die Zustimmung zum Kontozugriff ist zeitlich begrenzt — nach Ablauf muss sie erneuert werden, Faktero weist Sie darauf hin.",
  "<0>Ktoré banky.</0> Priamo Tatra banka, ďalej Wise, Wallester a Revolut Business. Ak máte účet v inej banke a v internetbankingu Tatra banky ho máte pripojený cez <1>multibanking</1> (Slovenská sporiteľňa, VÚB, ČSOB a ďalšie), natiahne sa spolu s ostatnými — zostatky aj pohyby. Oficiálne výpisy na stiahnutie ale banka vydá len pre účty vedené v Tatra banke.":
    "<0>Welche Banken.</0> Direkt Tatra banka, außerdem Wise, Wallester und Revolut Business. Haben Sie ein Konto bei einer anderen Bank und ist es im Internetbanking der Tatra banka über <1>Multibanking</1> angebunden (Slovenská sporiteľňa, VÚB, ČSOB und weitere), wird es zusammen mit den übrigen abgerufen — Salden und Umsätze. Offizielle Kontoauszüge zum Herunterladen stellt die Bank jedoch nur für Konten aus, die bei der Tatra banka geführt werden.",
  "Účet sa dá viesť aj <0>bez pripojenia</0>, len ako číslo účtu na faktúrach.":
    "Ein Konto lässt sich auch <0>ohne Anbindung</0> führen, nur als Kontonummer auf den Rechnungen.",
  Wise: "Wise",
  "Wise sa nepripája prihlásením ako banka, ale <0>osobným tokenom</0>. Vo Wise otvorte <1>Settings → API tokens</1>, vytvorte token na čítanie a vložte ho do Faktera.":
    "Wise wird nicht wie eine Bank per Anmeldung angebunden, sondern über einen <0>persönlichen Token</0>. Öffnen Sie in Wise <1>Settings → API tokens</1>, erstellen Sie einen Token mit Lesezugriff und fügen Sie ihn in Faktero ein.",
  "Potom je ešte jeden krok, na ktorý sa ľahko zabudne: <0>výpisy vo Wise chráni podpis</0>. Faktero vám ukáže verejný kľúč — stiahnite si ho ako súbor a nahrajte ho vo Wise k tomu istému tokenu. Kým to nespravíte, zostatky sa načítajú, ale pohyby nie.":
    "Danach folgt noch ein Schritt, der leicht vergessen wird: <0>Kontoauszüge bei Wise sind durch eine Signatur geschützt</0>. Faktero zeigt Ihnen einen öffentlichen Schlüssel an — laden Sie ihn als Datei herunter und laden Sie ihn in Wise zu demselben Token hoch. Solange Sie das nicht tun, werden die Salden geladen, die Umsätze aber nicht.",
  "Každá mena je vo Fakteri samostatný účet, pretože tak ich vedie aj Wise. Sumy v rôznych menách sa nikdy nesčítavajú.":
    "Jede Währung ist in Faktero ein eigenes Konto, weil Wise sie ebenfalls so führt. Beträge in verschiedenen Währungen werden nie addiert.",
  "Fio banka": "Fio banka",
  "Fio sa pripája <0>tokenom</0> z internetbankingu: <1>Nastavení → API → Přidat nový token</1>, vyberte účet a oprávnenie <2>Pouze sledovat účet</2>. Token vložte v Bankové účty → Pripojiť banku.":
    "Fio wird über einen <0>Token</0> aus dem Internetbanking angebunden: <1>Nastavení → API → Přidat nový token</1>, wählen Sie das Konto und die Berechtigung <2>Pouze sledovat účet</2>. Fügen Sie den Token unter Bankkonten → Bank verbinden ein.",
  "Jeden token patrí jednému účtu — ak máte korunový aj eurový účet, pridajte dva tokeny. Pri pripojení sa hneď stiahnu pohyby za posledných 90 dní (staršie Fio bez ďalšej autorizácie nevydá), potom sa sťahujú každú noc.":
    "Ein Token gehört zu einem Konto — wenn Sie ein Kronen- und ein Eurokonto haben, fügen Sie zwei Tokens hinzu. Beim Anbinden werden sofort die Umsätze der letzten 90 Tage abgerufen (ältere gibt Fio ohne weitere Autorisierung nicht heraus), danach jede Nacht.",
  "Fio pustí na jeden token len jedno stiahnutie za 30 sekúnd; keď tlačidlo stlačíte dvakrát rýchlo po sebe, Faktero povie, nech chvíľu počkáte.":
    "Fio erlaubt pro Token nur einen Abruf alle 30 Sekunden; wenn Sie die Schaltfläche zweimal kurz hintereinander drücken, bittet Faktero Sie, kurz zu warten.",
  Wallester: "Wallester",
  "Wallester vydáva firemné karty a jeho pohyby sú platby kartou — teda presne to, čo sa dá spárovať s naskenovanými bločkami podľa mena obchodníka.":
    "Wallester gibt Firmenkarten aus, und seine Umsätze sind Kartenzahlungen — also genau das, was sich anhand des Händlernamens mit gescannten Kassenbons abgleichen lässt.",
  "Prístup k ich rozhraniu <0>nie je samoobslužný</0>: treba oň požiadať Wallester (podpora alebo váš kontakt). Postup je potom takýto:":
    "Der Zugang zu ihrer Schnittstelle ist <0>nicht als Self-Service verfügbar</0>: Sie müssen ihn bei Wallester beantragen (Support oder Ihr Ansprechpartner). Danach gehen Sie so vor:",
  "V <0>Pripojiť banku</0> kliknite na <1>Vyrobiť verejný kľúč</1> a stiahnite si ho ako súbor.":
    "Klicken Sie unter <0>Bank verbinden</0> auf <1>Öffentlichen Schlüssel erzeugen</1> und laden Sie ihn als Datei herunter.",
  "Pošlite ten súbor Wallesteru.": "Senden Sie diese Datei an Wallester.",
  "Oni vám vrátia <0>issuer ID</0>, <1>audience ID</1>, kód produktu a maximálnu platnosť tokenu.":
    "Wallester schickt Ihnen <0>issuer ID</0>, <1>audience ID</1>, den Produktcode und die maximale Gültigkeit des Tokens zurück.",
  "Tie štyri údaje doplňte vo Fakteri a dokončite pripojenie.":
    "Tragen Sie diese vier Angaben in Faktero ein und schließen Sie die Anbindung ab.",
  "Súkromný kľúč ostáva u nás zašifrovaný a nikam sa neposiela; Wallesteru ide len tá verejná polovica. Pripojenie sa hneď skúsi, takže o preklepe v údajoch viete okamžite.":
    "Der private Schlüssel bleibt verschlüsselt bei uns und wird nirgendwohin gesendet; an Wallester geht nur die öffentliche Hälfte. Die Verbindung wird sofort getestet, sodass Sie einen Tippfehler in den Angaben umgehend bemerken.",
  "Wallester nie je bežný účet s IBAN-om — je to kartový účet, takže pri ňom neuvidíte číslo účtu ani variabilné symboly.":
    "Wallester ist kein normales Konto mit IBAN — es ist ein Kartenkonto, daher sehen Sie dort weder eine Kontonummer noch Verwendungszwecke.",
  "Revolut Business": "Revolut Business",
  "Revolut sa pripája certifikátom a potvrdením v prehliadači. Postup má tri kroky, v takomto poradí ich vyžaduje Revolut:":
    "Revolut wird über ein Zertifikat und eine Bestätigung im Browser angebunden. Der Ablauf hat drei Schritte, in dieser Reihenfolge verlangt sie Revolut:",
  "V <0>Pripojiť banku</0> kliknite na <1>Vyrobiť certifikát</1> a stiahnite si ho.":
    "Klicken Sie unter <0>Bank verbinden</0> auf <1>Zertifikat erzeugen</1> und laden Sie es herunter.",
  "V Revolut Business otvorte <0>Settings → APIs → Business API</0>, nahrajte certifikát a ako návratovú adresu zadajte <1>presne tú</1>, ktorú Faktero na obrazovke ukazuje. Musí sedieť na znak.":
    "Öffnen Sie in Revolut Business <0>Settings → APIs → Business API</0>, laden Sie das Zertifikat hoch und geben Sie als Rücksprungadresse <1>genau die</1> ein, die Faktero auf dem Bildschirm anzeigt. Sie muss Zeichen für Zeichen übereinstimmen.",
  "Portál vám ukáže <0>client ID</0>. Vložte ho do Faktera, kliknite na <1>Potvrdiť prístup</1> a v Revolute potvrďte, čo Fakteru dovolíte. Stačí čítanie.":
    "Das Portal zeigt Ihnen die <0>client ID</0> an. Fügen Sie sie in Faktero ein, klicken Sie auf <1>Zugriff bestätigen</1> und bestätigen Sie in Revolut, was Sie Faktero erlauben. Lesezugriff genügt.",
  "<0>Súhlas platí približne 90 dní.</0> Keď vyprší, sťahovanie prestane a potvrdenie treba zopakovať — je to tá istá cesta, len bez vyrábania certifikátu.":
    "<0>Die Zustimmung gilt etwa 90 Tage.</0> Wenn sie abläuft, endet der Abruf und die Bestätigung muss wiederholt werden — es ist derselbe Weg, nur ohne Erzeugen des Zertifikats.",
  "Prevod medzi vlastnými menami je v Revolute jedna transakcia, ktorá sa dotýka dvoch účtov. Faktero ju preto zapíše na oba — z jedného odíde, na druhý príde.":
    "Ein Umtausch zwischen eigenen Währungen ist bei Revolut eine einzige Transaktion, die zwei Konten betrifft. Faktero bucht sie daher auf beide — von einem geht sie ab, auf dem anderen geht sie ein.",
  "Kedy sa pohyby objavia": "Wann die Umsätze erscheinen",
  "Raz denne predpoludním si Faktero samo stiahne pohyby zo všetkých pripojených účtov. To je spodná hranica — nič viac netreba nastavovať.":
    "Einmal täglich am Vormittag ruft Faktero selbst die Umsätze aller angebundenen Konten ab. Das ist die Untergrenze — mehr muss nicht eingestellt werden.",
  "Pri <0>Tatra banke</0> to býva rýchlejšie: banka dá vedieť, že sa na účte niečo stalo, a Faktero si po pohyby siahne <1>v priebehu pár sekúnd</1>. Platba prijatá doobeda tak nečaká na ďalšie ráno.":
    "Bei der <0>Tatra banka</0> geht es meist schneller: Die Bank meldet, dass auf dem Konto etwas passiert ist, und Faktero holt die Umsätze <1>innerhalb weniger Sekunden</1> ab. Eine am Vormittag eingegangene Zahlung wartet so nicht bis zum nächsten Morgen.",
  "Sťahovanie sa nespúšťa ručne a je to zámer — nie je čo zrýchliť. Banky vydávajú pohyby s vlastným oneskorením: čo ešte nezaúčtovali, nepošlú ani na požiadanie. Tlačidlo <0>Načítať účty</0> v <1>Bankových účtoch</1> obnoví zoznam účtov a zostatky, nie zoznam pohybov.":
    "Der Abruf wird nicht manuell gestartet, und das ist Absicht — es gibt nichts zu beschleunigen. Banken geben Umsätze mit eigener Verzögerung heraus: Was sie noch nicht gebucht haben, senden sie auch auf Anfrage nicht. Die Schaltfläche <0>Konten laden</0> unter <1>Bankkonten</1> aktualisiert die Kontenliste und die Salden, nicht die Umsatzliste.",
  "Transakcie a párovanie": "Transaktionen und Abgleich",
  "<0>Bankové transakcie</0> ukazujú pohyby na účte. Párovanie sa spúšťa tlačidlom <1>Spárovať platby</1> v prehľade faktúr (alebo <2>Spárovať s faktúrami</2> nad transakciami). Nerobí sa samo od seba — úhrada mení stav faktúry, a to nemá prebehnúť bez toho, aby o tom niekto vedel.":
    "<0>Banktransaktionen</0> zeigen die Umsätze auf dem Konto. Der Abgleich wird über die Schaltfläche <1>Zahlungen abgleichen</1> in der Rechnungsübersicht gestartet (oder <2>Mit Rechnungen abgleichen</2> über den Transaktionen). Er läuft nicht von selbst — eine Zahlung ändert den Status der Rechnung, und das soll nicht geschehen, ohne dass jemand davon weiß.",
  "Faktero rozdeľuje nájdené dvojice na dve kôpky:":
    "Faktero teilt die gefundenen Paare in zwei Gruppen auf:",
  "<0>Isté</0> — sedí variabilný symbol aj suma do haliera a žiadna iná faktúra neprichádza do úvahy. Tie sa dajú zapísať naraz tlačidlom „Spárovať isté“.":
    "<0>Eindeutig</0> — Verwendungszweck und Betrag stimmen auf den Cent überein, und keine andere Rechnung kommt infrage. Diese lassen sich auf einmal mit der Schaltfläche „Eindeutige abgleichen“ übernehmen.",
  "<0>Na rozhodnutie</0> — čiastočná platba, chýbajúci variabilný symbol, alebo rovnako dobre sedia dve faktúry. Pri každej dvojici je napísané, prečo ju Faktero ponúka, a rozhodujete vy.":
    "<0>Zur Entscheidung</0> — Teilzahlung, fehlender Verwendungszweck oder zwei Rechnungen passen gleich gut. Bei jedem Paar steht, warum Faktero es vorschlägt, und Sie entscheiden.",
  "Čiastočná úhrada nechá faktúru otvorenú so zvyškom — ďalšia platba sa napáruje na to, čo ostalo. Za uhradenú sa faktúra označí, až keď je pokrytá celá.":
    "Eine Teilzahlung lässt die Rechnung mit dem Restbetrag offen — die nächste Zahlung wird auf den verbleibenden Betrag abgeglichen. Als bezahlt wird die Rechnung erst markiert, wenn sie vollständig gedeckt ist.",
  "Párovanie sa dá vrátiť: v zozname transakcií je pri spárovanom pohybe krížik, ktorý úhradu zmaže a faktúru vráti medzi otvorené.":
    "Der Abgleich lässt sich rückgängig machen: In der Transaktionsliste gibt es beim abgeglichenen Umsatz ein Kreuz, das die Zahlung löscht und die Rechnung wieder unter die offenen zurücksetzt.",
  "Odchádzajúce platby sa nepárujú — tie patria k prijatým faktúram, nie k vystaveným. Párovanie podľa variabilného symbolu funguje spoľahlivo len vtedy, keď ho odberateľ uvedie; preto Faktero predvypĺňa variabilný symbol z čísla faktúry.":
    "Ausgehende Zahlungen werden nicht abgeglichen — sie gehören zu Eingangsrechnungen, nicht zu Ausgangsrechnungen. Der Abgleich über den Verwendungszweck funktioniert nur zuverlässig, wenn der Kunde ihn angibt; deshalb füllt Faktero den Verwendungszweck aus der Rechnungsnummer vor.",
  "Úhrada sa dá zapísať aj do <0>uzamknutého obdobia</0> — platby chodia aj mesiace po vystavení faktúry.":
    "Eine Zahlung lässt sich auch in einer <0>gesperrten Periode</0> erfassen — Zahlungen kommen auch Monate nach dem Ausstellen der Rechnung.",
  "<0>Bankové výpisy</0> sú mesačné prehľady pre účtovníčku. Pri bankách, ktoré výpisy poskytujú, sa stiahnu priamo od nich.":
    "<0>Kontoauszüge</0> sind monatliche Übersichten für die Buchhalterin. Bei Banken, die Kontoauszüge bereitstellen, werden sie direkt von dort abgerufen.",
  "Pri ostatných si Faktero zostaví vlastný výpis zo stiahnutých transakcií — vo formáte camt.053 aj ako PDF. Taký výpis je len tak úplný, ako sú úplné transakcie, z ktorých vznikol.":
    "Bei den übrigen erstellt Faktero einen eigenen Kontoauszug aus den abgerufenen Transaktionen — im Format camt.053 und als PDF. Ein solcher Auszug ist nur so vollständig wie die Transaktionen, aus denen er entstanden ist.",
  "Odosielanie platieb": "Zahlungen senden",
  "Pri podporovaných bankách sa dá platba odoslať priamo z Faktera. Vyžaduje si to samostatný súhlas — súhlas na čítanie účtu na platby nestačí.":
    "Bei unterstützten Banken lässt sich eine Zahlung direkt aus Faktero senden. Dafür ist eine separate Zustimmung nötig — die Zustimmung zum Lesen des Kontos reicht für Zahlungen nicht aus.",
} satisfies Record<string, string>;
