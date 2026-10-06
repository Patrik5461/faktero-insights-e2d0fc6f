import { Plus, Trash2 } from "lucide-react";
import type { MoznostKodu } from "@/lib/faktero/predkontacie";
import { KodPohody } from "./KodPohody";

export type PomerHodnota =
  | null
  | { typ: "pomer"; casti: { podiel: number; predkontacia: string; odpocet: boolean }[]; clenenieBezOdpoctu?: string }
  | {
      typ: "dph5050";
      zaklad: number;
      zdanitelna: string;
      lenZaklad: string;
      nezdanitelna: string;
      clenenieBezOdpoctu?: string;
    };

/**
 * Účtovanie pomerom na predkontácii (ako v Doklado): doklad s touto
 * predkontáciou sa pri odovzdaní rozúčtuje sám a odpočet DPH sa skráti.
 */
export function PomerEditor({
  value,
  onChange,
  predkontacie,
  clenenia,
}: {
  value: PomerHodnota;
  onChange: (v: PomerHodnota) => void;
  predkontacie: MoznostKodu[];
  clenenia: MoznostKodu[];
}) {
  const vstup = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
  const typ = value?.typ ?? "";
  const spolu = value?.typ === "pomer" ? value.casti.reduce((a, c) => a + (Number(c.podiel) || 0), 0) : 100;
  return (
    <div className="rounded-md border border-border p-3">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Účtovať pomerom</span>
        <select
          value={typ}
          onChange={(e) => {
            const t = e.target.value;
            if (!t) onChange(null);
            else if (t === "pomer")
              onChange({
                typ: "pomer",
                casti: [
                  { podiel: 80, predkontacia: "", odpocet: true },
                  { podiel: 20, predkontacia: "", odpocet: false },
                ],
              });
            else onChange({ typ: "dph5050", zaklad: 80, zdanitelna: "", lenZaklad: "", nezdanitelna: "" });
          }}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="">nie</option>
          <option value="pomer">podľa pomeru (rovnaký pre základ aj DPH)</option>
          <option value="dph5050">DPH 50/50 a vlastný podiel nákladu (od 2026)</option>
        </select>
      </label>

      {value?.typ === "pomer" && (
        <div className="mt-2 space-y-2">
          {value.casti.map((c, i) => (
            <div key={i} className="grid grid-cols-[5rem_1fr_auto_auto] items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={c.podiel}
                aria-label={`Podiel ${i + 1} v %`}
                onChange={(e) =>
                  onChange({
                    ...value,
                    casti: value.casti.map((x, j) => (j === i ? { ...x, podiel: Number(e.target.value) } : x)),
                  })
                }
                className={vstup}
              />
              <KodPohody
                ariaLabel={`Predkontácia časti ${i + 1}`}
                value={c.predkontacia}
                onChange={(v) =>
                  onChange({ ...value, casti: value.casti.map((x, j) => (j === i ? { ...x, predkontacia: v } : x)) })
                }
                moznosti={predkontacie}
                placeholder="predkontácia"
                className={vstup}
                bezPopisu
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={c.odpocet}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      casti: value.casti.map((x, j) => (j === i ? { ...x, odpocet: e.target.checked } : x)),
                    })
                  }
                />
                odpočet DPH
              </label>
              <button
                type="button"
                onClick={() => onChange({ ...value, casti: value.casti.filter((_, j) => j !== i) })}
                className="rounded p-1 text-muted-foreground hover:bg-secondary"
                aria-label={`Zmazať časť ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() =>
                onChange({ ...value, casti: [...value.casti, { podiel: Math.max(0, 100 - spolu), predkontacia: "", odpocet: false }] })
              }
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Pridať časť
            </button>
            <span className={spolu === 100 ? "text-emerald-700" : "text-amber-700"}>Spolu {spolu} %</span>
          </div>
        </div>
      )}

      {value?.typ === "dph5050" && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="text-muted-foreground">Podiel nákladu na podnikanie (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={value.zaklad}
              onChange={(e) => onChange({ ...value, zaklad: Number(e.target.value) })}
              className={vstup}
            />
          </label>
          <div className="text-xs text-muted-foreground sm:pt-5">
            DPH sa odpočíta najviac 50 %; zvyšok podielu ide len do nákladov, súkromná časť mimo.
          </div>
          {(
            [
              ["zdanitelna", "Zdaniteľná časť (základ aj DPH)"],
              ["lenZaklad", "Len základ (DPH do nákladov)"],
              ["nezdanitelna", "Nezdaniteľná časť"],
            ] as const
          ).map(([k, n]) => (
            <label key={k} className="block text-xs">
              <span className="text-muted-foreground">{n}</span>
              <KodPohody
                value={value[k]}
                onChange={(v) => onChange({ ...value, [k]: v })}
                moznosti={predkontacie}
                placeholder="predkontácia"
                className={vstup}
                bezPopisu
              />
            </label>
          ))}
        </div>
      )}

      {value && (
        <label className="mt-2 block max-w-xs text-xs">
          <span className="text-muted-foreground">Členenie DPH pre časti bez odpočtu</span>
          <KodPohody
            value={value.clenenieBezOdpoctu ?? ""}
            onChange={(v) => onChange({ ...value, clenenieBezOdpoctu: v })}
            moznosti={clenenia}
            placeholder="ako doklad"
            className={vstup}
            vyber
          />
        </label>
      )}
    </div>
  );
}
