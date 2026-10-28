import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { KodPohody } from "./KodPohody";
import type { Navrhy } from "./ZauctovaniePanel";
import { navrhyKodovFn } from "@/lib/faktero/zauctovanie.functions";
import { KV_CLENENIA, KV_PRIJATE } from "@/lib/faktero/kv-clenenie";
import {
  DRUHY_PREDLOH,
  NOVA_PREDLOHA,
  chybaPredlohy,
  naUlozeniePredlohy,
  popisPredlohy,
  type DruhPredlohy,
  type Predloha,
} from "@/lib/faktero/predlohy-uctovania";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

const KV_VYDANE = KV_CLENENIA.filter((k) => ["A1", "A2", "C1", "D1", "D2", "X"].includes(k.kod));
const vstup = "mt-1 h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";

type Riadok = Predloha & { id: string };

/**
 * Predlohy zaúčtovania — pomenované šablóny bez podmienky (ako „Predloha"
 * v Doklado). Účtovník ich použije v paneli zaúčtovania dokladu cez
 * „Použiť predlohu…".
 */
export function PredlohyUctovania({ companyId }: { companyId: string }) {
  const { t } = useT();
  const [predlohy, setPredlohy] = useState<Riadok[] | null>(null);
  const [uprava, setUprava] = useState<Predloha | null>(null);

  const nacitaj = useCallback(async () => {
    const { data, error } = await supabase
      .from("predlohy_uctovania")
      .select("*")
      .eq("company_id", companyId)
      .order("poradie")
      .order("nazov");
    if (error) toast.error(error.message);
    setPredlohy((data ?? []) as Riadok[]);
  }, [companyId]);
  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  async function zmaz(r: Riadok) {
    if (
      !(await potvrd(
        t("Zmazať predlohu „{nazov}“? Doklady, na ktoré ste ju použili, sa nezmenia.", {
          nazov: r.nazov,
        }),
      ))
    )
      return;
    const { error } = await supabase.from("predlohy_uctovania").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(t("Predloha zmazaná."));
    void nacitaj();
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <p className="min-w-0 flex-1">
          {t(
            "Predloha je pomenované zaúčtovanie bez podmienky — napríklad „Nákup PHM – platba kartou“. Sama sa nepoužije; v zaúčtovaní dokladu ju vyberiete cez „Použiť predlohu…“ a doplní predkontáciu, členenie, pokladňu, rad aj poznámku naraz.",
          )}
        </p>
        <button
          onClick={() => setUprava({ ...NOVA_PREDLOHA })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> {t("Nová predloha")}
        </button>
      </div>

      {predlohy === null ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
        </div>
      ) : predlohy.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("Zatiaľ žiadna predloha.")}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">{t("Predloha")}</th>
                <th className="p-3">{t("Pre")}</th>
                <th className="p-3">{t("Doplní")}</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {predlohy.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{r.nazov}</td>
                  <td className="p-3 text-muted-foreground">
                    {t(DRUHY_PREDLOH.find((d) => d.kod === (r.druh ?? null))?.nazov ?? "")}
                  </td>
                  <td className="p-3">{popisPredlohy(r)}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setUprava({ ...r })}
                        aria-label={t("Upraviť {nazov}", { nazov: r.nazov })}
                        className="rounded-md border border-border p-1.5 hover:bg-secondary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void zmaz(r)}
                        aria-label={t("Zmazať {nazov}", { nazov: r.nazov })}
                        className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {uprava && (
        <UpravaPredlohy
          companyId={companyId}
          predloha={uprava}
          onClose={() => setUprava(null)}
          onUlozene={() => {
            setUprava(null);
            void nacitaj();
          }}
        />
      )}
    </div>
  );
}

