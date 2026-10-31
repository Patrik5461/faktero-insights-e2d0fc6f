import { Children, forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, ChevronDown, MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/useT";
import { manualPre } from "./nav";
import { useSpat } from "./AppShell";

/**
 * Hlavička detailu dokladu — jedna pre faktúry všetkých typov, ponuky,
 * objednávky, prijaté faktúry, vyúčtovania…
 *
 * Predtým mal každý detail vlastnú kopu tlačidiel v `PageHeader`: nadpis sa
 * lámal na dva riadky, odznak „Manuál“ visel uprostred, stav bol holý text
 * medzi tlačidlami a dve zelené tlačidlá si konkurovali. Tu je pevné poradie:
 *
 *   [←] Nadpis číslo [stav]                [Primárna] [Náhľad] [PDF] […]
 *       vystavená · splatná
 *
 * - `primaryAction` — najviac jedna hlavná akcia (`PrimarnaAkcia` / `SplitAkcia`),
 * - `secondaryActions` — `SekundarnaAkcia` (v úzkej hlavičke len ikona s popisom),
 * - `menuActions` — `MenuSkupina` s `MenuAkcia`; manuál sa pridá na koniec sám.
 *
 * Okná, ktoré otvára položka ponuky, sa vykresľujú mimo ponuky (stav v
 * stránke). Ponuka je `modal={false}` a po zatvorení nevracia fokus na „…“,
 * keď je otvorené okno — inak by mu ho Radix hneď vzal.
 */
export function DocumentDetailHeader({
  title,
  number,
  status,
  meta,
  primaryAction,
  secondaryActions,
  menuActions,
  help,
  back = true,
}: {
  /** Typ dokladu (už preložený), napr. „Faktúra“. */
  title: string;
  /** Číslo dokladu — vypíše sa za typom s `tabular-nums`. */
  number?: string | null;
  status?: ReactNode;
  meta?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  menuActions?: ReactNode;
  /** Vlastný manuál, keď automatický nesedí; `false` ho skryje. */
  help?: string | false;
  back?: boolean;
}) {
  const { t } = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const manual = help === false ? null : (help ?? manualPre(pathname));
  const { podstranka, spat } = useSpat();
  const sipka = back && podstranka;
  const celyNadpis = number ? `${title} ${number}` : title;
  const maMenu = Boolean(manual) || Children.toArray(menuActions).length > 0;
  /*
    Len „…“ bez ďalších akcií (nové vyúčtovanie, detail bez hlavnej akcie): ide do riadku
    s nadpisom vpravo. Inak by na telefóne ostal sám v prázdnom riadku pod nadpisom.
  */
  const lenMenu = maMenu && !primaryAction && Children.toArray(secondaryActions).length === 0;
  const ponuka = (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("Ďalšie akcie")}
              className={cn("shrink-0", !primaryAction && "ml-auto @2xl:ml-0")}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("Ďalšie akcie")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className={cn(
          "w-64",
          // Prázdna skupina nenechá po sebe dvojitú ani krajnú čiaru.
          "[&>[role=separator]:first-child]:hidden [&>[role=separator]:last-child]:hidden [&>[role=separator]+[role=separator]]:hidden",
        )}
        onCloseAutoFocus={nevracajFokusDoOkna}
      >
        {menuActions}
        {manual && (
          <MenuSkupina>
            <DropdownMenuItem asChild>
              <a
                href={manual}
                target="_blank"
                rel="noreferrer"
                title={t("Otvoriť manuál v novom okne")}
              >
                <BookOpen className="h-4 w-4" /> {t("Manuál")}
              </a>
            </DropdownMenuItem>
          </MenuSkupina>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="@container mx-auto w-full max-w-[1440px] border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:justify-between @2xl:gap-6">
          {/* Ľavá časť: späť, nadpis so stavom, dátumy */}
          <div className="min-w-0 @2xl:flex-1">
            <div className="flex min-w-0 items-center gap-2">
              {sipka && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={spat}
                      aria-label={t("Späť")}
                      className="-ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("Späť")}</TooltipContent>
                </Tooltip>
              )}
              {/* Stav sa radšej presunie pod nadpis, než by sa nadpis zalomil. */}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                {/* Keď sa nezmestí, skráti sa typ dokladu — číslo ostane vidieť celé. */}
                <h1
                  className="flex min-w-0 max-w-full items-baseline gap-x-[0.3em] whitespace-nowrap text-lg font-semibold tracking-tight @2xl:text-xl @5xl:text-2xl"
                  title={celyNadpis}
                >
                  <span className="min-w-0 truncate">{title}</span>
                  {number ? <span className="shrink-0 tabular-nums">{number}</span> : null}
                </h1>
                {status ? <div className="flex shrink-0 items-center gap-1.5">{status}</div> : null}
              </div>
              {lenMenu ? ponuka : null}
            </div>
            {meta ? (
              <div
                className={cn(
                  "mt-0.5 text-sm text-muted-foreground @2xl:truncate",
                  sipka && "pl-9",
                )}
              >
                {meta}
              </div>
            ) : null}
          </div>

          {/* Pravá časť: jedna primárna, sekundárne, „…“ */}
          {!lenMenu && (primaryAction || secondaryActions || maMenu) && (
            <div className="flex w-full flex-wrap items-center gap-2 @2xl:w-auto @2xl:shrink-0 @2xl:flex-nowrap @2xl:justify-end">
              {/*
                Hlavná akcia sa nikdy neskracuje: má šírku podľa textu (aj v DE/CS)
                a keď sa vedľa ikon nezmestí, zalomí sa na vlastný riadok cez celú
                šírku — ikony idú pod ňu doprava. Predtým ju ikony stlačili na
                „Odoslať eFaktu…“.
              */}
              {primaryAction ? (
                <div
                  data-hlavna-akcia=""
                  className="flex max-w-full shrink-0 grow basis-auto @2xl:grow-0"
                >
                  {primaryAction}
                </div>
              ) : null}
              <div
                data-akcie-hlavicky=""
                className={cn(
                  "flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2 @2xl:flex-nowrap",
                  primaryAction ? "ml-auto" : "w-full @2xl:w-auto",
                )}
              >
                {secondaryActions}
                {maMenu && ponuka}
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

/** Keď položka ponuky otvorila okno, fokus patrí oknu, nie tlačidlu „…“. */
function nevracajFokusDoOkna(e: Event) {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) e.preventDefault();
}

/* ---------- Stav a dátumy ---------- */

/** Stavový odznak — farbu dodá stránka (`className`), tvar je všade rovnaký. */
export function StavOdznak({
  className,
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        className ?? "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** Riadok dátumov pod nadpisom, položky oddelené „·“; prázdne sa vynechajú. */
export function MetaRiadok({ polozky }: { polozky: ReactNode[] }) {
  const platne = polozky.filter((p) => p !== null && p !== undefined && p !== false && p !== "");
  return (
    <>
      {platne.map((p, i) => (
        <span key={i}>
          {i > 0 ? " · " : null}
          {/* Položka sa zalomí celá („splatná 10. 11. 2026“ nie na „10.“ a „11. 2026“). */}
          <span className="inline-block max-w-full">{p}</span>
        </span>
      ))}
    </>
  );
}

/** Časť meta riadku, ktorá je po termíne (splatnosť, platnosť, dodanie). */
export function PoTermine({ children, aktivne }: { children: ReactNode; aktivne: boolean }) {
  return aktivne ? (
    <span className="font-medium text-destructive">{children}</span>
  ) : (
    <>{children}</>
  );
}

/* ---------- Akcie ---------- */

/**
 * Hlavná akcia dokladu. Na mobile sa roztiahne cez celý riadok vedľa „…“.
 * Pre odkaz: `<PrimarnaAkcia asChild><Link …><Ikona /> Text</Link></PrimarnaAkcia>`.
 */
export const PrimarnaAkcia = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof Button>>(
  function PrimarnaAkcia({ className, ...props }, ref) {
    return (
      <Button
        ref={ref}
        type="button"
        className={cn("h-9 w-full @2xl:w-auto", className)}
        {...props}
      />
    );
  },
);

/**
 * Rozdelené tlačidlo: hlavná časť spustí najčastejšiu voľbu, šípka ukáže
 * všetky (`children` = `MenuAkcia`).
 */
export function SplitAkcia({
  ikona: Ikona,
  label,
  onClick,
  disabled,
  title,
  menuLabel,
  children,
}: {
  ikona: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  /** Popis šípky pre čítačku, napr. „Spôsob odoslania“. */
  menuLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full @2xl:w-auto">
      <Button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className="h-9 flex-1 rounded-r-none @2xl:flex-none"
      >
        <Ikona /> {label}
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            aria-label={menuLabel}
            title={menuLabel}
            className="h-9 w-9 shrink-0 rounded-l-none border-l border-primary-foreground/25 px-0"
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={nevracajFokusDoOkna}>
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Sekundárna akcia (Náhľad, Stiahnuť PDF). S textom až keď je hlavička
 * široká aspoň 56rem, inak len ikona s popisom v bublinke. Rozhoduje šírka
 * hlavičky (container query), nie okna — pri 1024 bodoch zaberie bočné menu
 * štvrtinu a nadpis by sa inak orezal.
 */
export function SekundarnaAkcia({
  ikona: Ikona,
  label,
  onClick,
  disabled,
  title,
}: {
  ikona: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Dlhšie vysvetlenie; inak bublinka zopakuje `label`. */
  title?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className="h-9 w-9 shrink-0 px-0 @4xl:w-auto @4xl:px-3"
        >
          <Ikona />
          <span className="hidden @4xl:inline">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title ?? label}</TooltipContent>
    </Tooltip>
  );
}

/** Skupina v ponuke „…“; prázdna (všetky podmienky nepravdivé) sa nevykreslí. */
export function MenuSkupina({ label, children }: { label?: string; children: ReactNode }) {
  if (Children.toArray(children).length === 0) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {label ? (
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {label}
          </DropdownMenuLabel>
        ) : null}
        {children}
      </DropdownMenuGroup>
    </>
  );
}

/**
 * Položka ponuky s ikonou. Pre odkaz `asChild` a `<Link>` ako dieťa (ikonu
 * potom dajte do odkazu sami: `<Ikona className="h-4 w-4" />`).
 */
export function MenuAkcia({
  ikona: Ikona,
  children,
  onClick,
  disabled,
  title,
  nebezpecna,
  asChild,
}: {
  ikona?: LucideIcon;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  nebezpecna?: boolean;
  asChild?: boolean;
}) {
  return (
    <DropdownMenuItem
      onClick={onClick}
      disabled={disabled}
      title={title}
      asChild={asChild}
      className={nebezpecna ? "text-destructive focus:text-destructive" : undefined}
    >
      {asChild ? (
        children
      ) : (
        <>
          {Ikona ? <Ikona className="h-4 w-4" /> : null}
          {children}
        </>
      )}
    </DropdownMenuItem>
  );
}
