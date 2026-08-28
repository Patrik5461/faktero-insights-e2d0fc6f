import type { ComponentType } from "react";
import { Car, Clock, Home, Navigation } from "lucide-react";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";

/**
 * Spodná navigácia appky Kniha jázd.
 *
 * Zámerne nie je zdieľaná s lištou Faktera: tá má šesť agend a pevný zoznam.
 * Zovšeobecniť ju na oboje by znamenalo siahnuť do appky, ktorá je práve
 * v obchode — a ušetrilo by to štyridsať riadkov.
 *
 * Plavák tu nie je. Vo Fakteri je ním „nová faktúra", teda akcia, ktorá nemá
 * vlastnú záložku; tu je začatie jazdy celá obrazovka a tá záložku má. Plavák
 * nad štyrmi položkami by len prekrýval popisku pod sebou.
 */
export type ZalozkaJazd = "prehlad" | "jazda" | "historia" | "vozidla";

const ZALOZKY: { kod: ZalozkaJazd; kluc: Kluc; icon: ComponentType<{ className?: string }> }[] = [
  { kod: "prehlad", kluc: "kj.tabPrehlad", icon: Home },
  { kod: "jazda", kluc: "jazdy.jazda", icon: Navigation },
  { kod: "historia", kluc: "kj.tabHistoria", icon: Clock },
  { kod: "vozidla", kluc: "kj.tabVozidla", icon: Car },
];

export function TabBarJazd({
  aktivna,
  onPrepni,
  bezi,
}: {
  aktivna: ZalozkaJazd;
  onPrepni: (z: ZalozkaJazd) => void;
  /** Beží meranie? Bodka pri jazde je jediné miesto, kde to vidno zo všetkých obrazoviek. */
  bezi?: boolean;
}) {
  const { t } = usePreklad();
  return (
    <nav
      className="sticky bottom-0 z-30 border-t border-app-ramik bg-app-karta"
      /* Bez odsadenia dole padne posledný riadok ikon pod systémový indikátor. */
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label={t("tab.navigacia")}
    >
      <div className="flex items-stretch">
        {ZALOZKY.map((p) => (
          <Polozka
            key={p.kod}
            {...p}
            aktivna={aktivna}
            onPrepni={onPrepni}
            bodka={p.kod === "jazda" && !!bezi}
          />
        ))}
      </div>
    </nav>
  );
}

function Polozka({
  kod,
  kluc,
  icon: Icon,
  aktivna,
  onPrepni,
  bodka,
}: {
  kod: ZalozkaJazd;
  kluc: Kluc;
  icon: ComponentType<{ className?: string }>;
  aktivna: ZalozkaJazd;
  onPrepni: (z: ZalozkaJazd) => void;
  bodka?: boolean;
}) {
  const { t } = usePreklad();
  const je = kod === aktivna;
  return (
    <button
      type="button"
      onClick={() => onPrepni(kod)}
      aria-current={je ? "page" : undefined}
      className={`flex min-h-[44px] min-w-0 flex-1 select-none flex-col items-center gap-1 px-0.5 pb-1.5 pt-2 transition active:scale-95 ${
        je ? "text-app-zelena" : "text-app-text-3"
      }`}
    >
      <span className="relative">
        <Icon className="h-5 w-5 shrink-0" />
        {bodka && (
          <span className="absolute -right-1 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-app-zelena" />
        )}
      </span>
      <span
        className={`w-full truncate text-center text-[11px] leading-none ${je ? "font-semibold" : ""}`}
      >
        {t(kluc)}
      </span>
    </button>
  );
}
