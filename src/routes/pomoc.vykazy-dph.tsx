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
    id: "nezaplatene",
    title: "Nezaplatené faktúry — § 25a a § 53b",
    body: (
      <>
        <p>
          <strong>Vy dlžíte (§ 53b, povinné).</strong> Keď prijatú faktúru od platiteľa
          nezaplatíte ani na 101. deň po splatnosti, musíte štátu vrátiť odpočítanú daň. Faktero to
          urobí samo: v období, v ktorom 101. deň nastal, pridá opravu do r. 29 priznania a do časti
          C.2 kontrolného výkazu (číslo dokladu „0“, záporné sumy, označenie nevymožiteľnej
          pohľadávky). Doklad sa nevystavuje a cez eFaktúru sa nič neposiela. Keď faktúru neskôr
          zaplatíte, v období úhrady si daň odpočítate znova — aj to Faktero doplní samo. Rozhoduje
          dátum úhrady na prijatej faktúre, preto ju označujte ako zaplatenú s dátumom.
        </p>
        <p>
          <strong>Vám dlžia (§ 25a, môžete).</strong> Keď odberateľ nezaplatí ani 150 dní po
          splatnosti, môžete si daň z nezaplatenej časti vrátiť. Do 1 000 € s DPH stačí doložiť
          úkon na vymoženie — napríklad upomienku odoslanú z Faktera; nad 1 000 € musí byť podaná
          žaloba alebo vedená exekúcia. Na detaile faktúry sa vtedy objaví{" "}
          <em>Vystaviť opravný doklad (§ 25a)</em>: vznikne doklad s textom „oprava základu dane
          podľa § 25a“, ktorý musíte odberateľovi odoslať (e-mailom alebo cez eFaktúru ako dobropis
          s číslom pôvodnej faktúry) do lehoty na podanie priznania. Vo výkazoch ide do r. 26 a 27
          a do C.1. Keď odberateľ neskôr zaplatí, opravu treba vrátiť — Faktero na to upozorní a
          doklad o vrátení vystaví jedným klikom. Pri uplatňovaní dane na základe prijatia platby
          (§ 68d) a pri prenesení daňovej povinnosti sa nič z toho neuplatní.
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
          Niektoré riadky priznania z dokladov nevyplývajú — dovoz tovaru, odpočet dane pri
          registrácii, daň vrátená cestujúcim alebo nadmerný odpočet z minulého obdobia. Vyplnia sa
          ručne v rozbaľovacej časti pod priznaním a hneď sa premietnu do výsledku. Riadky 26, 27 a
          29 (nezaplatené faktúry) dopĺňa Faktero samo — ručne len to, čo vo Fakteri nie je.
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
