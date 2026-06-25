import { createFileRoute } from "@tanstack/react-router";
import { LegalShell, LEGAL_VERSION, LEGAL_UPDATED, LEGAL_COMPANY } from "@/components/faktero/LegalShell";

export const Route = createFileRoute("/pravne/obchodne-podmienky")({
  head: () => ({
    meta: [
      { title: "Obchodné podmienky — Faktero" },
      { name: "description", content: "Obchodné podmienky služby Faktero — fakturačného a účtovného nástroja pre podnikateľov." },
      { property: "og:title", content: "Obchodné podmienky — Faktero" },
      { property: "og:description", content: "Obchodné podmienky používania služby Faktero." },
      { property: "og:url", content: "https://faktero.sk/pravne/obchodne-podmienky" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pravne/obchodne-podmienky" }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalShell title="Obchodné podmienky" updated={LEGAL_UPDATED} version={LEGAL_VERSION}>
      <h2>1. Prevádzkovateľ služby</h2>
      <p>
        Prevádzkovateľom služby Faktero (ďalej len „<strong>Služba</strong>“) je spoločnosť <strong>{LEGAL_COMPANY.name}</strong>,
        so sídlom {LEGAL_COMPANY.address}, IČO: {LEGAL_COMPANY.ico}, DIČ: {LEGAL_COMPANY.dic}, IČ DPH: {LEGAL_COMPANY.icDph},
        zapísaná v Obchodnom registri Slovenskej republiky (ďalej len „<strong>Prevádzkovateľ</strong>“).
      </p>
      <p>Kontakt: {LEGAL_COMPANY.email}, {LEGAL_COMPANY.phone}, {LEGAL_COMPANY.web}.</p>

      <h2>2. Definícia služby Faktero</h2>
      <p>
        Faktero je online aplikácia (Software-as-a-Service) na vystavovanie faktúr, evidenciu odberateľov, sklad,
        eFaktúru, pripojenie bankových účtov a online platby cez tretie strany. Služba je dostupná na doméne
        faktero.sk a v subdoménach Prevádzkovateľa.
      </p>
      <p><strong>Služba Faktero je určená predovšetkým pre podnikateľov, živnostníkov a právnické osoby.</strong></p>

      <h2>3. Registrácia účtu</h2>
      <p>
        Používateľ je oprávnený vytvoriť si účet prostredníctvom registračného formulára alebo prihlásením cez
        poskytovateľa identity (Google). Pri registrácii je povinný uviesť pravdivé údaje a chrániť svoje
        prihlasovacie údaje pred zneužitím.
      </p>
      <p>Pri registrácii používateľ potvrdzuje súhlas s týmito Obchodnými podmienkami a berie na vedomie spracúvanie osobných údajov v zmysle dokumentu GDPR.</p>

      <h2>4. Predplatné a fakturácia</h2>
      <p>
        Služba je poskytovaná v rámci platených plánov podľa aktuálneho cenníka zverejneného na faktero.sk/cennik.
        Fakturácia prebieha mesačne alebo ročne, podľa zvoleného plánu. Cena je uvádzaná bez DPH a s DPH samostatne.
      </p>

      <h2>5. Skúšobná verzia</h2>
      <p>
        Prevádzkovateľ poskytuje nových používateľom 14-dňovú bezplatnú skúšobnú verziu. Počas trvania skúšky nie
        je vyžadované zadanie platobných údajov. Po uplynutí skúšky je potrebné aktivovať platený plán, inak bude
        prístup do aplikácie obmedzený.
      </p>

      <h2>6. Automatické obnovenie predplatného</h2>
      <p>
        <strong>Predplatné sa po skončení fakturačného obdobia automaticky obnovuje, pokiaľ ho používateľ nezruší.</strong>
        Pri aktivácii platby kartou alebo opakovanej platby cez GoPay používateľ udeľuje súhlas s opakovaným
        strhávaním poplatku zodpovedajúceho zvolenému plánu.
      </p>

      <h2>7. Zrušenie predplatného</h2>
      <p>
        Používateľ môže predplatné kedykoľvek zrušiť v sekcii Nastavenia → Predplatné. Zrušenie sa prejaví od
        nasledujúceho fakturačného obdobia; už uhradené poplatky sa nevracajú s výnimkou prípadov vyžadovaných
        platnými právnymi predpismi.
      </p>

      <h2>8. Dostupnosť služby</h2>
      <p>
        Prevádzkovateľ vyvíja primerané úsilie na zabezpečenie nepretržitej dostupnosti Služby. Negarantuje však
        100 % dostupnosť a vyhradzuje si právo na plánované odstávky z dôvodu údržby, aktualizácií alebo bezpečnostných
        zásahov. O plánovaných odstávkach informuje vopred, ak je to možné.
      </p>

      <h2>9. Obmedzenie zodpovednosti</h2>
      <p>
        Prevádzkovateľ nezodpovedá za škody spôsobené nesprávnym používaním Služby, výpadkami tretích strán
        (Supabase, GoPay, Resend, bankové API), ani za stratu údajov spôsobenú konaním používateľa. Celková
        zodpovednosť Prevádzkovateľa je obmedzená do výšky poplatkov zaplatených používateľom za posledných 12 mesiacov.
      </p>

      <h2>10. Ochrana údajov</h2>
      <p>
        Spracúvanie osobných údajov sa riadi samostatným dokumentom <em>GDPR — Ochrana osobných údajov</em>.
        Údaje vystavených faktúr a obchodných partnerov používateľa sú považované za údaje vlastnené firmou používateľa.
      </p>

      <h2>11. Duševné vlastníctvo</h2>
      <p>
        Všetky práva k softvéru, dizajnu, ochrannej známke a obsahu aplikácie Faktero patria Prevádzkovateľovi.
        Používateľ získava nevýhradnú, neprenosnú licenciu na používanie Služby počas trvania predplatného.
      </p>

      <h2>12. Ukončenie účtu</h2>
      <p>
        Používateľ môže svoj účet kedykoľvek zrušiť. Prevádzkovateľ je oprávnený obmedziť alebo zrušiť účet pri
        porušení týchto podmienok, neuhradení poplatkov alebo zneužití Služby. Po zrušení účtu sú údaje uchované
        po dobu vyžadovanú zákonom a následne vymazané.
      </p>

      <h2>13. Záverečné ustanovenia</h2>
      <p>
        Tieto podmienky sa riadia právnym poriadkom Slovenskej republiky. Spory sa riešia pred príslušnými súdmi SR.
        Prevádzkovateľ je oprávnený podmienky meniť; o zmenách informuje používateľa e-mailom alebo v aplikácii
        minimálne 14 dní vopred.
      </p>

      <h2>Podpora</h2>
      <p>E-mail: <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a><br/>Telefón: {LEGAL_COMPANY.phone}</p>
    </LegalShell>
  );
}