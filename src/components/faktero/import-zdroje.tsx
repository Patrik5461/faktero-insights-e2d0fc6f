import type { ReactNode } from "react";
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

export const IMPORT_ZDROJE: ImportZdroj[] = [
  {
    id: "superfaktura",
    label: "SuperFaktúra",
    title: "Import zo SuperFaktúry",
    description: "Naimportujte faktúry a odberateľov z exportu agendy zo SuperFaktúry.",
    cesta: "/importy/superfaktura",
    guide: (
      <ol className="ml-4 list-decimal space-y-1">
        <li>
          Vo SuperFaktúre otvorte <strong>Nástroje → Export agendy</strong>.
        </li>
        <li>Vyberte obdobie a stiahnite export.</li>
        <li>
          Dostanete <strong>ZIP</strong>, v ktorom je každá faktúra ako <code>.isdoc</code>.
          Nahrajte ho celý — rozbaľovať ho netreba.
        </li>
      </ol>
    ),
  },
  {
    id: "pohoda",
    label: "Pohoda a mPohoda",
    title: "Import z Pohody a mPohody",
    description:
      "Naimportujte faktúry a odberateľov z XML exportu programu POHODA, zo súboru ISDOC alebo z údajov mPohody.",
    accept: ".xml,.isdoc,.json",
    guide: (
      <>
        <p className="mb-2 font-medium">POHODA</p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            Otvorte agendu <strong>Fakturácia → Vydané faktúry</strong> a označte doklady.
          </li>
          <li>
            V menu zvoľte <strong>Súbor → Dátová komunikácia → XML import/export</strong>.
          </li>
          <li>Vyberte export do súboru a potvrďte.</li>
          <li>
            Súbor <code>.xml</code> nahrajte nižšie. Rovnako zvládneme aj export do{" "}
            <strong>ISDOC</strong>.
          </li>
        </ol>
        <p className="mb-2 mt-4 font-medium">mPohoda</p>
        <p className="text-muted-foreground">
          mPohoda dáta nevydáva ako XML, ale cez svoje rozhranie vo formáte <strong>JSON</strong>.
          Súbor so zoznamom faktúr z rozhrania mPohody nahrajte rovnako nižšie — formát rozpoznáme
          sami.
        </p>
      </>
    ),
  },
  {
    id: "money-s3",
    label: "Money S3",
    title: "Import z Money S3",
    description: "Naimportujte faktúry a odberateľov z XML exportu Money S3 (Seyfor).",
    accept: ".xml",
    guide: (
      <ol className="ml-4 list-decimal space-y-1">
        <li>
          V Money S3 otvorte agendu <strong>Faktúry vydané</strong>.
        </li>
        <li>
          Spustite <strong>XML prenosy → Export</strong> a vyberte typ dokladu{" "}
          <em>Faktúry vydané</em>.
        </li>
        <li>
          Zvoľte obdobie a potvrďte export do súboru <code>.xml</code> (dátový balík{" "}
          <code>MoneyData</code>).
        </li>
        <li>
          Súbor nahrajte nižšie. Rovnako sa dajú naimportovať aj <em>Faktúry prijaté</em>.
        </li>
      </ol>
    ),
  },
  {
    id: "omega",
    label: "KROS Omega",
    title: "Import z Omega (KROS)",
    description: "Naimportujte faktúry a odberateľov z CSV alebo XML exportu z KROS Omega.",
    accept: ".csv,.xml",
    guide: (
      <ol className="ml-4 list-decimal space-y-1">
        <li>
          V Omega otvorte <strong>Evidencia → Vydané faktúry</strong> (alebo Kniha odoslaných FA).
        </li>
        <li>
          Zvoľte <strong>Súbor → Export → CSV</strong> (odporúčané) alebo <strong>XML</strong>.
        </li>
        <li>
          Nastavte kódovanie na <strong>Windows-1250</strong> alebo <strong>UTF-8</strong> — obe
          zvládneme.
        </li>
        <li>Súbor nahrajte nižšie.</li>
      </ol>
    ),
  },
  {
    id: "kros",
    label: "KROS Alfa plus",
    title: "Import z KROS (Alfa plus / Omega)",
    description: "Naimportujte faktúry a odberateľov z XML alebo CSV exportu z KROS.",
    accept: ".xml,.csv",
    guide: (
      <ol className="ml-4 list-decimal space-y-1">
        <li>
          V KROS Alfa/Omega otvorte <strong>Vydané faktúry</strong>.
        </li>
        <li>
          Zvoľte <strong>Export → XML</strong> (odporúčané pre kompletné dáta) alebo{" "}
          <strong>CSV</strong>.
        </li>
        <li>Nastavte rozsah období a potvrďte.</li>
        <li>Súbor nahrajte nižšie — automaticky rozpoznáme štruktúru.</li>
      </ol>
    ),
  },
  {
    id: "idoklad",
    label: "iDoklad",
    title: "Import z iDoklad",
    description: "Naimportujte faktúry a odberateľov z CSV exportu z iDoklad.",
    accept: ".csv",
    guide: (
      <ol className="ml-4 list-decimal space-y-1">
        <li>
          Prihláste sa do iDoklad a otvorte <strong>Faktúry → Vydané faktúry</strong>.
        </li>
        <li>
          Kliknite na <strong>Export → CSV</strong> a zvoľte obdobie.
        </li>
        <li>
          Stiahnutý súbor <code>.csv</code> nahrajte nižšie.
        </li>
        <li>
          Alternatívne môžete exportovať aj odberateľov cez <strong>Kontakty → Export</strong>.
        </li>
      </ol>
    ),
  },
  {
    id: "doklady",
    label: "Prijaté doklady (Doklado, skeny)",
    title: "Import prijatých dokladov",
    description:
      "Prechod z Doklado alebo inej aplikácie: prijaté faktúry, bločky a skeny dokladov.",
    cesta: "/importy/doklady",
    guide: (
      <p>
        Prijaté doklady majú vlastnú stránku, lebo berú viac súborov naraz: XML alebo tabuľku s
        údajmi a k nej ZIP so skenmi. Keď máte len PDF, prečíta ich AI.
      </p>
    ),
  },
];

export function zdrojPodlaId(id: string): ImportZdroj {
  return IMPORT_ZDROJE.find((z) => z.id === id) ?? IMPORT_ZDROJE[0];
}
