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
    id: "palivove-karty",
    title: "Palivové karty (Shell)",
    body: (
      <>
        <p>
          Vo <Link to="/vozovy-park/palivove-karty">Vozovom parku → Palivové karty</Link> pripojíte
          kartu Shell. Od Shellu potrebujete prístup k B2B Mobility API (client ID a client secret,
          vydáva ich Shell na požiadanie) a payer number z faktúry. Pripojiť ju smie majiteľ alebo
          správca firmy; prístupové údaje sú uložené zašifrované a späť sa už neukážu.
        </p>
        <p>
          Nákupy kartou sa načítajú každú noc aj tlačidlom <strong>Synchronizovať teraz</strong>{" "}
          (pri prvom pripojení za posledné 3 mesiace). Karta sa k vozidlu priradí sama podľa ŠPZ,
          ktorú má Shell pri karte; kartu vodiča priradíte ručne. Tankovanie sa zapíše k vozidlu aj
          so stavom tachometra, ktorý vodič zadal pri platbe, a nákup sa pripočíta k nákladom
          vozidla.
        </p>
        <p>
          Účtovným dokladom je <strong>faktúra od Shellu</strong>, nie jednotlivé tankovania — pri
          nákupe kartou je daňovým dokladom faktúra vydavateľa karty. Každá faktúra sa preto založí
          ako jedna prijatá faktúra s rozpisom nákupov po riadkoch (dátum, palivo, ŠPZ, pumpa).
          Poplatky za karty dorovná samostatný riadok, aby suma sedela s faktúrou. Nákupy v
          zahraničí idú do nákladu celou sumou, lebo cudziu DPH si doma neodpočítate.
        </p>
        <p>
          Keď sú všetky nákupy na faktúre z jedného auta, dostane faktúra aj vozidlo a pri aute s
          odpočtom 50 % sa DPH rozdelí sama. Faktúra za viac áut s kráteným odpočtom má v internej
          poznámke rozpis po autách na kontrolu.
        </p>
        <p>
          K prijatej faktúre sa priloží aj PDF faktúry, ak ho Shell cez API vydá. Súbor, ktorý už
          pri faktúre je (napríklad z e-mailu), sa neprepíše.
        </p>
        <p>
          Ak tú istú faktúru Shell už vo Fakteri máte (prišla e-mailom alebo ste ju nahrali), druhá
          sa nezaloží — nákupy sa len prepoja na existujúcu. Bloček z pumpy s rovnakým dňom a sumou
          sa označí ako <strong>aj bloček</strong>: nezaúčtujte ho, inak bude náklad aj DPH dvakrát.
          Kto chce z karty len tankovania bez dokladov, prepne pri karte{" "}
          <strong>Len tankovania, bez dokladov</strong>.
        </p>
        <p>
          Karty DKV, Eurowag a OMV pripravujeme; pri každej je na stránke napísané, ako u vydavateľa
          získať prístup k údajom.
        </p>
      </>
    ),
  },
  {
    id: "karta-up",
    title: "Palivová karta Up Déjeuner",
    body: (
      <>
        <p>
          Shell kartu od Up Déjeuner vydáva a fakturuje Up. Up nemá verejné API, preto sa nákupy
          nenačítajú samé — nahráte <strong>mesačný výpis transakcií</strong> (CSV alebo XLSX) alebo{" "}
          <strong>faktúru v PDF</strong>. Výpis alebo faktúru nájdete v klientskej zóne Up, prípadne
          vám ich Up pošle e-mailom.
        </p>
        <p>
          V <Link to="/vozovy-park/palivove-karty">Palivových kartách</Link> pri Up Déjeuner
          kliknite na <strong>Pripojiť</strong> — stačí názov, prípadne číslo zmluvy, žiadne heslá.
          Potom tlačidlom <strong>Nahrať výpis</strong> vyberte súbor. Stĺpce výpisu (dátum, karta,
          ŠPZ, pumpa, produkt, litre, suma bez DPH a s DPH, tachometer, číslo faktúry) Faktero
          spozná samo; keď si nie je isté, ukáže stĺpce a priradíte ich sami. PDF faktúru prečíta
          AI.
        </p>
        <p>
          Pred uložením uvidíte <strong>náhľad</strong>: nákupy, litre, súčty, ku ktorým vozidlám
          patria a čo je duplicitné. Ak sa súčet nákupov líši od sumy faktúry, rozdiel sa na faktúre
          doplní dorovnávacím riadkom. Po uložení vznikne jedna prijatá faktúra od Up s rozpisom
          nákupov, tankovania k vozidlám a bločky z pumpy sa označia rovnako ako pri karte Shell.
        </p>
        <p>
          Ten istý výpis môžete nahrať aj viackrát — nič sa nezdvojí. Nákup, ktorý už je nahratý z
          iného súboru (napríklad najprv výpis v CSV a potom faktúra v PDF), sa preskočí, a faktúra,
          ktorú od Up už vo Fakteri máte, sa len prepojí. Kartu bez ŠPZ priradíte k vozidlu v časti{" "}
          <strong>Karty a vozidlá</strong>.
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
