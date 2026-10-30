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

export const Route = createFileRoute("/pravne/tesla-podmienky")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Podmienky používania Tesla Fleet API — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Podmienky pripojenia Tesla vozidiel cez Tesla Fleet API v službe Faktero.",
        ),
      },
      { property: "og:url", content: "https://www.faktero.sk/pravne/tesla-podmienky" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pravne/tesla-podmienky" }],
  }),
  component: Page,
});

function Page() {
  const { jazyk, t } = useT();
  return (
    <LegalShell
      title={t("Podmienky používania Tesla Fleet API")}
      updated={LEGAL_UPDATED}
      version={LEGAL_VERSION}
    >
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
      <p>
        Tieto podmienky dopĺňajú <a href="/pravne/obchodne-podmienky">Obchodné podmienky</a> a{" "}
        <a href="/pravne/gdpr">GDPR</a> spoločnosti {LEGAL_COMPANY.name} (ďalej len
        „prevádzkovateľ“) a upravujujú používanie integrácie s Tesla Fleet API (ďalej len „Tesla
        API“) v službe Faktero.
      </p>

      <h2>1. Čo je Tesla Fleet API</h2>
      <p>
        Tesla Fleet API je oficiálne rozhranie spoločnosti Tesla, Inc., ktoré umožňuje oprávneným
        tretím stranám pristupovať k údajom o vozidlách Tesla na základe výslovného súhlasu
        vlastníka vozidla. Faktero túto integráciu využíva výhradne na čítanie vybraných údajov —
        najmä stavu tachometra, polohy vozidla a identifikácie vozidla (VIN, názov vozidla).
      </p>

      <h2>2. Účel a rozsah spracúvania</h2>
      <p>
        Údaje získané cez Tesla API spracúvame výlučne na účely vedenia knihy jázd a správy
        vozidlového majetku v rámci služby Faktero. Konkrétne ide o:
      </p>
      <ul>
        <li>identifikáciu vozidla (VIN, zobrazovaný názov vozidla);</li>
        <li>stav tachometra (odometer) pre prepočet najazdených kilometrov;</li>
        <li>polohové údaje vozidla (zemepisná šírka a dĺžka) na účely prípadnej tvorby jázd;</li>
        <li>
          základné stavy vozidla (napr. shift_state, vehicle_state) potrebné na interpretáciu dát.
        </li>
      </ul>
      <p>
        Faktero <strong>nezapisuje</strong> do vozidla Tesla žiadne príkazy, neovplyvňuje jeho
        nastavenia, nezamyká ani neotvára vozidlo, neaktivuje klimatizáciu ani iné funkcie vozidla.
      </p>

      <h2>3. OAuth súhlas a požadované oprávnenia</h2>
      <p>
        Pripojenie Tesla účtu prebieha cez štandardný OAuth 2.0 autorizačný kód poskytovaný
        spoločnosťou Tesla. Používateľ je pred udelením súhlasu presmerovaný na Tesla prihlasovaciu
        stránku, kde vidí presný rozsah oprávnení. Faktero žiada iba minimálne potrebné rozsahy:
      </p>
      <ul>
        <li>
          <code>openid</code> — overenie identity používateľa a získanie e-mailovej adresy;
        </li>
        <li>
          <code>offline_access</code> — obnovovanie prístupového tokenu bez opätovného
          prihlasovania;
        </li>
        <li>
          <code>vehicle_device_data</code> — čítanie údajov o vozidle vrátane tachometra;
        </li>
        <li>
          <code>vehicle_location</code> — čítanie polohy vozidla (ak je používateľom udelené).
        </li>
      </ul>
      <p>
        Rozsah <code>vehicle_cmds</code> (príkazy vozidlu){" "}
        <strong>nie je požadovaný ani používaný</strong>.
      </p>

      <h2>4. Právny základ a súhlas</h2>
      <p>
        Právnym základom spracúvania osobných údajov získaných cez Tesla API je súhlas používateľa
        (článok 6 ods. 1 písm. a) Nariadenia GDPR). Súhlas udeľuje používateľ pri autorizácii na
        Tesla prihlasovacej stránke. Faktero tento súhlas nespracúva samostatne, využíva autorizačný
        token vydaný spoločnosťou Tesla.
      </p>
      <p>
        Používateľ môže súhlas kedykoľvek odvolať priamo vo svojom Tesla účte (zrušenie prístupu
        tretej strane) alebo v nastaveniach Faktera na stránke Tesla integrácie. Odvolaním súhlasu
        dôjde k okamžitému zneplatneniu tokenu a ukončeniu synchronizácie; údaje importované pred
        odvolaním súhlasu zostávajú zachované v súlade s retenčnými pravidlami Faktera.
      </p>

      <h2>5. Uchovávanie a bezpečnosť údajov</h2>
      <p>
        Prístupové a obnovovacie tokeny Tesla API sú uložené na serveri Faktera v šifrovanej podobe
        (AES-256-GCM). Tokeny nie sú ukladané do prehliadača ani zdieľané s tretími stranami.
        Faktero tokeny automaticky obnovuje pred vypršaním platnosti, aby nedochádzalo k častému
        opätovnému prihlasovaniu používateľa.
      </p>
      <p>
        Snímky vozidla (odometer, poloha) a synchronizačné logy sú uchovávané v databáze Faktera a
        viažu sa na konkrétnu spoločnosť (company_id). K údajom majú prístup iba oprávnení
        používatelia danej spoločnosti a technickí administrátori prevádzkovateľa v nevyhnutnom
        rozsahu.
      </p>

      <h2>6. Doba uchovávania</h2>
      <p>
        Tesla autentifikačné tokeny sú uchovávané do okamihu odpojenia Tesla účtu alebo odvolania
        súhlasu. Snímky vozidla a synchronizačné logy sú uchovávané po dobu používania služby
        Faktero v danej spoločnosti, najdlhšie však po dobu uvedenú v dokumentácii GDPR a
        všeobecných obchodných podmienkach. Po ukončení zmluvného vzťahu môžu byť údaje
        anonymizované alebo vymazané podľa zvolenej politiky uchovávania.
      </p>

      <h2>7. Zodpovednosť a obmedzenia</h2>
      <p>
        Tesla Fleet API neposkytuje hotový zoznam jázd. Faktero získava iba stavové snímky vozidla
        (tachometer, poloha), na základe ktorých môže v budúcnosti automatizovať tvorbu jázd.
        Faktero nezodpovedá za dostupnosť, presnosť ani oneskorenie dát poskytovaných spoločnosťou
        Tesla. Používateľ berie na vedomie, že prístup k API môže byť obmedzený, pozastavený alebo
        zmenený spoločnosťou Tesla bez predchádzajúceho upozornenia.
      </p>
      <p>
        Faktero používa Tesla API výhradne v súlade s aktuálnymi dokumentmi Tesla — vrátane, ale nie
        výhradne, <em>Tesla Fleet API Terms of Use</em> a <em>Tesla Privacy Policy</em>. Používateľ
        sa zaväzuje používať integráciu v súlade s podmienkami Tesla a platnými právnymi predpismi.
      </p>

      <h2>8. Prenos údajov do tretích krajín</h2>
      <p>
        Tesla API servery sa môžu nachádzať mimo Európskeho hospodárskeho priestoru. Tesla, Inc.
        poskytuje primerané záruky prenosu osobných údajov v súlade so svojou dokumentáciou a
        platnými právnymi predpismi. Faktero ako sprostredkovateľ neprevádzkuje Tesla API, ale iba
        ukladá dáta získané touto službou v rámci svojej vlastnej infraštruktúry.
      </p>

      <h2>9. Odpojenie a zrušenie prístupu</h2>
      <p>
        Používateľ môže kedykoľvek odpojiť Tesla účet v nastaveniach Faktera (sekcia Kniha jázd →
        Integrácie → Tesla). Odpojením dôjde k okamžitému vymazaniu uložených tokenov a zastaveniu
        ďalšej synchronizácie. Alternatívne môže používateľ zrušiť prístup aplikácie Faktero priamo
        v nastaveniach svojho Tesla účtu.
      </p>

      <h2>10. Zmeny podmienok</h2>
      <p>
        Prevádzkovateľ si vyhradzuje právo kedykoľvek zmeniť tieto podmienky, najmä ak dôjde k zmene
        funkcionality Tesla integrácie, rozsahu spracúvaných údajov alebo podmienok spoločnosti
        Tesla. O významných zmenách budú používatelia informovaní e-mailom alebo notifikáciou v
        aplikácii. Ďalším používaním integrácie po zmene podmienok používateľ vyjadruje svoj súhlas
        so zmeneným znením.
      </p>

      <h2>11. Kontakt</h2>
      <p>
        V prípade otázok týkajúcich sa Tesla integrácie, spracúvania údajov alebo odvolania súhlasu
        nás kontaktujte na e-mailovej adrese{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a> alebo poštou na adrese{" "}
        {LEGAL_COMPANY.address}.
      </p>
    </>
  );
}

