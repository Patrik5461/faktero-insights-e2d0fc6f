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

export const Route = createFileRoute("/pravne/reklamacny-poriadok")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Reklamačný poriadok — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Postup pri reklamácii služby Faktero, lehoty a kontaktné údaje.",
        ),
      },
      { property: "og:url", content: "https://faktero.sk/pravne/reklamacny-poriadok" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pravne/reklamacny-poriadok" }],
  }),
  component: Page,
});

function Page() {
  const { jazyk, t } = useT();
  return (
    <LegalShell title={t("Reklamačný poriadok")} updated={LEGAL_UPDATED} version={LEGAL_VERSION}>
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
        Tento reklamačný poriadok upravuje postup pri uplatňovaní reklamácií zo strany používateľov
        služby Faktero prevádzkovanej spoločnosťou <strong>{LEGAL_COMPANY.name}</strong>, IČO{" "}
        {LEGAL_COMPANY.ico}.
      </p>

      <h2>1. Ako podať reklamáciu</h2>
      <p>Reklamáciu môžete podať:</p>
      <ul>
        <li>
          e-mailom na <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>,
        </li>
        <li>písomne na adresu sídla: {LEGAL_COMPANY.address},</li>
        <li>telefonicky na {LEGAL_COMPANY.phone} (následne potvrďte e-mailom).</li>
      </ul>
      <p>
        Reklamácia musí obsahovať identifikačné údaje používateľa, popis problému, dátum vzniku a
        požadovaný spôsob vybavenia.
      </p>

      <h2>2. Lehota na vybavenie</h2>
      <p>
        Reklamáciu vybavíme bez zbytočného odkladu, najneskôr do <strong>30 dní</strong> od jej
        doručenia. O vybavení vás budeme informovať e-mailom.
      </p>

      <h2>3. Reklamácia služby</h2>
      <p>
        Reklamovať môžete najmä nedostupnosť Služby presahujúcu deklarovaný rozsah, chyby aplikácie
        znemožňujúce štandardné používanie alebo nesprávne fungovanie zaplatených funkcií.
      </p>

      <h2>4. Reklamácia platby</h2>
      <p>
        Reklamácie nesprávne zaúčtovaných platieb predplatného Faktera rieši Prevádzkovateľ.
        Reklamácie platieb, ktoré uskutočnili zákazníci používateľa prostredníctvom GoPay, rieši
        priamo poskytovateľ platobnej brány, prípadne obchodník (používateľ), na účet ktorého boli
        platby prijaté. Faktero v tomto procese nie je zmluvnou stranou platby.
      </p>

      <h2>5. Digitálna služba</h2>
      <p>
        Faktero je digitálna služba poskytovaná online. Po sprístupnení digitálneho obsahu
        (aktivovaní platby) berie používateľ na vedomie, že nemá právo na odstúpenie od zmluvy v
        zmysle § 7 ods. 6 písm. l) zákona č. 102/2014 Z. z., pokiaľ s plnením výslovne súhlasil.
      </p>

      <h2>6. Vylúčenia z reklamácie</h2>
      <ul>
        <li>Chyby spôsobené nesprávnym používaním Služby používateľom.</li>
        <li>
          Výpadky tretích strán (Supabase, GoPay, Resend, bankové API) mimo kontroly
          Prevádzkovateľa.
        </li>
        <li>Údaje a obsah vložený samotným používateľom.</li>
        <li>Plánované odstávky oznámené vopred.</li>
      </ul>

      <h2>7. Alternatívne riešenie sporov</h2>
      <p>
        Spotrebiteľ má právo obrátiť sa na orgán alternatívneho riešenia sporov (napr. Slovenská
        obchodná inšpekcia) alebo využiť platformu RSO (ec.europa.eu/consumers/odr). Služba Faktero
        je primárne určená pre podnikateľov.
      </p>

      <h2>Kontakt</h2>
      <p>
        {LEGAL_COMPANY.name}
        <br />
        {LEGAL_COMPANY.address}
        <br />
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
      <p>
        Diese Reklamationsordnung regelt das Verfahren bei der Geltendmachung von Reklamationen
        durch Nutzer des Dienstes Faktero, der von der Gesellschaft{" "}
        <strong>{LEGAL_COMPANY.name}</strong>, Firmen-ID (IČO) {LEGAL_COMPANY.ico}, betrieben wird.
      </p>

      <h2>1. Wie man eine Reklamation einreicht</h2>
      <p>Eine Reklamation können Sie einreichen:</p>
      <ul>
        <li>
          per E-Mail an <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>,
        </li>
        <li>schriftlich an die Sitzadresse: {LEGAL_COMPANY.address},</li>
        <li>telefonisch unter {LEGAL_COMPANY.phone} (anschließend per E-Mail bestätigen).</li>
      </ul>
      <p>
        Die Reklamation muss die Identifikationsdaten des Nutzers, eine Beschreibung des Problems,
        das Datum seines Auftretens und die gewünschte Art der Erledigung enthalten.
      </p>

      <h2>2. Frist für die Bearbeitung</h2>
      <p>
        Wir bearbeiten die Reklamation unverzüglich, spätestens innerhalb von{" "}
        <strong>30 Tagen</strong> nach ihrem Zugang. Über die Erledigung informieren wir Sie per
        E-Mail.
      </p>

      <h2>3. Reklamation des Dienstes</h2>
      <p>
        Reklamieren können Sie insbesondere eine Nichtverfügbarkeit des Dienstes über den
        angegebenen Umfang hinaus, Fehler der Anwendung, die die übliche Nutzung unmöglich machen,
        oder eine fehlerhafte Funktion bezahlter Funktionen.
      </p>

      <h2>4. Reklamation einer Zahlung</h2>
      <p>
        Reklamationen falsch verbuchter Zahlungen für das Faktero-Abonnement bearbeitet der
        Betreiber. Reklamationen von Zahlungen, die Kunden des Nutzers über GoPay geleistet haben,
        bearbeitet direkt der Anbieter des Zahlungsgateways bzw. der Händler (Nutzer), auf dessen
        Konto die Zahlungen eingegangen sind. Faktero ist in diesem Prozess keine Vertragspartei der
        Zahlung.
      </p>

      <h2>5. Digitaler Dienst</h2>
      <p>
        Faktero ist ein online bereitgestellter digitaler Dienst. Nach der Bereitstellung der
        digitalen Inhalte (Aktivierung der Zahlung) nimmt der Nutzer zur Kenntnis, dass er kein
        Recht auf Rücktritt vom Vertrag gemäß § 7 Abs. 6 Buchst. l) des Gesetzes Nr. 102/2014 Slg.
        (zákon č. 102/2014 Z. z.) hat, sofern er der Erfüllung ausdrücklich zugestimmt hat.
      </p>

      <h2>6. Ausschlüsse von der Reklamation</h2>
      <ul>
        <li>
          Fehler, die durch unsachgemäße Nutzung des Dienstes durch den Nutzer verursacht wurden.
        </li>
        <li>
          Ausfälle Dritter (Supabase, GoPay, Resend, Bank-APIs) außerhalb der Kontrolle des
          Betreibers.
        </li>
        <li>Vom Nutzer selbst eingegebene Daten und Inhalte.</li>
        <li>Im Voraus angekündigte geplante Ausfallzeiten.</li>
      </ul>

      <h2>7. Alternative Streitbeilegung</h2>
      <p>
        Der Verbraucher hat das Recht, sich an eine Stelle zur alternativen Streitbeilegung zu
        wenden (z. B. die Slowakische Handelsinspektion, Slovenská obchodná inšpekcia) oder die
        OS-Plattform (RSO) zu nutzen (ec.europa.eu/consumers/odr). Der Dienst Faktero ist vorrangig
        für Unternehmer bestimmt.
      </p>

      <h2>Kontakt</h2>
      <p>
        {LEGAL_COMPANY.name}
        <br />
        {LEGAL_COMPANY.address}
        <br />
        E-Mail: <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>
        <br />
        Telefon: {LEGAL_COMPANY.phone}
      </p>
    </>
  );
}
