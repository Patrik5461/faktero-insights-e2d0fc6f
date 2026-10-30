import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/vozovy-park")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Vozový park — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Vozový park vo Faktere: vozidlá firmy s technickým preukazom, vlastníctvom, leasingom, poistkami a upozornením na STK.",
        ),
      },
      { property: "og:url", content: "https://www.faktero.sk/pomoc/vozovy-park" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/vozovy-park" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo je vozový park",
    body: (
      <>
        <p>
          Vozový park je evidencia vozidiel firmy: technický preukaz, kto je vlastník, či je auto na
          leasing, poistky a termíny STK. Všetky papiere k autu sú na jednom mieste a Faktero vás
          upozorní skôr, než niečo prepadne.
        </p>
        <p>
          Sú to <strong>tie isté vozidlá ako v Knihe jázd</strong>. Ak firma knihu jázd používa,
          vozidlá z nej sa vo vozovom parku ukážu samé a naopak. Jazdy sa vo vozovom parku
          nezobrazujú, tie ostávajú v Knihe jázd.
        </p>
      </>
    ),
  },
  {
    id: "pridanie",
    title: "Pridanie vozidla z technického preukazu",
    body: (
      <>
        <p>
          V <Link to="/vozovy-park/nove">Vozový park → Nové vozidlo</Link> vpravo nahrajte fotku
          alebo sken technického preukazu (osvedčenia o evidencii, časť I alebo II). Faktero z neho
          vyčíta ŠPZ, VIN, značku, model, kategóriu, objem a výkon motora, hmotnosť, palivo aj
          vlastníka a držiteľa.
        </p>
        <p>
          Doplnia sa <strong>len prázdne polia</strong> — čo ste už vyplnili, sa neprepíše. Doplnené
          polia sú zvýraznené; skontrolujte ich a uložte. Pri každom poli je v zátvorke kód z
          technického preukazu (napríklad E pre VIN), aby sa dalo ľahko porovnať.
        </p>
      </>
    ),
  },
  {
    id: "vlastnictvo",
    title: "Vlastníctvo, leasing a DPH",
    body: (
      <>
        <p>Pri vozidle vyberte, v akom je vlastníctve:</p>
        <ul>
          <li>
            <strong>vlastné vozidlo firmy</strong> alebo <strong>kúpené na úver</strong> — vozidlo
            je v majetku firmy,
          </li>
          <li>
            <strong>finančný leasing</strong> — vlastníkom je leasingová spoločnosť, po splatení
            prejde na firmu,
          </li>
          <li>
            <strong>operatívny leasing</strong> a <strong>krátkodobý prenájom</strong> — vozidlo sa
            vracia,
          </li>
          <li>
            <strong>súkromné vozidlo</strong> — auto zamestnanca alebo konateľa používané aj na
            služobné cesty.
          </li>
        </ul>
        <p>
          Pri leasingu a úvere sa dá vozidlo prepojiť so zmluvou v{" "}
          <Link to="/financovanie">Banka → Leasingy a úvery</Link>; zo zmluvy sa potom jedným klikom
          dostanete na splátkový kalendár.
        </p>
        <p>
          Použitie a odpočet DPH: pri osobnom aute a motocykli používanom aj súkromne sa na
          Slovensku od 1. 1. 2026 do 30. 6. 2028 odpočítava DPH paušálne 50 % — z kúpy, nájmu aj
          prevádzky (§ 85n zákona o DPH). Celých 100 % len pri aute výlučne na podnikanie s
          podrobnou elektronickou evidenciou jázd a oznámením daňovému úradu. Daň z motorových
          vozidiel od roku 2023 platia len nákladné vozidlá a autobusy nad 3,5 t a ťažké prívesy —
          Faktero to pri kategórii vozidla pripomenie.
        </p>
      </>
    ),
  },
  {
    id: "terminy",
    title: "Termíny a upozornenia",
    body: (
      <>
        <p>
          Pri vozidle zapíšte platnosť STK, emisnej kontroly, PZP, havarijného poistenia, diaľničnej
          známky a dátum najbližšieho servisu. Termín, ktorý končí do 30 dní, sa ukáže{" "}
          <strong>v zvončeku</strong> aj v zozname vozidiel; prepadnutý je červený.
        </p>
        <p>Keď STK alebo poistku predĺžite, stačí prepísať dátum — upozornenie zmizne samo.</p>
        <p>
          Ráno príde aj <strong>e-mail</strong> na adresu firmy so zoznamom termínov, ktoré sa
          blížia. Každý termín sa pošle raz; po predĺžení príde pripomienka znova až k novému
          dátumu.
        </p>
      </>
    ),
  },
  {
    id: "naklady",
    title: "Náklady na vozidlo",
    body: (
      <>
        <p>
          Pri bločku, prijatej faktúre aj v Nespracovaných dokladoch je pole{" "}
          <strong>Vozidlo</strong> (ukáže sa, len keď má firma vo vozovom parku aspoň jedno auto).
          Vyberte ho pri tankovaní, servise, umývaní alebo poistke.
        </p>
        <p>
          Na karte vozidla potom vidíte <strong>náklady za tento rok aj spolu</strong> bez DPH a
          posledné doklady s odkazom na ne.
        </p>
        <p>
          Keď má vozidlo <strong>odpočet DPH 50 %</strong>, doklad s ním sa rozúčtuje sám: polovica
          DPH sa odpočíta, druhá ide so základom do nákladu (v dani z príjmov je to nedaňový
          výdavok). Takto ide do priznania DPH, kontrolného výkazu aj do exportu do Pohody, Omegy,
          Money a ABRA Flexi. Vlastné rozúčtovanie dokladu, pravidlo účtovania alebo predkontácia s
          pomerom majú prednosť. Kódy pre neodpočítateľnú časť sa berú z predkontácie s pomerom „DPH
          50/50“ v <Link to="/uctovnictvo/predkontacie">Predkontáciách</Link>; bez nej ostane
          predkontácia dokladu s členením bez nároku na odpočet.
        </p>
        <p>
          Daň z príjmov je samostatná vec: kto nevedie knihu jázd, uplatní si PHM do výdavkov len
          paušálne 80 % — na to je predkontácia s pomerom „DPH 50/50 a vlastný podiel nákladu“ s
          podielom 80 %.
        </p>
      </>
    ),
  },
  {
    id: "dokumenty",
    title: "Dokumenty k vozidlu",
    body: (
      <>
        <p>
          K vozidlu nahrajte technický preukaz, poistky, protokol z STK, kúpnu alebo leasingovú
          zmluvu a faktúru za vozidlo. Pri poistkách a kontrolách môžete zadať aj platnosť
          dokumentu. Súbory sú uložené súkromne a vidia ich len ľudia z vašej firmy.
        </p>
        <p>
          Vozidlo smie pridávať a upravovať majiteľ alebo správca firmy. Predané alebo vrátené auto
          označte ako <strong>vyradené</strong> — z prehľadu zmizne, ale história ostane.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Vozový park"
      title="Vozový park vo Faktere"
      intro={
        <p>
          Vozidlá firmy s technickým preukazom, vlastníctvom, poistkami a termínmi STK — tie isté,
          ktoré používa Kniha jázd.
        </p>
      }
      sections={sections}
    />
  );
}
