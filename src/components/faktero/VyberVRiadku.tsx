import { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { textMoznosti, type MoznostKodu } from "@/lib/faktero/predkontacie";
import { useT } from "@/lib/i18n/useT";

export type MoznostVyberu = { hodnota: string; text: string; popis?: string | null };

/** Predkontácie z číselníka ako voľby (názov ako hlavný text, kód a účty pod ním). */
export function moznostiKodov(m: MoznostKodu[]): MoznostVyberu[] {
  return m.map((k) => ({
    hodnota: k.kod,
    text: k.popis?.trim() || k.kod,
    popis: k.popis?.trim() ? [k.kod, k.ucty].filter(Boolean).join(" · ") : k.ucty,
  }));
}

/** Zoznam volieb s hľadaním — v riadku zoznamu aj v okne hromadnej akcie. */
export function ZoznamMoznosti({
  moznosti,
  hodnota,
  onVyber,
  prazdne,
}: {
  moznosti: MoznostVyberu[];
  hodnota?: string | null;
  onVyber: (v: string) => void;
  /** Text voľby „bez hodnoty" (napr. „Nedefinované"); bez neho sa vyčistiť nedá. */
  prazdne?: string;
}) {
  const { t } = useT();
  return (
    <Command
      filter={(v, hladane) => (v.toLowerCase().includes(hladane.toLowerCase()) ? 1 : 0)}
      className="max-h-80"
    >
      <CommandInput placeholder={t("Hľadať…")} autoFocus />
      <CommandList className="max-h-64">
        <CommandEmpty>{t("Nič sa nenašlo")}</CommandEmpty>
        {prazdne ? (
          <CommandItem value={`— ${prazdne}`} onSelect={() => onVyber("")}>
            <span className="text-muted-foreground">{prazdne}</span>
          </CommandItem>
        ) : null}
        {moznosti.map((m) => (
          <CommandItem
            key={m.hodnota}
            value={`${m.text} ${m.popis ?? ""} ${m.hodnota}`}
            onSelect={() => onVyber(m.hodnota)}
            className={m.hodnota === hodnota ? "bg-accent/60" : undefined}
          >
            <span className="min-w-0">
              <span className="block truncate">{m.text}</span>
              {m.popis ? (
                <span className="block truncate text-xs text-muted-foreground">{m.popis}</span>
              ) : null}
            </span>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

/**
 * Malý výber s hľadaním priamo v riadku zoznamu. Obsah sa vykreslí až po
 * otvorení — sto riadkov zoznamu drží len tlačidlá. Zamknutý doklad ukáže
 * zámok s dôvodom a hodnotu len na čítanie.
 */
export function VyberVRiadku({
  hodnota,
  moznosti,
  onVyber,
  zamok,
  ariaLabel,
  prazdne,
  nazovPrazdnej,
}: {
  hodnota: string | null | undefined;
  moznosti: MoznostVyberu[];
  onVyber: (v: string) => void | Promise<void>;
  /** Dôvod zámku (preložený) — výber sa neotvorí. */
  zamok?: string | null;
  ariaLabel: string;
  /** Voľba na vyčistenie hodnoty. */
  prazdne?: string;
  /** Text tlačidla bez hodnoty. */
  nazovPrazdnej?: string;
}) {
  const { t } = useT();
  const [otvorene, setOtvorene] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const vybrana = moznosti.find((m) => m.hodnota === hodnota);
  const text = hodnota ? (vybrana?.text ?? hodnota) : (nazovPrazdnej ?? t("Nedefinované"));
  if (zamok) {
    return (
      <span
        className="inline-flex max-w-[14rem] items-center gap-1 text-xs text-muted-foreground"
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
          aria-label={ariaLabel}
          disabled={ukladam}
          title={vybrana?.popis ? `${vybrana.text} · ${vybrana.popis}` : undefined}
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex max-w-[14rem] items-center gap-1 rounded-md border border-input bg-background px-1.5 py-1 text-left text-xs hover:bg-secondary disabled:opacity-50 ${
            hodnota ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <span className="min-w-0 truncate">{text}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <ZoznamMoznosti
          moznosti={moznosti}
          hodnota={hodnota}
          prazdne={prazdne}
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

/** Text predkontácie do bunky, keď sa nedá vyberať (číselník nie je). */
export function textKodu(kod: string | null | undefined, moznosti: MoznostKodu[]): string {
  if (!kod) return "—";
  const m = moznosti.find((x) => x.kod === kod);
  return m ? textMoznosti(m) : kod;
}
