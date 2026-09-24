import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/vykazy-dph")({
  head: () => ({
    meta: [
      { title: "Pomoc — Výkazy k DPH — Faktero" },
      {
        name: "description",
        content:
          "Priznanie k DPH, kontrolný výkaz a súhrnný výkaz vo Faktere: čo treba vyplniť na dokladoch, ako sa výkazy zostavia a ako sa XML podá cez eDane.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/vykazy-dph" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/vykazy-dph" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "co-to-je",
    title: "Tri výkazy z tých istých dokladov",
    body: (
      <>
        <p>
          <Link to="/uctovnictvo/vykazy">Účtovníctvo → Výkazy k DPH</Link> zostaví za zvolený mesiac
          alebo štvrťrok tri podania naraz:
        </p>
        <ul>
          <li>
            <strong>Priznanie k DPH</strong> (vzor DPHv21) — riadky 01 až 37,
          </li>
          <li>
            <strong>Kontrolný výkaz</strong> (schéma KVDPH 2025) — časti A.1, A.2, B.1, B.2, B.3 a
            C.1, C.2,
          </li>
          <li>
            <strong>Súhrnný výkaz</strong> (SVDPHv20) — dodania do iného členského štátu.
          </li>
        </ul>
        <p>
          Každý sa dá stiahnuť ako <strong>XML</strong> a nahrať do eDane alebo na portál finančnej
          správy. Faktero nič neodosiela samo — podpis a podanie ostávajú na vás.
        </p>
      </>
    ),
  },
  {
    id: "co-vyplnit",
    title: "Čo musí byť na dokladoch",
    body: (
      <>
        <p>Tri údaje sa z dokladu vypočítať nedajú a bez nich by výkaz bol nesprávny:</p>
        <ul>
          <li>
            <strong>Dodanie do EÚ</strong> — pri faktúre s prenesením daňovej povinnosti do EÚ
            vyberte, či išlo o tovar, službu alebo trojstranný obchod. Rozhoduje to o kóde plnenia v
            súhrnnom výkaze; tovar ide navyše do riadkov 13 a 14 priznania, služba do priznania
            nevstupuje vôbec.
          </li>
          <li>
            <strong>Režim DPH na prijatej faktúre</strong> — tuzemská faktúra od platiteľa ide do
            časti B.2, samozdanenie podľa § 69 do B.1, nadobudnutie tovaru z EÚ do riadkov 05 až 08
            priznania. Keď pole necháte prázdne, Faktero režim odhadne podľa IČ DPH dodávateľa.
          </li>
          <li>
            <strong>Číslo opravovanej faktúry</strong> — dobropis bez nej sa do častí C.1 a C.2
            zapísať nedá.
          </li>
        </ul>
        <p>
          Doplniť sa dá aj <strong>dátum dodania</strong> prijatej faktúry a či si z nej{" "}
          <strong>odpočítavate daň</strong>.
        </p>
      </>
    ),
  },
  {
    id: "vytky",
    title: "Upozornenia pred podaním",
    body: (
      <>
        <p>
          Nad výkazmi sa vypíše, čo chýba: faktúra bez IČ DPH odberateľa pri dodaní do EÚ, prijatá
          faktúra bez čísla, dobropis bez väzby na pôvodný doklad, doklad v cudzej mene. Výkaz sa dá
          stiahnuť aj tak, ale tie riadky budú neúplné — cudzia mena sa navyše do výkazov uvádza
          prepočítaná na eurá.
        </p>
      </>
    ),
  },
  {
    id: "rucne-riadky",
    title: "Riadky, ktoré Faktero nevie",
    body: (
      <>
        <p>
          Niektoré riadky priznania z dokladov nevyplývajú — dovoz tovaru, nevymožiteľná pohľadávka,
          odpočet dane pri registrácii, daň vrátená cestujúcim alebo nadmerný odpočet z minulého
          obdobia. Vyplnia sa ručne v rozbaľovacej časti pod priznaním a hneď sa premietnu do
          výsledku.
        </p>
      </>
    ),
  },
  {
    id: "podanie",
    title: "Po podaní",
    body: (
      <>
        <p>
          Tlačidlo <strong>Podané</strong> si výkaz uloží aj s dátumom, takže je dohľadateľné, čo a
          kedy sa odoslalo. Potom sa oplatí obdobie <Link to="/pomoc/uzavierka">uzamknúť</Link> —
          dodatočná zmena dokladu by inak rozišla účtovníctvo s tým, čo už má finančná správa.
        </p>
        <p>
          Lehota je do 25 dní po skončení zdaňovacieho obdobia; kontrolný výkaz sa podáva aj vtedy,
          keď je priznanie nulové, ak v ňom sú plnenia.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Účtovníctvo"
      title="Výkazy k DPH"
      intro={
        <p>
          Priznanie, kontrolný výkaz a súhrnný výkaz zostavené z dokladov a stiahnuté v XML pre
          eDane.
        </p>
      }
      sections={sections}
    />
  );
}