function De() {
  return (
    <>
      <DeUpozornenie />
      <p>
        Diese Bedingungen ergänzen die <a href="/pravne/obchodne-podmienky">Geschäftsbedingungen</a>{" "}
        und die <a href="/pravne/gdpr">DSGVO-Informationen</a> der Gesellschaft {LEGAL_COMPANY.name}{" "}
        (nachfolgend „Betreiber“) und regeln die Nutzung der Integration mit der Tesla Fleet API
        (nachfolgend „Tesla API“) im Dienst Faktero.
      </p>

      <h2>1. Was ist die Tesla Fleet API</h2>
      <p>
        Die Tesla Fleet API ist die offizielle Schnittstelle der Gesellschaft Tesla, Inc., die es
        berechtigten Dritten ermöglicht, auf Grundlage der ausdrücklichen Zustimmung des
        Fahrzeughalters auf Daten von Tesla-Fahrzeugen zuzugreifen. Faktero nutzt diese Integration
        ausschließlich zum Lesen ausgewählter Daten — insbesondere des Kilometerstands, des
        Fahrzeugstandorts und der Fahrzeugidentifikation (VIN, Fahrzeugname).
      </p>

      <h2>2. Zweck und Umfang der Verarbeitung</h2>
      <p>
        Über die Tesla API erlangte Daten verarbeiten wir ausschließlich zum Zweck der Führung des
        Fahrtenbuchs und der Verwaltung des Fahrzeugbestands im Rahmen des Dienstes Faktero. Konkret
        handelt es sich um:
      </p>
      <ul>
        <li>die Identifikation des Fahrzeugs (VIN, angezeigter Fahrzeugname);</li>
        <li>den Kilometerstand (Odometer) zur Berechnung der gefahrenen Kilometer;</li>
        <li>
          Standortdaten des Fahrzeugs (geografische Breite und Länge) zum Zweck der etwaigen
          Erstellung von Fahrten;
        </li>
        <li>
          grundlegende Fahrzeugzustände (z. B. shift_state, vehicle_state), die zur Interpretation
          der Daten erforderlich sind.
        </li>
      </ul>
      <p>
        Faktero <strong>sendet keine</strong> Befehle an das Tesla-Fahrzeug, beeinflusst nicht
        dessen Einstellungen, verriegelt oder entriegelt das Fahrzeug nicht und aktiviert weder die
        Klimaanlage noch andere Fahrzeugfunktionen.
      </p>

      <h2>3. OAuth-Zustimmung und angeforderte Berechtigungen</h2>
      <p>
        Die Anbindung des Tesla-Kontos erfolgt über den standardmäßigen
        OAuth-2.0-Autorisierungscode, der von der Gesellschaft Tesla bereitgestellt wird. Vor
        Erteilung der Zustimmung wird der Nutzer auf die Tesla-Anmeldeseite weitergeleitet, wo er
        den genauen Umfang der Berechtigungen sieht. Faktero fordert nur die minimal erforderlichen
        Bereiche an:
      </p>
      <ul>
        <li>
          <code>openid</code> — Überprüfung der Identität des Nutzers und Abruf der E-Mail-Adresse;
        </li>
        <li>
          <code>offline_access</code> — Erneuerung des Zugriffstokens ohne erneute Anmeldung;
        </li>
        <li>
          <code>vehicle_device_data</code> — Lesen von Fahrzeugdaten einschließlich Kilometerstand;
        </li>
        <li>
          <code>vehicle_location</code> — Lesen des Fahrzeugstandorts (sofern vom Nutzer erteilt).
        </li>
      </ul>
      <p>
        Der Bereich <code>vehicle_cmds</code> (Befehle an das Fahrzeug){" "}
        <strong>wird weder angefordert noch verwendet</strong>.
      </p>

      <h2>4. Rechtsgrundlage und Zustimmung</h2>
      <p>
        Rechtsgrundlage für die Verarbeitung der über die Tesla API erlangten personenbezogenen
        Daten ist die Einwilligung des Nutzers (Artikel 6 Abs. 1 lit. a) DSGVO). Die Einwilligung
        erteilt der Nutzer bei der Autorisierung auf der Tesla-Anmeldeseite. Faktero verarbeitet
        diese Einwilligung nicht gesondert, sondern verwendet das von der Gesellschaft Tesla
        ausgestellte Autorisierungstoken.
      </p>
      <p>
        Der Nutzer kann die Einwilligung jederzeit direkt in seinem Tesla-Konto (Entzug des Zugriffs
        für Dritte) oder in den Einstellungen von Faktero auf der Seite der Tesla-Integration
        widerrufen. Mit dem Widerruf der Einwilligung wird das Token sofort ungültig und die
        Synchronisierung beendet; vor dem Widerruf importierte Daten bleiben gemäß den
        Aufbewahrungsregeln von Faktero erhalten.
      </p>

      <h2>5. Speicherung und Sicherheit der Daten</h2>
      <p>
        Zugriffs- und Aktualisierungstoken der Tesla API werden auf dem Server von Faktero in
        verschlüsselter Form (AES-256-GCM) gespeichert. Die Token werden weder im Browser
        gespeichert noch an Dritte weitergegeben. Faktero erneuert die Token automatisch vor Ablauf
        ihrer Gültigkeit, damit sich der Nutzer nicht häufig erneut anmelden muss.
      </p>
      <p>
        Fahrzeug-Snapshots (Kilometerstand, Standort) und Synchronisierungsprotokolle werden in der
        Datenbank von Faktero gespeichert und sind an ein konkretes Unternehmen (company_id)
        gebunden. Zugriff auf die Daten haben nur berechtigte Nutzer des jeweiligen Unternehmens und
        technische Administratoren des Betreibers im unbedingt erforderlichen Umfang.
      </p>

      <h2>6. Speicherdauer</h2>
      <p>
        Tesla-Authentifizierungstoken werden bis zur Trennung des Tesla-Kontos oder zum Widerruf der
        Einwilligung gespeichert. Fahrzeug-Snapshots und Synchronisierungsprotokolle werden für die
        Dauer der Nutzung des Dienstes Faktero im jeweiligen Unternehmen gespeichert, höchstens
        jedoch für die in der DSGVO-Dokumentation und den allgemeinen Geschäftsbedingungen
        angegebene Dauer. Nach Beendigung des Vertragsverhältnisses können die Daten gemäß der
        gewählten Aufbewahrungsrichtlinie anonymisiert oder gelöscht werden.
      </p>

      <h2>7. Haftung und Einschränkungen</h2>
      <p>
        Die Tesla Fleet API stellt keine fertige Liste von Fahrten bereit. Faktero erhält nur
        Zustands-Snapshots des Fahrzeugs (Kilometerstand, Standort), auf deren Grundlage es künftig
        die Erstellung von Fahrten automatisieren kann. Faktero haftet nicht für Verfügbarkeit,
        Genauigkeit oder Verzögerung der von der Gesellschaft Tesla bereitgestellten Daten. Der
        Nutzer nimmt zur Kenntnis, dass der Zugang zur API von der Gesellschaft Tesla ohne vorherige
        Ankündigung eingeschränkt, ausgesetzt oder geändert werden kann.
      </p>
      <p>
        Faktero nutzt die Tesla API ausschließlich im Einklang mit den aktuellen Dokumenten von
        Tesla — einschließlich, aber nicht beschränkt auf die <em>Tesla Fleet API Terms of Use</em>{" "}
        und die <em>Tesla Privacy Policy</em>. Der Nutzer verpflichtet sich, die Integration im
        Einklang mit den Bedingungen von Tesla und den geltenden Rechtsvorschriften zu nutzen.
      </p>

      <h2>8. Übermittlung von Daten in Drittländer</h2>
      <p>
        Die Server der Tesla API können sich außerhalb des Europäischen Wirtschaftsraums befinden.
        Tesla, Inc. bietet geeignete Garantien für die Übermittlung personenbezogener Daten im
        Einklang mit ihrer Dokumentation und den geltenden Rechtsvorschriften. Faktero als
        Auftragsverarbeiter betreibt die Tesla API nicht, sondern speichert lediglich die über
        diesen Dienst erlangten Daten im Rahmen seiner eigenen Infrastruktur.
      </p>

      <h2>9. Trennung und Entzug des Zugriffs</h2>
      <p>
        Der Nutzer kann das Tesla-Konto jederzeit in den Einstellungen von Faktero trennen (Bereich
        Fahrtenbuch → Integrationen → Tesla). Mit der Trennung werden die gespeicherten Token sofort
        gelöscht und die weitere Synchronisierung gestoppt. Alternativ kann der Nutzer den Zugriff
        der Anwendung Faktero direkt in den Einstellungen seines Tesla-Kontos entziehen.
      </p>

      <h2>10. Änderungen der Bedingungen</h2>
      <p>
        Der Betreiber behält sich das Recht vor, diese Bedingungen jederzeit zu ändern, insbesondere
        wenn sich die Funktionalität der Tesla-Integration, der Umfang der verarbeiteten Daten oder
        die Bedingungen der Gesellschaft Tesla ändern. Über wesentliche Änderungen werden die Nutzer
        per E-Mail oder durch eine Benachrichtigung in der Anwendung informiert. Durch die weitere
        Nutzung der Integration nach der Änderung der Bedingungen erklärt der Nutzer sein
        Einverständnis mit der geänderten Fassung.
      </p>

      <h2>11. Kontakt</h2>
      <p>
        Bei Fragen zur Tesla-Integration, zur Datenverarbeitung oder zum Widerruf der Einwilligung
        kontaktieren Sie uns unter der E-Mail-Adresse{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a> oder per Post unter der
        Adresse {LEGAL_COMPANY.address}.
      </p>
    </>
  );
}
