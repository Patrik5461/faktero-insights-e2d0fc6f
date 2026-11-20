import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/predplatne")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Predplatné — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Skúšobné obdobie, obnovovanie, GoPay platba, zmena plánu a zrušenie predplatného Faktero.",
        ),
      },
      {
        property: "og:title",
        content: preloz(match.context.jazyk, "Pomoc — Predplatné — Faktero"),
      },
      {
        property: "og:description",
        content: preloz(match.context.jazyk, "Ako funguje predplatné a fakturácia Faktera."),
      },
      { property: "og:url", content: "https://www.faktero.sk/pomoc/predplatne" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/predplatne" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "trial",
    title: "Skúšobné obdobie",
    body: (
      <>
        <p>
          Po registrácii dostáva každá firma <strong>30 dní zadarmo na pláne Premium</strong>. Počas
          skúšobného obdobia môžete využívať všetky funkcie bez obmedzenia.
        </p>
        <p>
          Skúšobné obdobie sa <strong>nepredlžuje automaticky</strong> a nepýtame si platobné údaje
          vopred.
        </p>
      </>
    ),
  },
  {
    id: "obnova",
    title: "Obnovovanie predplatného",
    body: (
      <>
        <p>
          Platený plán platí <strong>mesiac odo dňa platby</strong>. Automatické strhávanie z karty
          platobná brána GoPay zatiaľ nemá zapnuté, takže sa nič nestrhne samo.
        </p>
        <p>
          <strong>7 dní pred koncom obdobia</strong> vám pošleme e-mail. Ďalší mesiac zaplatíte v
          sekcii <Link to="/predplatne">Predplatné</Link> tlačidlom <strong>Aktivovať plán</strong>.
        </p>
        <p>
          Keď platba nepríde ani 3 dni po konci obdobia, predplatné sa označí ako{" "}
          <em>Po splatnosti</em>. Faktero funguje ďalej a doklady aj údaje vám ostanú prístupné.
        </p>
        <p>
          Ak je pri pláne uvedená najbližšia platba z uloženej karty, strhne sa sama — aj vtedy vás
          7 dní vopred upozorníme e-mailom.
        </p>
      </>
    ),
  },
  {
    id: "gopay",
    title: "Platba cez GoPay",
    body: (
      <>
        <p>
          Predplatné platíte kartou (Visa, Mastercard) cez platobnú bránu <strong>GoPay</strong>.
          Údaje o karte zadávate len na stránke GoPay — Faktero ich nikdy nevidí.
        </p>
        <p>
          Daňový doklad za predplatné vám príde e-mailom hneď po zaplatení. Prehľad platieb je v
          sekcii <Link to="/predplatne">Predplatné</Link> v časti <em>História platieb</em>.
        </p>
      </>
    ),
  },
  {
    id: "zmena",
    title: "Zmena plánu",
    body: (
      <>
        <p>
          Plán zmeníte v sekcii <Link to="/predplatne">Predplatné</Link> — pri zvolenom pláne
          kliknite na <strong>Aktivovať plán</strong> a zaplaťte ho cez GoPay. Plán môže meniť
          majiteľ alebo administrátor firmy.
        </p>
        <ul>
          <li>
            Nový plán sa zapne <strong>hneď po potvrdení platby</strong> a mesačné obdobie začne
            plynúť odo dňa platby.
          </li>
          <li>
            Platí sa mesačná cena zvoleného plánu; zvyšok predchádzajúceho obdobia sa pomerne
            neprepočítava.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "zrusenie",
    title: "Zrušenie predplatného",
    body: (
      <>
        <p>
          V sekcii <Link to="/predplatne">Predplatné</Link> kliknite na{" "}
          <strong>Zrušiť predplatné</strong> (môže majiteľ alebo administrátor firmy). Do konca
          zaplateného obdobia funguje všetko ako doteraz a nič ďalšie sa už nestrhne.
        </p>
        <p>
          Vaše dáta sa <strong>neodstránia</strong> — kedykoľvek sa môžete vrátiť a obnoviť plán.
        </p>
      </>
    ),
  },
  {
    id: "trial-koniec",
    title: "Čo sa stane po skončení skúšobného obdobia",
    body: (
      <>
        <p>Ak si nevyberiete platený plán do uplynutia 30 dní:</p>
        <ul>
          <li>
            Účet <strong>automaticky prejde na bezplatný plán Starter</strong> — nič sa neplatí a
            aplikácia zostáva funkčná.
          </li>
          <li>
            Platia limity plánu Starter podľa <Link to="/cennik">cenníka</Link> — napríklad bez API
            a webhookov a najviac 2 používatelia.
          </li>
          <li>3 dni pred koncom skúšobného obdobia vám pošleme pripomienku e-mailom.</li>
          <li>
            Kedykoľvek si môžete aktivovať vyšší plán a všetko pokračuje tam, kde ste skončili.
          </li>
        </ul>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Predplatné"
      title="Predplatné a fakturácia Faktera"
      intro={<p>Ako funguje skúšobné obdobie, obnova, zmena plánu a zrušenie predplatného.</p>}
      sections={sections}
    />
  );
}
