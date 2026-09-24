import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/dph")({
  head: () => ({
    meta: [
      { title: "Pomoc — DPH — Faktero" },
      {
        name: "description",
        content:
          "Prehľad DPH vo Faktere: sadzby 23, 19, 5 a 0 %, daň na výstupe a vstupe, prenesenie daňovej povinnosti a podklady pre priznanie.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/dph" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/dph" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "prehlad",
    title: "Čo prehľad DPH ukazuje",
    body: (
      <>
        <p>
          <Link to="/uctovnictvo/dph">Účtovníctvo → DPH prehľad</Link> spočíta za zvolené obdobie{" "}
          <strong>daň na výstupe</strong> (z vydaných faktúr) a <strong>daň na vstupe</strong> (z
          prijatých faktúr a dokladov) a ukáže rozdiel — teda koľko máte odviesť alebo si nárokovať.
        </p>
        <p>
          Je to <strong>podklad</strong>, nie priznanie. Priznanie podáva účtovníčka; Faktero jej dá
          čísla a rozpis, z ktorých dokladov vznikli.
        </p>
      </>
    ),
  },
  {
    id: "sadzby",
    title: "Sadzby DPH",
    body: (
      <>
        <p>
          Ponuka sadzieb sa riadi <strong>krajinou firmy</strong> z{" "}
          <Link to="/firma">Nastavení firmy</Link> a dátumom dokladu — pri staršom doklade teda
          dostanete sadzby, ktoré vtedy platili, nie tie dnešné.
        </p>
        <p>Slovenská firma:</p>
        <ul>
          <li>
            <strong>23 %</strong> — základná,
          </li>
          <li>
            <strong>19 %</strong> — znížená,
          </li>
          <li>
            <strong>5 %</strong> — znížená (napríklad vybrané potraviny a bývanie),
          </li>
          <li>
            <strong>0 %</strong> — oslobodené plnenia.
          </li>
        </ul>
        <p>
          Takto to platí od 1. januára 2025. Na dokladoch do konca roka 2024 Faktero ponúkne 20 % a
          10 %.
        </p>
        <p>Česká firma:</p>
        <ul>
          <li>
            <strong>21 %</strong> — základná,
          </li>
          <li>
            <strong>12 %</strong> — znížená (od 1. januára 2024, keď sa obe znížené zlúčili),
          </li>
          <li>
            <strong>0 %</strong> — oslobodené plnenia.
          </li>
        </ul>
        <p>
          Sadzba sa nastavuje na produkte a dá sa prepísať na riadku faktúry. Predvolená je tá
          základná.
        </p>
      </>
    ),
  },
  {
    id: "neplatca",
    title: "Ak nie ste platiteľ DPH",
    body: (
      <>
        <p>
          V <Link to="/firma">Nastaveniach firmy</Link> nechajte zaškrtávacie pole{" "}
          <strong>Firma je platiteľ DPH</strong> prázdne a vyberte „Neplatiteľ DPH". Faktúry potom
          vychádzajú bez dane, sadzby sa neponúkajú a na doklade je veta, že dodávateľ nie je
          platiteľom.
        </p>
        <p>
          Samotné IČ DPH o platiteľstve nerozhoduje — registrácia podľa § 7 alebo § 7a ho má tiež.
          Prehľad DPH v tomto prípade nepotrebujete, súhrnný výkaz pri § 7a áno.
        </p>
      </>
    ),
  },
  {
    id: "prenesenie",
    title: "Prenesenie daňovej povinnosti",
    body: (
      <>
        <p>
          Pri faktúre sa dá zapnúť <strong>prenesenie daňovej povinnosti</strong> — tuzemské podľa
          §69, dodanie do EÚ alebo vývoz. Faktúra potom ide bez DPH a nesie príslušnú poznámku;
          namiesto sadzby je na riadkoch <em>PDP</em>.
        </p>
        <p>Takéto faktúry sa v prehľade DPH vedú zvlášť, lebo daň z nich neodvádzate vy.</p>
      </>
    ),
  },
  {
    id: "obdobie",
    title: "Do ktorého obdobia doklad patrí",
    body: (
      <>
        <p>
          Rozhoduje <strong>dátum dodania</strong>, nie dátum vystavenia ani úhrady. Ak dátum
          dodania nevyplníte, Faktero použije dátum vystavenia.
        </p>
        <p>
          Preto sa oplatí dátum dodania vypĺňať vždy, keď sa líši — inak sa doklad ocitne v zlom
          mesiaci DPH.
        </p>
        <p>
          Keď je priznanie podané, obdobie <Link to="/pomoc/uzavierka">uzamknite</Link>. Zabránite
          tým dodatočným zmenám v sumách a dátumoch.
        </p>
      </>
    ),
  },
  {
    id: "platitel",
    title: "Platiteľ, alebo len registrovaná osoba",
    body: (
      <>
        <p>
          V <Link to="/firma">Nastaveniach firmy</Link> sa zaškrtáva, či je firma platiteľ DPH, a
          vyberá sa typ registrácie. Nestačí totiž vyplnené IČ DPH: osoba registrovaná podľa{" "}
          <strong>§ 7</strong> (nadobudnutie tovaru z EÚ) alebo <strong>§ 7a</strong> (služby v
          rámci EÚ) IČ DPH má, ale platiteľom nie je — faktúry vystavuje bez dane.
        </p>
        <ul>
          <li>
            <strong>Platiteľ:</strong> § 4 (bežná registrácia), § 4b (skupinová), § 5 (zahraničná
            osoba).
          </li>
          <li>
            <strong>Bez postavenia platiteľa:</strong> § 7, § 7a alebo neregistrovaná osoba.
          </li>
          <li>Pre českú firmu: plátce, identifikovaná osoba, neplátce.</li>
        </ul>
        <p>
          Neplatiteľovi sa v doklade ponúka len nulová sadzba a na faktúru pribudne veta, prečo na
          nej daň nie je. Z registra sa ťahá len IČ DPH — paragraf treba vybrať ručne.
        </p>
      </>
    ),
  },
  {
    id: "cudzia-mena",
    title: "Faktúra v cudzej mene",
    body: (
      <>
        <p>
          Pri faktúre v inej mene než euro sa daň prepočíta{" "}
          <strong>kurzom ECB zo dňa predchádzajúceho dňu dodania</strong> a na doklade pribudne
          riadok s daňou v eurách, kurzom a dňom, z ktorého je (§ 26 ods. 1 zákona o DPH). Robí sa
          to samo pri vystavení; kurz si faktúra zapamätá, takže sa spätne nemení.
        </p>
        <p>
          Cez víkend a sviatky sa použije posledný zverejnený kurz. Do výkazov k DPH vstupuje
          prepočítaná suma v eurách.
        </p>
      </>
    ),
  },
  {
    id: "vykazy",
    title: "Priznanie a výkazy",
    body: (
      <>
        <p>
          Z tých istých dokladov sa v{" "}
          <Link to="/uctovnictvo/vykazy">Účtovníctve → Výkazy k DPH</Link> zostaví priznanie,
          kontrolný výkaz aj súhrnný výkaz a stiahnu sa v XML pre eDane. Podrobne to popisuje{" "}
          <Link to="/pomoc/vykazy-dph">manuál k výkazom</Link>.
        </p>
        <p>
          Predaj spotrebiteľom v EÚ cez <Link to="/pomoc/oss">režim OSS</Link> do priznania ani do
          kontrolného výkazu nevstupuje — má vlastné priznanie.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Účtovníctvo"
      title="DPH vo Faktere"
      intro={
        <p>Sadzby, daň na výstupe a vstupe, prenesenie povinnosti a podklady pre priznanie.</p>
      }
      sections={sections}
    />
  );
}
