import { useId, type ReactNode } from "react";
import { Info } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { datumPoDnoch, dniMedzi } from "@/lib/faktero/splatnost-dni";

/*
  Spoločné pole hlavičky dokladu (faktúra, zálohová, dobropis, ťarchopis —
  vystavenie aj úprava). Každé pole má rovnaký popis, výšku a odstup; doplnok
  (rýchle tlačidlá, odkaz) sedí vpravo v riadku popisu, takže nemení výšku
  riadku mriežky. Kompaktné rozloženie dáva popis do rámčeka poľa (styles.css,
  `.pole-dokladu`) — bez spoliehania sa na tvar HTML, ako pri ostatných poliach.
*/

/** Vstup v poli dokladu — rovnaká výška a zaoblenie pre input, select aj tlačidlo. */
export const VSTUP_DOKLADU =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm tabular-nums tracking-normal";

export function PoleDokladu({
  label,
  htmlFor,
  doplnok,
  napoveda,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  /** Vysvetlivka — ikona (i) s bublinkou pri popise; pod poľom by posunula mriežku. */
  napoveda?: string;
  /** Vpravo v riadku popisu — tlačidlá 7d/14d/30d, odkaz na nastavenia. */
  doplnok?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const idNapovedy = useId();
  return (
    <div className={`pole-dokladu min-w-0 ${className ?? ""}`}>
      <div className="pole-dokladu-hlavicka mb-1 flex h-5 items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className={`pole-dokladu-popis truncate text-[13px] font-semibold text-foreground ${doplnok ? "shrink-0" : "min-w-0"}`}
        >
          {label}
        </label>
        {napoveda ? (
          <span className="pole-dokladu-napoveda group relative mr-auto inline-flex shrink-0">
            <button
              type="button"
              aria-label={napoveda}
              aria-describedby={idNapovedy}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:text-foreground"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            <span
              id={idNapovedy}
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 w-56 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-[11px] font-normal leading-snug text-popover-foreground opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
            >
              {napoveda}
            </span>
          </span>
        ) : null}
        {doplnok ? (
          <div className="pole-dokladu-doplnok flex shrink-0 items-center gap-1">{doplnok}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Mriežka hlavičky dokladu. Riadi sa šírkou karty (container query), nie
 * okna — na širokom monitore je karta polovičná vedľa platobných údajov.
 * Pod 768 px okna a v úzkej karte: jeden stĺpec. Od 20rem: dvojice a dátumy 2 + 1. Od 28rem:
 * dátumy v troch stĺpcoch. Bunky určujú `bunka.*`.
 */
export function MriezkaDokladu({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:@xs:grid-cols-6">{children}</div>
    </div>
  );
}

/** Šírky buniek v `MriezkaDokladu`. */
export const bunka = {
  cela: "md:@xs:col-span-6",
  polovica: "md:@xs:col-span-3",
  /** Dátum: na užšej karte dva vedľa seba (tretí na celý riadok), na širšej tri. */
  datum: "md:@xs:col-span-3 md:@md:col-span-2",
  datumPosledny: "md:@xs:col-span-6 md:@md:col-span-2",
  /** Tri polia v riadku (VS | KS | ŠS) — rovnako ako dátumy. */
  tretina: "md:@xs:col-span-3 md:@md:col-span-2",
  tretinaPosledna: "md:@xs:col-span-6 md:@md:col-span-2",
  /**
   * Dva dátumy vedľa seba a splatnosť s počtom dní na celom riadku — dátum
   * aj „14 dní“ sa do tretiny polovičnej karty nezmestia.
   */
  datumDvojica: "md:@xs:col-span-3",
  splatnostRiadok: "md:@xs:col-span-6",
} as const;

/**
 * Splatnosť s rýchlymi tlačidlami v riadku popisu (výšku riadku nemenia).
 * S `odDatumu` (dátum vystavenia) sa dá zadať aj počtom dní — „14 dní“ — a
 * tlačidlá rátajú od neho, nie od dneška.
 */
export function SplatnostPole({
  value,
  onChange,
  required,
  className,
  id = "splatnost-dokladu",
  odDatumu,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
  id?: string;
  odDatumu?: string;
}) {
  const { t } = useT();
  const za = (dni: number) => datumPoDnoch(odDatumu, dni);
  const dni = odDatumu !== undefined ? dniMedzi(odDatumu, value) : null;
  return (
    <PoleDokladu
      label={t("Splatnosť")}
      htmlFor={id}
      className={className}
      doplnok={
        <div
          role="group"
          aria-label={t("Splatnosť o")}
          className="flex overflow-hidden rounded-md border border-border"
        >
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange(za(d))}
              aria-pressed={value === za(d)}
              title={t("Splatnosť o {n} dní", { n: d })}
              className={`h-5 border-l border-border px-1 text-[11px] leading-none tabular-nums first:border-l-0 hover:bg-secondary ${
                value === za(d)
                  ? "bg-primary/10 font-semibold text-primary-hover"
                  : "text-muted-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      }
    >
      {odDatumu !== undefined ? (
        <div className="flex min-w-0 gap-2">
          <input
            id={id}
            type="date"
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${VSTUP_DOKLADU} flex-1`}
          />
          <label className="flex h-10 shrink-0 items-center gap-1 rounded-md border border-input bg-background pr-2 text-sm text-muted-foreground">
            <input
              type="number"
              min={0}
              max={3650}
              inputMode="numeric"
              aria-label={t("Splatnosť v dňoch")}
              value={dni ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(n) && n >= 0 && n <= 3650)
                  onChange(datumPoDnoch(odDatumu, Math.round(n)));
              }}
              className="h-full w-12 min-w-0 rounded-md bg-transparent pl-2 text-right tabular-nums text-foreground outline-none"
            />
            {t("dní")}
          </label>
        </div>
      ) : (
        <input
          id={id}
          type="date"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={VSTUP_DOKLADU}
        />
      )}
    </PoleDokladu>
  );
}

/** Číslo dokladu do hlavičky karty: „FA20260004 · pridelí sa pri uložení“. */
export function CisloDokladuOdznak({ cislo }: { cislo: string | null }) {
  const { t } = useT();
  if (!cislo) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground">
      <strong className="font-mono font-semibold tabular-nums text-foreground">{cislo}</strong>
      <span aria-hidden>·</span> {t("pridelí sa pri uložení")}
    </span>
  );
}
