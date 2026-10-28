import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  AGENDY_POZNAMOK,
  NAZVY_AGEND_POZNAMOK,
  poznamkyPreAgendu,
  upravAgendy,
  type AgendaPoznamky,
  type PreddefinovanaPoznamka,
} from "@/lib/faktero/preddefinovane-poznamky";
import { potvrd } from "@/lib/potvrdenie";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";

/** Načíta celý číselník firmy (je malý — strop 1 000 riadkov tu nehrozí). */
export async function nacitajPoznamky(companyId: string): Promise<PreddefinovanaPoznamka[]> {
  const { data, error } = await supabase
    .from("preddefinovane_poznamky")
    .select("id, nazov, text, agendy, poradie")
    .eq("company_id", companyId)
    .order("poradie")
    .order("created_at")
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as PreddefinovanaPoznamka[];
}

type Uprava = { id: string | null; nazov: string; text: string; agendy: AgendaPoznamky[] };
const PRAZDNA: Uprava = { id: null, nazov: "", text: "", agendy: [] };

/**
 * Číselník preddefinovaných poznámok — názov, text a agendy, v ktorých sa
 * poznámka ponúka. Používa sa v Nastaveniach aj v okne „Spravovať poznámky“
 * priamo pri poli poznámky.
 */
export function PreddefinovanePoznamkySprava({
  agenda,
  onZmena,
}: {
  /** Nová poznámka z okna pri doklade sa predvyplní pre túto agendu. */
  agenda?: AgendaPoznamky | null;
  onZmena?: () => void;
}) {
  const { t } = useT();
  const companyId = getActiveCompanyId();
  const [zoznam, setZoznam] = useState<PreddefinovanaPoznamka[] | null>(null);
  const [uprava, setUprava] = useState<Uprava | null>(null);
  const [busy, setBusy] = useState(false);

  async function obnov() {
    if (!companyId) return;
    try {
      setZoznam(await nacitajPoznamky(companyId));
    } catch (e: any) {
      toast.error(t(e?.message ?? "Poznámky sa nepodarilo načítať."));
      setZoznam([]);
    }
  }
  useEffect(() => {
    void obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function uloz() {
    if (!companyId || !uprava) return;
    const text = uprava.text.trim();
    if (!text) {
      toast.error(t("Text poznámky je povinný."));
      return;
    }
    setBusy(true);
    const riadok = {
      nazov: uprava.nazov.trim().slice(0, 120),
      text: text.slice(0, 2000),
      agendy: upravAgendy(uprava.agendy),
      updated_at: new Date().toISOString(),
    };
    const { error } = uprava.id
      ? await supabase.from("preddefinovane_poznamky").update(riadok).eq("id", uprava.id)
      : await supabase.from("preddefinovane_poznamky").insert({
          ...riadok,
          company_id: companyId,
          poradie: (zoznam?.length ?? 0) + 1,
        });
    setBusy(false);
    if (error) {
      toast.error(t(error.message));
      return;
    }
    toast.success(t("Poznámka uložená"));
    setUprava(null);
    await obnov();
    onZmena?.();
  }

  async function zmaz(p: PreddefinovanaPoznamka) {
    if (
      !(await potvrd(t("Zmazať poznámku „{nazov}“?", { nazov: p.nazov || p.text.slice(0, 60) }), {
        nebezpecne: true,
      }))
    )
      return;
    const { error } = await supabase.from("preddefinovane_poznamky").delete().eq("id", p.id);
    if (error) {
      toast.error(t(error.message));
      return;
    }
    await obnov();
    onZmena?.();
  }

  const zobrazene = poznamkyPreAgendu(zoznam ?? [], null);

  return (
    <div className="space-y-3">
      {zoznam === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : zobrazene.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("Zatiaľ žiadne poznámky. Pridajte texty, ktoré píšete na doklady stále dookola.")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {zobrazene.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-wrap items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p.nazov || t("(bez názvu)")}</div>
                <div className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {p.text}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {p.agendy.length
                    ? p.agendy
                        .map((a) => t(NAZVY_AGEND_POZNAMOK[a as AgendaPoznamky] ?? a))
                        .join(", ")
                    : t("Všetky agendy")}
                </div>
              </div>
              <button
                type="button"
                aria-label={t("Upraviť")}
                onClick={() =>
                  setUprava({
                    id: p.id,
                    nazov: p.nazov,
                    text: p.text,
                    agendy: p.agendy as AgendaPoznamky[],
                  })
                }
                className="rounded p-1 text-muted-foreground hover:bg-secondary"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t("Zmazať")}
                onClick={() => zmaz(p)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {uprava ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <input
            value={uprava.nazov}
            onChange={(e) => setUprava({ ...uprava, nazov: e.target.value })}
            placeholder={t("Názov (napr. Záruka 24 mesiacov)")}
            aria-label={t("Názov poznámky")}
            maxLength={120}
            className="input w-full"
          />
          <textarea
            value={uprava.text}
            onChange={(e) => setUprava({ ...uprava, text: e.target.value })}
            placeholder={t("Text poznámky")}
            aria-label={t("Text poznámky")}
            rows={3}
            maxLength={2000}
            className="input w-full"
          />
          <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <legend className="mb-1 text-xs text-muted-foreground">
              {t("Kde sa ponúka (nič nezaškrtnuté = všade)")}
            </legend>
            {AGENDY_POZNAMOK.map((a) => (
              <label key={a} className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={uprava.agendy.includes(a)}
                  onChange={(e) =>
                    setUprava({
                      ...uprava,
                      agendy: e.target.checked
                        ? [...uprava.agendy, a]
                        : uprava.agendy.filter((x) => x !== a),
                    })
                  }
                  className="h-4 w-4 rounded border-input"
                />
                {t(NAZVY_AGEND_POZNAMOK[a])}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setUprava(null)}
              className="h-9 rounded-md border border-border px-3 text-sm hover:bg-secondary"
            >
              {t("Zrušiť")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={uloz}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("Uložiť")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setUprava({ ...PRAZDNA, agendy: agenda ? [agenda] : [] })}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
        >
          <Plus className="h-4 w-4" />
          {t("Pridať poznámku")}
        </button>
      )}
    </div>
  );
}

/** Okno so správou poznámok, otvorené priamo od poľa poznámky. */
export function OknoPreddefinovanychPoznamok({
  agenda,
  onClose,
  onZmena,
}: {
  agenda?: AgendaPoznamky | null;
  onClose: () => void;
  onZmena?: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Preddefinované poznámky")}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col rounded-xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <h2 className="text-base font-semibold">{t("Preddefinované poznámky")}</h2>
          <button
            type="button"
            aria-label={t("Zavrieť")}
            onClick={onClose}
            className="rounded p-1 hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <PreddefinovanePoznamkySprava agenda={agenda} onZmena={onZmena} />
        </div>
      </div>
    </div>
  );
}
