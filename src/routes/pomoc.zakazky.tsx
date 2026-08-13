import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/zakazky")({
  head: () => ({
    meta: [
      { title: "Pomoc — Zákazky — Faktero" },
      {
        name: "description",
        content:
          "Zákazky vo Faktere: sledovanie výnosov, nákladov a marže jednej práce naprieč faktúrami, skladom a jazdami.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/zakazky" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/zakazky" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo sú zákazky",
    body: (
      <>
        <p>
          Zákazka je jedna práca, jedna stavba, jeden projekt. Odpovedá na otázku, ktorú účtovníctvo
          nevie: <strong>zarobili sme na tomto konkrétnom prípade?</strong>
        </p>
        <p>
          Faktero k zákazke zbiera výnosy aj náklady z celého systému — vydané faktúry, prijaté
          faktúry, materiál zo skladu a jazdy — a spočíta zisk a maržu.
        </p>
      </>
    ),
  },
  {
    id: "zalozenie",
    title: "Založenie zákazky",
    body: (
      <>
        <p>
          V <Link to="/zakazky/nova">Zákazky → Nová zákazka</Link> stačí názov. Číslo pridelí
          Faktero samo v tvare <code>ZAK{"{rok}{poradie}"}</code>.
        </p>
        <p>Nepovinne pridajte:</p>
        <ul>
          <li>
            <strong>odberateľa</strong> — potom sa zákazka dá nastaviť ako jeho predvolená,
          </li>
          <li>
            <strong>začiatok a predpokladaný koniec</strong>,
          </li>
          <li>
            <strong>plánované výnosy a náklady</strong> — bez nich vidíte len skutočnosť, s nimi aj
            to, ako ďaleko ste od plánu.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "priradenie",
    title: "Priradenie dokladov",
    body: (
      <>
        <p>
          Výber zákazky sa objaví na faktúre, prijatej faktúre, cenovej ponuke, prijatej objednávke,
          skladovom pohybe aj jazde — ale <strong>až vtedy, keď firma nejakú zákazku má</strong>.
          Kým nie je založená ani jedna, políčko sa nezobrazuje, aby zbytočne nezavadzalo.
        </p>
        <p>
          Odberateľovi sa dá nastaviť <strong>predvolená zákazka</strong>. Nový doklad ju potom
          predvyplní sám — to je najspoľahlivejší spôsob, ako sa vyhnúť tomu, že polovica dokladov
          zákazku nemá.
        </p>
        <p>
          Do <strong>uzavretej</strong> zákazky sa nové doklady priradiť nedajú. Výnimkou je pohyb,
          ktorý vznikol z faktúry — ten prejde vždy, aby sa faktúra nezasekla.
        </p>
      </>
    ),
  },
  {
    id: "vyhodnotenie",
    title: "Ako sa počíta zisk",
    body: (
      <>
        <p>
          <strong>Výnosy</strong> sú sumy bez DPH z vydaných faktúr priradených k zákazke. Dobropis
          sa odpočítava. <strong>Zálohová faktúra sa nepočíta</strong> — záloha nie je výnos,
          výnosom sa stane až vyúčtovacia faktúra. Koncepty a zrušené faktúry sa preskakujú.
        </p>
        <p>
          <strong>Náklady</strong> sú tri:
        </p>
        <ul>
          <li>
            <strong>materiál zo skladu</strong> — výdaje ocenené váženou nákupnou cenou, nie
            predajnou,
          </li>
          <li>
            <strong>prijaté faktúry</strong> priradené k zákazke, sumy bez DPH,
          </li>
          <li>
            <strong>doprava</strong> — jazdy priradené k zákazke, spotrebované litre × cena paliva.
          </li>
        </ul>
        <p>
          <strong>Objednávka u dodávateľa nie je náklad.</strong> Objednaný tovar sa nákladom stane
          až jeho výdajom zo skladu. V detaile zákazky ju vidíte len informatívne.
        </p>
      </>
    ),
  },
  {
    id: "doprava",
    title: "Prečo mi doprava vychádza nula",
    body: (
      <>
        <p>Na výpočet dopravy treba dve veci a obe chýbajú najčastejšie:</p>
        <ol>
          <li>
            <strong>spotrebu vozidla</strong> v <Link to="/jazdy/vozidla">Jazdy → Vozidlá</Link>,
          </li>
          <li>
            <strong>aspoň jedno tankovanie</strong>, z ktorého Faktero zoberie cenu paliva.
          </li>
        </ol>
        <p>
          Cena sa berie najprv z tankovaní daného vozidla, potom z ktoréhokoľvek vozidla firmy. Kým
          nie je ani jedno, doprava vyjde nula.
        </p>
      </>
    ),
  },
  {
    id: "uzavretie",
    title: "Uzavretie a zrušenie",
    body: (
      <>
        <p>
          Hotovú zákazku <strong>uzavrite</strong>. Ostane v prehľade s konečným ziskom, ale nové
          doklady sa na ňu už nepriradia. Uzavretie sa dá vrátiť.
        </p>
        <p>
          <strong>Zmazať sa dá len zákazka bez dokladov.</strong> Ak sú na ňu naviazané faktúry
          alebo pohyby, Faktero mazanie odmietne — inak by tie doklady stratili súvislosť.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Zákazky"
      title="Zákazky vo Faktere"
      intro={
        <p>
          Zákazka spája faktúry, sklad a jazdy do jedného čísla: zarobili ste na tejto práci, alebo
          nie?
        </p>
      }
      sections={sections}
    />
  );
}
