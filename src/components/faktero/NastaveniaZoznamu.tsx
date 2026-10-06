import { useState } from "react";
import { Columns3, Bookmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NastaveniaZoznamu as Nastavenia } from "@/hooks/useNastaveniaZoznamu";
import type { StlpecZoznamu } from "@/lib/faktero/nastavenia-zoznamov";

/**
 * Lišta nad zoznamom: uložené filtre a výber stĺpcov (ako v Doklado).
 * `aktualne` sú hodnoty filtrov, ktoré sa uložia; `pouzi` ich nastaví späť.
 */
export function NastaveniaZoznamu({
  nastavenia,
  stlpce,
  aktualne,
  pouzi,
}: {
  nastavenia: Nastavenia;
  stlpce: StlpecZoznamu[];
  aktualne: Record<string, string>;
  pouzi: (hodnoty: Record<string, string>) => void;
}) {
  const [vybrany, setVybrany] = useState("");
  const [meno, setMeno] = useState("");
  const [filtrePreVsetky, setFiltrePreVsetky] = useState(false);
  const [zvolene, setZvolene] = useState<string[]>([]);
  const [stlpcePreVsetky, setStlpcePreVsetky] = useState(false);
  const [otvoreneStlpce, setOtvoreneStlpce] = useState(false);
  const [otvoreneUlozenie, setOtvoreneUlozenie] = useState(false);

  const kluc = (f: { nazov: string; vsetkyFirmy?: boolean }) =>
    `${f.vsetkyFirmy ? "v" : "f"}:${f.nazov}`;
  const aktivny = nastavenia.filtre.find((f) => kluc(f) === vybrany);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Uložené filtre"
        value={vybrany}
        onChange={(e) => {
          setVybrany(e.target.value);
          const f = nastavenia.filtre.find((x) => kluc(x) === e.target.value);
          if (f) pouzi(f.hodnoty);
        }}
        className="h-9 max-w-48 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">Uložené filtre…</option>
        {nastavenia.filtre.map((f) => (
          <option key={kluc(f)} value={kluc(f)}>
            {f.nazov}
            {f.vsetkyFirmy ? " (všetky firmy)" : ""}
          </option>
        ))}
      </select>
      {aktivny && (
        <button
          type="button"
          title="Zmazať uložený filter"
          aria-label="Zmazať uložený filter"
          onClick={async () => {
            if (!confirm(`Zmazať filter „${aktivny.nazov}"?`)) return;
            await nastavenia
              .zmazFilter(aktivny)
              .catch((e) => toast.error(e?.message ?? "Nepodarilo sa"));
            setVybrany("");
          }}
          className="inline-flex h-9 items-center rounded-md border border-border px-2 text-muted-foreground hover:bg-secondary"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      <Popover open={otvoreneUlozenie} onOpenChange={setOtvoreneUlozenie}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
          >
            <Bookmark className="h-4 w-4" /> Uložiť filter
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="space-y-3">
          <div className="text-sm font-medium">Uložiť aktuálny filter</div>
          <input
            value={meno}
            onChange={(e) => setMeno(e.target.value)}
            placeholder="Názov, napr. Neuhradené Orange"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filtrePreVsetky}
              onChange={(e) => setFiltrePreVsetky(e.target.checked)}
            />
            Pre všetky moje firmy
          </label>
          <button
            type="button"
            disabled={!meno.trim()}
            onClick={async () => {
              try {
                await nastavenia.ulozFilter(meno.trim(), aktualne, filtrePreVsetky);
                setVybrany(kluc({ nazov: meno.trim().slice(0, 60), vsetkyFirmy: filtrePreVsetky }));
                setMeno("");
                setOtvoreneUlozenie(false);
                toast.success("Filter je uložený");
              } catch (e: any) {
                toast.error(e?.message ?? "Nepodarilo sa");
              }
            }}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Uložiť
          </button>
        </PopoverContent>
      </Popover>

      <Popover
        open={otvoreneStlpce}
        onOpenChange={(o) => {
          setOtvoreneStlpce(o);
          if (o) {
            setZvolene(nastavenia.viditelne);
            setStlpcePreVsetky(nastavenia.stlpcePreVsetky);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
          >
            <Columns3 className="h-4 w-4" /> Stĺpce
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="space-y-2">
          <div className="text-sm font-medium">Zobrazené stĺpce</div>
          {stlpce.map((s) => (
            <label key={s.kluc} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={s.povinny}
                checked={s.povinny || zvolene.includes(s.kluc)}
                onChange={(e) =>
                  setZvolene(
                    e.target.checked ? [...zvolene, s.kluc] : zvolene.filter((k) => k !== s.kluc),
                  )
                }
              />
              {s.nazov}
            </label>
          ))}
          <label className="flex items-center gap-2 border-t border-border pt-2 text-sm">
            <input
              type="checkbox"
              checked={stlpcePreVsetky}
              onChange={(e) => setStlpcePreVsetky(e.target.checked)}
            />
            Pre všetky moje firmy
          </label>
          <button
            type="button"
            onClick={async () => {
              try {
                await nastavenia.ulozStlpce(zvolene, stlpcePreVsetky);
                setOtvoreneStlpce(false);
              } catch (e: any) {
                toast.error(e?.message ?? "Nepodarilo sa");
              }
            }}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Uložiť
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
