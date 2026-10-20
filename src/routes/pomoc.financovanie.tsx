import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/financovanie")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Leasingy a úvery — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Leasingy, úvery a kontokorent vo Faktere: splátkový kalendár s rozpadom na istinu, úrok a DPH, načítanie zmluvy z PDF, párovanie splátok s platbami z banky a úroky z kontokorentu.",
        ),
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/financovanie" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/financovanie" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo to je",
    body: (
      <>
        <p>
          Že vám každý mesiac odišlo 399,99 €, viete aj z výpisu. Účtovníčka ale potrebuje vedieť,{" "}
          <strong>koľko z tej sumy bola istina, koľko úrok a koľko DPH</strong> — a aký zostatok
          dlhu ostal na konci roka. To z výpisu nevyčítate.
        </p>
        <p>
          Faktero preto zo zmluvy vyrobí celý splátkový kalendár s týmto rozpadom a odchádzajúce
          platby z banky si k jednotlivým splátkam páruje samo. Nájdete to v{" "}
          <Link to="/financovanie">Banka → Leasingy a úvery</Link>.
        </p>
      </>
    ),
  },
  {
    id: "nova-zmluva",
    title: "Zapísanie zmluvy",
    body: (
      <>
        <p>
          <Link to="/financovanie/nova">Nová zmluva</Link> sa dá vyplniť dvomi spôsobmi — ručne
          alebo nahratím dokumentu.
        </p>
        <p>Ručne stačí päť údajov:</p>
        <ul>
          <li>
            <strong>Financovaná suma (istina)</strong> — koľko vám požičali, teda cena bez
            akontácie.
          </li>
          <li>
            <strong>Úrok % p. a.</strong> — ročná sadzba zo zmluvy. Nula je v poriadku, bezúročné
            splátky u predajcov sú bežné.
          </li>
          <li>
            <strong>Počet splátok</strong> a <strong>dátum prvej splátky</strong>.
          </li>
          <li>
            <strong>Variabilný symbol splátok</strong> — podľa neho sa neskôr páruje banka. Bez neho
            párovanie funguje oveľa horšie, oplatí sa ho vyplniť.
          </li>
        </ul>
        <p>
          Nepovinné je <strong>akontácia</strong>, <strong>zostatková cena</strong>,{" "}
          <strong>DPH v splátke</strong> (pri leasingu obvykle 23 %) a{" "}
          <strong>splátka zo zmluvy</strong> — tú vyplňte vtedy, keď chcete, aby kalendár sedel na
          cent s papierom; inak si ju Faktero dopočíta.
        </p>
      </>
    ),
  },
  {
    id: "z-pdf",
    title: "Načítanie zmluvy z PDF",
    body: (
      <>
        <p>
          Namiesto vypĺňania môžete zmluvu jednoducho nahrať. Faktero z nej prečíta hlavičku aj{" "}
          <strong>celý splátkový kalendár</strong>, ak je v dokumente uvedený — vtedy sa nič
          neprepočítava a v hlavičke zmluvy svieti „kalendár prevzatý z dokumentu“.
        </p>
        <p>
          Nahrať sa dá <strong>viac súborov naraz</strong>. Leasingovky často posielajú zmluvu a
          splátkový kalendár ako dva samostatné PDF — označte oba a prečítané údaje sa spoja.
        </p>
        <p>
          Čítanie trvá pol minúty až minútu a beží na pozadí; stránka počas neho ukazuje, koľko
          sekúnd už ubehlo. Zavrieť ju medzitým nemôžete.
        </p>
        <p>
          Prečítané údaje sú <strong>vždy len návrh</strong> — pred uložením si ich prejdite. Ak si
          Faktero niečím nie je isté, napíše to nad formulárom ako výhradu: napríklad že sa v
          kalendári opakuje ten istý dátum, že medzi dvomi splátkami je nezvyčajne veľká medzera
          alebo že sa splatnosť prvej splátky v dokumente vôbec nenašla.
        </p>
        <p>
          Nahratý dokument ostáva uložený pri zmluve a otvoríte ho tlačidlom <strong>Zmluva</strong>{" "}
          v hlavičke — aj keď sa z neho prečítať nič nepodarilo.
        </p>
      </>
    ),
  },
  {
    id: "kalendar",
    title: "Ako sa kalendár počíta",
    body: (
      <>
        <p>
          Počíta sa anuita: splátka je po celý čas rovnaká, mení sa len jej zloženie. Na začiatku je
          v nej najviac úroku, na konci najviac istiny.
        </p>
        <p>
          Úrok sa predvolene počíta zo <strong>skutočného počtu dní</strong> v období (ACT/365) —
          tak to robia slovenské banky. Preto úrok neklesá plynulo: mesiac s 31 dňami má vyšší úrok
          než predchádzajúci tridsaťdňový. Ak vaša zmluva počíta rovnakými mesiacmi, prepnite{" "}
          <strong>Výpočet úroku</strong> na 30/360.
        </p>
        <p>
          <strong>Posledná splátka sa dorovnáva.</strong> Keby sa každý riadok počítal nezávisle,
          súčet istín by sa o pár centov rozišiel s financovanou sumou a ten rozdiel by v
          účtovníctve visel navždy. Posledná splátka preto dostane presne toľko istiny, koľko
          zvýšilo — na cent.
        </p>
        <p>
          Keď zmluvu upravíte, kalendár sa prepočíta — ale{" "}
          <strong>už zaplatené splátky sa nikdy neprepíšu</strong>. Oprava úroku vám teda nezahodí
          spárované platby.
        </p>
      </>
    ),
  },
  {
    id: "parovanie",
    title: "Párovanie s bankou",
    body: (
      <>
        <p>
          Po každom stiahnutí pohybov z <Link to="/pomoc/banka">banky</Link> Faktero prejde
          odchádzajúce platby a skúsi ich priradiť k splátkam. Ručne to spustíte tlačidlom{" "}
          <strong>Spárovať s bankou</strong> na detaile zmluvy.
        </p>
        <p>
          Automaticky sa spáruje len platba, ktorú niečo <strong>identifikuje</strong> — sedí
          variabilný symbol zmluvy alebo meno leasingovky v protistrane — <strong>a zároveň</strong>{" "}
          sedí suma presne na cent.
        </p>
        <p>
          Prečo tak prísne: splátky sú každý mesiac rovnaké. Dva leasingy s podobnou splátkou od tej
          istej leasingovky by sa inak pomiešali a peniaze by sedeli na cudzej zmluve. Preto všetko
          ostatné — trochu iná suma, žiadny variabilný symbol, dve rovnako dobré možnosti — končí v
          žltom rámiku <strong>„Platby, ktoré sem asi patria“</strong>. Pri každom návrhu je
          napísané, prečo si Faktero myslí, že tam patrí; priradíte ho jedným kliknutím.
        </p>
        <p>
          Splátku viete označiť za zaplatenú aj bez banky a spárovanie kedykoľvek zrušiť — vtedy sa
          platba vráti medzi nespárované.
        </p>
      </>
    ),
  },
  {
    id: "nenaslo",
    title: "Nenašlo to žiadnu platbu",
    body: (
      <>
        <p>Keď párovanie nič nenájde, povie prečo. Sú dve možnosti:</p>
        <ul>
          <li>
            <strong>„V banke nie sú žiadne nespárované odchádzajúce platby.“</strong> — buď účet nie
            je pripojený, alebo z neho zatiaľ nie sú stiahnuté pohyby. Skontrolujte{" "}
            <Link to="/bankove-ucty">Bankové účty</Link>.
          </li>
          <li>
            <strong>„Prezrelo sa N platieb a ani jedna nesedí.“</strong> — platby v banke sú, ale
            nič ich nespája so zmluvou. Skoro vždy je to nevyplnený alebo preklepnutý{" "}
            <strong>variabilný symbol splátok</strong>, prípadne iná suma, než akú má kalendár.
          </li>
        </ul>
        <p>
          Pozor aj na dátumy: platba sa k splátke priradí len vtedy, keď je do 45 dní od jej
          splatnosti. Splátky staršie, než dokedy banka vydá históriu pohybov (spravidla rok až
          pätnásť mesiacov dozadu), preto ostanú neoznačené — tie označte ručne.
        </p>
      </>
    ),
  },
  {
    id: "prehlad",
    title: "Čo na zmluve uvidíte",
    body: (
      <>
        <p>
          Na detaile sú štyri čísla: <strong>financovaná suma</strong>,{" "}
          <strong>zaplatíte spolu</strong>, <strong>z toho úrok</strong> a{" "}
          <strong>zostáva splatiť</strong>. Pod nimi je celý kalendár — splátka, istina, úrok, DPH
          (ak je v splátke), zostatok istiny a stav. Nezaplatená splátka po splatnosti je červená.
        </p>
        <p>
          Na zozname zmlúv je hore súčet <strong>zostáva splatiť</strong> za všetky aktívne zmluvy —
          to je vaša záväzková situácia z leasingov a úverov jedným číslom.
        </p>
      </>
    ),
  },
  {
    id: "kontokorent",
    title: "Kontokorentný úver",
    body: (
      <>
        <p>
          Kontokorent (povolené prečerpanie, úverový rámec k bežnému účtu) je iný než leasing a
          úver: <strong>nemá splátkový kalendár</strong>. Banka vám na bežnom účte povolí ísť do
          mínusu do výšky limitu, raz za mesiac alebo štvrťrok z účtu strhne{" "}
          <strong>úrok z vyčerpanej sumy</strong> a prípadne <strong>poplatok za rámec</strong>.
          Istinu „splácajú“ samotné príjmy na účet.
        </p>
        <p>
          Pri novej zmluve zvoľte druh <strong>Kontokorentný úver</strong>. Polia splátkového
          kalendára sa skryjú a vyplníte <strong>úverový rámec</strong>, <strong>účet</strong>, na
          ktorom rámec je, <strong>úrok % p. a.</strong>, <strong>poplatok za rámec ročne</strong>,
          dokedy rámec platí a ako často banka úrok strhne. Pri pohyblivej sadzbe (napr. 1M EURIBOR
          + marža) zvoľte <strong>Pohyblivá</strong> — pozri časť Pohyblivá úroková sadzba nižšie.
        </p>
        <p>
          Nahratú zmluvu o kontokorente Faktero spozná samo — aj keď ju banka nazve „úver“: úver bez
          splátkového kalendára s rámcom k bežnému účtu je kontokorent. Vyčíta limit, sadzbu (aj
          referenčný index a maržu), poplatok, platnosť a IBAN účtu a podľa IBAN zmluvu priradí k
          napojenému účtu.
        </p>
        <p>
          Na detaile kontokorentu vidíte <strong>limit</strong>, <strong>čerpanie</strong> (mínus na
          napojenom účte podľa posledného zostatku z banky), <strong>voľný rámec</strong> a zoznam{" "}
          <strong>úrokov a poplatkov, ktoré banka strhla</strong>. Ak účet nie je napojený, čerpanie
          Faktero nepozná a napíše „zostatok účtu nie je známy“.
        </p>
        <p>
          Úroky a poplatky sa k zmluve párujú samy po stiahnutí pohybov z banky — ale len z{" "}
          <strong>účtu, na ktorom je rámec</strong>, a len keď text pohybu o kontokorente výslovne
          hovorí („úrok z kontokorentu“, „debetný úrok“, „úrok z povoleného prečerpania“, „poplatok
          za úverový rámec“…). Holé „Úroky“ na tom účte uvidíte ako návrh na potvrdenie. Poplatok za
          vedenie účtu a splátky bežného úveru či leasingu (tie majú vlastný kalendár a variabilný
          symbol) sa ku kontokorentu nepriradia nikdy.
        </p>
        <p>
          Do účtovníctva: úrok je finančný náklad (562), poplatok za rámec ostatný finančný náklad
          (568). Pri prevode výpisu do Pohody ich Faktero označí ako <em>Úrok</em> a{" "}
          <em>Bankový poplatok</em> a dostanú predkontáciu, ktorú pre tieto označenia nastavíte.
          Čerpaný kontokorent je krátkodobý bankový úver (231) — to je stav účtu, nie platba, takže
          sa ako splátka nevyváža.
        </p>
      </>
    ),
  },
  {
    id: "pohybliva-sadzba",
    title: "Pohyblivá úroková sadzba",
    body: (
      <>
        <p>
          Veľa úverov a kontokorentov nemá pevný úrok, ale <strong>referenčný index + maržu</strong>{" "}
          — napríklad „1M EURIBOR + 4,3 % p. a.“. Index sa mení raz za obdobie fixácie (mesačne,
          štvrťročne…) a s ním aj úrok. Keby ste do zmluvy zapísali len maržu, Faktero by úrok
          počítalo príliš nízky.
        </p>
        <p>
          V zmluve preto pri úrokovej sadzbe zvoľte <strong>Pohyblivá</strong> a vyplňte:
        </p>
        <ul>
          <li>
            <strong>Referenčný index</strong> — 1M, 3M, 6M alebo 12M EURIBOR, €STR, alebo PRIBOR
            (1M, 3M, 6M, 1R) pri českých úveroch.
          </li>
          <li>
            <strong>Marža</strong> — prirážka banky tak, ako je v zmluve (po prípadnom zvýhodnení).
          </li>
          <li>
            <strong>Dolná hranica indexu</strong> — keď zmluva hovorí, že záporný index sa považuje
            za nulu, zadajte 0. Bez hranice nechajte prázdne.
          </li>
          <li>
            <strong>Sadzba sa mení</strong> a <strong>index sa určuje</strong> — napríklad mesačne,
            „2 pracovné dni pred začiatkom obdobia fixácie“ (to je najčastejšie znenie), alebo ako
            priemer za predchádzajúci mesiac.
          </li>
          <li>
            <strong>Výpočet úroku</strong> — pri úveroch s EURIBORom banky takmer vždy počítajú „rok
            s 360 dňami a skutočný počet dní“, teda ACT/360. Pri rovnakej sadzbe vychádza úrok o 1,4
            % vyšší než pri ACT/365.
          </li>
        </ul>
        <p>
          Nahratú zmluvu Faktero prečíta samo — index, maržu, dolnú hranicu, fixing aj spôsob
          výpočtu vyplní do týchto polí.
        </p>
        <p>
          Hodnoty indexov si Faktero každé ráno stiahne: <strong>EURIBOR</strong> z Európskej
          centrálnej banky, <strong>€STR</strong> tiež z ECB a <strong>PRIBOR</strong> z ČNB. Na
          detaile zmluvy uvidíte napríklad „Aktuálna sadzba: 1M EURIBOR 1,920 % (priemer za
          september 2026) + marža 4,30 % = 6,22 % p. a.“ a pod tým históriu sadzby po obdobiach.
        </p>
        <p>
          <strong>Pozor, pri EURIBORe je to odhad.</strong> Denný EURIBOR sa zadarmo strojovo získať
          nedá — verejne dostupný je len mesačný priemer. Zmluva však index berie k presnému dňu
          fixingu, takže sa vypočítaná sadzba môže od skutočnej líšiť o pár stotín percenta.
          Skutočný úrok vždy určuje banka. Keď index k dňu fixingu ešte nie je zverejnený, Faktero
          použije posledný známy a označí výsledok ako predbežný.
        </p>
        <p>
          Preto sa dá sadzba za každé obdobie <strong>zadať ručne</strong> (ceruzka v histórii
          sadzby) — keď vám banka sadzbu oznámi, alebo keď ju chcete zosúladiť so skutočne strhnutým
          úrokom. Ručná sadzba prepíše vypočítanú za celé obdobie fixácie a dá sa vrátiť späť.
        </p>
        <p>
          Pri kontokorente Faktero počíta aj <strong>vypočítaný úrok</strong> za každý mesiac — z
          čerpania na konci každého dňa (zostatok účtu a pohyby z banky) — a porovná ho s úrokom,
          ktorý banka naozaj strhla. Rozdiel je najlepšia kontrola: keď sedí na pár centov, sadzba
          aj fixing sú v poriadku. Keď nesedí, tlačidlom <strong>Prevziať sadzbu</strong> si uložíte
          sadzbu, ktorá zo strhnutého úroku vyplýva.
        </p>
        <p>
          Pri splátkovom úvere s pohyblivou sadzbou sa kalendár počíta so sadzbou platnou pri
          uložení zmluvy. Keď banka po zmene indexu oznámi novú splátku, zmluvu otvorte a uložte —
          nezaplatené splátky sa prepočítajú s dnešnou sadzbou.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Leasingy a úvery"
      title="Leasingy a úvery"
      intro={
        <p>
          Splátkový kalendár s rozpadom na istinu, úrok a DPH — načítaný zo zmluvy a párovaný s
          platbami z banky.
        </p>
      }
      sections={sections}
    />
  );
}
