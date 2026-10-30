import type { ComponentType, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { formatovacMeny } from "@/lib/faktero/mena";

/**
 * Stavebné prvky mobilnej aplikácie.
 *
 * Predtým si každá obrazovka kreslila kartu, riadok aj hlavičku sekcie sama.
 * Vyzeralo to takmer rovnako — a to „takmer" bolo vidieť: iné zaoblenie na
 * faktúrach než v banke, iná veľkosť sumy, inde sivá popiska. Tu je každý
 * z tých prvkov raz a farby berie z tokenov `--app-*`, nie z tried s hex
 * hodnotami; svetlý aj tmavý režim sa tak menia na jednom mieste.
 */

/* ------------------------- sumy ------------------------- */

/**
 * Suma na zobrazenie.
 *
 * Vždy `tabular-nums`: bez toho sa v zozname pod sebou čísla nezarovnajú,
 * lebo „1" je v bežnom reze užšia než „8", a stĺpec súm sa vlní.
 */
export function suma(v: unknown, mena: string | null | undefined, loc: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return formatovacMeny(mena ?? "EUR", loc)(n);
}

/**
 * Dátum bez roka — „31. 8.".
 *
 * V zozname faktúr je rok šum: splatnosti sú v okolí dneška a celý dátum
 * rozbíja riadok na dva. Poradie dňa a mesiaca určuje jazyk, nie my.
 */
export function datumKratky(v: string | null | undefined, loc: string): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(loc, { day: "numeric", month: "numeric" });
}

/** Farebný význam sumy: prijaté zelenou, odchádzajúce a neutrálne čiernou. */
export type Ton = "neutral" | "zelena" | "cervena";

const TON_TEXT: Record<Ton, string> = {
  neutral: "text-app-text",
  zelena: "text-app-zelena",
  cervena: "text-app-chyba",
};

/** Pozadie a farba ikony v štvorčeku pred riadkom — „pozor" je oranžová (na kontrolu). */
const TON_IKONY: Record<Ton | "pozor", string> = {
  neutral: "bg-app-pozadie text-app-text-2",
  zelena: "bg-app-zelena-jemna text-app-zelena",
  cervena: "bg-app-chyba-jemna text-app-chyba",
  pozor: "bg-app-pozor-jemna text-app-pozor",
};

/* ------------------------- hlavička obrazovky ------------------------- */

/**
 * Nadpis obrazovky — veľký, v tele stránky, nie v lište.
 *
 * V návrhu je lišta takmer prázdna a názov obrazovky je až pod ňou v 28 px.
 * Drží sa tak jedno pravidlo: lišta patrí navigácii, nadpis obsahu.
 */
export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 pb-4 pt-1">
      <div className="min-w-0">
        <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight text-app-text">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-app-text-2">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-1 pt-1.5">{right}</div>}
    </div>
  );
}

/**
 * Nadpis sekcie v zozname — vľavo názov, vpravo prípadný súhrn.
 *
 * Plným písmom, nie sivými kapitálkami: v smere „A" sú sekcie (Čaká na vás,
 * Posledná aktivita) samostatné bloky a nadpis je to prvé, čo sa z nich číta.
 * Sivé kapitálky v 12 px boli na hranici čitateľnosti.
 */
export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1 pb-2 pt-1">
      <h2 className="text-[17px] font-bold leading-tight tracking-tight text-app-text">{title}</h2>
      {right && <span className="text-[13px] tabular-nums text-app-text-2">{right}</span>}
    </div>
  );
}

/* ------------------------- karty ------------------------- */

export function Card({
  children,
  className = "",
  onClick,
  ariaLabel,
  ariaPressed,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  /** Karta, ktorá niečo zapína (filter), nie karta, ktorá niekam vedie. */
  ariaPressed?: boolean;
}) {
  /* Bez tieňa: biela karta na sivom pozadí sa oddelí sama. Rámik je vo svetle
     priehľadný a v tme jemne viditeľný (`--app-obrys`). */
  const styl = `rounded-app border border-app-obrys bg-app-karta ${className}`;
  if (!onClick) return <div className={styl}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={`${styl} w-full text-left transition active:scale-[0.99] active:bg-app-pozadie`}
    >
      {children}
    </button>
  );
}

