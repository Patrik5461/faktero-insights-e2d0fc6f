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

export const Route = createFileRoute("/pravne/gopay-podmienky")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "GoPay podmienky — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Ako funguje GoPay vo Faktere — peniaze nikdy nejdú cez Faktero, každá firma má vlastný GoPay účet.",
        ),
      },
      { property: "og:url", content: "https://faktero.sk/pravne/gopay-podmienky" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pravne/gopay-podmienky" }],
  }),
  component: Page,
});

function Page() {
  const { jazyk, t } = useT();
  return (
    <LegalShell
      title={t("Podmienky používania GoPay vo Faktere")}
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
      <h2>1. Faktero nie je platobná inštitúcia</h2>
      <p>
        Spoločnosť <strong>{LEGAL_COMPANY.name}</strong> ako prevádzkovateľ služby Faktero{" "}
        <strong>nie je platobnou inštitúciou</strong> ani inštitúciou elektronických peňazí v zmysle
        zákona č. 492/2009 Z. z. o platobných službách.
      </p>
      <p>
        <strong>
          Tobify s. r. o. neprijíma ani nespracováva finančné prostriedky zákazníkov svojich
          používateľov.
        </strong>
      </p>

      <h2>2. Peniaze nikdy nejdú cez Faktero</h2>
      <p>
        Platba zákazníka putuje priamo od zákazníka cez platobnú bránu GoPay na bankový alebo GoPay
        účet obchodníka (používateľa Faktera).
      </p>

      <h2>3. Každá firma používa vlastný GoPay účet</h2>
      <p>
        Každý používateľ Faktera, ktorý chce prijímať platby online, je povinný pripojiť{" "}
        <strong>svoj vlastný GoPay účet</strong>. Faktero neumožňuje zdieľanie GoPay účtu medzi
        firmami a nepoužíva svoj vlastný GoPay účet na prijímanie platieb v mene používateľov.
      </p>

      <h2>4. Zákazník platí priamo obchodníkovi</h2>
      <p>
        <strong>Zákazník platí priamo na účet obchodníka prostredníctvom GoPay.</strong> Zmluvný
        vzťah pri platbe je medzi zákazníkom a obchodníkom (používateľom Faktera), nie medzi
        zákazníkom a spoločnosťou Tobify s. r. o.
      </p>

      <h2>5. Úloha GoPay</h2>
      <p>
        GoPay s.r.o. (so sídlom v ČR) je licencovaná platobná inštitúcia, ktorá spracúva platbu,
        autorizuje kartu a zúčtuje prostriedky na účet obchodníka. Vzťah obchodníka a GoPay sa riadi
        Obchodnými podmienkami GoPay.
      </p>

      <h2>6. Úloha Faktera</h2>
      <p>Faktero v platobnom procese plní výlučne technickú úlohu:</p>
      <ul>
        <li>
          vytvára <strong>platobný odkaz</strong> pre faktúru,
        </li>
        <li>posiela zákazníka do GoPay s identifikátorom platby,</li>
        <li>
          prijíma webhook o stave platby a <strong>páruje úhradu</strong> s faktúrou,
        </li>
        <li>aktualizuje stav faktúry v aplikácii (uhradená / čiastočne uhradená / zrušená).</li>
      </ul>
      <p>
        Faktero nevidí údaje platobnej karty zákazníka, nedrží peniaze a neúčtuje žiadnu províziu z
        platby zákazníka.
      </p>

      <h2>7. Reklamácie platieb</h2>
      <p>
        Reklamácie konkrétnej platby (chargeback, nesprávna suma, refundácia) sa uplatňujú u GoPay,
        prípadne u obchodníka. Faktero môže poskytnúť súčinnosť pri dohľadávaní záznamov o platobnom
        pokuse.
      </p>

      <h2>8. Automatické obnovovanie predplatného Faktera</h2>
      <p>Použitie GoPay sa vzťahuje aj na úhradu predplatného Služby Faktero:</p>
      <ul>
        <li>
          <strong>Opakované platby</strong> môžu byť použité na úhradu predplatného Faktera.
        </li>
        <li>
          Aktiváciou predplatného používateľ <strong>udeľuje súhlas s opakovaným strhávaním</strong>{" "}
          sumy zodpovedajúcej zvolenému plánu (mesačne alebo ročne).
        </li>
        <li>
          Predplatné je možné <strong>kedykoľvek zrušiť</strong> v sekcii Nastavenia → Predplatné.
        </li>
        <li>
          <strong>Zrušenie sa prejaví od ďalšieho fakturačného obdobia</strong>; už uhradené sumy sa
          nevracajú s výnimkou prípadov vyžadovaných právom.
        </li>
      </ul>

      <h2>9. Kontakt</h2>
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
      <h2>1. Faktero ist kein Zahlungsinstitut</h2>
      <p>
        Die Gesellschaft <strong>{LEGAL_COMPANY.name}</strong> als Betreiber des Dienstes Faktero{" "}
        <strong>ist kein Zahlungsinstitut</strong> und auch kein E-Geld-Institut im Sinne des
        Gesetzes Nr. 492/2009 Slg. über Zahlungsdienste (zákon č. 492/2009 Z. z. o platobných
        službách).
      </p>
      <p>
        <strong>
          Tobify s. r. o. nimmt keine Geldmittel der Kunden ihrer Nutzer entgegen und verarbeitet
          diese auch nicht.
        </strong>
      </p>

      <h2>2. Das Geld fließt nie über Faktero</h2>
      <p>
        Die Zahlung des Kunden geht direkt vom Kunden über das Zahlungsgateway GoPay auf das Bank-
        oder GoPay-Konto des Händlers (Nutzers von Faktero).
      </p>

      <h2>3. Jedes Unternehmen nutzt ein eigenes GoPay-Konto</h2>
      <p>
        Jeder Nutzer von Faktero, der Online-Zahlungen empfangen möchte, ist verpflichtet,{" "}
        <strong>sein eigenes GoPay-Konto</strong> anzubinden. Faktero ermöglicht keine gemeinsame
        Nutzung eines GoPay-Kontos durch mehrere Unternehmen und verwendet kein eigenes GoPay-Konto,
        um Zahlungen im Namen der Nutzer zu empfangen.
      </p>

      <h2>4. Der Kunde zahlt direkt an den Händler</h2>
      <p>
        <strong>Der Kunde zahlt über GoPay direkt auf das Konto des Händlers.</strong> Das
        Vertragsverhältnis bei der Zahlung besteht zwischen dem Kunden und dem Händler (Nutzer von
        Faktero), nicht zwischen dem Kunden und der Gesellschaft Tobify s. r. o.
      </p>

      <h2>5. Rolle von GoPay</h2>
      <p>
        GoPay s.r.o. (mit Sitz in der Tschechischen Republik) ist ein lizenziertes Zahlungsinstitut,
        das die Zahlung verarbeitet, die Karte autorisiert und die Mittel auf das Konto des Händlers
        abrechnet. Das Verhältnis zwischen Händler und GoPay richtet sich nach den
        Geschäftsbedingungen von GoPay.
      </p>

      <h2>6. Rolle von Faktero</h2>
      <p>Faktero erfüllt im Zahlungsprozess ausschließlich eine technische Rolle:</p>
      <ul>
        <li>
          erstellt einen <strong>Zahlungslink</strong> für die Rechnung,
        </li>
        <li>leitet den Kunden mit der Zahlungskennung zu GoPay weiter,</li>
        <li>
          empfängt den Webhook zum Zahlungsstatus und <strong>gleicht die Zahlung</strong> mit der
          Rechnung ab,
        </li>
        <li>
          aktualisiert den Status der Rechnung in der Anwendung (bezahlt / teilweise bezahlt /
          storniert).
        </li>
      </ul>
      <p>
        Faktero sieht die Daten der Zahlungskarte des Kunden nicht, hält kein Geld und berechnet
        keine Provision aus der Zahlung des Kunden.
      </p>

      <h2>7. Reklamationen von Zahlungen</h2>
      <p>
        Reklamationen einer konkreten Zahlung (Chargeback, falscher Betrag, Rückerstattung) werden
        bei GoPay bzw. beim Händler geltend gemacht. Faktero kann bei der Suche nach Aufzeichnungen
        über den Zahlungsversuch mitwirken.
      </p>

      <h2>8. Automatische Verlängerung des Faktero-Abonnements</h2>
      <p>
        Die Nutzung von GoPay gilt auch für die Bezahlung des Abonnements für den Dienst Faktero:
      </p>
      <ul>
        <li>
          <strong>Wiederkehrende Zahlungen</strong> können zur Bezahlung des Faktero-Abonnements
          verwendet werden.
        </li>
        <li>
          Mit der Aktivierung des Abonnements{" "}
          <strong>stimmt der Nutzer der wiederholten Abbuchung</strong> des dem gewählten Tarif
          entsprechenden Betrags zu (monatlich oder jährlich).
        </li>
        <li>
          Das Abonnement kann <strong>jederzeit gekündigt werden</strong>, und zwar im Bereich
          Einstellungen → Abonnement.
        </li>
        <li>
          <strong>Die Kündigung wird ab dem nächsten Abrechnungszeitraum wirksam</strong>; bereits
          bezahlte Beträge werden nicht erstattet, mit Ausnahme der gesetzlich vorgeschriebenen
          Fälle.
        </li>
      </ul>

      <h2>9. Kontakt</h2>
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
