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
    title: "Automatické obnovovanie",
    body: (
      <>
        <p>
          Po aktivácii plateného plánu sa predplatné obnovuje <strong>každý mesiac</strong> v deň
          aktivácie. Karta sa strhne automaticky cez GoPay.
        </p>
        <p>3 dni pred obnovou vám pošleme pripomienku e-mailom.</p>
      </>
    ),
  },
  {
    id: "gopay",
    title: "GoPay platba predplatného",
    body: (
      <>
        <p>
          Predplatné Faktera platíte cez <strong>GoPay opakovanú platbu</strong>. Po prvej úspešnej
          platbe sa kartové údaje uložia priamo u GoPay (Faktero ich nikdy nevidí).
        </p>
        <p>
          Daňový doklad za predplatné nájdete v sekcii <Link to="/predplatne">Predplatné</Link>.
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
          Plán môžete kedykoľvek zmeniť v sekcii <Link to="/predplatne">Predplatné</Link>.
        </p>
        <ul>
          <li>
            <strong>Prechod na vyšší plán</strong> sa aktivuje okamžite, rozdiel sa pripočíta
            pomerne.
          </li>
          <li>
            <strong>Prechod na nižší plán</strong> sa aktivuje od ďalšieho fakturačného obdobia.
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
          V Nastaveniach predplatného kliknite na <strong>Zrušiť predplatné</strong>. Zostáva vám
          aktívne do konca už zaplateného obdobia, potom prejde do režimu <em>len na čítanie</em>.
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
            Účet <strong>automaticky prejde na plán Starter</strong> — aplikácia zostáva plne
            funkčná.
          </li>
          <li>
            Prémiové funkcie (API, webhooky, import zo SuperFaktúry, audit log) sa vypnú, kým si
            nezvolíte Premium.
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
