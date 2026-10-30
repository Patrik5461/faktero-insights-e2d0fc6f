import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Lock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  polozkyZoznamu,
  posunAktivny,
  zaciatocnyAktivny,
  type Klavesa,
  type MoznostVyberu,
  type PolozkaZoznamu,
} from "@/lib/faktero/vyber-kodu";
import { useT } from "@/lib/i18n/useT";

/*
  Jeden výber kódu s hľadaním pre predkontáciu, členenie DPH a KV — vo
  formulároch dokladov, v oknách hromadných akcií aj v riadku zoznamu.

  Písaním sa filtruje podľa kódu, názvu aj účtov MD/D bez ohľadu na
  diakritiku; šípky, Home/End a Enter vyberajú, Escape zavrie len tento
  výber (nie okno, v ktorom je). Zoznam sa vykreslí až po otvorení, takže
  stovky riadkov zoznamu držia len tlačidlá.
*/

const KLAVESY: Klavesa[] = ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"];
/** Viac volieb naraz netreba — kto ich má viac, hľadá. */
const NAJVIAC_VOLIEB = 300;

/** Zoznam volieb s hľadaním (combobox + listbox) — obsah otvoreného výberu. */
export function ZoznamKodov({
  moznosti,
  hodnota,
  onVyber,
  prazdne,
  vlastny,
  onZavri,
}: {
  moznosti: MoznostVyberu[];
  hodnota?: string | null;
  onVyber: (v: string) => void;
  /** Text voľby „bez hodnoty" (napr. „Nedefinované"); bez neho sa vyčistiť nedá. */
  prazdne?: string;
  /** Dovolí použiť napísaný kód, ktorý v číselníku nie je. */
  vlastny?: boolean;
  /** Escape — zavrie výber. */
  onZavri?: () => void;
}) {
  const { t } = useT();
  const id = useId();
  const [hladane, setHladane] = useState("");
  const polozky = useMemo(
    () => polozkyZoznamu(moznosti, hladane, { prazdne: !!prazdne, vlastny }),
    [moznosti, hladane, prazdne, vlastny],
  );
  const viditelne = polozky.length > NAJVIAC_VOLIEB ? polozky.slice(0, NAJVIAC_VOLIEB) : polozky;
  const [aktivny, setAktivny] = useState(() => zaciatocnyAktivny(polozky, hodnota));
  const zoznam = useRef<HTMLUListElement>(null);

  // Po zmene hľadania je aktívna prvá zhoda.
  const prve = useRef(true);
  useEffect(() => {
    if (prve.current) {
      prve.current = false;
      return;
    }
    setAktivny(viditelne.length ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hladane]);

  useEffect(() => {
    if (aktivny < 0) return;
    zoznam.current
      ?.querySelector<HTMLElement>(`[data-index="${aktivny}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [aktivny]);

  function klavesa(e: KeyboardEvent<HTMLInputElement>) {
    if ((KLAVESY as string[]).includes(e.key)) {
      e.preventDefault();
      setAktivny((a) => posunAktivny(a, e.key as Klavesa, viditelne.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = viditelne[aktivny];
      if (p) onVyber(p.hodnota);
    } else if (e.key === "Escape") {
      // Len tento výber — ručne kreslené okno okolo počúva Escape na window.
      e.preventDefault();
      e.stopPropagation();
      onZavri?.();
    }
  }

  const idPolozky = (i: number) => `${id}-v${i}`;
  const text = (p: PolozkaZoznamu): ReactNode => {
    if (p.druh === "prazdne") return <span className="text-muted-foreground">{prazdne}</span>;
    if (p.druh === "vlastny")
      return (
        <span>
          {t("Použiť kód „{kod}“", { kod: p.hodnota })}
          <span className="block text-xs text-amber-700">{t("nie je v číselníku")}</span>
        </span>
      );
    return (
      <span className="min-w-0">
        <span className="block truncate">{p.moznost.text}</span>
        {p.moznost.popis ? (
          <span className="block truncate text-xs text-muted-foreground">{p.moznost.popis}</span>
        ) : null}
      </span>
    );
  };

  return (
    <div className="flex max-h-80 flex-col">
      <div className="border-b border-border p-1.5">
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-zoznam`}
          aria-autocomplete="list"
          aria-activedescendant={aktivny >= 0 ? idPolozky(aktivny) : undefined}
          aria-label={t("Hľadať kód, názov alebo účet")}
          autoFocus
          value={hladane}
          onChange={(e) => setHladane(e.target.value)}
          onKeyDown={klavesa}
          placeholder={t("Hľadať kód, názov alebo účet…")}
          className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <ul
        ref={zoznam}
        id={`${id}-zoznam`}
        role="listbox"
        aria-label={t("Voľby")}
        className="min-h-0 flex-1 overflow-y-auto p-1"
      >
        {viditelne.length ? (
          viditelne.map((p, i) => {
            const vybrana = p.druh !== "vlastny" && p.hodnota === (hodnota ?? "");
            return (
              <li
                key={`${p.druh}:${p.hodnota}`}
                id={idPolozky(i)}
                data-index={i}
                role="option"
                aria-selected={vybrana}
                onMouseMove={() => aktivny !== i && setAktivny(i)}
                // mousedown, aby sa nestratil fokus z hľadania skôr, než sa vyberie
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onVyber(p.hodnota)}
                className={`flex cursor-pointer items-start gap-1.5 rounded-sm px-2 py-1.5 text-sm ${
                  i === aktivny ? "bg-accent text-accent-foreground" : ""
                }`}
              >
                <Check
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${vybrana ? "opacity-100" : "opacity-0"}`}
                />
                {text(p)}
              </li>
            );
          })
        ) : (
          <li role="presentation" className="px-2 py-4 text-center text-sm text-muted-foreground">
            {t("Nič sa nenašlo")}
          </li>
        )}
        {polozky.length > NAJVIAC_VOLIEB ? (
          <li role="presentation" className="px-2 py-1.5 text-center text-xs text-muted-foreground">
            {t("Ďalšie voľby nájdete hľadaním")}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * Výber kódu s hľadaním. `vzhlad="pole"` je políčko formulára (trieda sa
 * dá prepísať `className`), `vzhlad="riadok"` malé tlačidlo do bunky zoznamu.
 * Zamknutý doklad (`zamok` = preložený dôvod) ukáže len hodnotu so zámkom.
 */
export function VyberKodu({
  hodnota,
  moznosti,
  onVyber,
  ariaLabel,
  prazdne,
  nazovPrazdnej,
  textHodnoty,
  vlastny,
  zamok,
  disabled,
  vzhlad = "pole",
  className,
}: {
  hodnota: string | null | undefined;
  moznosti: MoznostVyberu[];
  onVyber: (v: string) => void | Promise<void>;
  ariaLabel: string;
  prazdne?: string;
  /** Text tlačidla bez hodnoty. */
  nazovPrazdnej?: string;
  /** Text tlačidla pre hodnotu (inak text voľby alebo samotný kód). */
  textHodnoty?: string;
  vlastny?: boolean;
  zamok?: string | null;
  disabled?: boolean;
  vzhlad?: "pole" | "riadok";
  className?: string;
}) {
  const { t } = useT();
  const [otvorene, setOtvorene] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const vybrana = hodnota ? moznosti.find((m) => m.hodnota === hodnota) : undefined;
  const text = hodnota
    ? (textHodnoty ?? vybrana?.text ?? hodnota)
    : (nazovPrazdnej ?? t("Nedefinované"));
  const riadok = vzhlad === "riadok";

  if (zamok) {
    return (
      <span
        className={`inline-flex min-w-0 items-center gap-1 text-muted-foreground ${riadok ? "max-w-[14rem] text-xs" : "w-full text-sm"}`}
        title={zamok}
      >
        <Lock className="h-3 w-3 shrink-0" aria-label={zamok} />
        <span className="truncate">{hodnota ? text : "—"}</span>
      </span>
    );
  }

  return (
    <Popover open={otvorene} onOpenChange={setOtvorene}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={otvorene}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          disabled={disabled || ukladam}
          title={vybrana?.popis ? `${vybrana.text} · ${vybrana.popis}` : undefined}
          onClick={(e) => e.stopPropagation()}
          className={
            riadok
              ? `inline-flex max-w-[14rem] items-center gap-1 rounded-md border border-input bg-background px-1.5 py-1 text-left text-xs hover:bg-secondary disabled:opacity-50 ${
                  hodnota ? "text-foreground" : "text-muted-foreground"
                }`
              : `flex min-w-0 items-center justify-between gap-1 text-left disabled:opacity-50 ${
                  className ??
                  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                } ${hodnota ? "" : "text-muted-foreground"}`
          }
        >
          <span className="min-w-0 truncate">{text}</span>
          <ChevronDown className={`${riadok ? "h-3 w-3" : "h-4 w-4"} shrink-0 opacity-60`} />
        </button>
      </PopoverTrigger>
      {/* z-[90]: zoznam musí byť nad ručne kreslenými oknami (z-[60] až z-[80]), inak sa voľba nedá kliknúť. */}
      <PopoverContent
        className="z-[90] w-[min(22rem,calc(100vw-2rem))] min-w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        collisionPadding={16}
        onClick={(e) => e.stopPropagation()}
      >
        <ZoznamKodov
          moznosti={moznosti}
          hodnota={hodnota}
          prazdne={prazdne}
          vlastny={vlastny}
          onZavri={() => setOtvorene(false)}
          onVyber={async (v) => {
            setOtvorene(false);
            if (v === (hodnota ?? "")) return;
            setUkladam(true);
            try {
              await onVyber(v);
            } finally {
              setUkladam(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
