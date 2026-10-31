import { useState, type ReactNode } from "react";
import {
  ArrowUpDown,
  MoreHorizontal,
  PanelRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useT } from "@/lib/i18n/useT";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { zoradenieNaKluc, klucNaZoradenie, type ListFilters } from "@/hooks/useListFilters";
import {
  rozsahPredvolby,
  PREDVOLBY_ROZSAHU,
  type PredvolbaRozsahu,
} from "@/lib/faktero/rozsah-datumu";

export type MoznostFiltra = { value: string; label: string };

export type FilterDef =
  | { key: string; label: string; type: "select"; options: MoznostFiltra[]; allLabel?: string }
  | { key: string; label: string; type: "checkbox" }
  | {
      key: string;
      label: string;
      type: "dateRange";
      /** „Obdobie podľa“ — ktorý dátum dokladu sa filtruje; uloží sa pod `dateFieldKey`. */
      dateFieldOptions?: MoznostFiltra[];
      dateFieldKey?: string;
    };

export type MoznostTriedenia = { label: string; column: string; ascending?: boolean };

/** Spoločná výška a štýl prvkov toolbaru — ako ostatné vstupy v appke. */
export const PRVOK = "h-9 rounded-md border border-input bg-background text-sm";

/** Koľko filtrov je zapnutých — rozsah dátumu a jeho „Obdobie podľa“ sa rátajú ako jeden. */
export function pocetAktivnych(defs: FilterDef[], lf: ListFilters): number {
  return defs.reduce((n, d) => {
    if (d.type === "dateRange") {
      const r = lf.rozsah(d.key);
      return n + (r.od || r.do ? 1 : 0);
    }
    return n + (lf.filter(d.key) ? 1 : 0);
  }, 0);
}

/**
 * Toolbar nad zoznamom dokladov: hľadanie, Filtre (popover, na mobile panel),
 * zoradenie a prepínač náhľadu. Pod ním riadok aktívnych filtrov ako čipy.
 * Stav drží `useListFilters` v adrese; čo filtre znamenajú, rieši stránka.
 */
export function DocumentListToolbar({
  lf,
  searchPlaceholder = "Hľadať…",
  sortOptions,
  filters = [],
  previewToggle,
  extra,
}: {
  lf: ListFilters;
  searchPlaceholder?: string;
  sortOptions?: MoznostTriedenia[];
  filters?: FilterDef[];
  /** Prepínač „Náhľad vedľa zoznamu“ — bez neho sa nezobrazí. */
  previewToggle?: { zapnuty: boolean; prepni: (on: boolean) => void };
  /** Ďalší prvok do riadku (výnimočne, napr. prepínač rozloženia). */
  extra?: ReactNode;
}) {
  const { t } = useT();
  const mobil = useIsMobile();
  const [otvorene, setOtvorene] = useState(false);
  const aktivnych = pocetAktivnych(filters, lf);

  const tlacidloFiltrov = (
    <button
      type="button"
      onClick={mobil ? () => setOtvorene(true) : undefined}
      className={`${PRVOK} inline-flex shrink-0 items-center gap-1.5 px-3 hover:bg-secondary`}
    >
      <SlidersHorizontal className="h-4 w-4" />
      {t("Filtre")}
      {aktivnych > 0 && (
        <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
          {aktivnych}
        </span>
      )}
    </button>
  );

  const obsahFiltrov = (
    <PanelFiltrov filters={filters} lf={lf} onHotovo={() => setOtvorene(false)} />
  );

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">{t(searchPlaceholder)}</span>
          <input
            type="search"
            value={lf.q}
            onChange={(e) => lf.setQ(e.target.value)}
            placeholder={t(searchPlaceholder)}
            className={`${PRVOK} w-full pl-8 pr-3`}
          />
        </label>

        {filters.length > 0 &&
          (mobil ? (
            <>
              {tlacidloFiltrov}
              <Sheet open={otvorene} onOpenChange={setOtvorene}>
                <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>{t("Filtre")}</SheetTitle>
                  </SheetHeader>
                  <div className="mt-3">{obsahFiltrov}</div>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <Popover open={otvorene} onOpenChange={setOtvorene}>
              <PopoverTrigger asChild>{tlacidloFiltrov}</PopoverTrigger>
              <PopoverContent align="start" className="w-[22rem] p-4">
                {obsahFiltrov}
              </PopoverContent>
            </Popover>
          ))}

        {sortOptions && sortOptions.length > 0 && (
          <TriedenieSelect moznosti={sortOptions} lf={lf} />
        )}

        {extra}

        {previewToggle && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={previewToggle.zapnuty}
                  aria-label={t("Náhľad vedľa zoznamu")}
                  onClick={() => previewToggle.prepni(!previewToggle.zapnuty)}
                  className={`ml-auto hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border lg:inline-flex ${
                    previewToggle.zapnuty
                      ? "border-primary/40 bg-primary/10 text-primary-hover"
                      : "border-input bg-background hover:bg-secondary"
                  }`}
                >
                  <PanelRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("Náhľad vedľa zoznamu")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <AktivneFiltre filters={filters} lf={lf} />
    </div>
  );
}

