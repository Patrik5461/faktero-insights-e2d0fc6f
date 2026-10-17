import { Fragment, type ReactNode } from "react";
import { useT } from "@/lib/i18n/useT";
import type { VendorId } from "@/components/faktero/VendorImportPage";

/**
 * Jeden zoznam systémov, z ktorých sa dá do Faktera prejsť.
 *
 * Návody boli predtým rozpísané v ôsmich stránkach a menu malo osem položiek.
 * Teraz ich drží toto miesto a stránka `Účtovné importy` si z neho vyberá —
 * rovnako, ako si účtovné exporty vyberajú formát z rozbaľovačky.
 *
 * SuperFaktúra a prijaté doklady majú vlastnú stránku: prvá dáva ZIP
 * s priraďovaním stĺpcov, druhá berie viac súborov naraz aj skeny. V zozname
 * preto majú `cesta` namiesto `accept`.
 */
export type ImportZdroj = {
  id: VendorId | "superfaktura" | "doklady";
  /** Krátky názov do rozbaľovačky. */
  label: string;
  title: string;
  description: string;
  /** Prípony, ktoré stránka prijme — chýba pri zdrojoch s vlastnou stránkou. */
  accept?: string;
  /** Vlastná stránka, keď sa import nedá spraviť tým istým formulárom. */
  cesta?: string;
  guide: ReactNode;
};

/**
 * Preložený text s vloženými prvkami: `{x}` v kľúči sa nahradí `casti.x`.
 * Kľúčom ostáva celá veta, aby sa v nemčine dal zmeniť slovosled.
 */
function Veta({ k, casti = {} }: { k: string; casti?: Record<string, ReactNode> }) {
  const { t } = useT();
  const kusy = t(k).split(/\{(\w+)\}/);
  return (
    <>
      {kusy.map((kus, i) =>
        i % 2 ? <Fragment key={i}>{casti[kus] ?? `{${kus}}`}</Fragment> : kus,
      )}
    </>
  );
}

// Cesty v menu cudzích programov sa neprekladajú — program ich ukazuje po slovensky.
const S = ({ k }: { k: string }) => <strong>{k}</strong>;
const E = ({ k }: { k: string }) => <em>{k}</em>;

function NavodPohoda() {
  return (
    <>
      <p className="mb-2 font-medium">Pohoda</p>
      <ol className="ml-4 list-decimal space-y-1">
        <li>
          <Veta
            k="Otvorte agendu {cesta} a označte doklady."
            casti={{ cesta: <S k="Fakturácia → Vydané faktúry" /> }}
          />
        </li>
        <li>
          <Veta
            k="V menu zvoľte {cesta}."
            casti={{ cesta: <S k="Súbor → Dátová komunikácia → XML import/export" /> }}
          />
        </li>
        <li>
          <Veta k="Vyberte export do súboru a potvrďte." />
        </li>
        <li>
          <Veta
            k="Súbor {xml} nahrajte nižšie. Rovnako zvládneme aj export do {isdoc}."
            casti={{ xml: <code>.xml</code>, isdoc: <strong>ISDOC</strong> }}
          />
        </li>
      </ol>
      <p className="mb-2 mt-4 font-medium">mPohoda</p>
      <p className="text-muted-foreground">
        <Veta
          k="mPohoda dáta nevydáva ako XML, ale cez svoje rozhranie vo formáte {json}. Súbor so zoznamom faktúr z rozhrania mPohody nahrajte rovnako nižšie — formát rozpoznáme sami."
          casti={{ json: <strong>JSON</strong> }}
        />
      </p>
    </>
  );
}

function NavodSuperfaktura() {
  return (
    <ol className="ml-4 list-decimal space-y-1">
      <li>
        <Veta
          k="Vo SuperFaktúre otvorte {cesta}."
          casti={{ cesta: <S k="Nástroje → Export agendy" /> }}
        />
      </li>
      <li>
        <Veta k="Vyberte obdobie a stiahnite export." />
      </li>
      <li>
        <Veta
          k="Dostanete {zip}, v ktorom je každá faktúra ako {isdoc}. Nahrajte ho celý — rozbaľovať ho netreba."
          casti={{ zip: <strong>ZIP</strong>, isdoc: <code>.isdoc</code> }}
        />
      </li>
    </ol>
  );
}

function NavodIdoklad() {
  return (
    <ol className="ml-4 list-decimal space-y-1">
      <li>
        <Veta
          k="Prihláste sa do iDoklad a otvorte {cesta}."
          casti={{ cesta: <S k="Faktúry → Vydané faktúry" /> }}
        />
      </li>
      <li>
        <Veta
          k="Kliknite na {cesta} a zvoľte obdobie."
          casti={{ cesta: <S k="Export → CSV" /> }}
        />
      </li>
      <li>
        <Veta k="Stiahnutý súbor {csv} nahrajte nižšie." casti={{ csv: <code>.csv</code> }} />
      </li>
      <li>
        <Veta
          k="Alternatívne môžete exportovať aj odberateľov cez {cesta}."
          casti={{ cesta: <S k="Kontakty → Export" /> }}
        />
      </li>
    </ol>
  );
}

