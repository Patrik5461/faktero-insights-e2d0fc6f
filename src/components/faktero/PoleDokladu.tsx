import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/useT";

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
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  /** Vpravo v riadku popisu — tlačidlá 7d/14d/30d, odkaz na nastavenia. */
  doplnok?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`pole-dokladu min-w-0 ${className ?? ""}`}>
      <div className="pole-dokladu-hlavicka mb-1 flex h-5 items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className={`pole-dokladu-popis truncate text-[13px] font-semibold text-foreground ${doplnok ? "shrink-0" : "min-w-0"}`}
        >
          {label}
        </label>
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
} as const;

/** Splatnosť s rýchlymi tlačidlami v riadku popisu (výšku riadku nemenia). */
export function SplatnostPole({
  value,
  onChange,
  required,
  className,
  id = "splatnost-dokladu",
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
  id?: string;
}) {
  const { t } = useT();
  const za = (dni: number) => new Date(Date.now() + dni * 86400000).toISOString().slice(0, 10);
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
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      }
    >
      <input
        id={id}
        type="date"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={VSTUP_DOKLADU}
      />
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
