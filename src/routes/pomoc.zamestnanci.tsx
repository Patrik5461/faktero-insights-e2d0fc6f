import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/zamestnanci")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Zamestnanci — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Personalistika vo Fakteru: karta zamestnanca, zmluvy a dokumenty zo šablón, dochádzka, neprítomnosti a pripomienky lehôt.",
        ),
      },
      { property: "og:url", content: "https://www.faktero.sk/pomoc/zamestnanci" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/zamestnanci" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "co-to-je",
    title: "Čo modul rieši",
    body: (
      <>
        <p>
          <strong>Personalistiku bez miezd</strong> — karty zamestnancov, zmluvy a dokumenty,
          dochádzku, neprítomnosti a lehoty, ktoré nesmú ujsť. Mzdy sa počítajú inde; Faktero má
          podklady, z ktorých sa počítajú.
        </p>
        <p>Modul má zapnutý každá firma; vypnúť sa dá na požiadanie.</p>
      </>
    ),
  },
  {
    id: "karta",
    title: "Karta zamestnanca",
    body: (
      <>
        <p>
          Osobné a kontaktné údaje, druh pracovnoprávneho vzťahu (pracovná zmluva, dohoda o vykonaní
          práce, brigádnická práca študentov), miesto výkonu práce, odmena a skúšobná doba.
        </p>
        <p>
          <strong>Rodné číslo a číslo dokladu sú šifrované</strong> aj v databáze a ich zobrazenie
          sa zaznamenáva. Kto ich uvidí, určuje rola alebo{" "}
          <Link to="/pomoc/role">vlastný prístup</Link> — oblasť „Zamestnanci“ sa dá zapnúť
          samostatne.
        </p>
      </>
    ),
  },
  {
    id: "dokumenty",
    title: "Zmluvy a dokumenty zo šablón",
    body: (
      <>
        <p>
          V šablónach sa pripraví text raz a Faktero doň doplní údaje zamestnanca — pracovná zmluva,
          dodatok, výpoveď, potvrdenie o príjme, prihláška do zdravotnej a Sociálnej poisťovne,
          školenie BOZP a ďalšie. Hotový dokument sa uloží ku karte ako PDF.
        </p>
      </>
    ),
  },
  {
    id: "dochadzka",
    title: "Dochádzka a neprítomnosti",
    body: (
      <>
        <p>
          Zapisuje sa práca, dovolenka, náhradné voľno, neplatené voľno, služobná cesta, sviatok aj
          home office; hodiny sa dajú zadať priamo alebo časom od–do s prestávkou. Mesačný súhrn
          ukáže odpracované hodiny a čerpanú dovolenku a dá sa vyexportovať pre mzdovú účtovníčku.
        </p>
      </>
    ),
  },
  {
    id: "pripomienky",
    title: "Lehoty, ktoré sa pripomínajú",
    body: (
      <>
        <p>
          Koniec pracovného pomeru, koniec skúšobnej doby, lekárska prehliadka a školenie BOZP —
          Faktero na ne upozorní vopred, aby sa nezmeškali. Pripomienky vidno v prehľade
          zamestnancov aj na zvončeku.
        </p>
      </>
    ),
  },
  {
    id: "ceska-firma",
    title: "Česká firma",
    body: (
      <>
        <p>
          Firma so sídlom v Česku má ten istý modul, ale{" "}
          <strong>pravidlá podľa českých predpisov</strong> — podľa krajiny firmy v nastaveniach,
          nie podľa jazyka.
        </p>
        <ul>
          <li>
            Zmluvy: pracovný pomer na dobu určitú alebo neurčitú, dohoda o provedení práce (DPP,
            najviac 300 hodín za rok) a dohoda o pracovní činnosti (DPČ, v priemere najviac polovica
            týždenného pracovného času). Brigádnická dohoda študenta je slovenská, česká firma ju
            nemá.
          </li>
          <li>
            Pri zmluve Faktero upozorní na skúšobnú dobu dlhšiu ako 4 mesiace (8 mesiacov len u
            vedúceho zamestnanca), mzdu pod minimálnou mzdou (2026: 22 400 Kč mesačne, 134,40 Kč za
            hodinu) a pripomenie dovolenku najmenej 4 týždne a výpovednú dobu najmenej 2 mesiace,
            ktorá plynie odo dňa doručenia výpovede.
          </li>
          <li>
            DPP zakladá účasť na poistení od odmeny 12 000 Kč za mesiac (2026), DPČ od 4 500 Kč.
            Mzdy ani poistné Faktero nepočíta — upozornenie je len na kontrolu.
          </li>
          <li>
            Rodné číslo sa kontroluje (dátum a deliteľnosť 11), číslo účtu v tvare
            19-2000145399/0800 alebo IBAN, zdravotná poisťovňa sa vyberá zo siedmich českých (111
            VZP až 213 RBP).
          </li>
          <li>
            Šablóny dokumentov sú po česky: pracovní smlouva, DPP, DPČ, výpověď a potvrzení o
            příjmu.
          </li>
        </ul>
        <p>Pripomienky českej firmy:</p>
        <ul>
          <li>
            <strong>Registrácia zamestnanca na ČSSZ</strong> najneskôr pred nástupom (najskôr 8 dní
            vopred), aj pri dohodách.
          </li>
          <li>
            <strong>Zdravotná poisťovňa</strong> — nástup do 8 dní; kto má len DPP alebo DPČ, do 20.
            dňa nasledujúceho mesiaca.
          </li>
          <li>
            <strong>Po skončení</strong> — odhlásenie z ČSSZ do 8 dní a oznámenie zdravotnej
            poisťovni do 8 dní (pri dohodách do 20. dňa nasledujúceho mesiaca). Na karte sa zapíše
            dátum, kedy ste to podali.
          </li>
          <li>Koniec skúšobnej doby, koniec doby určitej, lekárska prehliadka a školenie BOZP.</li>
        </ul>
        <p>
          ELDP sa nepripomína: od apríla 2026 ho zamestnávateľ nevyhotovuje, ČSSZ ho zostaví z
          jednotného mesačného hlásenia, ktoré sa podáva do 20. dňa nasledujúceho mesiaca.
          Podrobnosti sú na{" "}
          <a href="https://www.cssz.gov.cz" target="_blank" rel="noreferrer">
            cssz.gov.cz
          </a>
          .
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Firma"
      title="Zamestnanci"
      intro={<p>Karty, zmluvy zo šablón, dochádzka a lehoty — personalistika bez miezd.</p>}
      sections={sections}
    />
  );
}