function TriedenieSelect({ moznosti, lf }: { moznosti: MoznostTriedenia[]; lf: ListFilters }) {
  const { t } = useT();
  const aktualny = lf.sort ? zoradenieNaKluc(lf.sort) : zoradenieNaKluc(moznosti[0]!);
  const zname = moznosti.some((m) => zoradenieNaKluc(m) === aktualny);
  return (
    <label className="relative inline-flex shrink-0 items-center">
      <ArrowUpDown className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
      <span className="sr-only">{t("Zoradenie")}</span>
      <select
        aria-label={t("Zoradenie")}
        value={zname ? aktualny : ""}
        onChange={(e) => {
          const z = klucNaZoradenie(e.target.value);
          if (z) lf.setSort(z);
        }}
        className={`${PRVOK} max-w-[13rem] pl-8 pr-7`}
      >
        {!zname && <option value="">{t("Vlastné zoradenie")}</option>}
        {moznosti.map((m) => (
          <option key={zoradenieNaKluc(m)} value={zoradenieNaKluc(m)}>
            {t(m.label)}
          </option>
        ))}
      </select>
    </label>
  );
}

function PanelFiltrov({
  filters,
  lf,
  onHotovo,
}: {
  filters: FilterDef[];
  lf: ListFilters;
  onHotovo: () => void;
}) {
  const { t } = useT();
  const zrusVsetky = () => lf.clearFilters();
  return (
    <div className="space-y-4">
      {filters.map((d) => (
        <div key={d.key}>
          {d.type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lf.zapnute(d.key)}
                onChange={(e) => lf.setFilter(d.key, e.target.checked)}
              />
              {t(d.label)}
            </label>
          ) : d.type === "select" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t(d.label)}
              </span>
              <select
                value={lf.filter(d.key)}
                onChange={(e) => lf.setFilter(d.key, e.target.value)}
                className={`${PRVOK} w-full px-2`}
              >
                <option value="">{t(d.allLabel ?? "Všetky")}</option>
                {d.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.label)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <RozsahDatumu def={d} lf={lf} />
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={zrusVsetky}
          className="h-9 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {t("Zrušiť filtre")}
        </button>
        <button
          type="button"
          onClick={onHotovo}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("Hotovo")}
        </button>
      </div>
    </div>
  );
}

