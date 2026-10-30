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

export const Route = createFileRoute("/pravne/gdpr")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Ochrana osobných údajov (GDPR) — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Informácie o spracúvaní osobných údajov v službe Faktero v zmysle GDPR.",
        ),
      },
      { property: "og:title", content: preloz(match.context.jazyk, "GDPR — Faktero") },
      { property: "og:url", content: "https://www.faktero.sk/pravne/gdpr" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pravne/gdpr" }],
  }),
  component: Page,
});

function Page() {
  const { jazyk, t } = useT();
  return (
    <LegalShell
      title={t("Ochrana osobných údajov (GDPR)")}
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
      <h2>1. Prevádzkovateľ</h2>
      <p>
        <strong>{LEGAL_COMPANY.name}</strong>, sídlo {LEGAL_COMPANY.address}, IČO:{" "}
        {LEGAL_COMPANY.ico}, DIČ: {LEGAL_COMPANY.dic}, IČ DPH: {LEGAL_COMPANY.icDph}.
      </p>

      <h2>2. Kontaktné údaje</h2>
      <p>
        Pre otázky týkajúce sa spracúvania osobných údajov nás kontaktujte na{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a> alebo{" "}
        {LEGAL_COMPANY.phone}.
      </p>
      <p>
        Nemáme povinnosť ustanoviť zodpovednú osobu (DPO); vo veciach ochrany osobných údajov
        kontaktujte <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>.
      </p>

      <p>
        Keď Faktero používate na vedenie svojej agendy, spracúvame údaje vašich odberateľov a
        zamestnancov ako <strong>sprostredkovateľ</strong> podľa čl. 28 GDPR — podmienky sú v{" "}
        <a href="/pravne/spracovanie-udajov">zmluve o spracúvaní osobných údajov</a>, kde je aj
        zoznam subdodávateľov.
      </p>

      <h2>3. Aké údaje spracúvame</h2>
      <ul>
        <li>Identifikačné údaje: meno, priezvisko, e-mail, telefón.</li>
        <li>Firemné údaje: názov firmy, IČO, DIČ, IČ DPH, adresa sídla.</li>
        <li>Účtovné údaje: vystavené faktúry, odberatelia, sklad, platby.</li>
        <li>Technické údaje: IP adresa, prehliadač, cookies, logy prístupov.</li>
        <li>
          Platobné údaje: informácie o platbách za predplatné (samotné údaje o platobnej karte
          spracúva poskytovateľ platobnej brány).
        </li>
      </ul>

      <h2>4. Účel spracúvania</h2>
      <ul>
        <li>Poskytovanie a prevádzka Služby Faktero.</li>
        <li>Plnenie zmluvných povinností a fakturácia predplatného.</li>
        <li>Komunikácia s používateľom a zákaznícka podpora.</li>
        <li>Plnenie zákonných povinností (účtovníctvo, dane, archivácia).</li>
        <li>Zabezpečenie a prevencia zneužitia služby.</li>
      </ul>

      <h2>5. Právny základ</h2>
      <ul>
        <li>Plnenie zmluvy (čl. 6 ods. 1 písm. b GDPR).</li>
        <li>Plnenie zákonných povinností (čl. 6 ods. 1 písm. c GDPR).</li>
        <li>Oprávnený záujem prevádzkovateľa (čl. 6 ods. 1 písm. f GDPR).</li>
        <li>Súhlas dotknutej osoby (čl. 6 ods. 1 písm. a GDPR), tam, kde sa vyžaduje.</li>
      </ul>

      <h2>6. Doba uchovávania</h2>
      <p>
        Osobné údaje uchovávame po dobu trvania zmluvného vzťahu a následne po dobu vyžadovanú
        právnymi predpismi (typicky 10 rokov v zmysle zákona o účtovníctve). Po uplynutí tejto doby
        sú údaje vymazané alebo anonymizované.
      </p>

      <h2>7. Prenos údajov tretím stranám</h2>
      <p>Údaje zdieľame výhradne so spracovateľmi nevyhnutnými na prevádzku Služby:</p>
      {/*
        Zoznam musí sedieť so zmluvou o spracúvaní údajov (/pravne/spracovanie-udajov).
        Chýbali v ňom server, na ktorom Faktero beží, a poskytovatelia AI, ktorí
        čítajú nahraté doklady — teda práve tí, na ktorých sa človek pýta.
      */}
      <ul>
        <li>
          <strong>Supabase</strong> (databáza, prihlasovanie a úložisko súborov) — Supabase Inc.,
          servery v EÚ (Frankfurt).
        </li>
        <li>
          <strong>Hetzner Online</strong> (server, na ktorom aplikácia beží) — Hetzner Online GmbH,
          Nemecko.
        </li>
        <li>
          <strong>Resend</strong> (rozosielanie a príjem e-mailov, faktúry a doklady poštou) —
          Resend Inc., USA, štandardné zmluvné doložky.
        </li>
        <li>
          <strong>Google (Gemini API)</strong> a <strong>OpenAI</strong> (rozpoznávanie údajov z
          nahratých dokladov a asistent) — Google Ireland Ltd. a OpenAI Ireland Ltd., štandardné
          zmluvné doložky. Doklady sa neposkytujú na trénovanie modelov.
        </li>
        <li>
          <strong>GoPay</strong> (platobná brána pre predplatné Faktero) — GOPAY s.r.o., ČR. Platby
          kartou pre zákazníkov vašej firmy Faktero neponúka.
        </li>
        <li>
          <strong>Apple / Google</strong> (distribúcia mobilnej aplikácie a doručovanie upozornení)
          — Apple Inc. a Google Ireland Ltd.
        </li>
        <li>
          <strong>Google Analytics</strong> (ak bude aktivovaný) — Google Ireland Ltd., Írsko. Údaje
          sú anonymizované.
        </li>
      </ul>
      <p>
        So všetkými spracovateľmi máme uzavretú zmluvu o spracúvaní osobných údajov v zmysle čl. 28
        GDPR.
      </p>

      <h2>8. Údaje vlastnené používateľom</h2>
      <p>
        <strong>
          Údaje vystavených faktúr, odberateľov a sklad vložené používateľom patria firme
          používateľa.
        </strong>{" "}
        Prevádzkovateľ tieto údaje spracúva výlučne ako spracovateľ v mene používateľa za účelom
        prevádzky Služby.
      </p>

      <h2>9. Práva dotknutej osoby</h2>
      <ul>
        <li>Právo na prístup k osobným údajom.</li>
        <li>Právo na opravu nesprávnych údajov.</li>
        <li>Právo na výmaz („právo byť zabudnutý“).</li>
        <li>Právo na obmedzenie spracúvania.</li>
        <li>Právo na prenositeľnosť údajov.</li>
        <li>Právo namietať proti spracúvaniu.</li>
        <li>Právo podať sťažnosť dozornému orgánu (Úrad na ochranu osobných údajov SR).</li>
      </ul>

      <h2>10. Výmaz údajov</h2>
      <p>
        O výmaz účtu a osobných údajov môžete požiadať e-mailom na{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>. Údaje, ktoré sme
        povinní uchovávať podľa zákona (napr. vystavené faktúry), budú vymazané po uplynutí zákonnej
        lehoty.
      </p>

      <h2>11. Prenositeľnosť údajov</h2>
      <p>
        Na požiadanie poskytneme export vašich údajov v štruktúrovanom, bežne používanom a strojovo
        čitateľnom formáte (CSV, JSON, XML).
      </p>

      <h2>12. Kontakt pre GDPR</h2>
      <p>
        {LEGAL_COMPANY.name}
        <br />
        {LEGAL_COMPANY.address}
        <br />
        E-mail: <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>
      </p>
    </>
  );
}

function De() {
  return (
    <>
      <DeUpozornenie />
      <h2>1. Verantwortlicher</h2>
      <p>
        <strong>{LEGAL_COMPANY.name}</strong>, Sitz {LEGAL_COMPANY.address}, Firmen-ID (IČO):{" "}
        {LEGAL_COMPANY.ico}, Steuernummer (DIČ): {LEGAL_COMPANY.dic}, USt-IdNr.:{" "}
        {LEGAL_COMPANY.icDph}.
      </p>

      <h2>2. Kontaktdaten</h2>
      <p>
        Bei Fragen zur Verarbeitung personenbezogener Daten kontaktieren Sie uns unter{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a> oder{" "}
        {LEGAL_COMPANY.phone}.
      </p>
      <p>
        Wir sind nicht verpflichtet, einen Datenschutzbeauftragten (DPO) zu benennen; in
        Datenschutzangelegenheiten wenden Sie sich an{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>.
      </p>

      <p>
        Wenn Sie Faktero zur Führung Ihrer Geschäftsunterlagen nutzen, verarbeiten wir die Daten
        Ihrer Kunden und Mitarbeiter als <strong>Auftragsverarbeiter</strong> gemäß Art. 28 DSGVO —
        die Bedingungen finden Sie im{" "}
        <a href="/pravne/spracovanie-udajov">
          Vertrag über die Verarbeitung personenbezogener Daten
        </a>
        , wo auch die Liste der Unterauftragsverarbeiter aufgeführt ist.
      </p>

      <h2>3. Welche Daten wir verarbeiten</h2>
      <ul>
        <li>Identifikationsdaten: Vorname, Nachname, E-Mail, Telefon.</li>
        <li>
          Unternehmensdaten: Firmenname, Firmen-ID (IČO), Steuernummer (DIČ), USt-IdNr.,
          Sitzadresse.
        </li>
        <li>Buchhaltungsdaten: Ausgangsrechnungen, Kunden, Lager, Zahlungen.</li>
        <li>Technische Daten: IP-Adresse, Browser, Cookies, Zugriffsprotokolle.</li>
        <li>
          Zahlungsdaten: Informationen über Zahlungen für das Abonnement (die Daten der
          Zahlungskarte selbst verarbeitet der Anbieter des Zahlungsgateways).
        </li>
      </ul>

      <h2>4. Zweck der Verarbeitung</h2>
      <ul>
        <li>Bereitstellung und Betrieb des Dienstes Faktero.</li>
        <li>Erfüllung vertraglicher Pflichten und Abrechnung des Abonnements.</li>
        <li>Kommunikation mit dem Nutzer und Kundensupport.</li>
        <li>Erfüllung gesetzlicher Pflichten (Buchhaltung, Steuern, Archivierung).</li>
        <li>Sicherheit und Verhinderung von Missbrauch des Dienstes.</li>
      </ul>

      <h2>5. Rechtsgrundlage</h2>
      <ul>
        <li>Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).</li>
        <li>Erfüllung gesetzlicher Pflichten (Art. 6 Abs. 1 lit. c DSGVO).</li>
        <li>Berechtigtes Interesse des Verantwortlichen (Art. 6 Abs. 1 lit. f DSGVO).</li>
        <li>
          Einwilligung der betroffenen Person (Art. 6 Abs. 1 lit. a DSGVO), sofern erforderlich.
        </li>
      </ul>

      <h2>6. Speicherdauer</h2>
      <p>
        Personenbezogene Daten speichern wir für die Dauer des Vertragsverhältnisses und danach für
        die von den Rechtsvorschriften geforderte Dauer (in der Regel 10 Jahre gemäß dem Gesetz über
        die Buchführung (zákon o účtovníctve)). Nach Ablauf dieser Frist werden die Daten gelöscht
        oder anonymisiert.
      </p>

      <h2>7. Übermittlung von Daten an Dritte</h2>
      <p>
        Wir teilen Daten ausschließlich mit Auftragsverarbeitern, die für den Betrieb des Dienstes
        erforderlich sind:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> (Datenbank, Anmeldung und Dateispeicher) — Supabase Inc., Server
          in der EU (Frankfurt).
        </li>
        <li>
          <strong>Hetzner Online</strong> (Server, auf dem die Anwendung läuft) — Hetzner Online
          GmbH, Deutschland.
        </li>
        <li>
          <strong>Resend</strong> (Versand und Empfang von E-Mails, Rechnungen und Belege per Post)
          — Resend Inc., USA, Standardvertragsklauseln.
        </li>
        <li>
          <strong>Google (Gemini API)</strong> und <strong>OpenAI</strong> (Erkennung von Daten aus
          hochgeladenen Belegen und Assistent) — Google Ireland Ltd. und OpenAI Ireland Ltd.,
          Standardvertragsklauseln. Die Belege werden nicht zum Training von Modellen
          bereitgestellt.
        </li>
        <li>
          <strong>GoPay</strong> (Zahlungsgateway für das Faktero-Abonnement) — GOPAY s.r.o.,
          Tschechische Republik. Kartenzahlungen für die Kunden Ihres Unternehmens bietet Faktero
          nicht an.
        </li>
        <li>
          <strong>Apple / Google</strong> (Vertrieb der mobilen Anwendung und Zustellung von
          Benachrichtigungen) — Apple Inc. und Google Ireland Ltd.
        </li>
        <li>
          <strong>Google Analytics</strong> (falls aktiviert) — Google Ireland Ltd., Irland. Die
          Daten werden anonymisiert.
        </li>
      </ul>
      <p>
        Mit allen Auftragsverarbeitern haben wir einen Vertrag über die Verarbeitung
        personenbezogener Daten gemäß Art. 28 DSGVO geschlossen.
      </p>

      <h2>8. Daten im Eigentum des Nutzers</h2>
      <p>
        <strong>
          Die vom Nutzer eingegebenen Daten zu Ausgangsrechnungen, Kunden und Lager gehören dem
          Unternehmen des Nutzers.
        </strong>{" "}
        Der Betreiber verarbeitet diese Daten ausschließlich als Auftragsverarbeiter im Namen des
        Nutzers zum Zweck des Betriebs des Dienstes.
      </p>

      <h2>9. Rechte der betroffenen Person</h2>
      <ul>
        <li>Recht auf Auskunft über personenbezogene Daten.</li>
        <li>Recht auf Berichtigung unrichtiger Daten.</li>
        <li>Recht auf Löschung („Recht auf Vergessenwerden“).</li>
        <li>Recht auf Einschränkung der Verarbeitung.</li>
        <li>Recht auf Datenübertragbarkeit.</li>
        <li>Recht auf Widerspruch gegen die Verarbeitung.</li>
        <li>
          Recht auf Beschwerde bei der Aufsichtsbehörde (Amt für den Schutz personenbezogener Daten
          der Slowakischen Republik, Úrad na ochranu osobných údajov SR).
        </li>
      </ul>

      <h2>10. Löschung von Daten</h2>
      <p>
        Die Löschung des Kontos und der personenbezogenen Daten können Sie per E-Mail an{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a> beantragen. Daten, die
        wir gesetzlich aufbewahren müssen (z. B. Ausgangsrechnungen), werden nach Ablauf der
        gesetzlichen Frist gelöscht.
      </p>

      <h2>11. Datenübertragbarkeit</h2>
      <p>
        Auf Anfrage stellen wir Ihnen einen Export Ihrer Daten in einem strukturierten, gängigen und
        maschinenlesbaren Format (CSV, JSON, XML) zur Verfügung.
      </p>

      <h2>12. Kontakt für DSGVO</h2>
      <p>
        {LEGAL_COMPANY.name}
        <br />
        {LEGAL_COMPANY.address}
        <br />
        E-Mail: <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>
      </p>
    </>
  );
}
