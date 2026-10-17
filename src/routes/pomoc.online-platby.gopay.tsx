import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

/**
 * Stránka ostáva kvôli uloženým odkazom, ale hovorí to, čo dnes platí:
 * platby kartou pre zákazníkov firmy neponúkame. Pôvodný návod na pripojenie
 * vlastného GoPay účtu by posielal ľudí do funkcie, ktorá v aplikácii nie je.
 */
export const Route = createFileRoute("/pomoc/online-platby/gopay")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Ako od zákazníkov dostať peniaze — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "QR platba na faktúre a párovanie úhrad z banky. Platby kartou pre zákazníkov firmy Faktero neponúka.",
        ),
      },
      { name: "robots", content: preloz(match.context.jazyk, "noindex") },
    ],
  }),
  component: HelpPlatby,
});

const sections: HelpSection[] = [
  {
    id: "karty",
    title: "Platby kartou zatiaľ neponúkame",
    body: (
      <>
        <p>
          Aby firma mohla prijímať platby kartou pod vlastným účtom, potrebuje poskytovateľ
          platobnej brány zmluvu, ktorá to na spoločnej doméne umožňuje. Kým ju nemáme, funkciu
          neponúkame — je to poctivejšie, než sľúbiť ju a nechať vás zlyhať pri prvom pokuse.
        </p>
        <p>Netýka sa to platenia predplatného za Faktero. To cez platobnú bránu funguje bežne.</p>
      </>
    ),
  },
  {
    id: "namiesto",
    title: "Čo použiť namiesto toho",
    body: (
      <>
        <ul>
          <li>
            <strong>QR platba priamo na faktúre.</strong> Na každom PDF je kód PAY by square —
            odberateľ ho naskenuje v mobilnej banke a má predvyplnenú sumu, IBAN aj variabilný
            symbol. Netreba nič nastavovať.
          </li>
          <li>
            <strong>Párovanie úhrad z banky.</strong> Keď platba príde na účet, Faktero ju priradí k
            faktúre a označí ju za uhradenú. Isté zhody spáruje samo, sporné predloží na
            rozhodnutie.
          </li>
          <li>
            <strong>Upomienky po splatnosti.</strong> Tri úrovne s vlastnými textami — odosielajú sa
            len tým, ktorí naozaj nezaplatili.
          </li>
        </ul>
        <p>
          Podrobne to popisuje <Link to="/pomoc/banka">návod na bankové účty</Link>.
        </p>
      </>
    ),
  },
];

function HelpPlatby() {
  return (
    <PrelozenyManual
      category="Pomoc · Úhrady faktúr"
      title="Ako od zákazníkov dostať peniaze"
      sections={sections}
    />
  );
}
