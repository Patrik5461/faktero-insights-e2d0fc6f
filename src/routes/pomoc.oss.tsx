import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/oss")({
  head: () => ({
    meta: [
      { title: "Pomoc — OSS, predaj spotrebiteľom v EÚ — Faktero" },
      {
        name: "description",
        content:
          "Predaj tovaru a digitálnych služieb spotrebiteľom v EÚ: hranica 10 000 €, sadzba štátu zákazníka a podklady pre priznanie OSS.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/oss" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/oss" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "co-to-je",
    title: "Kedy sa OSS týka vás",
    body: (
      <>
        <p>
          Keď predávate tovar alebo digitálne služby <strong>spotrebiteľom</strong> (nie firmám s IČ
          DPH) do iných členských štátov EÚ, platí hranica{" "}
          <strong>10 000 € za kalendárny rok</strong>.
        </p>
        <ul>
          <li>
            <strong>Do hranice</strong> sa dá fakturovať so slovenskou daňou ako doma.
          </li>
          <li>
            <strong>Po prekročení</strong> sa predaj zdaňuje sadzbou štátu, kde zákazník býva, a daň
            sa odvádza cez jedno kontaktné miesto (One Stop Shop).
          </li>
        </ul>
        <p>
          Hranica sa počíta <strong>za všetky štáty spolu</strong>, nie za každý zvlášť — to je
          častý omyl. Do OSS sa dá vstúpiť aj dobrovoľne skôr.
        </p>
      </>
    ),
  },
  {
    id: "faktura",
    title: "Ako vystaviť takú faktúru",
    body: (
      <>
        <p>
          Pri vystavovaní zaškrtnite <strong>Predaj spotrebiteľovi v EÚ (OSS)</strong> a vyberte
          štát spotreby. Sadzby položiek sa prepnú na sadzby toho štátu — napríklad Nemecko 19 %,
          Maďarsko 27 %, Luxembursko 17 %.
        </p>
        <p>
          Znížené sadzby sa v každom štáte vzťahujú na iné tovary, takže ktorú použiť, ostáva na
          vás. Tabuľka sadzieb v Fakteru je informatívna a udržiavaná k aktuálnemu roku.
        </p>
      </>
    ),
  },
  {
    id: "prehlad",
    title: "Podklady pre priznanie",
    body: (
      <>
        <p>
          <Link to="/uctovnictvo/oss">Účtovníctvo → OSS</Link> ukáže za štvrťrok rozpis podľa štátov
          a sadzieb — základ dane a daň — a sleduje, koľko z hranice 10 000 € je vyčerpané.
        </p>
        <p>
          Priznanie OSS sa podáva do konca mesiaca nasledujúceho po štvrťroku cez portál finančnej
          správy; údaje z tabuľky sa doň prepíšu.
        </p>
      </>
    ),
  },
  {
    id: "vztah-k-dph",
    title: "Vzťah k priznaniu k DPH",
    body: (
      <>
        <p>
          Faktúry v režime OSS <strong>nevstupujú</strong> do slovenského priznania k DPH ani do
          kontrolného výkazu — daň sa odvádza osobitným priznaním. Faktero ich preto z{" "}
          <Link to="/pomoc/vykazy-dph">výkazov k DPH</Link> vynecháva samo.
        </p>
        <p>
          Predaj firme s platným IČ DPH v inom členskom štáte nie je OSS — to je dodanie s
          prenesením daňovej povinnosti a patrí do súhrnného výkazu.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Účtovníctvo"
      title="OSS — predaj spotrebiteľom v EÚ"
      intro={
        <p>
          Hranica 10 000 €, sadzba štátu zákazníka a štvrťročné podklady pre priznanie k jednému
          kontaktnému miestu.
        </p>
      }
      sections={sections}
    />
  );
}
