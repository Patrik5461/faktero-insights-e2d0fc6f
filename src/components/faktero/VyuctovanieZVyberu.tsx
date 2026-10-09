import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import {
  pridajDoVyuctovaniaFn,
  zoznamVyuctovaniFn,
} from "@/lib/faktero/vyuctovanie-vydavkov.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";

/**
 * Hromadná akcia „Vyúčtovanie" — označené bločky či prijaté faktúry do nového
 * vyúčtovania výdavkov alebo do existujúceho (ako „Vytvoriť vyúčtovanie" v Doklado).
 */
export function VyuctovanieZVyberu({
  companyId,
  druh,
  ids,
  onHotovo,
}: {
  companyId: string;
  druh: "blocek" | "prijata";
  ids: string[];
  onHotovo?: () => void;
}) {
  const [otvorene, setOtvorene] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOtvorene(true)}
        disabled={!ids.length}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
      >
        <HandCoins className="h-4 w-4" /> Vyúčtovanie ({ids.length})
      </button>
      {otvorene && (
        <Okno
          companyId={companyId}
          druh={druh}
          ids={ids}
          onClose={() => setOtvorene(false)}
          onHotovo={onHotovo}
        />
      )}
    </>
  );
}

function Okno({
  companyId,
  druh,
  ids,
  onClose,
  onHotovo,
}: {
  companyId: string;
  druh: "blocek" | "prijata";
  ids: string[];
  onClose: () => void;
  onHotovo?: () => void;
}) {
  useZatvorNaEscape(onClose);
  const navigate = useNavigate();
  const zoznam = useServerFn(zoznamVyuctovaniFn);
  const pridaj = useServerFn(pridajDoVyuctovaniaFn);
  const [otvorene, setOtvorene] = useState<{ id: string; nazov: string }[]>([]);
  const [vybrane, setVybrane] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    zoznam({ data: { company_id: companyId } })
      .then((r: any[]) =>
        setOtvorene(
          r.filter((v) => v.stav === "otvorene").map((v) => ({ id: v.id, nazov: v.nazov })),
        ),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function nove() {
    navigate({
      to: "/doklady/vyuctovania/$id",
      params: { id: "novy" },
      search: druh === "blocek" ? { blocky: ids.join(",") } : { prijate: ids.join(",") },
    });
  }

  async function doExistujuceho() {
    if (!vybrane) return;
    setBusy(true);
    try {
      const r = await pridaj({
        data: { company_id: companyId, id: vybrane, doklady: ids.map((id) => ({ druh, id })) },
      });
      toast.success(
        r.vInom
          ? `Pridané ${r.priradenych}; ${r.vInom} už bolo v inom vyúčtovaní.`
          : `Pridané do vyúčtovania (${r.priradenych}).`,
      );
      onClose();
      onHotovo?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vyúčtovanie výdavkov"
        className="w-full max-w-md rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Vyúčtovanie výdavkov</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {ids.length} {druh === "blocek" ? "bločkov" : "prijatých faktúr"} zaplatil zamestnanec —
          zo zálohy, z vlastných peňazí alebo firemnou kartou.
        </p>
        <button
          onClick={nove}
          className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Vytvoriť nové vyúčtovanie
        </button>
        {otvorene.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">alebo pridať do existujúceho</span>
              <select
                value={vybrane}
                onChange={(e) => setVybrane(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— vyberte —</option>
                {otvorene.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nazov}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => void doExistujuceho()}
              disabled={!vybrane || busy}
              className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
            >
              Pridať
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
