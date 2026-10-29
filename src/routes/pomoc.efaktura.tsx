import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/efaktura")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — eFaktúra — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Ako si vo Fakteri zapnúť eFaktúru cez Portál finančnej správy, ako ju odoslať a ako spracovať prijaté eFaktúry.",
        ),
      },
      { property: "og:title", content: preloz(match.context.jazyk, "Pomoc — eFaktúra — Faktero") },
      {
        property: "og:description",
        content: preloz(
          match.context.jazyk,
          "eFaktúra vo Fakteri — zapnutie, odoslanie a príjem cez sieť Peppol.",
        ),
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
          Neplatiteľ DPH eFaktúry vystavovať nemusí, no prijať ich vedieť musí — aj na to stačí
          zapnúť eFaktúru vo Fakteri.
        </p>
        <p>
          Faktero je váš <strong>digitálny poštár</strong> — tak finančná správa volá poskytovateľa
          doručovacej služby. eFaktúry cez sieť Peppol odosielame aj prijímame naostro od{" "}
          <strong>13. 10. 2026</strong>. Vystavujete, posielate aj prijímate ich priamo vo Fakteri,
          bez ďalšieho programu a <strong>bez poplatku za odoslanú eFaktúru</strong>.
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
            Po registrácii vám príde e-mail. Ak vo Fakteri už máte firmu s rovnakým DIČ, eFaktúra
            sa pri nej zapne sama a e-mail to len potvrdí. Ak účet ešte nemáte, e-mail je pozvánka —
            po registrácii s tým istým DIČ sa eFaktúra k firme pripojí sama.
          </li>
        </ol>
        <p>
          Niektoré žiadosti od finančnej správy kontrolujeme ručne. Vtedy registrácia trvá dlhšie,
          no robiť nemusíte nič — e-mail príde, keď je hotová.
        </p>
        <p>
          Stav nájdete v <Link to="/efaktura">eFaktúra → Prehľad eFaktúry</Link>. Ak tam firma
          spárovaná nie je, hoci registrácia prebehla, kliknite na <strong>Spárovať</strong> —
          Faktero ju nájde podľa IČO.
        </p>
      </>
    ),
  },
  {
    id: "krok-za-krokom",
    title: "Aktivácia krok za krokom",
    body: (
      <>
        <p>
          Aktivácia sa nerobí vo Fakteri, ale na Portáli finančnej správy — tam si firma vyberá, kto
          jej bude eFaktúry doručovať. Zaberie to pár minút.
        </p>
        <p>
          <strong>Pripravte si:</strong> prístup do osobnej internetovej zóny na Portáli finančnej
          správy (prihlásenie občianskym preukazom s čipom alebo prihlasovacím menom a heslom) a DIČ
          firmy. DIČ nájdete vo Fakteri v <Link to="/efaktura">eFaktúra → Prehľad eFaktúry</Link> aj
          s tlačidlom na skopírovanie.
        </p>
        <p>
          Kým eFaktúra nie je zapnutá, je na prehľade eFaktúry časť{" "}
          <strong>Ako zapnúť eFaktúru</strong> s týmito krokmi, DIČ na skopírovanie a tlačidlom{" "}
          <strong>Otvoriť Portál finančnej správy</strong>. Dostanete sa tam aj z okna po
          prihlásení: <em>Mám prístup na Finančnú správu</em> → <em>Pokračovať na prepojenie</em>.
        </p>
        <ol>
          <li>
            Prihláste sa na <strong>Portál finančnej správy</strong> (financnasprava.sk) do osobnej
            internetovej zóny.
          </li>
          <li>Ak spravujete viac subjektov, prepnite sa na firmu, za ktorú eFaktúru zapínate.</li>
          <li>
            Otvorte časť <strong>eFaktúra</strong> a zvoľte výber poskytovateľa doručovacej služby.
          </li>
          <li>
            Zo zoznamu poskytovateľov vyberte <strong>Faktero</strong> a výber potvrďte.
          </li>
          <li>
            Finančná správa nám pošle údaje firmy a Faktero ju zaregistruje v sieti Peppol —
            zvyčajne do niekoľkých minút. Po registrácii vám príde e-mail.
          </li>
          <li>
            Vo Fakteri sa eFaktúra zapne sama. V{" "}
            <Link to="/efaktura">eFaktúra → Prehľad eFaktúry</Link> uvidíte Peppol ID firmy a od tej
            chvíle môžete eFaktúry posielať aj prijímať.
          </li>
        </ol>
        <p>
          Názvy položiek sa na portáli môžu mierne líšiť. Ak výber Faktera portál nedovolí, lebo
          firmu v sieti Peppol drží iný poskytovateľ, pokračujte časťou o migračnom kóde nižšie.
        </p>
      </>
    ),
  },
  {
    id: "ucetnik",
    title: "Za firmu to urobí účtovník",
    body: (
      <>
        <p>
          Ak na Portál finančnej správy prístup nemáte, výber poskytovateľa za vás urobí účtovník,
          ktorý má od firmy splnomocnenie na zastupovanie (to isté, s ktorým podáva priznania).
        </p>
        <ol>
          <li>
            Po prihlásení do Faktera sa ukáže okno{" "}
            <strong>Pripravte sa na e-Faktúru s Fakterom</strong>. V karte{" "}
            <em>Nemám prístup na Finančnú správu</em> kliknite na{" "}
            <strong>Zapojiť účtovníka</strong> a zadajte jeho e-mail.
          </li>
          <li>
            Účtovník dostane odkaz na stránku s návodom a údajmi firmy (názov, IČO, DIČ, IČ DPH,
            adresa). Odkaz platí 30 dní a funguje bez prihlásenia do Faktera.
          </li>
          <li>
            Keď účtovník na portáli Faktero vyberie, klikne na stránke na{" "}
            <strong>Hotovo, vybral som Faktero</strong> — vy to uvidíte v podrobnostiach pozvánky.
          </li>
          <li>
            Kým aktivácia nie je dokončená, vidíte hore pás{" "}
            <strong>Čakáme na aktiváciu e-fakturácie vaším účtovníkom</strong>. Cez{" "}
            <strong>Podrobnosti</strong> odkaz skopírujete, pozvánku zrušíte alebo zvolíte{" "}
            <em>Aktivujem sám</em>.
          </li>
          <li>
            Keď Finančná správa výber potvrdí, eFaktúra sa vo Fakteri zapne sama a pás zmizne.
          </li>
        </ol>
        <p>
          Ak e-mail s pozvánkou neodíde, pozvánka platí ďalej — odkaz sa zobrazí priamo v okne a
          pošlete ho účtovníkovi sami. Zaškrtnutím <em>Pozvať ho aj do Faktera ako účtovníka</em>{" "}
          dostane účtovník aj prístup k dokladom firmy.
        </p>
      </>
    ),
  },
  {
    id: "prechod",
    title: "Prechod od iného poskytovateľa (migračný kód)",
    body: (
      <>
        <p>
          V sieti Peppol môže byť firma len u <strong>jedného poskytovateľa</strong> — u toho jej
          eFaktúry chodia. Ak je vaša firma už zaregistrovaná u{" "}
          <strong>iného poskytovateľa</strong>, výber Faktera na Portáli finančnej správy sám nestačí: registrácia sa nedokončí a
          eFaktúra sa vo Fakteri nezapne. Na prechod treba <strong>migračný kód</strong>.
        </p>
        <ol>
          <li>
            Migračný kód si vypýtajte u <strong>súčasného poskytovateľa</strong> eFaktúr (v jeho
            aplikácii alebo na jeho podpore). Vydá ho len vám ako vlastníkovi firmy.
          </li>
          <li>
            Kód pošlite na <Link to="/podpora">podporu Faktera</Link> spolu s názvom firmy a DIČ.
            Kód je dôverný — nikomu inému ho neposielajte.
          </li>
          <li>
            Firmu prevezmeme a dáme vám vedieť. Od tej chvíle vám eFaktúry chodia do Faktera a u
            pôvodného poskytovateľa sa firma zo siete Peppol odpojí.
          </li>
        </ol>
        <p>
          Kód má obmedzenú platnosť. Ak vyprší alebo ho poskytovateľ odmietne, treba si vypýtať
          nový.
        </p>
      </>
    ),
  },
  {
    id: "len-odosielanie",
    title: "Len odosielanie (príjem u iného poskytovateľa)",
    body: (
      <>
        <p>
          Ak eFaktúry <strong>prijímate u iného poskytovateľa</strong> a nechcete to meniť, môžete ich
          z Faktera len <strong>odosielať</strong>. Príjem ostáva tam, kde je — v sieti Peppol sa pre
          vašu firmu nič neprepisuje a migračný kód netreba.
        </p>
        <ol>
          <li>
            Napíšte na <Link to="/podpora">podporu Faktera</Link>, že chcete len odosielanie. Žiadosť
            u nášho partnera ePošták založíme za vás.
          </li>
          <li>
            Na Portáli finančnej správy vyberte <strong>ePošťák</strong> ako poštára na{" "}
            <strong>odosielanie</strong> — <strong>nie Faktero</strong>; Faktero sa vyberá len vtedy,
            keď u nás eFaktúry aj prijímate. Poštára na príjem nemeníte — výber slúži len na overenie,
            že firma smie používať svoje Peppol ID.
          </li>
          <li>
            Na kontaktný e-mail z portálu vám príde správa — v nej potvrďte prepojenie s Fakterom.
          </li>
          <li>
            Odosielanie sa potom zapne samo a dáme vám vedieť e-mailom. Na stránke eFaktúra uvidíte
            štítok <strong>Len odosielanie</strong>.
          </li>
        </ol>
        <p>
          Čo v tomto režime nejde: <strong>prijaté eFaktúry</strong> sa vo Fakteri nezobrazia a
          neuvidíte tu ani <strong>odpovede odberateľov</strong> na vaše faktúry (prijatie alebo
          zamietnutie) — obe dostávate u poskytovateľa príjmu. Stav doručenia odoslaných faktúr vo
          Fakteri vidíte. Údaje o odoslaných faktúrach hlási finančnej správe náš partner, o
          prijatých váš poskytovateľ príjmu.
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
          Faktúru vystavíte ako doteraz. Na jej detaile je hlavné tlačidlo{" "}
          <strong>Odoslať eFaktúru</strong> (e-mail je vedľa neho). Otvorí sa okno, v ktorom
          vyberiete, čo pôjde s faktúrou:
        </p>
        <ul>
          <li>
            <strong>Priložiť PDF faktúry</strong> — zapnuté vopred, odberateľ uvidí faktúru tak, ako
            ju poznáte.
          </li>
          <li>
            <strong>Prílohy dokladu</strong> — súbory nahraté k faktúre (výkaz práce, dodací list…)
            zaškrtnete jednotlivo. Prejdú PDF, PNG, JPG, CSV, XLSX a ODS, najviac 20 súborov, 10 MB
            na súbor a 15 MB spolu. Čo sa poslať nedá, okno povie hneď.
          </li>
        </ul>
        <p>
          Pred odoslaním overí, či je <strong>odberateľ v sieti Peppol</strong>. Ak nie je, povie to
          hneď — faktúra by inak odišla do prázdna. Odberateľ potrebuje vyplnené DIČ alebo IČ DPH,
          podľa nich sa v sieti hľadá.
        </p>
        <p>
          <strong>Kontrola eFaktúry:</strong> po otvorení okna sa faktúra sama skontroluje podľa
          pravidiel EN 16931 a Peppol BIS. Zelené <strong>Kontrola prešla</strong> znamená, že je v
          poriadku. Pri chybe okno vypíše, čo opraviť (s odkazom na pravidlo), a tlačidlo Odoslať
          ostane zablokované; varovania odoslaniu nebránia. Pri hromadnom odoslaní sa faktúry s
          chybou preskočia.
        </p>
        <p>
          <strong>Viac faktúr naraz:</strong> v zozname faktúr ich zaškrtnite a v lište hore zvoľte{" "}
          <strong>Odoslať eFaktúrou</strong>. Odídu s PDF faktúry; koncepty, storná, zálohové a už
          odoslané sa preskočia. Ďalšie prílohy pošlite jednotlivo z detailu faktúry.
        </p>
        <p>
          Odoslanie sa nedá vziať späť. Chybu na odoslanej faktúre opravíte dobropisom alebo
          ťarchopisom, ktoré tiež odídu ako eFaktúra.
        </p>
        <p>
          Cez eFaktúru sa neposielajú <strong>zálohové faktúry</strong> (nie sú daňovým dokladom —
          pošlite ich e-mailom, daňový doklad k prijatej platbe už áno) ani faktúry{" "}
          <strong>súkromným osobám</strong> bez IČO a DIČ.
        </p>
      </>
    ),
  },
  {
    id: "stav",
    title: "Kde vidím, či eFaktúra odišla",
    body: (
      <>
        <ul>
          <li>
            V <Link to="/faktury">zozname faktúr</Link> má faktúra štítok <strong>eFaktúra</strong>.
            Po prejdení myšou ukáže, či je odoslaná, doručená (aj kedy), alebo či odoslanie zlyhalo.
          </li>
          <li>
            Na detaile faktúry je namiesto tlačidla stav <em>eFaktúra odoslaná</em> alebo{" "}
            <em>eFaktúra doručená</em>.
          </li>
          <li>
            Všetky odoslané doklady sú v{" "}
            <Link to="/efaktura/odoslane">eFaktúra → Odoslané eFaktúry</Link> a v{" "}
            <Link to="/efaktura/dorucenia">Doručeniach</Link> vidíte, kedy si ich odberateľ
            prevzal.
          </li>
        </ul>
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
            <strong>Prílohy</strong> ukážu, čo dodávateľ k eFaktúre priložil (PDF, výkazy, dodacie
            listy), a každú si stiahnete.
          </li>
          <li>
            <strong>Zaevidovať</strong> z nej spraví{" "}
            <Link to="/prijate-faktury">prijatú faktúru</Link> aj s PDF v prílohe — netreba nič
            prepisovať. Potom ju zaúčtujete, uhradíte alebo pošlete do Pohody ako každú inú.
          </li>
          <li>
            <strong>Kontrola</strong> — každú prijatú eFaktúru Faktero hneď skontroluje podľa EN
            16931 a Peppol BIS 3.0 a v zozname ukáže „Kontrola: OK“, počet varovaní alebo chýb.
            Kliknutím na odznak uvidíte nálezy s kódom pravidla. eFaktúra s chybami sa prijme tiež;
            pri zaevidovaní sa Faktero opýta, či ju naozaj chcete zaevidovať, a na prijatej faktúre
            ostane upozornenie. Chyby sú na strane dodávateľa — dajte mu o nich vedieť.
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
    id: "xml",
    title: "XML na stiahnutie a kontrola",
    body: (
      <>
        <p>
          Na odoslanie XML nepotrebujete — Faktero ho pripraví samo. Ak ho chcete vidieť alebo
          poslať účtovníkovi, na detaile faktúry otvorte ponuku <strong>…</strong> (Ďalšie akcie):
        </p>
        <ul>
          <li>
            <strong>Vygenerovať eFaktúru XML</strong> pripraví XML a skontroluje ho podľa normy. Ak
            niečo chýba, povie, koľko chýb našiel.
          </li>
          <li>
            <strong>Stiahnuť eFaktúru XML</strong> stiahne súbor vo formáte UBL aj s PDF faktúry
            vloženým vo vnútri.
          </li>
        </ul>
        <p>
          Akékoľvek XML e-faktúry — vlastné, od dodávateľa alebo z iného programu — skontrolujete v{" "}
          <Link to="/efaktura/kontrola">eFaktúra → Kontrola XML</Link>. Uvidíte chyby a varovania
          podľa EN 16931, Peppol BIS 3.0 a slovenských pravidiel, každú s kódom pravidla (napríklad
          BR-CO-15) a miestom v súbore. Súbor sa kontroluje len vo vašom prehliadači. Bez
          prihlásenia je kontrola aj na stránke{" "}
          <Link to="/nastroje/kontrola-efaktury">Kontrola e-faktúry</Link>.
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
          Dobropis odchádza ako samostatný doklad <strong>CreditNote (typ 381)</strong> a nesie
          číslo pôvodnej faktúry (pole BT-25) — finančná správa to vyžaduje. Bez vyplnenej pôvodnej
          faktúry ho Faktero neodošle. Opravný doklad s kladnou sumou (napríklad vrátenie opravy
          podľa § 25a) ide ako ťarchopis (typ 383).
        </p>
        <p>
          Opravný doklad pri nezaplatenej faktúre podľa <Link to="/pomoc/vykazy-dph">§ 25a</Link>{" "}
          pošlete odberateľovi aj cez eFaktúru — odíde ako dobropis s číslom pôvodnej faktúry.
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
    id: "nemecko",
    title: "Firma v Nemecku",
    body: (
      <>
        <p>
          Nemecká firma má vo Fakteri vlastné e-faktúry — <strong>ZUGFeRD</strong> v PDF a{" "}
          <strong>XRechnung</strong> na stiahnutie. Tie Faktero cez sieť Peppol neodosiela. Všetko
          o nich je v manuáli <Link to="/pomoc/nemecko">Nemecko</Link>.
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
  {
    id: "co-nevie",
    title: "Čo Faktero nerobí",
    body: (
      <>
        <ul>
          <li>
            Neodošle ani neprijme eFaktúru za firmu, ktorá je v sieti Peppol u iného poskytovateľa.
            Najprv treba prechod migračným kódom (pozri vyššie).
          </li>
          <li>
            Neposiela cez eFaktúru zálohové faktúry a faktúry súkromným osobám — tie idú e-mailom.
          </li>
          <li>Odoslanú eFaktúru nevie vziať späť ani zmeniť; opravuje sa dobropisom.</li>
        </ul>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
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
