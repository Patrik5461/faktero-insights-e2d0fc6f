import type { ComponentType } from "react";
import { FileText, Home, MoreHorizontal, Receipt, ScanLine } from "lucide-react";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";
import { SPODNA_LISTA } from "@/lib/mobile/rozmery";

/**
 * Spodná navigácia mobilnej aplikácie.
 *
 * Päť miest podľa smeru „A": Prehľad, Faktúry, uprostred vyvýšené zelené
 * tlačidlo skenera, Doklady a Viac. Skener je v strede a väčší preto, že je to
 * vec, kvôli ktorej sa appka otvára najčastejšie — trafí sa naslepo palcom.
 *
 * Banka a Kniha jázd sa z lišty presunuli pod „Viac" (bočný panel), ale
 * nezmizli: obe sú aj rýchle akcie na Prehľade. Šesť položiek v lište znamenalo
 * 10 px popisky a ešte menší skener. Keď je otvorená Banka alebo Jazdy, svieti
 * „Viac" — človek vidí, kde v appke stojí.
 */
export type Zalozka = "prehlad" | "faktury" | "doklady" | "skener" | "banka" | "jazda";

/** Záložky, ktoré nemajú vlastné miesto v lište a otvárajú sa cez „Viac". */
export const ZALOZKY_VO_VIAC: readonly Zalozka[] = ["banka", "jazda"];

type Polozka = { kod: Zalozka; kluc: Kluc; icon: ComponentType<{ className?: string }> };

const VLAVO: Polozka[] = [
  { kod: "prehlad", kluc: "tab.prehlad", icon: Home },
  { kod: "faktury", kluc: "tab.faktury", icon: FileText },
];

const VPRAVO: Polozka[] = [{ kod: "doklady", kluc: "tab.doklady", icon: Receipt }];

export function TabBar({
  aktivna,
  onPrepni,
  onViac,
}: {
  aktivna: Zalozka;
  onPrepni: (z: Zalozka) => void;
  /** Otvorí bočný panel so zvyšnými agendami (Banka, Jazdy, Ponuky…) a nastaveniami. */
  onViac: () => void;
}) {
  const { t } = usePreklad();
  const jeSkener = aktivna === "skener";
  return (
    <nav
      className="sticky bottom-0 z-30 border-t border-app-ramik bg-app-karta"
      /*
        Výška je daná, nie zdedená z obsahu: musí sedieť s miestom, ktoré lište
        rezervuje obal (`--spodna-lista`) — viď `lib/mobile/rozmery`. Odsadenie
        dole je v nej započítané, bez neho by na iPhone posledný riadok ikon
        padol pod systémový indikátor a nedal by sa trafiť. Vyvýšený skener
        trčí nad lištu, do výšky sa nepočíta.
      */
      style={{ height: SPODNA_LISTA, paddingBottom: "var(--safe-bottom)" }}
      aria-label={t("tab.navigacia")}
    >
      <div className="grid h-full grid-cols-5 items-stretch">
        {VLAVO.map((p) => (
          <Miesto key={p.kod} {...p} je={p.kod === aktivna} onClick={() => onPrepni(p.kod)} />
        ))}
        <div className="relative flex justify-center">
          <button
            type="button"
            onClick={() => onPrepni("skener")}
            aria-label={t("tab.skener")}
            aria-current={jeSkener ? "page" : undefined}
            data-skener-v-liste
            className={`absolute -top-6 grid h-14 w-14 place-items-center rounded-full bg-app-zelena-plocha text-white shadow-[0_6px_16px_rgb(0_126_70/0.35)] transition active:scale-95 ${
              jeSkener ? "ring-4 ring-app-zelena-jemna" : ""
            }`}
          >
            <ScanLine className="h-[26px] w-[26px]" strokeWidth={2.2} />
          </button>
        </div>
        {VPRAVO.map((p) => (
          <Miesto key={p.kod} {...p} je={p.kod === aktivna} onClick={() => onPrepni(p.kod)} />
        ))}
        <Miesto
          kod="prehlad"
          kluc="tab.viac"
          icon={MoreHorizontal}
          je={ZALOZKY_VO_VIAC.includes(aktivna)}
          onClick={onViac}
          viac
        />
      </div>
    </nav>
  );
}

function Miesto({
  kluc,
  icon: Icon,
  je,
  onClick,
  viac,
}: Polozka & { je: boolean; onClick: () => void; viac?: boolean }) {
  const { t } = usePreklad();
  return (
    <button
      type="button"
      onClick={onClick}
      /* „Viac" otvára panel, nie stránku — `aria-current` by klamal. */
      aria-current={je && !viac ? "page" : undefined}
      aria-haspopup={viac ? "dialog" : undefined}
      data-viac={viac ? "" : undefined}
      className={`flex min-w-0 select-none flex-col items-center justify-center gap-1 px-0.5 transition active:scale-95 ${
        je ? "text-app-zelena" : "text-app-text-2"
      }`}
    >
      <Icon className="h-[22px] w-[22px] shrink-0" />
      <span
        className={`w-full truncate text-center text-[11px] leading-none ${je ? "font-bold" : "font-medium"}`}
      >
        {t(kluc)}
      </span>
    </button>
  );
}
