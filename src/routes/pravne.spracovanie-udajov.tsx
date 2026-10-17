import { createFileRoute } from "@tanstack/react-router";
import {
  LegalShell,
  LEGAL_VERSION,
  LEGAL_UPDATED,
  LEGAL_COMPANY,
  DeUpozornenie,
} from "@/components/faktero/LegalShell";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/pravne/spracovanie-udajov")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Zmluva o spracúvaní osobných údajov — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Zmluvné podmienky spracúvania osobných údajov podľa čl. 28 GDPR medzi Faktero ako sprostredkovateľom a zákazníkom ako prevádzkovateľom, vrátane zoznamu subdodávateľov.",
        ),
      },
      {
        property: "og:title",
        content: preloz(match.context.jazyk, "Spracúvanie osobných údajov — Faktero"),
      },
      { property: "og:url", content: "https://faktero.sk/pravne/spracovanie-udajov" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pravne/spracovanie-udajov" }],
  }),
  component: Page,
});

/**
 * Subdodávatelia (ďalší sprostredkovatelia). Zoznam musí byť verejný a
 * aktuálny — zákazník má právo vedieť, komu sa jeho údaje sprístupňujú, a
 * namietať pribudnutie nového.
 */
const SUBDODAVATELIA = [
  {
    nazov: "Supabase, Inc.",
    ucel: "Databáza, prihlasovanie a úložisko súborov",
    kde: "Európska únia (Frankfurt, Nemecko)",
  },
  {
    nazov: "Hetzner Online GmbH",
    ucel: "Server, na ktorom beží aplikácia",
    kde: "Európska únia (Nemecko)",
  },
  {
    nazov: "Resend, Inc.",
    ucel: "Odosielanie a prijímanie e-mailov (faktúry, upomienky, doklady poštou)",
    kde: "USA — štandardné zmluvné doložky",
  },
  {
    nazov: "Google Ireland Ltd. (Gemini API)",
    ucel: "Rozpoznávanie údajov z nahratých dokladov",
    kde: "Európska únia / USA — štandardné zmluvné doložky",
  },
  {
    nazov: "OpenAI Ireland Ltd.",
    ucel: "Rozpoznávanie dokladov a asistent, keď prvý poskytovateľ nie je dostupný",
    kde: "Európska únia / USA — štandardné zmluvné doložky",
  },
  {
    nazov: "GOPAY s.r.o.",
    ucel: "Platby za predplatné",
    kde: "Česká republika",
  },
  {
    nazov: "Apple Inc. / Google Ireland Ltd.",
    ucel: "Distribúcia mobilnej aplikácie a doručovanie upozornení",
    kde: "USA / Európska únia — štandardné zmluvné doložky",
  },
] as const;

function Page() {
  const { jazyk, t } = useT();
  return (
    <LegalShell
      title={t("Zmluva o spracúvaní osobných údajov")}
      updated={LEGAL_UPDATED}
      version={LEGAL_VERSION}
    >
      {jazyk === "de" ? <De /> : <Sk />}
    </LegalShell>
  );
}

