import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/efaktura")({
  head: () => ({
    meta: [
      { title: "Pomoc — eFaktúra — Faktero" },
      {
        name: "description",
        content:
          "Ako si vo Fakteri zapnúť eFaktúru cez Portál finančnej správy, ako ju odoslať a ako spracovať prijaté eFaktúry.",
      },
      { property: "og:title", content: "Pomoc — eFaktúra — Faktero" },
      {
        property: "og:description",
        content: "eFaktúra vo Fakteri — zapnutie, odoslanie a príjem cez sieť Peppol.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/efaktura" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/efaktura" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "co-je",
    title: "Čo je eFaktúra",
    body: (
      <>
        <p>
          eFaktúra je <strong>elektronický doklad v štruktúrovanej podobe</strong> (XML podľa normy{" "}
          <code>EN 16931</code>), ktorý sa doručuje cez sieť <strong>Peppol</strong> — nie e-mailom
          ako PDF. Od <strong>1. 1. 2027</strong> ju musia platitelia DPH na Slovensku používať pri
          faktúrach medzi firmami.
        </p>
        <p>
          Faktero je napojené na sieť Peppol cez certifikovaný prístupový bod. eFaktúry vystavujete,
          posielate aj prijímate priamo vo Fakteri — žiadny ďalší program netreba.
        </p>
      </>
    ),
  },
  {
    id: "zapnutie",
    title: "Ako si eFaktúru zapnúť",
    body: (
      <>
        <ol>
          <li>
            Prihláste sa na <strong>Portál finančnej správy</strong> do osobnej internetovej zóny a
            v časti <strong>eFaktúra</strong> vyberte ako poskytovateľa doručovacej služby{" "}
            <strong>Faktero</strong>.
          </li>
          <li>
            Finančná správa nám pošle údaje vašej firmy a Faktero ju zaregistruje v sieti Peppol —
            zvyčajne do niekoľkých minút.
          </li>
          <li>
            Keď je registrácia hotová, eFaktúra sa vo Fakteri zapne sama pri firme s rovnakým DIČ.
            Ak vo Fakteri ešte účet nemáte, príde vám e-mailom pozvánka — po registrácii s tým istým
            DIČ sa eFaktúra k firme pripojí automaticky.
          </li>
        </ol>
        <p>
          Stav nájdete v <Link to="/efaktura">eFaktúra → Prehľad eFaktúry</Link>. Ak tam firma
          spárovaná nie je, hoci registrácia prebehla, kliknite na <strong>Spárovať</strong> —
          Faktero ju nájde podľa IČO.
        </p>
      </>
    ),
  },
  {
    id: "odoslanie",
    title: "Odoslanie eFaktúry",
    body: (
      <>
        <p>
          Faktúru vystavíte ako doteraz a na jej detaile kliknete na{" "}
          <strong>Odoslať eFaktúru</strong>. Faktero z nej vytvorí XML, skontroluje ho podľa normy a
          pošle odberateľovi.
        </p>
        <p>
          Pred odoslaním overí, či je <strong>odberateľ v sieti Peppol</strong>. Ak nie je, povie to
          hneď — faktúra by inak odišla do prázdna. Odberateľ potrebuje vyplnené DIČ alebo IČ DPH,
          podľa nich sa v sieti hľadá.
        </p>
        <p>
          Odoslané doklady sú v <Link to="/efaktura/odoslane">eFaktúra → Odoslané eFaktúry</Link> a
          v <Link to="/efaktura/dorucenia">Doručeniach</Link> vidíte, kedy si ich odberateľ prevzal.
        </p>
      </>
    ),
  },
  {
    id: "prijem",
    title: "Prijaté eFaktúry",
    body: (
      <>
        <p>
          eFaktúry od dodávateľov pribúdajú v{" "}
          <Link to="/efaktura/prijate">eFaktúra → Prijaté eFaktúry</Link> samy; tlačidlom{" "}
          <strong>Stiahnuť nové</strong> ich načítate hneď.
        </p>
        <ul>
          <li>
            <strong>Náhľad</strong> ukáže eFaktúru ako bežnú faktúru v PDF. Ak dodávateľ priložil
            vlastné PDF, uvidíte jeho; inak ju Faktero vykreslí z údajov eFaktúry.
          </li>
          <li>
            <strong>Zaevidovať</strong> z nej spraví{" "}
            <Link to="/prijate-faktury">prijatú faktúru</Link> aj s PDF v prílohe — netreba nič
            prepisovať. Potom ju zaúčtujete, uhradíte alebo pošlete do Pohody ako každú inú.
          </li>
        </ul>
        <p>
          Ak tá istá faktúra prišla aj inou cestou (napríklad e-mailom), Faktero ju nezaloží druhý
          raz, ale eFaktúru pripojí k existujúcej.
        </p>
      </>
    ),
  },
  {
    id: "nie-pdf",
    title: "eFaktúra nie je PDF",
    body: (
      <>
        <p>
          PDF je obrázok faktúry pre ľudí. eFaktúra je <strong>XML súbor pre stroje</strong> —
          účtovný systém príjemcu ho spracuje bez ručného prepisovania. Právne záväzná je eFaktúra;
          PDF môže ísť len ako príloha na pozretie.
        </p>
      </>
    ),
  },
  {
    id: "dobropis",
    title: "Dobropis a samofaktúra cez eFaktúru",
    body: (
      <>
        <p>
          Dobropis odchádza ako samostatný doklad <strong>CreditNote (typ 381)</strong> a nesie číslo
          pôvodnej faktúry (pole BT-25) — finančná správa to vyžaduje. Bez vyplnenej pôvodnej
          faktúry ho Faktero neodošle. Opravný doklad s kladnou sumou (napríklad vrátenie opravy
          podľa § 25a) ide ako ťarchopis (typ 383).
        </p>
        <p>
          Prijatý dobropis sa pri zaevidovaní uloží medzi prijaté faktúry so zápornou sumou a s
          číslom faktúry, ktorú opravuje — do výkazu DPH tak ide ako oprava odpočtu, nie ako ďalší
          nákup.
        </p>
        <p>
          Odsúhlasenú <Link to="/pomoc/prijate-faktury">samofaktúru</Link> pošlete dodávateľovi aj
          cez eFaktúru tlačidlom <em>Poslať cez eFaktúru</em> na jej detaile (typ self-billing).
        </p>
      </>
    ),
  },
  {
    id: "readiness",
    title: "Skóre pripravenosti",
    body: (
      <>
        <p>
          V <Link to="/efaktura">eFaktúra → Prehľad eFaktúry</Link> vidíte{" "}
          <strong>skóre pripravenosti</strong> a zoznam toho, čo ešte chýba — napríklad vyplnené
          údaje firmy, IČ DPH pri platiteľovi DPH alebo Peppol ID. Čím vyššie skóre, tým menej
          prekvapení pri prvej eFaktúre.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · eFaktúra"
      title="Elektronická fakturácia (eFaktúra)"
      intro={
        <p>
          Zapnutie eFaktúry cez Portál finančnej správy, odosielanie a príjem eFaktúr cez sieť
          Peppol.
        </p>
      }
      sections={sections}
    />
  );
}
