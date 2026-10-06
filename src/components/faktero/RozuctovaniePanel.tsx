import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Split, Trash2 } from "lucide-react";
import { ulozRozuctovanieFn } from "@/lib/faktero/zauctovanie.functions";
import {
  chybaRozuctovania,
  dorovnaj,
  dphZoZakladu,
  nacitajRozuctovanie,
  zaciatokRozuctovania,
  zostava,
  type RiadokRozuctovania,
  type RozpisSadzby,
} from "@/lib/faktero/rozuctovanie";
import { KodPohody } from "./KodPohody";
import type { Navrhy } from "./ZauctovaniePanel";

const f2 = (n: number) => (Number(n) || 0).toFixed(2);

/**
 * Rozúčtovanie dokladu na viac riadkov — každý s vlastnou predkontáciou,
 * členením DPH a sumou. Do Pohody ide ako položky s vlastným zaúčtovaním,
 * hlavička dostane „Rozúčtovať".
 */
export function RozuctovaniePanel({
  companyId,
  druh,
  id,
  rozpis,
  ulozene,
  navrhy,
  kody,
  zamknute,
  onZmena,
}: {
  companyId: string;
  druh: "prijata" | "doklad";
  id: string;
  rozpis: RozpisSadzby[];
  ulozene: unknown;
  navrhy: Navrhy | null;
  /** Kódy dokladu — nimi sa predvyplní prvý riadok. */
  kody: { predkontacia: string | null; clenenie: string | null };
  zamknute?: boolean;
  onZmena?: () => void;
}) {
  const uloz = useServerFn(ulozRozuctovanieFn);
  const povodne = useMemo(() => nacitajRozuctovanie(ulozene), [ulozene]);
  const [riadky, setRiadky] = useState<RiadokRozuctovania[]>(povodne);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRiadky(povodne), [povodne]);

  const sadzby = useMemo(
    () => [...new Set(rozpis.map((x) => Number(x.sadzba) || 0))].sort((a, b) => b - a),
    [rozpis],
  );
  const zvysok = zostava(riadky, rozpis);
  const chyba = chybaRozuctovania(riadky, rozpis);
  const zmenene = JSON.stringify(riadky) !== JSON.stringify(povodne);

  if (!rozpis.length) return null;

  async function ulozit(nove: RiadokRozuctovania[]) {
    setBusy(true);
    try {
      await uloz({ data: { company_id: companyId, druh, id, riadky: nove as any } });
      toast.success(nove.length ? `Rozúčtované na ${nove.length} riadky` : "Rozúčtovanie zrušené");
      onZmena?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa uložiť");
    } finally {
      setBusy(false);
    }
  }

  const zmen = (i: number, z: Partial<RiadokRozuctovania>) =>
    setRiadky((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const n = { ...r, ...z };
        // Zmena základu alebo sadzby prepočíta DPH; ručne zadaná DPH ostane.
        if (("zaklad" in z || "sadzba" in z) && !("dph" in z)) n.dph = dphZoZakladu(n.zaklad, n.sadzba);
        return n;
      }),
    );

  function pridaj() {
    const z = zvysok.find((x) => Math.abs(x.zaklad) >= 0.005 || Math.abs(x.dph) >= 0.005);
    setRiadky((rs) => [
      ...rs,
      {
        predkontacia: "",
        clenenie: kody.clenenie ?? "",
        sadzba: z?.sadzba ?? sadzby[0] ?? 0,
        zaklad: z ? Math.max(z.zaklad, 0) : 0,
        dph: z ? Math.max(z.dph, 0) : 0,
        text: "",
      },
    ]);
  }

  if (!riadky.length) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-border p-3 text-sm">
        <button
          type="button"
          disabled={zamknute}
          onClick={() => setRiadky(zaciatokRozuctovania(rozpis, kody))}
          className="inline-flex items-center gap-1.5 text-primary hover:underline disabled:opacity-50"
        >
          <Split className="h-4 w-4" /> Rozúčtovať na viac predkontácií
        </button>
        <span className="ml-2 text-xs text-muted-foreground">
          napr. časť materiál, časť réžia — každý riadok s vlastnou predkontáciou a členením DPH
        </span>
      </div>
    );
  }

  const vstup = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Split className="h-4 w-4" /> Rozúčtovanie
        </div>
        <div className="text-xs text-muted-foreground">
          Doklad:{" "}
          {rozpis.map((r) => `${r.sadzba} % — základ ${f2(r.zaklad)}, DPH ${f2(r.dph)}`).join(" · ")}
        </div>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Predkontácia</th>
              <th className="py-1 pr-2 font-medium">Členenie DPH</th>
              <th className="py-1 pr-2 font-medium">Sadzba</th>
              <th className="py-1 pr-2 text-right font-medium">Základ</th>
              <th className="py-1 pr-2 text-right font-medium">DPH</th>
              <th className="py-1 pr-2 font-medium">Text</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {riadky.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="py-1 pr-2 w-36">
                  <KodPohody
                    ariaLabel={`Predkontácia riadku ${i + 1}`}
                    value={r.predkontacia ?? ""}
                    onChange={(v) => zmen(i, { predkontacia: v })}
                    moznosti={navrhy?.predkontacie ?? []}
                    placeholder={kody.predkontacia ?? ""}
                    className={vstup}
                  />
                </td>
                <td className="py-1 pr-2 w-32">
                  <KodPohody
                    ariaLabel={`Členenie DPH riadku ${i + 1}`}
                    value={r.clenenie ?? ""}
                    onChange={(v) => zmen(i, { clenenie: v })}
                    moznosti={navrhy?.clenenia ?? []}
                    placeholder={kody.clenenie ?? ""}
                    className={vstup}
                  />
                </td>
                <td className="py-1 pr-2 w-20">
                  <select
                    value={r.sadzba}
                    onChange={(e) => zmen(i, { sadzba: Number(e.target.value) })}
                    className={vstup}
                    aria-label={`Sadzba riadku ${i + 1}`}
                  >
                    {sadzby.map((s) => (
                      <option key={s} value={s}>
                        {s} %
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2 w-24">
                  <input
                    type="number"
                    step="0.01"
                    value={r.zaklad}
                    onChange={(e) => zmen(i, { zaklad: Number(e.target.value) })}
                    className={`${vstup} text-right`}
                    aria-label={`Základ riadku ${i + 1}`}
                  />
                </td>
                <td className="py-1 pr-2 w-24">
                  <input
                    type="number"
                    step="0.01"
                    value={r.dph}
                    onChange={(e) => zmen(i, { dph: Number(e.target.value) })}
                    className={`${vstup} text-right`}
                    aria-label={`DPH riadku ${i + 1}`}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={r.text ?? ""}
                    onChange={(e) => zmen(i, { text: e.target.value })}
                    placeholder="nepovinné"
                    className={vstup}
                    aria-label={`Text riadku ${i + 1}`}
                  />
                </td>
                <td className="py-1 whitespace-nowrap">
                  <button
                    type="button"
                    title="Doplniť sem zvyšok sadzby"
                    onClick={() => setRiadky((rs) => dorovnaj(rs, rozpis, i))}
                    className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-secondary"
                  >
                    = zvyšok
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiadky((rs) => rs.filter((_, j) => j !== i))}
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                    aria-label={`Zmazať riadok ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={pridaj}
        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Pridať riadok
      </button>

      <p className={`mt-2 text-xs ${chyba ? "text-amber-700" : "text-emerald-700"}`}>
        {chyba ??
          "Súčty sedia s dokladom. Do Pohody pôjde ako položky s vlastnou predkontáciou, hlavička „Rozúčtovať“."}
      </p>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {povodne.length > 0 && (
          <button
            type="button"
            disabled={busy || zamknute}
            onClick={() => ulozit([])}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            Zrušiť rozúčtovanie
          </button>
        )}
        {!povodne.length && (
          <button
            type="button"
            onClick={() => setRiadky([])}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            Zrušiť
          </button>
        )}
        <button
          type="button"
          disabled={busy || zamknute || !!chyba || !zmenene}
          onClick={() => ulozit(riadky)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Uložiť rozúčtovanie
        </button>
      </div>
    </div>
  );
}