function Sk() {
  return (
    <>
      <p>
        Tieto podmienky sú zmluvou o spracúvaní osobných údajov podľa čl. 28 nariadenia (EÚ)
        2016/679 (GDPR). Uzatvárajú sa medzi vami ako <strong>prevádzkovateľom</strong> a
        spoločnosťou <strong>{LEGAL_COMPANY.name}</strong> ({LEGAL_COMPANY.address}, IČO{" "}
        {LEGAL_COMPANY.ico}) ako <strong>sprostredkovateľom</strong>, a to okamihom, keď začnete
        službu Faktero používať. Samostatný podpis sa nevyžaduje; na požiadanie vám podpísané
        vyhotovenie pošleme na <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>.
      </p>

      <h2>1. Predmet a trvanie</h2>
      <p>
        Sprostredkovateľ spracúva osobné údaje výlučne na účel poskytovania služby Faktero — teda
        aby ste mohli vystavovať doklady, viesť účtovné podklady, komunikovať s odberateľmi a
        používať ďalšie funkcie, ktoré si zapnete. Spracúvanie trvá po dobu trvania zmluvy o
        používaní služby.
      </p>

      <h2>2. Povaha a účel spracúvania</h2>
      <p>
        Ukladanie, usporadúvanie, zálohovanie, sprístupňovanie oprávneným používateľom vašej firmy,
        odosielanie dokladov a upozornení, rozpoznávanie údajov z nahratých dokumentov a prevádzkové
        zabezpečenie služby.
      </p>

      <h2>3. Kategórie dotknutých osôb a údajov</h2>
      <ul>
        <li>
          <strong>Dotknuté osoby:</strong> vaši odberatelia a dodávatelia (aj fyzické osoby),
          zamestnanci, používatelia, ktorých do firmy pozvete, prípadne vodiči a ďalšie osoby
          uvedené vo vašich dokladoch.
        </li>
        <li>
          <strong>Údaje:</strong> identifikačné a kontaktné údaje, fakturačné a platobné údaje,
          obsah dokladov a príloh, údaje z knihy jázd a — ak modul používate — mzdové a personálne
          údaje vrátane osobitnej kategórie (rodné číslo, číslo dokladu), ktoré sa ukladajú
          šifrované.
        </li>
      </ul>

      <h2>4. Pokyny prevádzkovateľa</h2>
      <p>
        Sprostredkovateľ spracúva údaje len na základe vašich pokynov — teda toho, čo v aplikácii
        urobíte alebo si písomne vyžiadate. Ak by pokyn odporoval právnym predpisom, upozorní vás.
        Ak by mu spracúvanie ukladal právny predpis, oznámi vám to, ak to predpis nezakazuje.
      </p>

      <h2>5. Mlčanlivosť a bezpečnosť</h2>
      <ul>
        <li>Osoby oprávnené spracúvať údaje sú viazané mlčanlivosťou.</li>
        <li>
          Prenos aj uloženie sú šifrované; prístup k dátam firmy má len ten, koho do firmy pozvete,
          a v rozsahu roly alebo vlastného prístupu, ktorý mu nastavíte.
        </li>
        <li>
          K dispozícii je dvojfaktorové overenie; údaje osobitnej kategórie sú šifrované aj v
          databáze.
        </li>
        <li>Zálohy sa vytvárajú denne a uchovávajú v Európskej únii.</li>
      </ul>

      <h2>6. Ďalší sprostredkovatelia</h2>
      <p>
        Na poskytovanie služby využívame subdodávateľov. Zmena sa oznámi najmenej 30 dní vopred na
        tejto stránke a e-mailom; do uplynutia tejto lehoty môžete voči zmene namietať a zmluvu
        ukončiť.
      </p>
      {/* Na mobile karty, od sm tabuľka — tri stĺpce sa do 390 px nezmestia. */}
      <ul className="list-none! space-y-3 pl-0! sm:hidden">
        {SUBDODAVATELIA.map((s) => (
          <li key={s.nazov} className="rounded-lg border border-border bg-card p-3">
            <div className="font-semibold text-foreground">{s.nazov}</div>
            <div className="mt-1 text-sm">{s.ucel}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.kde}</div>
          </li>
        ))}
      </ul>
      <div className="my-4 hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 text-left font-semibold text-foreground">Subdodávateľ</th>
              <th className="py-2 pr-4 text-left font-semibold text-foreground">Účel</th>
              <th className="py-2 text-left font-semibold text-foreground">Miesto spracúvania</th>
            </tr>
          </thead>
          <tbody>
            {SUBDODAVATELIA.map((s) => (
              <tr key={s.nazov} className="border-b border-border/60 align-top">
                <td className="py-2 pr-4 font-medium text-foreground">{s.nazov}</td>
                <td className="py-2 pr-4">{s.ucel}</td>
                <td className="py-2">{s.kde}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>7. Pomoc pri právach dotknutých osôb</h2>
      <p>
        Nástroje na výkon práv máte priamo v aplikácii: údaje odberateľov a dokladov viete upraviť
        aj vymazať a účet aj s dátami zrušiť. Ak si žiadosť vyžaduje našu súčinnosť, poskytneme ju
        bez zbytočného odkladu, najneskôr do 10 pracovných dní.
      </p>

      <h2>8. Porušenie ochrany údajov</h2>
      <p>
        O porušení ochrany osobných údajov vás upovedomíme bez zbytočného odkladu po tom, čo sa o
        ňom dozvieme, a poskytneme informácie potrebné na vaše ohlásenie dozornému orgánu.
      </p>

      <h2>9. Po skončení zmluvy</h2>
      <p>
        Po zrušení účtu sa údaje vymažú v lehote uvedenej v obchodných podmienkach. Pred zmazaním si
        dáta stiahnite — <strong>povinnosť uchovávať účtovné doklady desať rokov</strong> (§ 76
        zákona o DPH, § 35 zákona o účtovníctve) ostáva na vás a zmazaním účtu nezaniká.
      </p>

      <h2>10. Kontrola a audit</h2>
      <p>
        Na požiadanie poskytneme informácie potrebné na preukázanie plnenia povinností podľa čl. 28
        GDPR a umožníme audit dohodnutý vopred, v rozsahu, ktorý neohrozí bezpečnosť údajov
        ostatných zákazníkov.
      </p>
    </>
  );
}

const SUBDODAVATELIA_DE = [
  {
    nazov: "Supabase, Inc.",
    ucel: "Datenbank, Anmeldung und Dateispeicher",
    kde: "Europäische Union (Frankfurt, Deutschland)",
  },
  {
    nazov: "Hetzner Online GmbH",
    ucel: "Server, auf dem die Anwendung läuft",
    kde: "Europäische Union (Deutschland)",
  },
  {
    nazov: "Resend, Inc.",
    ucel: "Versand und Empfang von E-Mails (Rechnungen, Mahnungen, Belege per Post)",
    kde: "USA — Standardvertragsklauseln",
  },
  {
    nazov: "Google Ireland Ltd. (Gemini API)",
    ucel: "Erkennung von Daten aus hochgeladenen Belegen",
    kde: "Europäische Union / USA — Standardvertragsklauseln",
  },
  {
    nazov: "OpenAI Ireland Ltd.",
    ucel: "Belegerkennung und Assistent, wenn der erste Anbieter nicht verfügbar ist",
    kde: "Europäische Union / USA — Standardvertragsklauseln",
  },
  {
    nazov: "GOPAY s.r.o.",
    ucel: "Zahlungen für das Abonnement",
    kde: "Tschechische Republik",
  },
  {
    nazov: "Apple Inc. / Google Ireland Ltd.",
    ucel: "Vertrieb der mobilen Anwendung und Zustellung von Benachrichtigungen",
    kde: "USA / Europäische Union — Standardvertragsklauseln",
  },
] as const;

function De() {
  return (
    <>
      <DeUpozornenie />
      <p>
        Diese Bedingungen sind ein Vertrag über die Verarbeitung personenbezogener Daten gemäß Art.
        28 der Verordnung (EU) 2016/679 (DSGVO). Er wird zwischen Ihnen als{" "}
        <strong>Verantwortlichem</strong> und der Gesellschaft <strong>{LEGAL_COMPANY.name}</strong>{" "}
        ({LEGAL_COMPANY.address}, Firmen-ID (IČO) {LEGAL_COMPANY.ico}) als{" "}
        <strong>Auftragsverarbeiter</strong> geschlossen, und zwar in dem Moment, in dem Sie
        beginnen, den Dienst Faktero zu nutzen. Eine gesonderte Unterschrift ist nicht erforderlich;
        auf Anfrage senden wir Ihnen eine unterzeichnete Ausfertigung an{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>.
      </p>

      <h2>1. Gegenstand und Dauer</h2>
      <p>
        Der Auftragsverarbeiter verarbeitet personenbezogene Daten ausschließlich zum Zweck der
        Bereitstellung des Dienstes Faktero — also damit Sie Belege ausstellen,
        Buchhaltungsunterlagen führen, mit Kunden kommunizieren und weitere Funktionen nutzen
        können, die Sie aktivieren. Die Verarbeitung dauert für die Laufzeit des Vertrags über die
        Nutzung des Dienstes an.
      </p>

      <h2>2. Art und Zweck der Verarbeitung</h2>
      <p>
        Speicherung, Ordnung, Sicherung, Bereitstellung für berechtigte Nutzer Ihres Unternehmens,
        Versand von Belegen und Benachrichtigungen, Erkennung von Daten aus hochgeladenen Dokumenten
        und betriebliche Absicherung des Dienstes.
      </p>

      <h2>3. Kategorien betroffener Personen und Daten</h2>
      <ul>
        <li>
          <strong>Betroffene Personen:</strong> Ihre Kunden und Lieferanten (auch natürliche
          Personen), Mitarbeiter, Nutzer, die Sie in das Unternehmen einladen, ggf. Fahrer und
          weitere in Ihren Belegen genannte Personen.
        </li>
        <li>
          <strong>Daten:</strong> Identifikations- und Kontaktdaten, Rechnungs- und Zahlungsdaten,
          Inhalt von Belegen und Anhängen, Daten aus dem Fahrtenbuch und — sofern Sie das Modul
          nutzen — Lohn- und Personaldaten einschließlich besonderer Kategorien (Geburtsnummer,
          Ausweisnummer), die verschlüsselt gespeichert werden.
        </li>
      </ul>

      <h2>4. Weisungen des Verantwortlichen</h2>
      <p>
        Der Auftragsverarbeiter verarbeitet Daten nur auf Grundlage Ihrer Weisungen — also dessen,
        was Sie in der Anwendung tun oder schriftlich anfordern. Sollte eine Weisung gegen
        Rechtsvorschriften verstoßen, weist er Sie darauf hin. Sollte ihm die Verarbeitung durch
        eine Rechtsvorschrift auferlegt werden, teilt er Ihnen dies mit, sofern die Vorschrift dies
        nicht verbietet.
      </p>

      <h2>5. Vertraulichkeit und Sicherheit</h2>
      <ul>
        <li>Zur Verarbeitung der Daten befugte Personen sind zur Verschwiegenheit verpflichtet.</li>
        <li>
          Übertragung und Speicherung sind verschlüsselt; Zugriff auf die Daten des Unternehmens hat
          nur, wen Sie in das Unternehmen einladen, und zwar im Umfang der Rolle oder des
          individuellen Zugriffs, den Sie ihm einrichten.
        </li>
        <li>
          Eine Zwei-Faktor-Authentifizierung steht zur Verfügung; Daten besonderer Kategorien sind
          auch in der Datenbank verschlüsselt.
        </li>
        <li>Sicherungen werden täglich erstellt und in der Europäischen Union aufbewahrt.</li>
      </ul>

      <h2>6. Weitere Auftragsverarbeiter</h2>
      <p>
        Zur Bereitstellung des Dienstes setzen wir Unterauftragsverarbeiter ein. Eine Änderung wird
        mindestens 30 Tage im Voraus auf dieser Seite und per E-Mail mitgeteilt; bis zum Ablauf
        dieser Frist können Sie der Änderung widersprechen und den Vertrag beenden.
      </p>
      <ul className="list-none! space-y-3 pl-0! sm:hidden">
        {SUBDODAVATELIA_DE.map((s) => (
          <li key={s.nazov} className="rounded-lg border border-border bg-card p-3">
            <div className="font-semibold text-foreground">{s.nazov}</div>
            <div className="mt-1 text-sm">{s.ucel}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.kde}</div>
          </li>
        ))}
      </ul>
      <div className="my-4 hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 text-left font-semibold text-foreground">
                Unterauftragsverarbeiter
              </th>
              <th className="py-2 pr-4 text-left font-semibold text-foreground">Zweck</th>
              <th className="py-2 text-left font-semibold text-foreground">Ort der Verarbeitung</th>
            </tr>
          </thead>
          <tbody>
            {SUBDODAVATELIA_DE.map((s) => (
              <tr key={s.nazov} className="border-b border-border/60 align-top">
                <td className="py-2 pr-4 font-medium text-foreground">{s.nazov}</td>
                <td className="py-2 pr-4">{s.ucel}</td>
                <td className="py-2">{s.kde}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>7. Unterstützung bei den Rechten betroffener Personen</h2>
      <p>
        Werkzeuge zur Ausübung der Rechte haben Sie direkt in der Anwendung: Daten von Kunden und
        Belegen können Sie bearbeiten und auch löschen, und das Konto einschließlich der Daten
        auflösen. Erfordert ein Antrag unsere Mitwirkung, leisten wir sie unverzüglich, spätestens
        innerhalb von 10 Arbeitstagen.
      </p>

      <h2>8. Verletzung des Schutzes personenbezogener Daten</h2>
      <p>
        Über eine Verletzung des Schutzes personenbezogener Daten benachrichtigen wir Sie
        unverzüglich, nachdem wir davon erfahren haben, und stellen Ihnen die Informationen zur
        Verfügung, die Sie für Ihre Meldung an die Aufsichtsbehörde benötigen.
      </p>

      <h2>9. Nach Vertragsende</h2>
      <p>
        Nach Auflösung des Kontos werden die Daten innerhalb der in den Geschäftsbedingungen
        angegebenen Frist gelöscht. Laden Sie die Daten vor der Löschung herunter — die{" "}
        <strong>Pflicht, Buchhaltungsbelege zehn Jahre aufzubewahren</strong> (§ 76 des
        Mehrwertsteuergesetzes (zákon o DPH), § 35 des Gesetzes über die Buchführung (zákon o
        účtovníctve)) verbleibt bei Ihnen und erlischt nicht mit der Löschung des Kontos.
      </p>

      <h2>10. Kontrolle und Audit</h2>
      <p>
        Auf Anfrage stellen wir die Informationen zur Verfügung, die zum Nachweis der Erfüllung der
        Pflichten gemäß Art. 28 DSGVO erforderlich sind, und ermöglichen ein im Voraus vereinbartes
        Audit in einem Umfang, der die Sicherheit der Daten anderer Kunden nicht gefährdet.
      </p>
    </>
  );
}
