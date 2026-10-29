import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import { RADENIA_EXPORTU, type RadenieExportu } from "@/lib/faktero/export-radenie";

export type VolbyExportu = {
  /** Dátum zaúčtovania pre doklady z uzavretého obdobia; prázdny = dátum dokladu. */
  datumZauctovania: string | null;
  /** Aj doklady, ktoré už raz do účtovníctva odišli. */
  ajOdovzdane: boolean;
  /** Zapísať doklady ako odovzdané. */
  oznacit: boolean;
  /** Poradie dokladov v dávke. */
  radenie: RadenieExportu;
  /** Bločky: preniesť aj vyťažené položky (`null` = podľa nastavenia firmy). */
  polozky: boolean | null;
  /** Bločky: samotné XML pre Pohodu alebo ZIP so skenmi (len pri `ponukaFormat`). */
  format: "xml" | "zip";
};

/**
 * Voľby pred exportom do účtovníctva. Doklady z prelomu rokov idú do
 * samostatných súborov samy — Pohoda importuje vždy do jedného roka.
 */
export function VolbyExportuOkno({
  pocet,
  nazov,
  ponukaOznacit = true,
  ponukaPolozky,
  ponukaFormat = false,
  onClose,
  onExport,
}: {
  pocet: number;
  nazov: string;
  ponukaOznacit?: boolean;
  /** Bločky: ponúknuť „Exportovať položky dokladu" (hodnota = nastavenie firmy). */
  ponukaPolozky?: { predvolene: boolean };
  /** Bločky: ponúknuť výber „XML pre Pohodu“ / „ZIP (XML + skeny)“. */
  ponukaFormat?: boolean;
  onClose: () => void;
  onExport: (v: VolbyExportu) => Promise<void>;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const [v, setV] = useState<VolbyExportu>({
    datumZauctovania: null,
    ajOdovzdane: false,
    oznacit: true,
    radenie: "datum",
    polozky: null,
    format: "xml",
  });
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Export do účtovníctva")}
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{t("Exportovať ({pocet})", { pocet })}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{nazov}</p>

        <div className="mt-4 space-y-4 text-sm">
          {ponukaFormat ? (
            <fieldset>
              <legend className="text-xs font-medium text-muted-foreground">{t("Súbor")}</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(
                  [
                    ["xml", t("XML pre Pohodu"), t("Len pohoda.xml na import, bez skenov.")],
                    ["zip", t("ZIP (XML + skeny)"), t("pohoda.xml, súpiska CSV a skeny dokladov.")],
                  ] as const
                ).map(([k, nazov, popis]) => (
                  <label
                    key={k}
                    className={`flex min-w-0 cursor-pointer flex-col rounded-md border px-3 py-2 ${
                      v.format === k ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <input
                        type="radio"
                        name="format-exportu"
                        checked={v.format === k}
                        onChange={() => setV({ ...v, format: k })}
                      />
                      {nazov}
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">{popis}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              {t("Dátum zaúčtovania")}
            </span>
            <input
              type="date"
              value={v.datumZauctovania ?? ""}
              onChange={(e) => setV({ ...v, datumZauctovania: e.target.value || null })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {t(
                "Pre doklady z už uzavretého obdobia. Prázdne = dátum dokladu (doklady z uzávierky dostanú prvý deň po nej samy).",
              )}
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              {t("Radenie dokladov v dávke")}
            </span>
            <select
              value={v.radenie}
              onChange={(e) => setV({ ...v, radenie: e.target.value as RadenieExportu })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            >
              {RADENIA_EXPORTU.map((r) => (
                <option key={r.kluc} value={r.kluc}>
                  {t(r.nazov)}
                </option>
              ))}
            </select>
          </label>

          {ponukaPolozky ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={v.polozky ?? ponukaPolozky.predvolene}
                onChange={(e) => setV({ ...v, polozky: e.target.checked })}
              />
              <span>
                {t("Exportovať položky dokladu")}
                <span className="block text-xs text-muted-foreground">
                  {t("Bloček pôjde do Pohody po položkách, nie jedným riadkom podľa sadzieb DPH.")}
                </span>
              </span>
            </label>
          ) : null}

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={v.ajOdovzdane}
              onChange={(e) => setV({ ...v, ajOdovzdane: e.target.checked })}
            />
            <span>
              {t("Exportovať aj už odovzdané doklady")}
              <span className="block text-xs text-muted-foreground">
                {t("Len keď ste ich v účtovnom programe zmazali — inak by tam boli dvakrát.")}
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
                {t("Označiť ako odovzdané")}
                <span className="block text-xs text-muted-foreground">
                  {t("Doklady sa zamknú a konektor ich už nepošle.")}
                </span>
              </span>
            </label>
          ) : null}

          <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            {t(
              "Doklady z dvoch rokov sa rozdelia do samostatných súborov — každý naimportujte do svojho roka.",
            )}
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            {t("Zrušiť")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void spusti()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t("Exportovať")}
          </button>
        </div>
      </div>
    </div>
  );
}
