import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, ShieldCheck, Lock } from "lucide-react";
import { LegalShell, LEGAL_COMPANY, DeUpozornenie } from "@/components/faktero/LegalShell";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/pravne/opakovane-platby")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Opakované platby — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Informácie o opakovaných platbách predplatného Faktero cez GoPay.",
        ),
      },
      { property: "og:title", content: preloz(match.context.jazyk, "Opakované platby — Faktero") },
      {
        property: "og:description",
        content: preloz(
          match.context.jazyk,
          "Informácie o opakovaných platbách predplatného Faktero cez GoPay.",
        ),
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Page,
});

function Page() {
  const { jazyk, t } = useT();
  return (
    <LegalShell title={t("Opakované platby")} updated="09.07.2026" version="1.0">
      {jazyk === "de" ? <De /> : <Sk />}
    </LegalShell>
  );
}

function Sk() {
  return (
    <>
      <p>
        Tento dokument vysvetľuje, ako fungujú opakované platby predplatného služby Faktero
        prostredníctvom platobnej brány GoPay.
      </p>

      <h2>1. Čo sú opakované platby</h2>
      <p>
        Opakovaná platba je automatické mesačné strhnutie ceny predplatného z platobnej karty alebo
        účtu používateľa. Po aktivácii plateného plánu predplatné Faktero automaticky obnovujeme
        každý mesiac, kým ho používateľ nezruší.
      </p>

      <h2>2. Kedy sa platba strhne</h2>
      <p>
        Platba sa uskutoční v deň obnovy predplatného, ktorý zodpovedá dátumu prvej úhrady. Ak tento
        deň pripadne na deň, ktorý v danom mesiaci neexistuje (napr. 31.), platba sa strhne v
        posledný deň toho mesiaca.
      </p>
      <p>
        O každej nadchádzajúcej platbe dostane používateľ upozornenie e-mailom najmenej 7 dní pred
        jej strhnutím.
      </p>

      <h2>3. Ako zrušiť opakované platby</h2>
      <p>
        Predplatné a s ním aj opakované platby je možné kedykoľvek zrušiť nasledujúcimi spôsobmi:
      </p>
      <ul>
        <li>
          <strong>Vo Faktero:</strong> Nastavenia → Predplatné → Zrušiť predplatné. Zrušenie je
          účinné okamžite a ďalšia platba sa už neuskutoční.
        </li>
        <li>
          <strong>E-mailom:</strong> Napíšte nám na{" "}
          <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a> z e-mailovej adresy,
          ktorá je spojená s vaším účtom.
        </li>
      </ul>
      <p>
        Po zrušení predplatného si môžete používať aktívny plán až do konca už zaplateného obdobia.
        Zrušenie neznamená okamžitú stratu prístupu.
      </p>

      <h2>4. Výška platby</h2>
      <ul>
        <li>
          <strong>Starter:</strong> 9 € / mesiac (bez DPH)
        </li>
        <li>
          <strong>Premium:</strong> 19 € / mesiac (bez DPH)
        </li>
      </ul>
      <p>
        Uvedené ceny sú bez dane z pridanej hodnoty. Konečná suma faktúry obsahuje DPH vo výške 23 %
        podľa aktuálnej slovenskej legislatívy.
      </p>

      <h2>5. Podporované platobné metódy</h2>
      <p>Opakované platby spracúva platobná brána GoPay. Podporované sú platobné karty:</p>
      <ul>
        <li>Visa</li>
        <li>Mastercard</li>
      </ul>
      <div className="my-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
          <CreditCard className="h-3.5 w-3.5" /> GoPay
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-[#1a1f71]">
          VISA
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold">
          <span className="text-[#eb001b]">Master</span>
          <span className="text-[#f79e1b]">card</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
          <Lock className="h-3.5 w-3.5" /> 3-D Secure
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Údaje karty spracúva GoPay
        </span>
      </div>
      <p>
        GoPay zabezpečuje platby prostredníctvom 3-D Secure a údaje karty spracúva výhradne GoPay.
        Faktero si číslo karty ani CVV kód neukladá.
      </p>

      <h2>6. Kontakt</h2>
      <p>Ak máte otázky k opakovaným platbám, kontaktujte nás:</p>
      <ul>
        <li>
          E-mail: <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>
        </li>
        <li>
          Telefón:{" "}
          <a href={`tel:${LEGAL_COMPANY.phone.replace(/\s/g, "")}`}>{LEGAL_COMPANY.phone}</a>
        </li>
      </ul>

      <h2>7. Prevádzkovateľ</h2>
      <p>
        {LEGAL_COMPANY.name}
        <br />
        {LEGAL_COMPANY.address}
        <br />
        IČO: {LEGAL_COMPANY.ico}
        <br />
        DIČ: {LEGAL_COMPANY.dic}
        <br />
        IČ DPH: {LEGAL_COMPANY.icDph}
      </p>
    </>
  );
}

function De() {
  return (
    <>
      <DeUpozornenie />
      <p>
        Dieses Dokument erläutert, wie wiederkehrende Zahlungen für das Abonnement des Dienstes
        Faktero über das Zahlungsgateway GoPay funktionieren.
      </p>

      <h2>1. Was sind wiederkehrende Zahlungen</h2>
      <p>
        Eine wiederkehrende Zahlung ist die automatische monatliche Abbuchung des Abonnementpreises
        von der Zahlungskarte oder dem Konto des Nutzers. Nach Aktivierung eines kostenpflichtigen
        Tarifs verlängern wir das Faktero-Abonnement automatisch jeden Monat, bis der Nutzer es
        kündigt.
      </p>

      <h2>2. Wann die Zahlung abgebucht wird</h2>
      <p>
        Die Zahlung erfolgt am Verlängerungstag des Abonnements, der dem Datum der ersten Zahlung
        entspricht. Fällt dieser Tag auf einen Tag, den es im jeweiligen Monat nicht gibt (z. B. den
        31.), wird die Zahlung am letzten Tag dieses Monats abgebucht.
      </p>
      <p>
        Über jede bevorstehende Zahlung erhält der Nutzer mindestens 7 Tage vor der Abbuchung eine
        Benachrichtigung per E-Mail.
      </p>

      <h2>3. Wie man wiederkehrende Zahlungen kündigt</h2>
      <p>
        Das Abonnement und damit auch die wiederkehrenden Zahlungen können jederzeit auf folgende
        Weise gekündigt werden:
      </p>
      <ul>
        <li>
          <strong>In Faktero:</strong> Einstellungen → Abonnement → Abonnement kündigen. Die
          Kündigung ist sofort wirksam und die nächste Zahlung erfolgt nicht mehr.
        </li>
        <li>
          <strong>Per E-Mail:</strong> Schreiben Sie uns an{" "}
          <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a> von der
          E-Mail-Adresse, die mit Ihrem Konto verknüpft ist.
        </li>
      </ul>
      <p>
        Nach der Kündigung des Abonnements können Sie den aktiven Tarif bis zum Ende des bereits
        bezahlten Zeitraums nutzen. Die Kündigung bedeutet keinen sofortigen Verlust des Zugangs.
      </p>

      <h2>4. Höhe der Zahlung</h2>
      <ul>
        <li>
          <strong>Starter:</strong> 9 € / Monat (ohne MwSt.)
        </li>
        <li>
          <strong>Premium:</strong> 19 € / Monat (ohne MwSt.)
        </li>
      </ul>
      <p>
        Die angegebenen Preise verstehen sich ohne Mehrwertsteuer. Der Endbetrag der Rechnung
        enthält die MwSt. in Höhe von 23 % gemäß der aktuellen slowakischen Gesetzgebung.
      </p>

      <h2>5. Unterstützte Zahlungsmethoden</h2>
      <p>
        Wiederkehrende Zahlungen werden vom Zahlungsgateway GoPay verarbeitet. Unterstützt werden
        folgende Zahlungskarten:
      </p>
      <ul>
        <li>Visa</li>
        <li>Mastercard</li>
      </ul>
      <div className="my-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
          <CreditCard className="h-3.5 w-3.5" /> GoPay
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-[#1a1f71]">
          VISA
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold">
          <span className="text-[#eb001b]">Master</span>
          <span className="text-[#f79e1b]">card</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
          <Lock className="h-3.5 w-3.5" /> 3-D Secure
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Kartendaten verarbeitet GoPay
        </span>
      </div>
      <p>
        GoPay sichert Zahlungen mittels 3-D Secure ab, und die Kartendaten werden ausschließlich von
        GoPay verarbeitet. Faktero speichert weder die Kartennummer noch den CVV-Code.
      </p>

      <h2>6. Kontakt</h2>
      <p>Wenn Sie Fragen zu wiederkehrenden Zahlungen haben, kontaktieren Sie uns:</p>
      <ul>
        <li>
          E-Mail: <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>
        </li>
        <li>
          Telefon:{" "}
          <a href={`tel:${LEGAL_COMPANY.phone.replace(/\s/g, "")}`}>{LEGAL_COMPANY.phone}</a>
        </li>
      </ul>

      <h2>7. Betreiber</h2>
      <p>
        {LEGAL_COMPANY.name}
        <br />
        {LEGAL_COMPANY.address}
        <br />
        Firmen-ID (IČO): {LEGAL_COMPANY.ico}
        <br />
        Steuernummer (DIČ): {LEGAL_COMPANY.dic}
        <br />
        USt-IdNr.: {LEGAL_COMPANY.icDph}
      </p>
    </>
  );
}
