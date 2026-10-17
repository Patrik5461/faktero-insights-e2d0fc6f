import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { navrhyKodovFn, zauctujDokladyFn } from "@/lib/faktero/zauctovanie.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { PoliaZauctovania, type Navrhy } from "./ZauctovaniePanel";
import { useT } from "@/lib/i18n/useT";

/**
 * Predkontácia, členenie DPH a kategória pre vybrané bločky — ako v Doklado,
 * kde sa doklad priradí k predkontácii podľa popisu.
 */
export function PredkontaciaDokladovOkno({
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
  const uloz = useServerFn(zauctujDokladyFn);
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [h, setH] = useState<{
    predkontacia: string;
    clenenie: string;
    kategoria: string;
    kv?: string;
    stredisko?: string;
    cinnost?: string;
    rad?: string;
  }>({
    predkontacia: "",
    clenenie: "",
    kategoria: "",
    kv: "",
    stredisko: "",
    cinnost: "",
    rad: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nacitaj({ data: { company_id: companyId, pre: "doklad" } })
      .then(setNavrhy)
      .catch(() => {});
  }, [companyId, nacitaj]);

  async function ulozit() {
    setBusy(true);
    try {
      const r = await uloz({ data: { company_id: companyId, ids, ...h } });
      if (r.preskocenych)
        toast.warning(
          t(
            "Nastavené na {zmenenych}; {preskocenych} už je odovzdaných do Pohody, tie sa nemenia.",
            {
              zmenenych: r.zmenenych,
              preskocenych: r.preskocenych,
            },
          ),
        );
      else
        toast.success(
          r.zmenenych ? t("Nastavené") : t("Nič sa nezmenilo — vyplňte aspoň jedno pole."),
        );
      onHotovo();
      onClose();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  const pocet = t(ids.length === 1 ? "1 doklad" : ids.length < 5 ? "{n} doklady" : "{n} dokladov", {
    n: ids.length,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Predkontácia vybraných dokladov")}
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{t("Predkontácia — {pocet}", { pocet })}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Vyplnené pole sa nastaví na všetkých vybraných; prázdne nechá, čo na doklade je (z pravidla alebo predvolené pre bločky z",
          )}{" "}
          <Link to="/uctovnictvo/predkontacie" className="underline">
            {t("nastavení predkontácií")}
          </Link>
          {t("). Do Pohody idú spracované doklady.")}
        </p>
        <div className="mt-4">
          <PoliaZauctovania navrhy={navrhy} hodnoty={h} setHodnoty={setH} hromadne />
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
            {t("Nastaviť")}
          </button>
        </div>
      </div>
    </div>
  );
}