function NavodMoney() {
  return (
    <ol className="ml-4 list-decimal space-y-1">
      <li>
        <Veta
          k="V Money S3 otvorte agendu {agenda}."
          casti={{ agenda: <S k="Faktúry vydané" /> }}
        />
      </li>
      <li>
        <Veta
          k="Spustite {cesta} a vyberte typ dokladu {typ}."
          casti={{ cesta: <S k="XML prenosy → Export" />, typ: <E k="Faktúry vydané" /> }}
        />
      </li>
      <li>
        <Veta
          k="Zvoľte obdobie a potvrďte export do súboru {xml} (dátový balík {balik})."
          casti={{ xml: <code>.xml</code>, balik: <code>MoneyData</code> }}
        />
      </li>
      <li>
        <Veta
          k="Súbor nahrajte nižšie. Rovnako sa dajú naimportovať aj {prijate}."
          casti={{ prijate: <E k="Faktúry prijaté" /> }}
        />
      </li>
    </ol>
  );
}

function NavodOmega() {
  return (
    <ol className="ml-4 list-decimal space-y-1">
      <li>
        <Veta
          k="V Omega otvorte {cesta} (alebo Kniha odoslaných FA)."
          casti={{ cesta: <S k="Evidencia → Vydané faktúry" /> }}
        />
      </li>
      <li>
        <Veta
          k="Zvoľte {csv} (odporúčané) alebo {xml}."
          casti={{ csv: <S k="Súbor → Export → CSV" />, xml: <strong>XML</strong> }}
        />
      </li>
      <li>
        <Veta
          k="Nastavte kódovanie na {a} alebo {b} — obe zvládneme."
          casti={{ a: <strong>Windows-1250</strong>, b: <strong>UTF-8</strong> }}
        />
      </li>
      <li>
        <Veta k="Súbor nahrajte nižšie." />
      </li>
    </ol>
  );
}

function NavodKros() {
  return (
    <ol className="ml-4 list-decimal space-y-1">
      <li>
        <Veta
          k="V KROS Alfa/Omega otvorte {agenda}."
          casti={{ agenda: <S k="Vydané faktúry" /> }}
        />
      </li>
      <li>
        <Veta
          k="Zvoľte {xml} (odporúčané pre kompletné dáta) alebo {csv}."
          casti={{ xml: <S k="Export → XML" />, csv: <strong>CSV</strong> }}
        />
      </li>
      <li>
        <Veta k="Nastavte rozsah období a potvrďte." />
      </li>
      <li>
        <Veta k="Súbor nahrajte nižšie — automaticky rozpoznáme štruktúru." />
      </li>
    </ol>
  );
}

function NavodDoklady() {
  return (
    <p>
      <Veta k="Prijaté doklady majú vlastnú stránku, lebo berú viac súborov naraz: XML alebo tabuľku s údajmi a k nej ZIP so skenmi. Keď máte len PDF, prečíta ich AI." />
    </p>
  );
}

export const IMPORT_ZDROJE: ImportZdroj[] = [
  {
    id: "pohoda",
    label: "Pohoda a mPohoda",
    title: "Import z Pohody a mPohody",
    description:
      "Naimportujte faktúry a odberateľov z XML exportu programu Pohoda, zo súboru ISDOC alebo z údajov mPohody.",
    accept: ".xml,.isdoc,.json",
    guide: <NavodPohoda />,
  },
  {
    id: "superfaktura",
    label: "SuperFaktúra",
    title: "Import zo SuperFaktúry",
    description: "Naimportujte faktúry a odberateľov z exportu agendy zo SuperFaktúry.",
    cesta: "/importy/superfaktura",
    guide: <NavodSuperfaktura />,
  },
  {
    id: "idoklad",
    label: "iDoklad",
    title: "Import z iDoklad",
    description: "Naimportujte faktúry a odberateľov z CSV exportu z iDoklad.",
    accept: ".csv",
    guide: <NavodIdoklad />,
  },
  {
    id: "money-s3",
    label: "Money S3",
    title: "Import z Money S3",
    description: "Naimportujte faktúry a odberateľov z XML exportu Money S3 (Seyfor).",
    accept: ".xml",
    guide: <NavodMoney />,
  },
  {
    id: "omega",
    label: "KROS Omega",
    title: "Import z Omega (KROS)",
    description: "Naimportujte faktúry a odberateľov z CSV alebo XML exportu z KROS Omega.",
    accept: ".csv,.xml",
    guide: <NavodOmega />,
  },
  {
    id: "kros",
    label: "KROS Alfa plus",
    title: "Import z KROS (Alfa plus / Omega)",
    description: "Naimportujte faktúry a odberateľov z XML alebo CSV exportu z KROS.",
    accept: ".xml,.csv",
    guide: <NavodKros />,
  },
  {
    id: "doklady",
    label: "Prijaté doklady (Doklado, skeny)",
    title: "Import prijatých dokladov",
    description:
      "Prechod z Doklado alebo inej aplikácie: prijaté faktúry, bločky a skeny dokladov.",
    cesta: "/importy/doklady",
    guide: <NavodDoklady />,
  },
];

/**
 * Predvolený zdroj je prvý, ktorý sa vybavuje priamo na stránke. Keby ním bola
 * SuperFaktúra, po otvorení by človek nevidel nahrávanie, ale ďalšie tlačidlo.
 */
export const PREDVOLENY_ZDROJ = IMPORT_ZDROJE.find((z) => !z.cesta)!.id;

export function zdrojPodlaId(id: string): ImportZdroj {
  return IMPORT_ZDROJE.find((z) => z.id === id) ?? zdrojPodlaId(PREDVOLENY_ZDROJ);
}
