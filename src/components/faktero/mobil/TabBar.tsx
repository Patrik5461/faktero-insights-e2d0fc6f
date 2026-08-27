import type { ComponentType } from "react";
import { Car, Home, Landmark, Plus, Receipt, ScanLine, FileText } from "lucide-react";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";

/**
 * Spodná navigácia mobilnej aplikácie.
 *
 * Šesť agend a uprostred plavák na vystavenie faktúry. Je to o jednu agendu
 * viac, než sa do lišty bežne dáva, a je to zámer: skener aj banka sú veci,
 * do ktorých človek chodí denne, a schovať ich do bočného panela znamená, že
 * ich prestane používať. Preto sú popisky 10 px a ikony 20 px — na 390 px
 * širokom displeji vyjde na položku 54 px, čo je nad hranicou dotyku.
 *
 * Plavák nie je siedma položka. Vystavenie faktúry je akcia, nie miesto,
 * kam sa dá „prepnúť": nemá aktívny stav a lišta sa pod ním nezvýrazňuje.
 */
export type Zalozka = "prehlad" | "faktury" | "doklady" | "skener" | "banka" | "jazda";

const VLAVO: { kod: Zalozka; kluc: Kluc; icon: ComponentType<{ className?: string }> }[] = [
  { kod: "prehlad", kluc: "tab.prehlad", icon: Home },
  { kod: "faktury", kluc: "tab.faktury", icon: FileText },
  { kod: "doklady", kluc: "tab.doklady", icon: Receipt },
];

const VPRAVO: { kod: Zalozka; kluc: Kluc; icon: ComponentType<{ className?: string }> }[] = [
  { kod: "skener", kluc: "tab.skener", icon: ScanLine },
  { kod: "banka", kluc: "tab.banka", icon: Landmark },
  { kod: "jazda", kluc: "tab.jazdy", icon: Car },
];

export function TabBar({
  aktivna,
  onPrepni,
  onVytvorit,
}: {
  aktivna: Zalozka;
  onPrepni: (z: Zalozka) => void;
  /** Plavák. Bez neho sa lišta vykreslí bez stredovej medzery. */
  onVytvorit?: () => void;
}) {
  const { t } = usePreklad();
  return (
    <nav
      className="sticky bottom-0 z-30 border-t border-app-ramik bg-app-karta"
      /* Bez odsadenia dole by na iPhone posledný riadok ikon padol pod
         systémový indikátor a nedal by sa trafiť. */
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label={t("tab.navigacia")}
    >
      <div className="relative flex items-stretch">
        {VLAVO.map((p) => (
          <Polozka key={p.kod} {...p} aktivna={aktivna} onPrepni={onPrepni} />
        ))}

        {onVytvorit && (
          <>
            {/* Miesto pre plavák. Prázdna bunka, aby sa ikony rozdelili 3 + 3. */}
            <div className="w-16 shrink-0" aria-hidden />
            <button
              type="button"
              onClick={onVytvorit}
              aria-label={t("tab.vytvorit")}
              /*
                Vyvýšený nad lištu. `-translate-y-1/3` ho zdvihne asi o 18 px —
                dosť na to, aby bol vidieť ako samostatná vec, a málo na to,
                aby zakrýval obsah nad lištou.
              */
              className="absolute left-1/2 top-0 grid h-14 w-14 -translate-x-1/2 -translate-y-1/3 place-items-center rounded-full bg-app-zelena text-white shadow-[0_6px_16px_rgb(0_126_70_/_0.35)] transition active:scale-95"
            >
              <Plus className="h-7 w-7" />
            </button>
          </>
        )}

        {VPRAVO.map((p) => (
          <Polozka key={p.kod} {...p} aktivna={aktivna} onPrepni={onPrepni} />
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
}: {
  kod: Zalozka;
  kluc: Kluc;
  icon: ComponentType<{ className?: string }>;
  aktivna: Zalozka;
  onPrepni: (z: Zalozka) => void;
}) {
  const { t } = usePreklad();
  const je = kod === aktivna;
  return (
    <button
      type="button"
      onClick={() => onPrepni(kod)}
      aria-current={je ? "page" : undefined}
      className={`flex min-w-0 flex-1 select-none flex-col items-center gap-1 px-0.5 pb-1.5 pt-2 transition active:scale-95 ${
        je ? "text-app-zelena" : "text-app-text-3"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className={`w-full truncate text-center text-[10px] leading-none ${je ? "font-semibold" : ""}`}>
        {t(kluc)}
      </span>
    </button>
  );
}
