import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";
import { useT } from "@/lib/i18n/useT";

export const Route = createFileRoute("/pomoc/prepojenia")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — API a prepojenia — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Všetko, s čím sa Faktero prepojí: API, webhooky, AI asistenti, banky, účtovné programy, eFaktúra, e-shopy, kniha jázd a prechod z iných programov.",
        ),
      },
      {
        property: "og:title",
        content: preloz(match.context.jazyk, "Pomoc — API a prepojenia — Faktero"),
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/prepojenia" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/prepojenia" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "prehlad",
    title: "Prehľad",
    body: (
      <>
        <p>
          Faktero nie je ostrov. Doklady si berie z banky, z e-mailu, zo skenera aj z e-shopu,
          posiela ich do účtovného programu a cez eFaktúru odberateľom a vlastný systém či AI
          asistent sa naň napojí cez API. Táto stránka zhŕňa všetky prepojenia na jednom mieste —
          podrobnosti ku každému sú v samostatných manuáloch.
        </p>
        <p>
          Celý prehľad si stiahnete ako <strong>PDF</strong> tlačidlom hore alebo zo sekcie{" "}
          <a href="#na-stiahnutie">Na stiahnutie</a>.
        </p>
      </>
    ),
  },
  {
    id: "api",
    title: "Faktero API — čo vie čítať a zapisovať",
    body: (
      <>
        <p>
          REST API na adrese <code>https://faktero.sk/api/v1</code>, odpovede v JSON. Prihlasuje sa
          API kľúčom v hlavičke <code>Authorization: Bearer fk_live_…</code>. Testovací kľúč (
          <code>fk_test_…</code>) smie len čítať.
        </p>
        <ul>
          <li>
            <strong>Fakturácia</strong> — faktúry (vystavenie, úprava, PDF, odoslanie e-mailom,
            úhrada, storno), cenové ponuky a ich prevod na faktúru, opakované faktúry, odberatelia a
            dodávatelia vrátane hromadného prenosu adresára (do 1000 naraz).
          </li>
          <li>
            <strong>Doklady</strong> — prijaté faktúry a bločky (čítanie, zápis aj so súborom,
            úhrada, zaúčtovanie, označenie odovzdaných), nahratie dokladu na prečítanie cez AI.
          </li>
          <li>
            <strong>Banka</strong> — bankové účty a pohyby; účet banky bez napojenia založíte cez
            API a pohyby naň posielate dávkami.
          </li>
          <li>
            <strong>Cenník a sklad</strong> — produkty a služby, sklady, skladové karty, stavy,
            pohyby, ocenenie skladu a prečítanie dodacieho listu.
          </li>
          <li>
            <strong>Kniha jázd</strong> — vozidlá, jazdy a tankovania.
          </li>
          <li>
            <strong>Firmy a používatelia</strong> — kľúčom pre viac firiem založíte firmu klienta,
            upravíte jej údaje a pozvete do nej účtovníka či kolegu.
          </li>
          <li>
            <strong>Pohoda</strong> — dávka dokladov pre konektor a príjem odpovede z Pohody.
          </li>
        </ul>
        <p>
          <strong>Kľúč firmy alebo kľúč pre viac firiem.</strong> Účtovná kancelária má jeden kľúč
          na všetkých klientov a firmu vyberie hlavičkou <code>X-Company</code> (IČO alebo id).
          Zakladať firmy a pozývať používateľov smie len kľúč pre viac firiem.
        </p>
        <p>
          <strong>Bezpečné opakovanie.</strong> Pri zápise pošlite vlastné <code>external_id</code>{" "}
          — to isté volanie druhýkrát nič nezdvojí. Cez API sa nič nemaže, faktúra sa dá len
          stornovať. Počet požiadaviek nie je obmedzený.
        </p>
        <p>
          Úplný zoznam endpointov s príkladmi je v <Link to="/docs/api">API dokumentácii</Link>,
          návod na kľúče v manuáli <Link to="/pomoc/api">API a webhooky</Link>.
        </p>
      </>
    ),
  },
  {
    id: "webhooky",
    title: "Webhooky — Faktero sa ozve samo",
    body: (
      <>
        <p>
          Na vašu adresu pošle Faktero správu, keď sa niečo stane — nemusíte sa každú chvíľu pýtať:
        </p>
        <ul>
          <li>
            <code>invoice.created</code>, <code>invoice.sent</code>, <code>invoice.paid</code>,{" "}
            <code>invoice.cancelled</code> — faktúra vznikla, odišla, je uhradená, je stornovaná,
          </li>
          <li>
            <code>customer.created</code> — nový odberateľ,
          </li>
          <li>
            <code>bank_transaction.created</code> — nový pohyb na účte.
          </li>
        </ul>
        <p>
          Každá správa je podpísaná, neúspešné doručenie sa opakuje a v{" "}
          <Link to="/webhooky-logy">denníku webhookov</Link> vidíte, čo odišlo.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI asistenti — Claude, ChatGPT a Faktero AI",
    body: (
      <>
        <p>
          <strong>Faktero AI</strong> je asistent priamo vo Fakteri — pozná vaše doklady aj tieto
          manuály. Navyše sa na Faktero napojí <strong>Claude, ChatGPT</strong>, Claude Code či
          Cursor cez MCP na adrese <code>https://www.faktero.sk/api/mcp</code>.
        </p>
        <p>
          Asistent cez MCP vie vypísať firmy, faktúry, faktúry po splatnosti, ponuky, cenník,
          prijaté faktúry, odberateľov, bankové účty a pohyby; vystaviť faktúru, zapísať prijatú
          faktúru či bloček, založiť odberateľa, produkt alebo firmu, preniesť kontakty a bankové
          pohyby, označiť úhradu a pozvať používateľa. Nič nemaže a nič neposiela odberateľom.
        </p>
        <p>
          Postup pridania je v manuáli <Link to="/pomoc/api">API a webhooky</Link>.
        </p>
      </>
    ),
  },
  {
    id: "banky",
    title: "Banky a platby",
    body: (
      <>
        <ul>
          <li>
            <strong>Tatra banka</strong> — priame napojenie: zostatky, pohyby, výpisy a platby z
            Faktera; cez Tatra banku aj účty v iných slovenských bankách.
          </li>
          <li>
            <strong>Fio banka, Wise, Revolut Business, Wallester</strong> — pohyby a zostatky cez
            ich API (token alebo prepojenie).
          </li>
          <li>
            <strong>E-mailové notifikácie banky</strong> — pri banke bez napojenia stačí preposielať
            avíza o platbách na adresu, ktorú vám Faktero pridelí.
          </li>
          <li>
            <strong>Nahratie výpisu</strong> (camt.053, CSV z platobných brán) a{" "}
            <strong>účet cez API</strong> — pre ostatné banky a pri prechode z iného programu.
          </li>
          <li>
            Platby sa <strong>párujú s faktúrami</strong> samé (podľa VS, sumy a protistrany),
            vystavené faktúry sa označia ako uhradené.
          </li>
          <li>
            <strong>Hromadný príkaz na úhradu</strong> (SEPA XML) z prijatých faktúr a{" "}
            <strong>platobný QR kód</strong> na faktúre (PAY by square, v Česku QR platba).
          </li>
          <li>
            <strong>Vlastné výpisy</strong> v PDF a camt.053 aj pre banky, ktoré ich samé nedajú.
          </li>
        </ul>
        <p>
          Podrobne v manuáloch <Link to="/pomoc/banka">Bankové účty</Link> a{" "}
          <Link to="/pomoc/financovanie">Leasingy a úvery</Link>.
        </p>
      </>
    ),
  },
  {
    id: "uctovnictvo",
    title: "Účtovné programy",
    body: (
      <>
        <ul>
          <li>
            <strong>POHODA</strong> — konektor si doklady berie sám každú noc (aj pre viac firiem
            jedným kľúčom) a vráti čísla, ktoré im Pohoda pridelila; alebo XML na ručný import.
            Faktúry, prijaté doklady, pokladňa, adresár, sklad a zákazky, s predkontáciou a členením
            DPH.
          </li>
          <li>
            <strong>Omega a ALFA plus, Money S3, ABRA Flexi, DATEV</strong> — exporty v ich
            formátoch, vrátane zaúčtovania.
          </li>
          <li>
            <strong>CSV a ISDOC</strong> — pre ostatné programy a e-faktúry v českom štandarde.
          </li>
          <li>
            <strong>Mesačné odovzdanie účtovníkovi</strong> — jeden balík (XML, súpisky, PDF a
            skeny) automaticky e-mailom 5. v mesiaci.
          </li>
          <li>
            <strong>Prístup pre účtovníka</strong> — pozvete ho do firmy s rolou účtovník; doklady
            vedie a zaúčtuje priamo vo Fakteri.
          </li>
        </ul>
        <p>
          Podrobne v manuáloch <Link to="/pomoc/pohoda">Prepojenie s Pohodou</Link>,{" "}
          <Link to="/pomoc/exporty">Exporty a importy</Link> a{" "}
          <Link to="/pomoc/automaticke-zauctovanie">Automatické zaúčtovanie</Link>.
        </p>
      </>
    ),
  },
  {
    id: "stat",
    title: "eFaktúra, štát a registre",
    body: (
      <>
        <ul>
          <li>
            <strong>eFaktúra</strong> — posielanie a prijímanie elektronických faktúr cez sieť
            Peppol (od roku 2027 povinné), s doručenkami a prijatými eFaktúrami priamo vo Fakteri.
          </li>
          <li>
            <strong>Finančná správa</strong> — bloček z eKasy načítaný z QR kódu (aj s položkami),
            výkazy DPH v XML na podanie (priznanie, kontrolný a súhrnný výkaz; v Česku DPHDP3, KH1 a
            SHV).
          </li>
          <li>
            <strong>Registre</strong> — údaje firmy podľa IČO (slovenské a české registre), overenie
            IČ DPH vo VIES s dôkazom pre daňovú kontrolu.
          </li>
          <li>
            <strong>Kurzy</strong> — ECB, ČNB a nemecké BMF pre faktúry v cudzej mene.
          </li>
        </ul>
        <p>
          Podrobne v manuáloch <Link to="/pomoc/efaktura">eFaktúra</Link>,{" "}
          <Link to="/pomoc/vykazy-dph">Výkazy k DPH</Link> a{" "}
          <Link to="/pomoc/oss">OSS — predaj do EÚ</Link>.
        </p>
      </>
    ),
  },
  {
    id: "eshopy",
    title: "E-shopy a doprava",
    body: (
      <>
        <ul>
          <li>
            <strong>WooCommerce</strong> — doplnok pre WordPress vystaví faktúru k objednávke a
            pošle ju zákazníkovi.
          </li>
          <li>
            <strong>Shoptet</strong> — objednávky sa prenesú do Faktera a vyfakturujú.
          </li>
          <li>
            <strong>Zásielkovňa</strong> — zásielka k faktúre jedným klikom, sledovanie stavu.
          </li>
          <li>
            Ostatné e-shopy a pokladne sa napoja cez <Link to="/docs/api">API</Link>.
          </li>
        </ul>
        <p>
          Podrobne v manuáli <Link to="/pomoc/woocommerce">E-shop na WooCommerce</Link>.
        </p>
      </>
    ),
  },
  {
    id: "jazdy",
    title: "Kniha jázd a vozidlá",
    body: (
      <>
        <ul>
          <li>
            <strong>Commander</strong> — jazdy z GPS jednotiek vozidiel.
          </li>
          <li>
            <strong>Tesla</strong> — jazdy priamo z auta.
          </li>
          <li>
            <strong>Aplikácia Kniha jázd</strong> — jazdu rozpozná telefón sám, adresy a vodiča
            doplní Faktero.
          </li>
        </ul>
        <p>
          Podrobne v manuáloch <Link to="/pomoc/jazdy">Kniha jázd</Link> a{" "}
          <Link to="/pomoc/vozovy-park">Vozový park</Link>.
        </p>
      </>
    ),
  },
  {
    id: "doklady",
    title: "E-mail, skenovanie a doklady",
    body: (
      <>
        <ul>
          <li>
            <strong>Príjem dokladov e-mailom</strong> — firma má vlastnú adresu; faktúry a bločky,
            ktoré na ňu pošlete či preposielate, Faktero prečíta a zaradí.
          </li>
          <li>
            <strong>Skener v aplikácii</strong> — odfotený doklad prečíta AI; ISDOC a ZUGFeRD v PDF
            sa načítajú presne.
          </li>
          <li>
            <strong>Odosielanie faktúr</strong> — e-mailom z Faktera alebo z vlastnej poštovej
            schránky (SMTP), s verejným odkazom na faktúru.
          </li>
        </ul>
        <p>
          Podrobne v manuáloch <Link to="/pomoc/doklady">Doklady a skenovanie</Link> a{" "}
          <Link to="/pomoc/prijate-faktury">Prijaté faktúry</Link>.
        </p>
      </>
    ),
  },
  {
    id: "prechod",
    title: "Prechod z iných programov",
    body: (
      <>
        <p>
          Faktúry, kontakty a doklady prenesiete z programov <strong>POHODA a mPOHODA</strong>,{" "}
          <strong>SuperFaktúra</strong>, <strong>iDoklad</strong>, <strong>KROS (Omega)</strong> a{" "}
          <strong>Money S3</strong>; prijaté doklady z exportu pre Pohodu, z tabuľky a zo ZIP so
          skenmi. Číslovanie faktúr potom pokračuje tam, kde ste skončili.
        </p>
        <p>
          Väčší prenos (celú históriu dokladov aj so súbormi, adresár, cenník, bankové účty) zvládne
          aj <Link to="/docs/api">API</Link>. Ak potrebujete pomôcť s prechodom, napíšte nám.
        </p>
      </>
    ),
  },
  {
    id: "aplikacie",
    title: "Aplikácie a ostatné",
    body: (
      <>
        <ul>
          <li>
            <strong>Mobilná aplikácia</strong> pre iPhone a Android — faktúry, doklady, skener,
            banka; funguje aj bez signálu.
          </li>
          <li>
            <strong>Predplatné Faktera</strong> sa platí kartou cez GoPay.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "na-stiahnutie",
    title: "Na stiahnutie",
    body: <NaStiahnutie />,
  },
];

/** Odkazy na PDF v jazyku webu (generuje `npm run docs:manualy` a `docs:pdf`). */
function NaStiahnutie() {
  const { t, jazyk } = useT();
  const j = jazyk === "cs" || jazyk === "de" ? jazyk : "sk";
  return (
    <ul>
      <li>
        <a href={`/docs/faktero-prepojenia-${j}.pdf`} download>
          {t("API a prepojenia — tento prehľad (PDF)")}
        </a>
      </li>
      <li>
        <a href={`/docs/faktero-api-${j}.pdf`} download>
          {t("API dokumentácia — všetky endpointy s príkladmi (PDF)")}
        </a>
      </li>
      <li>
        <a href={`/docs/faktero-manualy-${j}.pdf`} download>
          {t("Všetky manuály Faktera v jednom súbore (PDF)")}
        </a>
      </li>
    </ul>
  );
}

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Účet a vývoj"
      title="API a prepojenia"
      intro={
        <p>
          Všetko, s čím sa Faktero prepojí — API, AI asistenti, banky, účtovné programy, eFaktúra,
          e-shopy, kniha jázd a prechod z iných programov.
        </p>
      }
      sections={sections}
      pdf="prepojenia"
    />
  );
}
