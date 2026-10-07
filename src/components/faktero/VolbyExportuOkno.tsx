import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";

export type VolbyExportu = {
  /** Dátum zaúčtovania pre doklady z uzavretého obdobia; prázdny = dátum dokladu. */
  datumZauctovania: string | null;
  /** Aj doklady, ktoré už raz do účtovníctva odišli. */
  ajOdovzdane: boolean;
  /** Zapísať doklady ako odovzdané. */
  oznacit: boolean;
};

/**
 * Voľby pred exportom do účtovníctva. Doklady z prelomu rokov idú do
 * samostatných súborov samy — Pohoda importuje vždy do jedného roka.
 */
export function VolbyExportuOkno({
  pocet,
  nazov,
  ponukaOznacit = true,
  onClose,
  onExport,
}: {
  pocet: number;
  nazov: string;
  ponukaOznacit?: boolean;
  onClose: () => void;
  onExport: (v: VolbyExportu) => Promise<void>;
}) {
  useZatvorNaEscape(onClose);
  const [v, setV] = useState<VolbyExportu>({ datumZauctovania: null, ajOdovzdane: false, oznacit: true });
  const [busy, setBusy] = useState(false);

  async function spusti() {
    setBusy(true);
    try {
      await onExport(v);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export do účtovníctva"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Exportovať ({pocet})</h2>
        <p className="mt-1 text-sm text-muted-foreground">{nazov}</p>

        <div className="mt-4 space-y-4 text-sm">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Dátum zaúčtovania</span>
            <input
              type="date"
              value={v.datumZauctovania ?? ""}
              onChange={(e) => setV({ ...v, datumZauctovania: e.target.value || null })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Pre doklady z už uzavretého obdobia. Prázdne = dátum dokladu (doklady z uzávierky dostanú prvý
              deň po nej samy).
            </span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={v.ajOdovzdane}
              onChange={(e) => setV({ ...v, ajOdovzdane: e.target.checked })}
            />
            <span>
              Exportovať aj už odovzdané doklady
              <span className="block text-xs text-muted-foreground">
                Len keď ste ich v účtovnom programe zmazali — inak by tam boli dvakrát.
              </span>
            </span>
          </label>

          {ponukaOznacit ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={v.oznacit}
                onChange={(e) => setV({ ...v, oznacit: e.target.checked })}
              />
              <span>
                Označiť ako odovzdané
                <span className="block text-xs text-muted-foreground">
                  Doklady sa zamknú a konektor ich už nepošle.
                </span>
              </span>
            </label>
          ) : null}

          <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            Doklady z dvoch rokov sa rozdelia do samostatných súborov — každý naimportujte do svojho roka.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary">
            Zrušiť
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void spusti()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Exportovať
          </button>
        </div>
      </div>
    </div>
  );
}