/**
 * Karta s jedným číslom — „Neuhradené", „Po splatnosti", „Celkový zostatok".
 *
 * Suma je najväčšia vec na karte, pretože je to jediné, čo si človek z tejto
 * karty odnesie; popis nad ňou a počet pod ňou sú kontext.
 */
export function StatCard({
  label,
  value,
  hint,
  ton = "neutral",
  velka,
  onClick,
  aktivna,
}: {
  label: string;
  value: string;
  hint?: string;
  ton?: Ton;
  /** Celoplošná karta (banka) má sumu o kúsok väčšiu než dvojica vedľa seba. */
  velka?: boolean;
  onClick?: () => void;
  /**
   * Karta zapína filter a toto je jeho stav.
   *
   * Keď je zadané, karta nikam nevedie — preto z nej zmizne šípka a namiesto
   * nej si zapnutý stav drží rámik. Šípka, ktorá by nikam neviedla, je horšia
   * než žiadna: sľubuje obrazovku, ktorá sa neotvorí.
   */
  aktivna?: boolean;
}) {
  const prepinac = aktivna !== undefined;
  return (
    <Card
      onClick={onClick}
      ariaPressed={prepinac ? aktivna : undefined}
      className={`p-4 ${aktivna ? "ring-2 ring-app-zelena" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] text-app-text-2">{label}</span>
        {onClick && !prepinac && <ChevronRight className="h-4 w-4 shrink-0 text-app-text-3" />}
      </div>
      <div
        className={`mt-1.5 font-extrabold tabular-nums leading-none tracking-tight ${velka ? "text-[30px]" : "text-[26px]"} ${TON_TEXT[ton]}`}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[13px] text-app-text-2">{hint}</div>}
    </Card>
  );
}

/* ------------------------- riadok zoznamu ------------------------- */

/**
 * Riadok zoznamu.
 *
 * Jeden tvar pre faktúry, doklady, odberateľov aj pohyby na účte: vľavo
 * voliteľná ikona, uprostred názov a popis, vpravo hodnota a šípka. Výška je
 * vždy aspoň 44 px — menší cieľ sa palcom na prvý raz netrafí.
 */
export function ListRow({
  icon: Icon,
  ikonaTon = "zelena",
  title,
  subtitle,
  right,
  rightSub,
  rightTon = "neutral",
  chevron,
  onClick,
}: {
  icon?: ComponentType<{ className?: string }>;
  ikonaTon?: Ton | "pozor";
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  rightSub?: ReactNode;
  rightTon?: Ton;
  chevron?: boolean;
  onClick?: () => void;
}) {
  const obsah = (
    <>
      {Icon && (
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${TON_IKONY[ikonaTon]}`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight text-app-text">
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[13px] leading-tight text-app-text-2">
            {subtitle}
          </span>
        )}
      </span>
      {(right || rightSub) && (
        <span className="shrink-0 text-right">
          {right && (
            <span
              className={`block text-[15px] font-bold tabular-nums leading-tight ${TON_TEXT[rightTon]}`}
            >
              {right}
            </span>
          )}
          {rightSub && <span className="mt-1 block leading-tight">{rightSub}</span>}
        </span>
      )}
      {chevron && <ChevronRight className="h-4 w-4 shrink-0 text-app-text-3" />}
    </>
  );

  const styl = "flex min-h-[44px] w-full items-center gap-3 px-4 py-3.5 text-left";
  if (!onClick) return <div className={styl}>{obsah}</div>;
  return (
    <button type="button" onClick={onClick} className={`${styl} transition active:bg-app-pozadie`}>
      {obsah}
    </button>
  );
}

/** Zoznam riadkov v jednej karte — deliace čiary kreslí obal, nie riadok. */
export function ListCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    /* Deliaca čiara neide od okraja po okraj — začína a končí s textom, ako v návrhu. */
    <Card
      className={`overflow-hidden [&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-4 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-app-ramik [&>*+*]:before:content-[''] ${className}`}
    >
      {children}
    </Card>
  );
}

/* ------------------------- štítky a chipy ------------------------- */

