import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/automaticke-zauctovanie")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Automatické zaúčtovanie — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Autopilot zaúčtovania vo Fakteri: predkontácia z pravidla, zo zvyku partnera alebo od AI, členenie DPH a KV z režimu dane, blokátory a stránka Na kontrolu.",
        ),
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/automaticke-zauctovanie" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/automaticke-zauctovanie" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "ako-to-funguje",
    title: "Ako to funguje",
    body: (
      <>
        <p>
          Každý nový doklad — prijatá faktúra, bloček aj vystavená faktúra — dostane do minúty návrh
          zaúčtovania: <strong>predkontáciu, členenie DPH, riadok kontrolného výkazu</strong>,
          prípadne stredisko a činnosť. Nezáleží na tom, či prišiel e-mailom, zo skenera, z importu
          alebo ste ho napísali ručne.
        </p>
        <p>Predkontácia sa hľadá v tomto poradí — prvý zdroj, ktorý zaberie, vyhráva:</p>
        <ol>
          <li>
            <strong>Pravidlo účtovania</strong> (istota 100 %) — podľa partnera, textu, spôsobu
            úhrady, predmetu či odosielateľa e-mailu, krajiny, variabilného symbolu alebo typu
            dokladu. Pravidlá spravujete v{" "}
            <Link to="/uctovnictvo/pravidla">Účtovníctvo → Pravidlá účtovania</Link>.
          </li>
          <li>
            <strong>Zvyk partnera</strong> — keď ste aspoň tri z posledných desiatich dokladov od
            toho istého partnera zaúčtovali väčšinou rovnako. Istota je podiel zhody (najviac 98 %).
          </li>
          <li>
            <strong>AI</strong> (prijaté faktúry a bločky) — vyberá výhradne z vašich predkontácií a
            povie, prečo. Kód, ktorý vo vašom číselníku nie je, sa zahodí.
          </li>
        </ol>
        <p>
          <strong>Členenie DPH a kontrolný výkaz sa AI nepýta nikdy.</strong> Odvodia sa z režimu
          dane na doklade: tuzemsko s odpočtom (PD, B.2), bloček (B.3), bez nároku na odpočet (PN),
          prenesenie daňovej povinnosti, nadobudnutie tovaru a služby z EÚ (B.1), opravný doklad
          (C.2), osobitná úprava či firma, ktorá nie je platiteľ DPH.
        </p>
      </>
    ),
  },
  {
    id: "pravidla-a-predlohy",
    title: "Pravidlá, predlohy a pravidlo z dokladu",
    body: (
      <>
        <p>
          Pravidlo platí, keď na doklad sedia všetky vyplnené podmienky: dodávateľ (IČO alebo časť
          názvu), typ faktúry, spôsob úhrady, kto doklad nahral, predmet e-mailu,{" "}
          <strong>e-mail odosielateľa</strong> (napr. <code>@telekom.sk</code>),{" "}
          <strong>krajina dodávateľa</strong> (bez nej na doklade platí krajina vašej firmy) a pri
          prijatej faktúre <strong>stály variabilný symbol</strong> — zmluva s operátorom či
          energiami. Pravidlo podľa partnera alebo VS má prednosť pred ostatnými.
        </p>
        <p>
          Okrem predkontácie, členenia DPH a KV vie pravidlo bločku nastaviť{" "}
          <strong>pokladňu</strong> a doklad <strong>rozúčtovať pomerom</strong> (napr. telefón 70 %
          s odpočtom, 30 % bez odpočtu) — sumy sa dopočítajú pri odovzdaní z rozpisu DPH.
        </p>
        <p>
          <strong>Predloha</strong> (záložka Predlohy v Pravidlách účtovania) je pomenované
          zaúčtovanie bez podmienky, napríklad „Nákup PHM – platba kartou“. Sama sa nepoužije — pri
          doklade ju vyberiete cez „Použiť predlohu…“ a doplní kódy, pokladňu, rad aj poznámku
          naraz.
        </p>
        <p>
          V Nespracovaných dokladoch (vedľa tlačidla Vytvoriť) a pri zaúčtovaní prijatej faktúry či
          bločku je <strong>Vytvoriť pravidlo z tohto dokladu</strong>: predvyplní dodávateľa, kódy
          a ponúkne e-mail a VS z dokladu. Keď podobné pravidlo už máte, otvorí sa to — nevznikne
          druhé.
        </p>
      </>
    ),
  },
  {
    id: "autopilot",
    title: "Režimy autopilota",
    body: (
      <>
        <ul>
          <li>
            <strong>Vypnutý</strong> — Faktero samo nič nenavrhuje; návrh si vyžiadate na doklade.
          </li>
          <li>
            <strong>Bezpečný</strong> (predvolený) — samo zaúčtuje doklady, ktoré sedia na pravidlo
            alebo na ustálený zvyk s istotou aspoň 95 %. Návrhy od AI čakajú na vás.
          </li>
          <li>
            <strong>Plný</strong> — navyše zaúčtuje aj návrhy od AI s istotou aspoň 90 %.
          </li>
        </ul>
        <p>
          Režim a limit sumy nastaví majiteľ alebo admin firmy na stránke{" "}
          <Link to="/uctovnictvo/na-kontrolu">Zaúčtovanie na kontrolu</Link> alebo pri pravidlách
          účtovania. Po zapnutí sa týka len nových dokladov — staré sa samé nezaúčtujú.
        </p>
      </>
    ),
  },
  {
    id: "blokatory",
    title: "Kedy doklad čaká na vás",
    body: (
      <>
        <p>Doklad sa nezaúčtuje sám nikdy, keď:</p>
        <ul>
          <li>súčet položiek alebo základ s DPH nesedí so sumou dokladu,</li>
          <li>ide o prenesenie či plnenie z EÚ a IČ DPH partnera nemá platné overenie vo VIES,</li>
          <li>suma je nad limitom firmy (predvolene 5 000 €),</li>
          <li>je to prvý doklad od tohto partnera,</li>
          <li>chýba predkontácia alebo sa nedá určiť členenie DPH,</li>
          <li>je odovzdaný do účtovníctva alebo zamknutý — taký sa vôbec nemení.</li>
        </ul>
        <p>
          Ručne zaúčtovaný doklad automat nikdy neprepíše. Hodnoty, ktoré na doklade už sú, majú
          vždy prednosť pred návrhom.
        </p>
      </>
    ),
  },
  {
    id: "na-kontrolu",
    title: "Stránka Na kontrolu",
    body: (
      <>
        <p>
          V <Link to="/uctovnictvo/na-kontrolu">Účtovníctvo → Zaúčtovanie na kontrolu</Link> sú
          všetky nezaúčtované doklady s návrhom, zdrojom a dôvodom, prečo čakajú. Filtrujete podľa
          druhu, blokátora a zdroja, vyberiete a potvrdíte návrhy naraz.
        </p>
        <p>
          Tlačidlo <strong>Navrhnúť zaúčtovanie pre nezaúčtované</strong> pripraví návrhy aj pre
          doklady spred zapnutia — nič pritom nezaúčtuje.
        </p>
      </>
    ),
  },
  {
    id: "na-doklade",
    title: "Na detaile dokladu",
    body: (
      <>
        <p>
          Automaticky zaúčtovaný doklad má štítok{" "}
          <em>Zaúčtované automaticky · pravidlo X / zvyk 98 % / AI 91 %</em> so zdôvodnením.
          Tlačidlom <strong>Zmeniť</strong> zaúčtovanie zrušíte, kódy upravíte a zaúčtujete znova.
          Nezaúčtovaný doklad ukáže návrh s blokátormi a tlačidlo Potvrdiť návrh.
        </p>
        <p>
          Keď rovnakú opravu u toho istého partnera urobíte druhýkrát, Faktero ponúkne{" "}
          <strong>vytvoriť pravidlo</strong> s predvyplnenými podmienkami. Každá oprava sa zapíše do
          histórie dokladu.
        </p>
      </>
    ),
  },
  {
    id: "banka",
    title: "Bankové pohyby",
    body: (
      <>
        <p>
          Pohyby sa zaúčtujú pri vývoze výpisu do Pohody: pravidlo pre banku (účet, smer,
          protistrana) má prednosť, spárovaný pohyb dostane predvolenú predkontáciu pre banku. Pri
          nespárovaných pohyboch sa AI nepýta. Pravidlo pre banku s výsledkom{" "}
          <strong>Spárované bez dokladu</strong> (poplatky, mzdy, odvody) vybaví pohyb hneď, ako
          príde z banky alebo z nahratého výpisu — pozri <Link to="/pomoc/banka">Banka</Link>.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Účtovníctvo"
      title="Automatické zaúčtovanie"
      intro={<p>Autopilot, ktorý doklady zaúčtuje sám — a vie, kedy sa má zastaviť.</p>}
      sections={sections}
    />
  );
}
