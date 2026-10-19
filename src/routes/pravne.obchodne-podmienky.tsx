import { createFileRoute } from "@tanstack/react-router";
import {
  LegalShell,
  LEGAL_VERSION,
  LEGAL_UPDATED,
  LEGAL_COMPANY,
  DeUpozornenie,
  CsUpozornenie,
} from "@/components/faktero/LegalShell";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/pravne/obchodne-podmienky")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Obchodné podmienky — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Obchodné podmienky služby Faktero — fakturačného a účtovného nástroja pre podnikateľov.",
        ),
      },
      {
        property: "og:title",
        content: preloz(match.context.jazyk, "Obchodné podmienky — Faktero"),
      },
      {
        property: "og:description",
        content: preloz(match.context.jazyk, "Obchodné podmienky používania služby Faktero."),
      },
      { property: "og:url", content: "https://faktero.sk/pravne/obchodne-podmienky" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pravne/obchodne-podmienky" }],
  }),
  component: Page,
});

function Page() {
  const { jazyk, t } = useT();
  return (
    <LegalShell title={t("Obchodné podmienky")} updated={LEGAL_UPDATED} version={LEGAL_VERSION}>
      {jazyk === "de" ? (
        <De />
      ) : (
        <>
          {jazyk === "cs" && <CsUpozornenie />}
          <Sk />
        </>
      )}
    </LegalShell>
  );
}

