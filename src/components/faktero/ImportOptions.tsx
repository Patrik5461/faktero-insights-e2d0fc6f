/**
 * Voľby importu — spoločné pre všetky zdroje.
 *
 * Pôvodne to boli nezávislé zaškrtávacie políčka „Importovať iba odberateľov"
 * a „Importovať iba faktúry". Kto zaškrtol obe (a je to pochopiteľné — znie to
 * ako „chcem oboje"), dostal import, ktorý dobehol ako úspešný a nezapísal ani
 * jednu faktúru. Rozsah je preto jediná voľba z troch a protirečenie sa nedá
 * nastaviť.
 */

export type ImportRozsah = "vsetko" | "odberatelia" | "faktury";

export type ImportVolby = {
  updateExisting: boolean;
  customersOnly: boolean;
  invoicesOnly: boolean;
};

export const PREDVOLENE_VOLBY: ImportVolby = {
  updateExisting: false,
  customersOnly: false,
  invoicesOnly: false,
};

export function rozsahVolieb(v: ImportVolby): ImportRozsah {
  if (v.customersOnly && !v.invoicesOnly) return "odberatelia";
  if (v.invoicesOnly && !v.customersOnly) return "faktury";
  return "vsetko";
}

export function volbyPreRozsah(v: ImportVolby, r: ImportRozsah): ImportVolby {
  return {
    ...v,
    customersOnly: r === "odberatelia",
    invoicesOnly: r === "faktury",
  };
}

const ROZSAHY: { id: ImportRozsah; label: string; popis: string }[] = [
  { id: "vsetko", label: "Faktúry aj odberateľov", popis: "Bežná voľba — prenesie sa celý doklad." },
  {
    id: "odberatelia",
    label: "Iba odberateľov",
    popis: "Zo súboru sa vezmú len adresy, faktúry sa nezapíšu.",
  },
  {
    id: "faktury",
    label: "Iba faktúry",
    popis: "Noví odberatelia sa nezakladajú; údaje ostanú opísané na doklade.",
  },
];

export function ImportOptions({
  options,
  setOptions,
}: {
  options: ImportVolby;
  setOptions: (v: ImportVolby) => void;
}) {
  const rozsah = rozsahVolieb(options);
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Čo importovať</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ROZSAHY.map((r) => (
            <label
              key={r.id}
              className={`flex cursor-pointer flex-col gap-1 rounded-md border px-3 py-2 text-sm ${
                rozsah === r.id ? "border-primary bg-primary/5" : "border-border bg-background"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="import-rozsah"
                  checked={rozsah === r.id}
                  onChange={() => setOptions(volbyPreRozsah(options, r.id))}
                />
                {r.label}
              </span>
              <span className="text-xs text-muted-foreground">{r.popis}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={options.updateExisting}
          onChange={(e) => setOptions({ ...options, updateExisting: e.target.checked })}
        />
        Aktualizovať faktúry, ktoré už v systéme sú
      </label>
    </div>
  );
}
