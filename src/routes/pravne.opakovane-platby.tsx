import { createFileRoute } from "@tanstack/react-router";
import { LegalShell, LEGAL_COMPANY } from "@/components/faktero/LegalShell";

export const Route = createFileRoute("/pravne/opakovane-platby")({
  head: () => ({
    meta: [
      { title: "Opakované platby — Faktero" },
      { name: "description", content: "Informácie o opakovaných platbách predplatného Faktero cez GoPay." },
      { property: "og:title", content: "Opakované platby — Faktero" },
      { property: "og:description", content: "Informácie o opakovaných platbách predplatného Faktero cez GoPay." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalShell
      title="Opakované platby"
      updated="09.07.2026"
      version="1.0"
    >
      <p>
        Tento dokument vysvetľuje, ako fungujú opakované platby predplatného
        služby Faktero prostredníctvom platobnej brány GoPay.
      </p>

      <h2>1. Čo sú opakované platby</h2>
      <p>
        Opakovaná platba je automatické mesačné strhnutie ceny predplatného z
        platobnej karty alebo účtu používateľa. Po aktivácii plateného plánu
        predplatné Faktero automaticky obnovujeme každý mesiac, kým ho
        používateľ nezruší.
      </p>

      <h2>2. Kedy sa platba strhne</h2>
      <p>
        Platba sa uskutoční v deň obnovy predplatného, ktorý zodpovedá dátumu
        prvej úhrady. Ak tento deň pripadne na deň, ktorý v danom mesiaci
        neexistuje (napr. 31.), platba sa strhne v posledný deň toho mesiaca.
      </p>
      <p>
        O každej nadchádzajúcej platbe dostane používateľ upozornenie e-mailom
        najmenej 7 dní pred jej strhnutím.
      </p>

      <h2>3. Ako zrušiť opakované platby</h2>
      <p>
        Predplatné a s ním aj opakované platby je možné kedykoľvek zrušiť
        nasledujúcimi spôsobmi:
      </p>
      <ul>
        <li>
          <strong>Vo Faktero:</strong> Nastavenia → Predplatné → Zrušiť
          predplatné. Zrušenie je účinné okamžite a ďalšia platba sa už
          neuskutoční.
        </li>
        <li>
          <strong>E-mailom:</strong> Napíšte nám na{" "}
          <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>{" "}
          z e-mailovej adresy, ktorá je spojená s vaším účtom.
        </li>
      </ul>
      <p>
        Po zrušení predplatného si môžete používať aktívny plán až do konca
        už zaplateného obdobia. Zrušenie neznamená okamžitú stratu prístupu.
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
        Uvedené ceny sú bez dane z pridanej hodnoty. Konečná suma faktúry
        obsahuje DPH vo výške 23 % podľa aktuálnej slovenskej legislatívy.
      </p>

      <h2>5. Podporované platobné metódy</h2>
      <p>
        Opakované platby spracúva platobná brána GoPay. Podporované sú
        platobné karty:
      </p>
      <ul>
        <li>Visa</li>
        <li>Mastercard</li>
      </ul>
      <p>
        GoPay zabezpečuje platby prostredníctvom 3-D Secure a údaje karty
        spracúva výhradne GoPay. Faktero si číslo karty ani CVV kód
        neukladá.
      </p>

      <h2>6. Kontakt</h2>
      <p>
        Ak máte otázky k opakovaným platbám, kontaktujte nás:
      </p>
      <ul>
        <li>
          E-mail:{" "}
          <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>
        </li>
        <li>
          Telefón:{" "}
          <a href={`tel:${LEGAL_COMPANY.phone.replace(/\s/g, "")}`}>
            {LEGAL_COMPANY.phone}
          </a>
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
    </LegalShell>
  );
}
