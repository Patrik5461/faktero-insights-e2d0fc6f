import { createFileRoute } from "@tanstack/react-router";
import {
  LegalShell,
  LEGAL_VERSION,
  LEGAL_UPDATED,
  LEGAL_COMPANY,
} from "@/components/faktero/LegalShell";

export const Route = createFileRoute("/pravne/reklamacny-poriadok")({
  head: () => ({
    meta: [
      { title: "Reklamačný poriadok — Faktero" },
      {
        name: "description",
        content: "Postup pri reklamácii služby Faktero, lehoty a kontaktné údaje.",
      },
      { property: "og:url", content: "https://faktero.sk/pravne/reklamacny-poriadok" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pravne/reklamacny-poriadok" }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalShell title="Reklamačný poriadok" updated={LEGAL_UPDATED} version={LEGAL_VERSION}>
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
    </LegalShell>
  );
}
