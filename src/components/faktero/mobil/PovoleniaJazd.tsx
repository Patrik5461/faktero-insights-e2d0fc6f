import { useEffect, useState } from "react";
import { MapPin, Bell, Activity, ShieldCheck } from "lucide-react";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";
import { PrimaryCta } from "./ui";
import {
  dopytajPovoleniaJazd,
  stavPovoleniJazd,
  type ChybajucePovolenie,
} from "@/lib/mobile/povolenia-jazd";

/**
 * Okno, ktoré si na Androide vypýta povolenia pre knihu jázd.
 *
 * Systémové okná musí niečo vyvolať a Google navyše chce, aby appka **pred**
 * žiadosťou o polohu na pozadí sama vysvetlila, načo jej je. Toto je oboje
 * naraz: krátke vysvetlenie a jedno tlačidlo, po ktorom sa okná zobrazia za
 * sebou.
 *
 * Zobrazí sa len vtedy, keď naozaj niečo chýba, a len na Androide — na iOS
 * si povolenia pýta appka v inom poradí a v iných chvíľach. Pýta sa v oboch
 * appkách hneď po prihlásení, nielen v Knihe jázd: kto si kúpil fakturáciu
 * s knihou jázd, ten ju zvyčajne aj chce, a povolenie vypýtané mesiac po
 * inštalácii znamená mesiac nezapísaných jázd. Kto o ňu nestojí, klepne na
 * „Neskôr".
 */

/** Odloženie platí do zatvorenia appky. Bez povolení kniha jázd nerobí nič,
 *  takže sa pri ďalšom otvorení spýta znova. */
let odlozene = false;

export function PovoleniaJazd() {
  const { t } = usePreklad();
  const [chyba, setChyba] = useState<ChybajucePovolenie[] | null>(null);
  const [pracujem, setPracujem] = useState(false);

  useEffect(() => {
    let zive = true;
    void (async () => {
      if (odlozene) return;
      const chybajuce = await stavPovoleniJazd();
      if (zive && chybajuce?.length) setChyba(chybajuce);
    })();
    return () => {
      zive = false;
    };
  }, []);

  if (!chyba?.length) return null;

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
              await dopytajPovoleniaJazd();
              setPracujem(false);
              // Čo človek odmietol, sa druhýkrát nepýta — Android tretiu
              // žiadosť aj tak nezobrazí a okno by len prekážalo.
              odlozene = true;
              setChyba(null);
            }}
          >
            {pracujem ? t("pov.pytamSa") : t("pov.povolit")}
          </PrimaryCta>
        </div>
        <button
          type="button"
          onClick={() => {
            odlozene = true;
            setChyba(null);
          }}
          className="mt-2 h-11 w-full text-[14px] font-medium text-app-text-2"
        >
          {t("pov.neskor")}
        </button>
      </div>
    </div>
  );
}
