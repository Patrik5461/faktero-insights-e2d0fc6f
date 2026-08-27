import type { ComponentType } from "react";
import { Car, FilePlus2, FileText, Landmark, ScanLine } from "lucide-react";
import { ZELENA_HORE } from "@/lib/mobile/brand";
import { usePreklad } from "@/lib/mobile/preklady/hook";

/**
 * Spodná navigácia mobilnej aplikácie.
 *
 * Päť agend, do ktorých človek chodí opakovane. Všetko ostatné — prijaté
 * doklady, PDF a viacstranové doklady, čísla dopredu, nastavenia — je naďalej
 * dostupné: časť priamo na obrazovke skenera, zvyšok v bočnom paneli. Nič sa
 * pridaním tejto lišty nestratilo, len sa to prestalo hľadať v zozname
 * veľkých tlačidiel.
 *
 * Zelený plavák (FAB) tu vedome nie je — vystavenie faktúry je jedna z piatich
 * rovnocenných vecí, nie tá jediná dôležitá.
 */
export type Zalozka = "skener" | "faktury" | "vytvorit" | "banka" | "jazda";

/* Popisy sa prekladajú — kľúč je tu, znenie v slovníku. */
const POLOZKY: {
  kod: Zalozka;
  kluc: "tab.skener" | "tab.faktury" | "tab.vytvorit" | "tab.banka" | "tab.jazda";
  icon: ComponentType<{ className?: string }>;
}[] = [
  { kod: "skener", kluc: "tab.skener", icon: ScanLine },
  { kod: "faktury", kluc: "tab.faktury", icon: FileText },
  { kod: "vytvorit", kluc: "tab.vytvorit", icon: FilePlus2 },
  { kod: "banka", kluc: "tab.banka", icon: Landmark },
  { kod: "jazda", kluc: "tab.jazda", icon: Car },
];

export function TabBar({
  aktivna,
  onPrepni,
}: {
  aktivna: Zalozka;
  onPrepni: (z: Zalozka) => void;
}) {
  const { t } = usePreklad();
  return (
    <nav
      className="sticky bottom-0 z-30 border-t border-border/70 bg-card/95 backdrop-blur"
      /* Bez odsadenia dole by na iPhone posledný riadok ikon padol pod
         systémový indikátor a nedal by sa trafiť. */
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label={t("tab.navigacia")}
    >
      <ul className="flex">
        {POLOZKY.map(({ kod, kluc, icon: Icon }) => {
          const label = t(kluc);
          const je = kod === aktivna;
          return (
            <li key={kod} className="flex-1">
              <button
                onClick={() => onPrepni(kod)}
                aria-current={je ? "page" : undefined}
                className="flex w-full select-none flex-col items-center gap-1 px-1 py-2 transition active:scale-95"
                style={{ color: je ? ZELENA_HORE : undefined }}
              >
                <Icon className={`h-[22px] w-[22px] ${je ? "" : "text-muted-foreground"}`} />
                <span
                  className={`text-[11px] leading-none ${
                    je ? "font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