function RozsahDatumu({
  def,
  lf,
}: {
  def: Extract<FilterDef, { type: "dateRange" }>;
  lf: ListFilters;
}) {
  const { t } = useT();
  const r = lf.rozsah(def.key);
  const kluceRozsahu = { od: `${def.key}_od`, do: `${def.key}_do` };
  const predvolba = lf.filter(`${def.key}_p`) as PredvolbaRozsahu | "vlastne" | "";
  const polePodla = def.dateFieldKey ?? "podla";
  const nastavPredvolbu = (p: string) => {
    if (!p)
      return lf.setFilters({ [kluceRozsahu.od]: "", [kluceRozsahu.do]: "", [`${def.key}_p`]: "" });
    if (p === "vlastne") return lf.setFilters({ [`${def.key}_p`]: "vlastne" });
    const { od, do: doDna } = rozsahPredvolby(p as PredvolbaRozsahu, new Date());
    lf.setFilters({ [kluceRozsahu.od]: od, [kluceRozsahu.do]: doDna, [`${def.key}_p`]: p });
  };
  return (
    <div className="space-y-2 text-sm">
      <span className="block text-xs font-medium text-muted-foreground">{t(def.label)}</span>
      {def.dateFieldOptions && def.dateFieldOptions.length > 0 && (
        <select
          aria-label={t("Obdobie podľa")}
          value={lf.filter(polePodla) || def.dateFieldOptions[0]!.value}
          onChange={(e) =>
            lf.setFilter(
              polePodla,
              e.target.value === def.dateFieldOptions![0]!.value ? "" : e.target.value,
            )
          }
          className={`${PRVOK} w-full px-2`}
        >
          {def.dateFieldOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {t("podľa {pole}", { pole: t(o.label) })}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label={t(def.label)}
        value={predvolba || (r.od || r.do ? "vlastne" : "")}
        onChange={(e) => nastavPredvolbu(e.target.value)}
        className={`${PRVOK} w-full px-2`}
      >
        <option value="">{t("Celé obdobie")}</option>
        {PREDVOLBY_ROZSAHU.map((p) => (
          <option key={p.kod} value={p.kod}>
            {t(p.nazov)}
          </option>
        ))}
        <option value="vlastne">{t("Vlastné")}</option>
      </select>
      {(predvolba === "vlastne" || ((r.od || r.do) && !predvolba)) && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            aria-label={t("Od")}
            value={r.od}
            onChange={(e) =>
              lf.setFilters({ [kluceRozsahu.od]: e.target.value, [`${def.key}_p`]: "vlastne" })
            }
            className={`${PRVOK} w-full px-2`}
          />
          <input
            type="date"
            aria-label={t("Do")}
            value={r.do}
            onChange={(e) =>
              lf.setFilters({ [kluceRozsahu.do]: e.target.value, [`${def.key}_p`]: "vlastne" })
            }
            className={`${PRVOK} w-full px-2`}
          />
        </div>
      )}
    </div>
  );
}

/** Riadok čipov aktívnych filtrov; bez aktívneho filtra sa nezobrazí. */
function AktivneFiltre({ filters, lf }: { filters: FilterDef[]; lf: ListFilters }) {
  const { t } = useT();
  const cipy: { key: string; text: string; zrus: () => void }[] = [];
  for (const d of filters) {
    if (d.type === "checkbox" && lf.zapnute(d.key)) {
      cipy.push({ key: d.key, text: t(d.label), zrus: () => lf.setFilter(d.key, "") });
    } else if (d.type === "select" && lf.filter(d.key)) {
      const o = d.options.find((x) => x.value === lf.filter(d.key));
      cipy.push({
        key: d.key,
        text: `${t(d.label)}: ${o ? t(o.label) : lf.filter(d.key)}`,
        zrus: () => lf.setFilter(d.key, ""),
      });
    } else if (d.type === "dateRange") {
      const r = lf.rozsah(d.key);
      if (!r.od && !r.do) continue;
      const pole = d.dateFieldOptions?.find(
        (o) => o.value === (lf.filter(d.dateFieldKey ?? "podla") || d.dateFieldOptions?.[0]?.value),
      );
      const predvolba = PREDVOLBY_ROZSAHU.find((p) => p.kod === lf.filter(`${d.key}_p`));
      const obdobie = predvolba
        ? t(predvolba.nazov)
        : `${r.od ? datumNaDoklade(r.od) : "…"} – ${r.do ? datumNaDoklade(r.do) : "…"}`;
      cipy.push({
        key: d.key,
        text: pole
          ? `${t(d.label)} ${t("podľa {pole}", { pole: t(pole.label) })}: ${obdobie}`
          : `${t(d.label)}: ${obdobie}`,
        zrus: () =>
          lf.setFilters({
            [`${d.key}_od`]: "",
            [`${d.key}_do`]: "",
            [`${d.key}_p`]: "",
            [d.dateFieldKey ?? "podla"]: "",
          }),
      });
    }
  }
  if (!cipy.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {cipy.map((c) => (
        <span
          key={c.key}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-secondary/60 pl-2.5 pr-1 text-xs"
        >
          {c.text}
          <button
            type="button"
            aria-label={t("Zrušiť filter {nazov}", { nazov: c.text })}
            onClick={c.zrus}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => lf.clearFilters()}
        className="h-7 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        {t("Zrušiť všetko")}
      </button>
    </div>
  );
}

export type AkciaHlavicky = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  to?: string;
  search?: Record<string, unknown>;
  onClick?: () => void;
};

/**
 * Menej časté akcie zoznamu (Číselné rady, Import…) v hlavičke stránky pod „⋯“.
 */
export function HlavickaViac({ akcie }: { akcie: AkciaHlavicky[] }) {
  const { t } = useT();
  if (!akcie.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("Ďalšie akcie")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-secondary"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {akcie.map((a) => {
          const Ikona = a.icon;
          const obsah = (
            <>
              {Ikona && <Ikona className="h-4 w-4" />}
              {t(a.label)}
            </>
          );
          return a.to ? (
            <DropdownMenuItem key={a.label} asChild>
              <Link to={a.to as any} search={a.search as any} className="flex items-center gap-2">
                {obsah}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={a.label}
              onSelect={() => a.onClick?.()}
              className="flex items-center gap-2"
            >
              {obsah}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
