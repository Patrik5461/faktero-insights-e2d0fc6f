import { Plus, Trash2 } from "lucide-react";
import {
  VYROVNAVACIA_POLOZKA,
  rozdielPoloziek,
  vyrovnajPolozky,
  type UdajeNespracovaneho,
} from "@/lib/faktero/nespracovane";

type Polozka = UdajeNespracovaneho["polozky"][number];

const cislo = (v: string) => {
  const n = Number(v.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Položky nespracovaného dokladu: sadzba DPH a prenesenie daňovej
 * povinnosti pri každej položke. Keď súčet položiek nesedí so sumou dokladu,
 * ukáže rozdiel a ponúkne vyrovnávaciu položku — inak by do účtovníctva
 * odišli položky, ktoré sa so súčtom nezhodujú.
 */
export function PolozkyNespracovaneho({
  u,
  setU,
  sadzby,
}: {
  u: UdajeNespracovaneho;
  setU: (u: UdajeNespracovaneho) => void;
  sadzby: number[];
}) {
  const nesuhlas = rozdielPoloziek(u);
  const zmen = (i: number, z: Partial<Polozka>) =>
    setU({ ...u, polozky: u.polozky.map((p, j) => (j === i ? { ...p, ...z } : p)) });
  const pdpCela = Boolean(u.prenesenie);

  return (
    <div className="space-y-2">
      {u.polozky.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-normal">Názov</th>
                <th className="w-16 py-1 pr-2 text-right font-normal">Počet</th>
                <th className="w-20 py-1 pr-2 font-normal">DPH</th>
                <th className="w-24 py-1 pr-2 text-right font-normal">Suma</th>
                <th className="w-12 py-1 pr-2 text-center font-normal" title="Prenesenie daňovej povinnosti">
                  PDP
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {u.polozky.map((p, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1 pr-2">
                    <input
                      aria-label={`Názov položky ${i + 1}`}
                      value={p.name}
                      onChange={(e) => zmen(i, { name: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      aria-label={`Počet položky ${i + 1}`}
                      inputMode="decimal"
                      value={p.quantity ?? ""}
                      onChange={(e) => zmen(i, { quantity: cislo(e.target.value) })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      aria-label={`Sadzba DPH položky ${i + 1}`}
                      value={String(p.vat_rate ?? "")}
                      onChange={(e) => zmen(i, { vat_rate: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-full rounded-md border border-input bg-background px-1 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {[...new Set([...sadzby, ...(p.vat_rate != null ? [Number(p.vat_rate)] : [])])].map((s) => (
                        <option key={s} value={s}>
                          {s} %
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      aria-label={`Suma položky ${i + 1}`}
                      inputMode="decimal"
                      value={p.total ?? ""}
                      onChange={(e) => zmen(i, { total: cislo(e.target.value) })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
                    />
                  </td>
                  <td className="py-1 pr-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Položka ${i + 1} v prenesení daňovej povinnosti`}
                      checked={pdpCela || Boolean(p.pdp)}
                      disabled={pdpCela}
                      onChange={(e) => zmen(i, { pdp: e.target.checked || undefined })}
                    />
                  </td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      aria-label={`Odstrániť položku ${i + 1}`}
                      onClick={() => setU({ ...u, polozky: u.polozky.filter((_, j) => j !== i) })}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Doklad nemá položky — do účtovníctva pôjde súhrn podľa sadzieb.</p>
      )}

      {nesuhlas ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <span>
            Súčet položiek {nesuhlas.sucet.toFixed(2)} nesedí so sumou dokladu
            {nesuhlas.netto ? " bez DPH" : ""} — rozdiel {nesuhlas.rozdiel > 0 ? "+" : ""}
            {nesuhlas.rozdiel.toFixed(2)} {u.mena}.
          </span>
          <button
            type="button"
            onClick={() => setU(vyrovnajPolozky(u))}
            className="rounded-md border border-red-300 bg-white px-2 py-1 font-medium hover:bg-red-100 dark:bg-transparent"
          >
            Pridať vyrovnávaciu položku
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() =>
            setU({
              ...u,
              polozky: [
                ...u.polozky.filter((x) => x.name !== VYROVNAVACIA_POLOZKA),
                { name: "", quantity: 1, unit: null, unit_price: null, vat_rate: sadzby[0] ?? null, total: null },
                ...u.polozky.filter((x) => x.name === VYROVNAVACIA_POLOZKA),
              ],
            })
          }
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Pridať položku
        </button>
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={pdpCela}
            onChange={(e) => setU({ ...u, prenesenie: e.target.checked || undefined })}
          />
          Celá faktúra v prenesení daňovej povinnosti
        </label>
      </div>
    </div>
  );
}