function Sk() {
  return (
    <>
      <h2>1. Prevádzkovateľ služby</h2>
      <p>
        Prevádzkovateľom služby Faktero (ďalej len „<strong>Služba</strong>“) je spoločnosť{" "}
        <strong>{LEGAL_COMPANY.name}</strong>, so sídlom {LEGAL_COMPANY.address}, IČO:{" "}
        {LEGAL_COMPANY.ico}, DIČ: {LEGAL_COMPANY.dic}, IČ DPH: {LEGAL_COMPANY.icDph}, zapísaná v
        Obchodnom registri Slovenskej republiky (ďalej len „<strong>Prevádzkovateľ</strong>“).
      </p>
      <p>
        Kontakt: {LEGAL_COMPANY.email}, {LEGAL_COMPANY.phone}, {LEGAL_COMPANY.web}.
      </p>

      <h2>2. Definícia služby Faktero</h2>
      <p>
        Faktero je online aplikácia (Software-as-a-Service) na vystavovanie faktúr, evidenciu
        odberateľov, sklad, eFaktúru, pripojenie bankových účtov a online platby cez tretie strany.
        Služba je dostupná na doméne faktero.sk a v subdoménach Prevádzkovateľa.
      </p>
      <p>
        <strong>
          Služba Faktero je určená predovšetkým pre podnikateľov, živnostníkov a právnické osoby.
        </strong>
      </p>

      <h2>3. Registrácia účtu</h2>
      <p>
        Používateľ je oprávnený vytvoriť si účet prostredníctvom registračného formulára alebo
        prihlásením cez poskytovateľa identity (Google). Pri registrácii je povinný uviesť pravdivé
        údaje a chrániť svoje prihlasovacie údaje pred zneužitím.
      </p>
      <p>
        Pri registrácii používateľ potvrdzuje súhlas s týmito Obchodnými podmienkami a berie na
        vedomie spracúvanie osobných údajov v zmysle dokumentu GDPR.
      </p>

      <h2>4. Predplatné, ceny a fakturácia</h2>
      <p>
        Služba je poskytovaná v rámci platených plánov podľa aktuálneho cenníka zverejneného na{" "}
        <a href="/cennik">faktero.sk/cennik</a>. Aktuálne ceny platených plánov (bez DPH):
      </p>
      <ul>
        <li>
          <strong>Starter — 9,00 € / mesiac</strong> bez DPH (s DPH 23 %: 11,07 € / mesiac).
        </li>
        <li>
          <strong>Premium — 19,00 € / mesiac</strong> bez DPH (s DPH 23 %: 23,37 € / mesiac).
        </li>
        <li>
          <strong>Enterprise</strong> — cena stanovená individuálne podľa rozsahu.
        </li>
      </ul>
      <p>
        Prevádzkovateľ je platcom DPH; na všetky ceny sa uplatňuje platná sadzba DPH v Slovenskej
        republike (aktuálne <strong>23 %</strong>). Fakturácia prebieha mesačne, po každej úspešnej
        platbe je používateľovi vystavený daňový doklad dostupný v aplikácii.
      </p>

      <h2>5. Spôsob platby</h2>
      <p>
        Platby predplatného sú realizované prostredníctvom platobnej brány <strong>GoPay</strong>{" "}
        (prevádzkovateľ GoPay s.r.o., ČR). Podporované sú platby platobnou kartou (Visa, Mastercard)
        a okamžitý bankový prevod. Údaje platobnej karty používateľa{" "}
        <strong>Faktero nevidí ani neuchováva</strong> — spracúva ich výhradne GoPay v súlade s PCI
        DSS a 3-D Secure.
      </p>

      <h2>6. Skúšobná verzia</h2>
      <p>
        Prevádzkovateľ poskytuje novým používateľom bezplatnú skúšobnú verziu (aktuálne 30 dní).
        Počas trvania skúšky nie je vyžadované zadanie platobných údajov. Po uplynutí skúšky je
        potrebné aktivovať platený plán, inak bude prístup do aplikácie obmedzený.
      </p>

      <h2>7. Automatické obnovenie predplatného</h2>
      <p>
        <strong>
          Predplatné sa po skončení fakturačného obdobia automaticky obnovuje, pokiaľ ho používateľ
          nezruší.
        </strong>{" "}
        Pri aktivácii platby kartou alebo opakovanej platby cez GoPay používateľ udeľuje súhlas s
        opakovaným strhávaním poplatku zodpovedajúceho zvolenému plánu. O nadchádzajúcom obnovení a
        jeho výške je používateľ informovaný e-mailom.
      </p>

      <h2>8. Odstúpenie od zmluvy (spotrebiteľ)</h2>
      <p>
        Ak je používateľ spotrebiteľom v zmysle zákona č. 108/2024 Z. z., má právo odstúpiť od
        zmluvy do <strong>14 dní</strong> od jej uzavretia (aktivácie plateného plánu) bez uvedenia
        dôvodu. Odstúpenie zašle e-mailom na{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>. Ak používateľ pri
        aktivácii výslovne požiadal o okamžité začatie poskytovania digitálnej služby ešte pred
        uplynutím 14-dňovej lehoty a bol poučený o strate práva na odstúpenie, právo na odstúpenie
        sa nevzťahuje na už poskytnutú časť Služby. Pre podnikateľov (B2B) sa zákonné právo na
        odstúpenie neuplatňuje.
      </p>

      <h2>9. Zrušenie predplatného</h2>
      <p>
        Používateľ môže predplatné kedykoľvek zrušiť v sekcii <em>Nastavenia → Predplatné</em>.
        Zrušenie sa prejaví na konci aktuálneho fakturačného obdobia; už uhradený poplatok za
        bežiace obdobie sa <strong>nevracia</strong> (zostatok obdobia nie je refundovaný), s
        výnimkou prípadov vyžadovaných platnými právnymi predpismi (napr. odstúpenie podľa čl. 8).
      </p>

      <h2>10. Reklamačný postup</h2>
      <p>
        Reklamáciu poskytovanej Služby môže používateľ uplatniť e-mailom na{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a> alebo písomne na adresu
        sídla Prevádzkovateľa ({LEGAL_COMPANY.address}). Reklamácia bude vybavená bez zbytočného
        odkladu, najneskôr do <strong>30 dní</strong> od doručenia. Podrobnosti upravuje samostatný{" "}
        <a href="/pravne/reklamacny-poriadok">Reklamačný poriadok</a>.
      </p>

      <h2>11. Dostupnosť služby</h2>
      <p>
        Prevádzkovateľ vyvíja primerané úsilie na zabezpečenie nepretržitej dostupnosti Služby.
        Negarantuje však 100 % dostupnosť a vyhradzuje si právo na plánované odstávky z dôvodu
        údržby, aktualizácií alebo bezpečnostných zásahov. O plánovaných odstávkach informuje
        vopred, ak je to možné.
      </p>

      <h2>12. Obmedzenie zodpovednosti</h2>
      <p>
        Prevádzkovateľ nezodpovedá za škody spôsobené nesprávnym používaním Služby, výpadkami
        tretích strán (Supabase, GoPay, Resend, bankové API), ani za stratu údajov spôsobenú konaním
        používateľa. Celková zodpovednosť Prevádzkovateľa je obmedzená do výšky poplatkov
        zaplatených používateľom za posledných 12 mesiacov.
      </p>

      <h2>13. Ochrana údajov</h2>
      <p>
        Spracúvanie osobných údajov sa riadi samostatným dokumentom{" "}
        <em>GDPR — Ochrana osobných údajov</em>. Údaje vystavených faktúr a obchodných partnerov
        používateľa sú považované za údaje vlastnené firmou používateľa.
      </p>

      <h2>14. Duševné vlastníctvo</h2>
      <p>
        Všetky práva k softvéru, dizajnu, ochrannej známke a obsahu aplikácie Faktero patria
        Prevádzkovateľovi. Používateľ získava nevýhradnú, neprenosnú licenciu na používanie Služby
        počas trvania predplatného.
      </p>

      <h2>15. Ukončenie účtu</h2>
      <p>
        Používateľ môže svoj účet kedykoľvek zrušiť. Prevádzkovateľ je oprávnený obmedziť alebo
        zrušiť účet pri porušení týchto podmienok, neuhradení poplatkov alebo zneužití Služby. Po
        zrušení účtu sú údaje uchované po dobu vyžadovanú zákonom a následne vymazané.
      </p>

      <h2>16. Záverečné ustanovenia</h2>
      <p>
        Tieto podmienky sa riadia právnym poriadkom Slovenskej republiky. Spory sa riešia pred
        príslušnými súdmi SR. Prevádzkovateľ je oprávnený podmienky meniť; o zmenách informuje
        používateľa e-mailom alebo v aplikácii minimálne 14 dní vopred.
      </p>

      <h2>Podpora</h2>
      <p>
        E-mail: <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>
        <br />
        Telefón: {LEGAL_COMPANY.phone}
      </p>
    </>
  );
}

function De() {
  return (
    <>
      <DeUpozornenie />
      <h2>1. Betreiber des Dienstes</h2>
      <p>
        Betreiber des Dienstes Faktero (nachfolgend „<strong>Dienst</strong>“) ist die Gesellschaft{" "}
        <strong>{LEGAL_COMPANY.name}</strong> mit Sitz {LEGAL_COMPANY.address}, Firmen-ID (IČO):{" "}
        {LEGAL_COMPANY.ico}, Steuernummer (DIČ): {LEGAL_COMPANY.dic}, USt-IdNr.:{" "}
        {LEGAL_COMPANY.icDph}, eingetragen im Handelsregister der Slowakischen Republik (Obchodný
        register Slovenskej republiky) (nachfolgend „<strong>Betreiber</strong>“).
      </p>
      <p>
        Kontakt: {LEGAL_COMPANY.email}, {LEGAL_COMPANY.phone}, {LEGAL_COMPANY.web}.
      </p>

      <h2>2. Definition des Dienstes Faktero</h2>
      <p>
        Faktero ist eine Online-Anwendung (Software-as-a-Service) zum Ausstellen von Rechnungen, zur
        Verwaltung von Kunden, für Lager, E-Rechnung, die Anbindung von Bankkonten und
        Online-Zahlungen über Dritte. Der Dienst ist unter der Domain faktero.sk und in den
        Subdomains des Betreibers verfügbar.
      </p>
      <p>
        <strong>
          Der Dienst Faktero ist vorrangig für Unternehmer, Gewerbetreibende und juristische
          Personen bestimmt.
        </strong>
      </p>

      <h2>3. Registrierung des Kontos</h2>
      <p>
        Der Nutzer ist berechtigt, ein Konto über das Registrierungsformular oder durch Anmeldung
        über einen Identitätsanbieter (Google) zu erstellen. Bei der Registrierung ist er
        verpflichtet, wahrheitsgemäße Angaben zu machen und seine Anmeldedaten vor Missbrauch zu
        schützen.
      </p>
      <p>
        Mit der Registrierung bestätigt der Nutzer sein Einverständnis mit diesen
        Geschäftsbedingungen und nimmt die Verarbeitung personenbezogener Daten gemäß dem Dokument
        DSGVO zur Kenntnis.
      </p>

      <h2>4. Abonnement, Preise und Abrechnung</h2>
      <p>
        Der Dienst wird im Rahmen kostenpflichtiger Tarife gemäß der aktuellen Preisliste
        bereitgestellt, die unter <a href="/cennik">faktero.sk/cennik</a> veröffentlicht ist.
        Aktuelle Preise der kostenpflichtigen Tarife (ohne MwSt.):
      </p>
      <ul>
        <li>
          <strong>Starter — 9,00 € / Monat</strong> ohne MwSt. (mit 23 % MwSt.: 11,07 € / Monat).
        </li>
        <li>
          <strong>Premium — 19,00 € / Monat</strong> ohne MwSt. (mit 23 % MwSt.: 23,37 € / Monat).
        </li>
        <li>
          <strong>Enterprise</strong> — Preis wird individuell je nach Umfang festgelegt.
        </li>
      </ul>
      <p>
        Der Betreiber ist umsatzsteuerpflichtig; auf alle Preise wird der in der Slowakischen
        Republik geltende MwSt.-Satz angewendet (derzeit <strong>23 %</strong>). Die Abrechnung
        erfolgt monatlich; nach jeder erfolgreichen Zahlung wird dem Nutzer ein Steuerbeleg
        ausgestellt, der in der Anwendung verfügbar ist.
      </p>

      <h2>5. Zahlungsweise</h2>
      <p>
        Zahlungen für das Abonnement erfolgen über das Zahlungsgateway <strong>GoPay</strong>{" "}
        (Betreiber GoPay s.r.o., Tschechische Republik). Unterstützt werden Zahlungen per
        Zahlungskarte (Visa, Mastercard) und Sofortüberweisung. Die Daten der Zahlungskarte des
        Nutzers <strong>sieht und speichert Faktero nicht</strong> — sie werden ausschließlich von
        GoPay gemäß PCI DSS und 3-D Secure verarbeitet.
      </p>

      <h2>6. Testversion</h2>
      <p>
        Der Betreiber stellt neuen Nutzern eine kostenlose Testversion zur Verfügung (derzeit 30
        Tage). Während des Testzeitraums ist die Eingabe von Zahlungsdaten nicht erforderlich. Nach
        Ablauf des Testzeitraums muss ein kostenpflichtiger Tarif aktiviert werden, andernfalls wird
        der Zugang zur Anwendung eingeschränkt.
      </p>

      <h2>7. Automatische Verlängerung des Abonnements</h2>
      <p>
        <strong>
          Das Abonnement verlängert sich nach Ablauf des Abrechnungszeitraums automatisch, sofern
          der Nutzer es nicht kündigt.
        </strong>{" "}
        Mit der Aktivierung der Kartenzahlung oder der wiederkehrenden Zahlung über GoPay erteilt
        der Nutzer seine Zustimmung zur wiederholten Abbuchung der dem gewählten Tarif
        entsprechenden Gebühr. Über die bevorstehende Verlängerung und deren Höhe wird der Nutzer
        per E-Mail informiert.
      </p>

      <h2>8. Rücktritt vom Vertrag (Verbraucher)</h2>
      <p>
        Ist der Nutzer Verbraucher im Sinne des Gesetzes Nr. 108/2024 Slg. (zákon č. 108/2024 Z.
        z.), hat er das Recht, innerhalb von <strong>14 Tagen</strong> ab Vertragsschluss
        (Aktivierung des kostenpflichtigen Tarifs) ohne Angabe von Gründen vom Vertrag
        zurückzutreten. Den Rücktritt sendet er per E-Mail an{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>. Hat der Nutzer bei der
        Aktivierung ausdrücklich verlangt, dass mit der Erbringung des digitalen Dienstes noch vor
        Ablauf der 14-tägigen Frist begonnen wird, und wurde er über den Verlust des
        Rücktrittsrechts belehrt, gilt das Rücktrittsrecht nicht für den bereits erbrachten Teil des
        Dienstes. Für Unternehmer (B2B) gilt das gesetzliche Rücktrittsrecht nicht.
      </p>

      <h2>9. Kündigung des Abonnements</h2>
      <p>
        Der Nutzer kann das Abonnement jederzeit im Bereich <em>Einstellungen → Abonnement</em>{" "}
        kündigen. Die Kündigung wird zum Ende des laufenden Abrechnungszeitraums wirksam; die
        bereits bezahlte Gebühr für den laufenden Zeitraum wird <strong>nicht erstattet</strong>{" "}
        (der Restzeitraum wird nicht zurückerstattet), mit Ausnahme der von den geltenden
        Rechtsvorschriften geforderten Fälle (z. B. Rücktritt gemäß Art. 8).
      </p>

      <h2>10. Reklamationsverfahren</h2>
      <p>
        Eine Reklamation des bereitgestellten Dienstes kann der Nutzer per E-Mail an{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a> oder schriftlich an die
        Sitzadresse des Betreibers ({LEGAL_COMPANY.address}) geltend machen. Die Reklamation wird
        unverzüglich, spätestens innerhalb von <strong>30 Tagen</strong> nach Zugang bearbeitet.
        Einzelheiten regelt die gesonderte{" "}
        <a href="/pravne/reklamacny-poriadok">Reklamationsordnung</a>.
      </p>

      <h2>11. Verfügbarkeit des Dienstes</h2>
      <p>
        Der Betreiber unternimmt angemessene Anstrengungen, um die ununterbrochene Verfügbarkeit des
        Dienstes sicherzustellen. Er garantiert jedoch keine 100%ige Verfügbarkeit und behält sich
        das Recht auf geplante Ausfallzeiten wegen Wartung, Aktualisierungen oder
        Sicherheitsmaßnahmen vor. Über geplante Ausfallzeiten informiert er nach Möglichkeit im
        Voraus.
      </p>

      <h2>12. Haftungsbeschränkung</h2>
      <p>
        Der Betreiber haftet nicht für Schäden, die durch unsachgemäße Nutzung des Dienstes,
        Ausfälle Dritter (Supabase, GoPay, Resend, Bank-APIs) oder durch einen vom Nutzer
        verursachten Datenverlust entstehen. Die Gesamthaftung des Betreibers ist auf die Höhe der
        vom Nutzer in den letzten 12 Monaten gezahlten Gebühren beschränkt.
      </p>

      <h2>13. Datenschutz</h2>
      <p>
        Die Verarbeitung personenbezogener Daten richtet sich nach dem gesonderten Dokument{" "}
        <em>DSGVO — Schutz personenbezogener Daten</em>. Die Daten der Ausgangsrechnungen und der
        Geschäftspartner des Nutzers gelten als Daten im Eigentum des Unternehmens des Nutzers.
      </p>

      <h2>14. Geistiges Eigentum</h2>
      <p>
        Alle Rechte an der Software, dem Design, der Marke und den Inhalten der Anwendung Faktero
        gehören dem Betreiber. Der Nutzer erhält eine nicht ausschließliche, nicht übertragbare
        Lizenz zur Nutzung des Dienstes für die Dauer des Abonnements.
      </p>

      <h2>15. Beendigung des Kontos</h2>
      <p>
        Der Nutzer kann sein Konto jederzeit auflösen. Der Betreiber ist berechtigt, das Konto bei
        Verstoß gegen diese Bedingungen, Nichtzahlung der Gebühren oder Missbrauch des Dienstes
        einzuschränken oder aufzulösen. Nach Auflösung des Kontos werden die Daten für die
        gesetzlich vorgeschriebene Dauer aufbewahrt und anschließend gelöscht.
      </p>

      <h2>16. Schlussbestimmungen</h2>
      <p>
        Diese Bedingungen unterliegen der Rechtsordnung der Slowakischen Republik. Streitigkeiten
        werden vor den zuständigen Gerichten der Slowakischen Republik beigelegt. Der Betreiber ist
        berechtigt, die Bedingungen zu ändern; über Änderungen informiert er den Nutzer per E-Mail
        oder in der Anwendung mindestens 14 Tage im Voraus.
      </p>

      <h2>Support</h2>
      <p>
        E-Mail: <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>
        <br />
        Telefon: {LEGAL_COMPANY.phone}
      </p>
    </>
  );
}
