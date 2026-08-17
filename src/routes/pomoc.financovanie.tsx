import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/financovanie")({
  head: () => ({
    meta: [
      { title: "Pomoc — Leasingy a úvery — Faktero" },
      {
        name: "description",
        content:
          "Leasingy a úvery vo Faktere: splátkový kalendár s rozpadom na istinu, úrok a DPH, načítanie zmluvy z PDF a párovanie splátok s platbami z banky.",
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
          Že vám každý mesiac odišlo 399,99 €, viete aj z výpisu. Účtovníčka ale potrebuje vedieť,{" "}
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
          <strong>DPH v splátke</strong> (pri leasingu obvykle 23 %) a{" "}
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
];

function Page() {
  return (
    <HelpArticle
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