export function StatusBadge({ text, ton = "zelena" }: { text: string; ton?: Ton }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ton === "cervena"
          ? "bg-app-chyba-jemna text-app-chyba"
          : ton === "zelena"
            ? "bg-app-zelena-jemna text-app-zelena"
            : "bg-app-pozadie text-app-text-2"
      }`}
    >
      {text}
    </span>
  );
}

/**
 * Vodorovný pás filtrov.
 *
 * Roluje sa vodorovne a okraje pásu sú zámerne za okrajom obsahu — inak by
 * posledný chip vyzeral ako odrezaný namiesto „pokračuje ďalej".
 */
export function FilterChips<T extends string>({
  moznosti,
  aktivna,
  onZmen,
  ariaLabel,
}: {
  moznosti: { kod: T; popis: string }[];
  aktivna: T;
  onZmen: (kod: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {moznosti.map(({ kod, popis }) => {
        const je = kod === aktivna;
        return (
          <button
            key={kod}
            type="button"
            aria-pressed={je}
            onClick={() => onZmen(kod)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium transition active:scale-95 ${
              je
                ? "bg-app-zelena-plocha font-semibold text-white"
                : "border border-app-linka bg-app-karta text-app-text"
            }`}
          >
            {popis}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Krokovník — kde v sprievodcovi človek je.
 *
 * Čísla v krúžkoch, nie prúžok: pri troch krokoch sa dá povedať aj to, čo
 * ktorý krok obsahuje, a človek vie, či sa oplatí ísť ďalej. Hotové kroky
 * ostávajú zelené — späť sa dá, takže nesmú vyzerať zamknuto.
 */
export function StepIndicator({
  kroky,
  aktivny,
}: {
  kroky: string[];
  /** Číslované od 1. */
  aktivny: number;
}) {
  return (
    <ol className="mb-5 flex items-center gap-1.5">
      {kroky.map((popis, i) => {
        const cislo = i + 1;
        const je = cislo === aktivny;
        const hotovy = cislo < aktivny;
        return (
          <li key={popis} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${
                je || hotovy ? "bg-app-zelena-plocha text-white" : "bg-app-ramik text-app-text-3"
              }`}
            >
              {cislo}
            </span>
            <span
              className={`truncate text-[13px] ${
                je ? "font-semibold text-app-text" : "text-app-text-3"
              }`}
            >
              {popis}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------- tlačidlá ------------------------- */

/** Hlavná akcia obrazovky. Jedna na obrazovku — inak nie je hlavná. */
export function PrimaryCta({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[54px] w-full rounded-[16px] px-4 py-3.5 text-[16px] font-bold transition active:scale-[0.99] ${
        disabled ? "bg-app-ramik text-app-text-3" : "bg-app-zelena-plocha text-white"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Dlaždica rýchlej akcie — ikona v zelenom štvorčeku a popiska pod ňou.
 *
 * Vedľa seba v rovnakej šírke (mriežka, nie flex): sú to rovnocenné akcie,
 * takže žiadna z nich nesmie byť väčšia než ostatné.
 */
export function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-app border border-app-obrys bg-app-karta px-1 py-3.5 transition active:scale-[0.98] active:bg-app-pozadie"
    >
      <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-app-zelena-jemna text-app-zelena">
        <Icon className="h-5 w-5" />
      </span>
      {/* Štyri dlaždice vedľa seba: na 375–390 px sa „Rechnung“, „Beolvasás“ či „Skenovať“
          pri 13 px nezmestili a končili trojbodkou. */}
      <span className="w-full truncate text-center text-[12px] font-semibold leading-tight text-app-text min-[400px]:text-[13px]">
        {label}
      </span>
    </button>
  );
}

/** Prázdny stav — vždy s vetou, čo s tým, nie len s konštatovaním. */
export function PrazdnyStav({
  icon: Icon,
  title,
  popis,
  akcia,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  popis?: string;
  akcia?: ReactNode;
}) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-app-zelena-jemna text-app-zelena">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-[15px] font-semibold text-app-text">{title}</p>
      {popis && <p className="mt-1 max-w-[34ch] text-[13px] text-app-text-2">{popis}</p>}
      {akcia && <div className="mt-4 w-full max-w-[16rem]">{akcia}</div>}
    </div>
  );
}
