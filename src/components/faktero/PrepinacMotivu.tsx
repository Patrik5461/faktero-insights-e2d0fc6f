import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { nacitajMotiv, nasadMotiv, sledujSystem, ulozMotiv, type Motiv } from "@/lib/faktero/motiv";

const MOZNOSTI: { hodnota: Motiv; popis: string; ikona: typeof Sun }[] = [
  { hodnota: "svetly", popis: "Svetlý", ikona: Sun },
  { hodnota: "tmavy", popis: "Tmavý", ikona: Moon },
  { hodnota: "system", popis: "Podľa systému", ikona: Monitor },
];

/**
 * Prepínač svetlého a tmavého režimu.
 *
 * Tri možnosti, nie prepínač áno/nie: „podľa systému" je predvolená a väčšine
 * ľudí stačí — kto má v telefóne nočný režim, chce ho aj tu.
 *
 * Voľba sa číta až v efekte. Na serveri sa stránka vykresľuje bez prístupu
 * k `localStorage`, takže vykreslená a načítaná podoba by sa nezhodovali
 * a React by to zahlásil ako nesúlad.
 */
export function PrepinacMotivu() {
  const [volba, setVolba] = useState<Motiv | null>(null);

  useEffect(() => {
    const ulozena = nacitajMotiv();
    setVolba(ulozena);
    nasadMotiv(ulozena);
  }, []);

  // Systém sa môže prepnúť aj počas práce (nočný režim o západe slnka).
  useEffect(() => sledujSystem(() => volba ?? "system"), [volba]);

  return (
    <div
      role="group"
      aria-label="Vzhľad"
      className="flex gap-1 rounded-md border border-border p-0.5"
    >
      {MOZNOSTI.map(({ hodnota, popis, ikona: Ikona }) => {
        const aktivna = volba === hodnota;
        return (
          <button
            key={hodnota}
            type="button"
            aria-pressed={aktivna}
            title={popis}
            onClick={() => {
              setVolba(hodnota);
              ulozMotiv(hodnota);
            }}
            className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] transition ${
              aktivna
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Ikona className="h-3.5 w-3.5" />
            {popis}
          </button>
        );
      })}
    </div>
  );
}
