import { useEffect, useState } from "react";
import { MapPin, Bell, Activity, ShieldCheck } from "lucide-react";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";
import {
  dopytajPovoleniaJazd,
  otvorNastaveniaAppky,
  stavPovoleniJazd,
  uzSmeSaPytali,
  zapamatajZePytane,
  type ChybajucePovolenie,
} from "@/lib/mobile/povolenia-jazd";
import { PrimaryCta } from "./ui";

/**
 * Okno, ktoré si na Androide vypýta povolenia pre knihu jázd.
 *
 * Systémové okná musí niečo vyvolať a Google navyše chce, aby appka **pred**
 * žiadosťou o polohu na pozadí sama vysvetlila, načo jej je. Toto je oboje
 * naraz: krátke vysvetlenie a jedno tlačidlo, po ktorom sa okná zobrazia za
 * sebou.
 *
 * Pýta sa v oboch appkách hneď po prihlásení, nielen v Knihe jázd: povolenie
 * vypýtané mesiac po inštalácii znamená mesiac nezapísaných jázd. Kto o knihu
 * jázd nestojí, klepne na „Neskôr".
 *
 * **Pýta sa raz.** Polohu „vždy" Android oknom povoliť nedá — po prvom kole
 * teda „niečo chýba" ostane pravda aj vtedy, keď človek všetko odklikol, a
 * okno pri každom otvorení by bolo otravovanie. Na tú poslednú vec preto
 * ponúkne nastavenia a viac sa nepripomína; zapnúť sa dá kedykoľvek na
 * obrazovke Kniha jázd.
 */

/** Odloženie v rámci behu appky — kým sa okno raz vybaví, nemá sa vracať. */
let odlozene = false;

type Krok = "vysvetlenie" | "nastavenia";

export function PovoleniaJazd() {
  const { t } = usePreklad();
  const [chyba, setChyba] = useState<ChybajucePovolenie[] | null>(null);
  const [krok, setKrok] = useState<Krok>("vysvetlenie");
  const [pracujem, setPracujem] = useState(false);

  useEffect(() => {
    let zive = true;
    void (async () => {
      if (odlozene || (await uzSmeSaPytali())) return;
      const chybajuce = await stavPovoleniJazd();
      if (zive && chybajuce?.length) setChyba(chybajuce);
    })();
    return () => {
      zive = false;
    };
  }, []);

  if (!chyba?.length) return null;

  function zavri() {
    odlozene = true;
    void zapamatajZePytane();
    setChyba(null);
  }

  const IKONY: Record<ChybajucePovolenie, typeof MapPin> = {
    poloha: MapPin,
    notifikacie: Bell,
    pohyb: Activity,
    vzdy: ShieldCheck,
  };
  const TEXTY: Record<ChybajucePovolenie, Kluc> = {
    poloha: "pov.poloha",
    notifikacie: "pov.notifikacie",
    pohyb: "pov.pohyb",
    vzdy: "pov.vzdy",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center">
      <div
        role="dialog"
        aria-label={t("pov.nadpis")}
        className="w-full rounded-t-app bg-app-karta p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-app"
      >
        <h2 className="text-[17px] font-semibold text-app-text">{t("pov.nadpis")}</h2>

        {krok === "vysvetlenie" ? (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-app-text-2">{t("pov.uvod")}</p>
            <ul className="mt-4 space-y-3">
              {chyba.map((k) => {
                const Ikona = IKONY[k];
                return (
                  <li key={k} className="flex gap-3">
                    <Ikona className="mt-0.5 h-4 w-4 shrink-0 text-app-text-2" />
                    <span className="text-[13px] leading-relaxed text-app-text">{t(TEXTY[k])}</span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-5">
              <PrimaryCta
                disabled={pracujem}
                onClick={async () => {
                  setPracujem(true);
                  const ostalo = await dopytajPovoleniaJazd();
                  setPracujem(false);
                  // Poloha „vždy" je jediná, ktorú okno vybaviť nevie —
                  // na ňu treba nastavenia. Zvyšok je hotový, tak zavri.
                  if (ostalo.includes("vzdy")) {
                    setChyba(["vzdy"]);
                    setKrok("nastavenia");
                    return;
                  }
                  zavri();
                }}
              >
                {pracujem ? t("pov.pytamSa") : t("pov.povolit")}
              </PrimaryCta>
            </div>
            <button
              type="button"
              onClick={zavri}
              className="mt-2 h-11 w-full text-[14px] font-medium text-app-text-2"
            >
              {t("pov.neskor")}
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-app-text-2">
              {t("pov.vzdyNastavenia")}
            </p>
            <div className="mt-5">
              <PrimaryCta
                onClick={async () => {
                  await otvorNastaveniaAppky();
                  zavri();
                }}
              >
                {t("pov.otvoritNastavenia")}
              </PrimaryCta>
            </div>
            <button
              type="button"
              onClick={zavri}
              className="mt-2 h-11 w-full text-[14px] font-medium text-app-text-2"
            >
              {t("pov.hotovo")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
