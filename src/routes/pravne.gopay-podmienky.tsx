import { createFileRoute } from "@tanstack/react-router";
import {
  LegalShell,
  LEGAL_VERSION,
  LEGAL_UPDATED,
  LEGAL_COMPANY,
} from "@/components/faktero/LegalShell";

export const Route = createFileRoute("/pravne/gopay-podmienky")({
  head: () => ({
    meta: [
      { title: "GoPay podmienky — Faktero" },
      {
        name: "description",
        content:
          "Ako funguje GoPay vo Faktere — peniaze nikdy nejdú cez Faktero, každá firma má vlastný GoPay účet.",
      },
      { property: "og:url", content: "https://faktero.sk/pravne/gopay-podmienky" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pravne/gopay-podmienky" }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalShell
      title="Podmienky používania GoPay vo Faktere"
      updated={LEGAL_UPDATED}
      version={LEGAL_VERSION}
    >
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
        <strong>Peniaze nikdy nejdú cez Faktero.</strong> Platba zákazníka putuje priamo od
        zákazníka cez platobnú bránu GoPay na bankový alebo GoPay účet obchodníka (používateľa
        Faktera).
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
    </LegalShell>
  );
}
