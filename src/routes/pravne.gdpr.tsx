import { createFileRoute } from "@tanstack/react-router";
import { LegalShell, LEGAL_VERSION, LEGAL_UPDATED, LEGAL_COMPANY } from "@/components/faktero/LegalShell";

export const Route = createFileRoute("/pravne/gdpr")({
  head: () => ({
    meta: [
      { title: "Ochrana osobných údajov (GDPR) — Faktero" },
      { name: "description", content: "Informácie o spracúvaní osobných údajov v službe Faktero v zmysle GDPR." },
      { property: "og:title", content: "GDPR — Faktero" },
      { property: "og:url", content: "https://faktero.sk/pravne/gdpr" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pravne/gdpr" }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalShell title="Ochrana osobných údajov (GDPR)" updated={LEGAL_UPDATED} version={LEGAL_VERSION}>
      <h2>1. Prevádzkovateľ</h2>
      <p>
        <strong>{LEGAL_COMPANY.name}</strong>, sídlo {LEGAL_COMPANY.address}, IČO: {LEGAL_COMPANY.ico},
        DIČ: {LEGAL_COMPANY.dic}, IČ DPH: {LEGAL_COMPANY.icDph}.
      </p>

      <h2>2. Kontaktné údaje</h2>
      <p>Pre otázky týkajúce sa spracúvania osobných údajov nás kontaktujte na <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a> alebo {LEGAL_COMPANY.phone}.</p>

      <h2>3. Aké údaje spracúvame</h2>
      <ul>
        <li>Identifikačné údaje: meno, priezvisko, e-mail, telefón.</li>
        <li>Firemné údaje: názov firmy, IČO, DIČ, IČ DPH, adresa sídla.</li>
        <li>Účtovné údaje: vystavené faktúry, odberatelia, sklad, platby.</li>
        <li>Technické údaje: IP adresa, prehliadač, cookies, logy prístupov.</li>
        <li>Platobné údaje: informácie o platbách za predplatné (samotné údaje o platobnej karte spracúva poskytovateľ platobnej brány).</li>
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
        Osobné údaje uchovávame po dobu trvania zmluvného vzťahu a následne po dobu vyžadovanú právnymi predpismi
        (typicky 10 rokov v zmysle zákona o účtovníctve). Po uplynutí tejto doby sú údaje vymazané alebo anonymizované.
      </p>

      <h2>7. Prenos údajov tretím stranám</h2>
      <p>Údaje zdieľame výhradne so spracovateľmi nevyhnutnými na prevádzku Služby:</p>
      <ul>
        <li><strong>Supabase</strong> (databáza a autentifikácia) — Supabase Inc., USA, EU servery.</li>
        <li><strong>Resend</strong> (rozosielanie e-mailov a faktúr) — Resend Inc., USA.</li>
        <li><strong>GoPay</strong> (platobná brána pre predplatné a online platby) — GoPay s.r.o., ČR.</li>
        <li><strong>Google Analytics</strong> (ak bude aktivovaný) — Google Ireland Ltd., Írsko. Údaje sú anonymizované.</li>
      </ul>
      <p>So všetkými spracovateľmi máme uzavretú zmluvu o spracúvaní osobných údajov v zmysle čl. 28 GDPR.</p>

      <h2>8. Údaje vlastnené používateľom</h2>
      <p>
        <strong>Údaje vystavených faktúr, odberateľov a sklad vložené používateľom patria firme používateľa.</strong>
        Prevádzkovateľ tieto údaje spracúva výlučne ako spracovateľ v mene používateľa za účelom prevádzky Služby.
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
      <p>O výmaz účtu a osobných údajov môžete požiadať e-mailom na <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a>. Údaje, ktoré sme povinní uchovávať podľa zákona (napr. vystavené faktúry), budú vymazané po uplynutí zákonnej lehoty.</p>

      <h2>11. Prenositeľnosť údajov</h2>
      <p>Na požiadanie poskytneme export vašich údajov v štruktúrovanom, bežne používanom a strojovo čitateľnom formáte (CSV, JSON, XML).</p>

      <h2>12. Kontakt pre GDPR</h2>
      <p>{LEGAL_COMPANY.name}<br/>{LEGAL_COMPANY.address}<br/>E-mail: <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a></p>
    </LegalShell>
  );
}