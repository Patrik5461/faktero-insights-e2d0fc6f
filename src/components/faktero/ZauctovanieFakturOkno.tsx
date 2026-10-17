import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { navrhyKodovFn, zauctujVystaveneHromadneFn } from "@/lib/faktero/zauctovanie.functions";
import { KV_CLENENIA } from "@/lib/faktero/kv-clenenie";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { KodPohody } from "./KodPohody";
import type { Navrhy } from "./ZauctovaniePanel";
import { useT } from "@/lib/i18n/useT";

const KV_VYDANE = KV_CLENENIA.filter((k) => ["A1", "A2", "C1", "D1", "D2", "X"].includes(k.kod));

/** Hromadné zaúčtovanie označených vystavených faktúr zo zoznamu. */
export function ZauctovanieFakturOkno({
  companyId,
  ids,
  onClose,
  onHotovo,
}: {
  companyId: string;
  ids: string[];
  onClose: () => void;
  onHotovo: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const nacitaj = useServerFn(navrhyKodovFn);
  const uloz = useServerFn(zauctujVystaveneHromadneFn);
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [h, setH] = useState({ predkontacia: "", clenenie: "", kv: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nacitaj({ data: { company_id: companyId, pre: "vystavena" } })
      .then(setNavrhy)
      .catch(() => {});
  }, [companyId, nacitaj]);

  async function ulozit() {
    setBusy(true);
    try {
      const r = await uloz({ data: { company_id: companyId, ids, ...h } });
      if (r.preskocene.length)
        toast.warning(
          t("Zaúčtovaných {n}; vynechané: {vynechane}", {
            n: r.zauctovanych,
            vynechane: r.preskocene.join(" · "),
          }),
        );
      else toast.success(t("Zaúčtovaných {n} faktúr", { n: r.zauctovanych }));
      onHotovo();
      onClose();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  const vstup = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Zaúčtovať vybrané faktúry")}
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">
          {ids.length === 1
            ? t("Zaúčtovať 1 faktúru")
            : t("Zaúčtovať {n} faktúr", { n: ids.length })}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Vyplnené pole sa nastaví na všetkých vybraných; prázdne nechá, čo na faktúre je (alebo predvolené z",
          )}{" "}
          <Link to="/uctovnictvo/predkontacie" className="underline">
            {t("nastavení predkontácií")}
          </Link>
          {t("). Kódy po položkách sa nastavujú na detaile faktúry.")}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">{t("Predkontácia (Pohoda)")}</span>
            <KodPohody
              value={h.predkontacia}
              onChange={(v) => setH({ ...h, predkontacia: v })}
              moznosti={navrhy?.predkontacie ?? []}
              placeholder={t("nemeniť")}
              className={vstup}
              vyber
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">{t("Členenie DPH")}</span>
            <KodPohody
              value={h.clenenie}
              onChange={(v) => setH({ ...h, clenenie: v })}
              moznosti={navrhy?.clenenia ?? []}
              placeholder={t("nemeniť")}
              className={vstup}
              vyber
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">{t("Členenie KV DPH")}</span>
            <select
              value={h.kv}
              onChange={(e) => setH({ ...h, kv: e.target.value })}
              className={vstup}
            >
              <option value="">{t("nemeniť")}</option>
              <option value="auto">{t("automaticky")}</option>
              {KV_VYDANE.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {t(k.nazov)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            {t("Zrušiť")}
          </button>
          <button
            onClick={ulozit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("Zaúčtovať")}
          </button>
        </div>
      </div>
    </div>
  );
}
