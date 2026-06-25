import { createFileRoute } from "@tanstack/react-router";
import { LegalShell, LEGAL_VERSION, LEGAL_UPDATED, LEGAL_COMPANY } from "@/components/faktero/LegalShell";

export const Route = createFileRoute("/pravne/tesla-podmienky")({
  head: () => ({
    meta: [
      { title: "Podmienky používania Tesla Fleet API — Faktero" },
      { name: "description", content: "Podmienky pripojenia Tesla vozidiel cez Tesla Fleet API v službe Faktero." },
      { property: "og:url", content: "https://faktero.sk/pravne/tesla-podmienky" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pravne/tesla-podmienky" }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalShell title="Podmienky používania Tesla Fleet API" updated={LEGAL_UPDATED} version={LEGAL_VERSION}>
      <p>
        Tieto podmienky dopĺňajú <a href="/pravne/obchodne-podmienky">Obchodné podmienky</a> a{" "}
        <a href="/pravne/gdpr">GDPR</a> spoločnosti {LEGAL_COMPANY.name} (ďalej len „prevádzkovateľ“) a
        upravujujú používanie integrácie s Tesla Fleet API (ďalej len „Tesla API“) v službe Faktero.
      </p>

      <h2>1. Čo je Tesla Fleet API</h2>
      <p>
        Tesla Fleet API je oficiálne rozhranie spoločnosti Tesla, Inc., ktoré umožňuje oprávneným tretím
        stranám pristupovať k údajom o vozidlách Tesla na základe výslovného súhlasu vlastníka vozidla.
        Faktero túto integráciu využíva výhradne na čítanie vybraných údajov — najmä stavu tachometra,
        polohy vozidla a identifikácie vozidla (VIN, názov vozidla).
      </p>

      <h2>2. Účel a rozsah spracúvania</h2>
      <p>
        Údaje získané cez Tesla API spracúvame výlučne na účely vedenia knihy jázd a správy vozidlového
        majetku v rámci služby Faktero. Konkrétne ide o:
      </p>
      <ul>
        <li>identifikáciu vozidla (VIN, zobrazovaný názov vozidla);</li>
        <li>stav tachometra (odometer) pre prepočet najazdených kilometrov;</li>
        <li>polohové údaje vozidla (zemepisná šírka a dĺžka) na účely prípadnej tvorby jázd;</li>
        <li>základné stavy vozidla (napr. shift_state, vehicle_state) potrebné na interpretáciu dát.</li>
      </ul>
      <p>
        Faktero <strong>nezapisuje</strong> do vozidla Tesla žiadne príkazy, neovplyvňuje jeho nastavenia,
        nezamyká ani neotvára vozidlo, neaktivuje klimatizáciu ani iné funkcie vozidla.
      </p>

      <h2>3. OAuth súhlas a požadované oprávnenia</h2>
      <p>
        Pripojenie Tesla účtu prebieha cez štandardný OAuth 2.0 autorizačný kód poskytovaný spoločnosťou
        Tesla. Používateľ je pred udelením súhlasu presmerovaný na Tesla prihlasovaciu stránku, kde vidí
        presný rozsah oprávnení. Faktero žiada iba minimálne potrebné rozsahy:
      </p>
      <ul>
        <li>
          <code>openid</code> — overenie identity používateľa a získanie e-mailovej adresy;
        </li>
        <li>
          <code>offline_access</code> — obnovovanie prístupového tokenu bez opätovného prihlasovania;
        </li>
        <li>
          <code>vehicle_device_data</code> — čítanie údajov o vozidle vrátane tachometra;
        </li>
        <li>
          <code>vehicle_location</code> — čítanie polohy vozidla (ak je používateľom udelené).
        </li>
      </ul>
      <p>
        Rozsah <code>vehicle_cmds</code> (príkazy vozidlu) <strong>nie je požadovaný ani používaný</strong>.
      </p>

      <h2>4. Právny základ a súhlas</h2>
      <p>
        Právnym základom spracúvania osobných údajov získaných cez Tesla API je súhlas používateľa
        (článok 6 ods. 1 písm. a) Nariadenia GDPR). Súhlas udeľuje používateľ pri autorizácii na Tesla
        prihlasovacej stránke. Faktero tento súhlas nespracúva samostatne, využíva autorizačný token
        vydaný spoločnosťou Tesla.
      </p>
      <p>
        Používateľ môže súhlas kedykoľvek odvolať priamo vo svojom Tesla účte (zrušenie prístupu tretej
        strane) alebo v nastaveniach Faktera na stránke Tesla integrácie. Odvolaním súhlasu dôjde k
        okamžitému zneplatneniu tokenu a ukončeniu synchronizácie; údaje importované pred odvolaním
        súhlasu zostávajú zachované v súlade s retenčnými pravidlami Faktera.
      </p>

      <h2>5. Uchovávanie a bezpečnosť údajov</h2>
      <p>
        Prístupové a obnovovacie tokeny Tesla API sú uložené na serveri Faktera v šifrovanej podobe
        (AES-256-GCM). Tokeny nie sú ukladané do prehliadača ani zdieľané s tretími stranami. Faktero
        tokeny automaticky obnovuje pred vypršaním platnosti, aby nedochádzalo k častému opätovnému
        prihlasovaniu používateľa.
      </p>
      <p>
        Snímky vozidla (odometer, poloha) a synchronizačné logy sú uchovávané v databáze Faktera a viažu sa
        na konkrétnu spoločnosť (company_id). K údajom majú prístup iba oprávnení používatelia danej
        spoločnosti a technickí administrátori prevádzkovateľa v nevyhnutnom rozsahu.
      </p>

      <h2>6. Doba uchovávania</h2>
      <p>
        Tesla autentifikačné tokeny sú uchovávané do okamihu odpojenia Tesla účtu alebo odvolania súhlasu.
        Snímky vozidla a synchronizačné logy sú uchovávané po dobu používania služby Faktero v danej
        spoločnosti, najdlhšie však po dobu uvedenú v dokumentácii GDPR a všeobecných obchodných
        podmienkach. Po ukončení zmluvného vzťahu môžu byť údaje anonymizované alebo vymazané podľa
        zvolenej politiky uchovávania.
      </p>

      <h2>7. Zodpovednosť a obmedzenia</h2>
      <p>
        Tesla Fleet API neposkytuje hotový zoznam jázd. Faktero získava iba stavové snímky vozidla
        (tachometer, poloha), na základe ktorých môže v budúcnosti automatizovať tvorbu jázd. Faktero
        nezodpovedá za dostupnosť, presnosť ani oneskorenie dát poskytovaných spoločnosťou Tesla. Používateľ
        berie na vedomie, že prístup k API môže byť obmedzený, pozastavený alebo zmenený spoločnosťou Tesla
        bez predchádzajúceho upozornenia.
      </p>
      <p>
        Faktero používa Tesla API výhradne v súlade s aktuálnymi dokumentmi Tesla — vrátane, ale nie
        výhradne, <em>Tesla Fleet API Terms of Use</em> a <em>Tesla Privacy Policy</em>. Používateľ sa
        zaväzuje používať integráciu v súlade s podmienkami Tesla a platnými právnymi predpismi.
      </p>

      <h2>8. Prenos údajov do tretích krajín</h2>
      <p>
        Tesla API servery sa môžu nachádzať mimo Európskeho hospodárskeho priestoru. Tesla, Inc. poskytuje
        primerané záruky prenosu osobných údajov v súlade so svojou dokumentáciou a platnými právnymi
        predpismi. Faktero ako sprostredkovateľ neprevádzkuje Tesla API, ale iba ukladá dáta získané touto
        službou v rámci svojej vlastnej infraštruktúry.
      </p>

      <h2>9. Odpojenie a zrušenie prístupu</h2>
      <p>
        Používateľ môže kedykoľvek odpojiť Tesla účet v nastaveniach Faktera (sekcia Kniha jázd →
        Integrácie → Tesla). Odpojením dôjde k okamžitému vymazaniu uložených tokenov a zastaveniu ďalšej
        synchronizácie. Alternatívne môže používateľ zrušiť prístup aplikácie Faktero priamo v nastaveniach
        svojho Tesla účtu.
      </p>

      <h2>10. Zmeny podmienok</h2>
      <p>
        Prevádzkovateľ si vyhradzuje právo kedykoľvek zmeniť tieto podmienky, najmä ak dôjde k zmene
        funkcionality Tesla integrácie, rozsahu spracúvaných údajov alebo podmienok spoločnosti Tesla.
        O významných zmenách budú používatelia informovaní e-mailom alebo notifikáciou v aplikácii. Ďalším
        používaním integrácie po zmene podmienok používateľ vyjadruje svoj súhlas so zmeneným znením.
      </p>

      <h2>11. Kontakt</h2>
      <p>
        V prípade otázok týkajúcich sa Tesla integrácie, spracúvania údajov alebo odvolania súhlasu nás
        kontaktujte na e-mailovej adrese{" "}
        <a href={`mailto:${LEGAL_COMPANY.email}`}>{LEGAL_COMPANY.email}</a> alebo poštou na adrese{" "}
        {LEGAL_COMPANY.address}.
      </p>
    </LegalShell>
  );
}