function UpravaPredlohy({
  companyId,
  predloha,
  onClose,
  onUlozene,
}: {
  companyId: string;
  predloha: Predloha;
  onClose: () => void;
  onUlozene: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const [p, setP] = useState<Predloha>(predloha);
  const [busy, setBusy] = useState(false);
  const zmen = (z: Partial<Predloha>) => setP((x) => ({ ...x, ...z }));
  const nacitajKody = useServerFn(navrhyKodovFn);
  const [kody, setKody] = useState<Navrhy | null>(null);
  const vystavena = p.druh === "vystavena";
  useEffect(() => {
    nacitajKody({
      data: {
        company_id: companyId,
        pre: vystavena ? "vystavena" : p.druh === "prijata" ? "prijata" : "doklad",
      },
    })
      .then(setKody)
      .catch(() => {});
  }, [companyId, nacitajKody, p.druh, vystavena]);
  const chyba = chybaPredlohy(p);

  async function uloz() {
    if (chyba) return toast.error(t(chyba));
    setBusy(true);
    try {
      const riadok = { ...naUlozeniePredlohy(p), updated_at: new Date().toISOString() };
      const { error } = p.id
        ? await supabase.from("predlohy_uctovania").update(riadok).eq("id", p.id)
        : await supabase.from("predlohy_uctovania").insert({ ...riadok, company_id: companyId });
      if (error) throw new Error(error.message);
      toast.success(p.id ? t("Predloha uložená.") : t("Predloha pridaná."));
      onUlozene();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={p.id ? t("Upraviť predlohu") : t("Nová predloha")}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">
          {p.id ? t("Upraviť predlohu") : t("Nová predloha")}
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-3 [&>*]:min-w-0">
          <label className="block text-sm">
            <span className="font-medium">{t("Názov")}</span>
            <input
              value={p.nazov}
              onChange={(e) => zmen({ nazov: e.target.value })}
              maxLength={120}
              placeholder={t("napr. Nákup PHM – platba kartou")}
              className={vstup}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("Ponúkať pri")}</span>
            <select
              value={p.druh ?? ""}
              onChange={(e) => zmen({ druh: (e.target.value || null) as DruhPredlohy | null })}
              className={vstup}
            >
              {DRUHY_PREDLOH.map((d) => (
                <option key={d.kod ?? ""} value={d.kod ?? ""}>
                  {t(d.nazov)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("Predkontácia (Pohoda)")}</span>
            <KodPohody
              value={p.predkontacia ?? ""}
              onChange={(v) => zmen({ predkontacia: v })}
              moznosti={kody?.predkontacie ?? []}
              className={vstup}
              vyber
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("Členenie DPH (Pohoda)")}</span>
            <KodPohody
              value={p.clenenie_dph ?? ""}
              onChange={(v) => zmen({ clenenie_dph: v })}
              moznosti={kody?.clenenia ?? []}
              className={vstup}
              vyber
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("Členenie kontrolného výkazu")}</span>
            <select
              value={p.kv_clenenie ?? ""}
              onChange={(e) => zmen({ kv_clenenie: e.target.value || null })}
              className={vstup}
            >
              <option value="">{t("Nemeniť (automaticky)")}</option>
              {(vystavena ? KV_VYDANE : KV_PRIJATE).map((k) => (
                <option key={k.kod} value={k.kod}>
                  {t(k.nazov)}
                </option>
              ))}
            </select>
          </label>
          {p.druh === "blocek" || p.druh === null ? (
            <label className="block text-sm">
              <span className="font-medium">{t("Pokladňa (hotovostný bloček)")}</span>
              <KodPohody
                value={p.pokladna ?? ""}
                onChange={(v) => zmen({ pokladna: v })}
                moznosti={kody?.pokladne ?? []}
                placeholder={t("napr. {x}", { x: "HP" })}
                className={vstup}
                vyber
              />
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="font-medium">{t("Číselný rad v Pohode")}</span>
            <KodPohody
              value={p.rad ?? ""}
              onChange={(v) => zmen({ rad: v })}
              moznosti={kody?.rady ?? []}
              className={vstup}
              vyber
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("Interná poznámka pre účtovníka (do Pohody)")}</span>
            <input
              value={p.poznamka ?? ""}
              onChange={(e) => zmen({ poznamka: e.target.value })}
              maxLength={240}
              className={vstup}
            />
          </label>
        </div>
        {chyba && p.nazov ? <p className="mt-3 text-sm text-destructive">{t(chyba)}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            {t("Zrušiť")}
          </button>
          <button
            onClick={() => void uloz()}
            disabled={busy || !!chyba}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("Uložiť")}
          </button>
        </div>
      </div>
    </div>
  );
}
