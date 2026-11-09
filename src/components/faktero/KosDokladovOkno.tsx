import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { kosDokladovFn, obnovZKosaFn, zmazZKosaFn } from "@/lib/faktero/expenses.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { potvrd } from "@/lib/potvrdenie";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { obnovPoctyMenu } from "@/lib/faktero/pocty-menu";
import { ListPagination, useStoredPageSize } from "@/components/faktero/ListControls";

type Polozka = {
  id: string;
  popis: string;
  zmazaneAt: string;
  datum: string | null;
  suma: number | null;
  mena: string;
};

/**
 * Kôš dokladov — zmazaný bloček sa dá do 90 dní obnoviť aj s párovaním na
 * banku; potom sa vysype sám aj so skenom.
 */
export function KosDokladovOkno({
  companyId,
  onClose,
  onObnovene,
  vlozene = false,
}: {
  companyId: string;
  onClose: () => void;
  onObnovene: () => void;
  /** Ako obsah stránky Kôš, nie ako okno nad inou stránkou. */
  vlozene?: boolean;
}) {
  const { t, jazyk } = useT();
  useZatvorNaEscape(vlozene ? null : onClose);
  const nacitaj = useServerFn(kosDokladovFn);
  const obnov = useServerFn(obnovZKosaFn);
  const zmaz = useServerFn(zmazZKosaFn);
  const [polozky, setPolozky] = useState<Polozka[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Okno nemá vlastnú adresu — strana je v stave, počet na stranu si pamätá prehliadač.
  const [strana, setStrana] = useState(1);
  const [naStranu, setNaStranu] = useStoredPageSize("kos-dokladov");
  const pocetStran = Math.max(1, Math.ceil((polozky?.length ?? 0) / naStranu));
  const aktStrana = Math.min(strana, pocetStran);
  const viditelne = (polozky ?? []).slice((aktStrana - 1) * naStranu, aktStrana * naStranu);

  const nacitajZnova = () =>
    nacitaj({ data: { company_id: companyId } })
      .then(setPolozky)
      .catch((e: any) => {
        toast.error(e?.message ?? t("Kôš sa nepodarilo načítať"));
        setPolozky([]);
      });
  useEffect(() => {
    void nacitajZnova();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function akcia(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      // Obnovený doklad sa vráti medzi Nespracované — odznak v menu to má ukázať hneď, nie až po odchode z koša.
      obnovPoctyMenu();
      await nacitajZnova();
      onObnovene();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(null);
    }
  }

  const obal = (obsah: ReactNode) =>
    vlozene ? (
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">{obsah}</div>
    ) : (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dk-prekrytie p-4" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Kôš dokladov")}
          className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-popover p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {obsah}
        </div>
      </div>
    );

  return obal(
    <>
        {/* Vložený kôš má nadpis aj vysvetlenie v hlavičke stránky. */}
        {!vlozene && (
          <>
            <h2 className="text-lg font-semibold">{t("Kôš dokladov")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Zmazané doklady sa dajú obnoviť aj s párovaním na pohyb v banke. Po 90 dňoch sa kôš vysype sám aj so skenmi.",
              )}
            </p>
          </>
        )}
        {polozky === null ? (
          <p className={`${vlozene ? "" : "mt-4"} text-sm text-muted-foreground`}>{t("Načítavam…")}</p>
        ) : polozky.length === 0 ? (
          <p className={`${vlozene ? "py-4" : "mt-6"} text-center text-sm text-muted-foreground`}>{t("Kôš je prázdny.")}</p>
        ) : (
          <ul className={`${vlozene ? "-my-2" : "mt-4"} divide-y divide-border`}>
            {viditelne.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.popis}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.datum ? datumNaDoklade(p.datum) : t("bez dátumu")}
                    {p.suma != null ? <> · <span className="font-medium tabular-nums text-foreground">{formatujMenu(p.suma, p.mena)}</span></> : ""} · {t("zmazané")}{" "}
                    {new Date(p.zmazaneAt).toLocaleString(lokalJazyka(jazyk), { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
                <button
                  onClick={() => akcia(p.id, () => obnov({ data: { id: p.id } }), t("Doklad obnovený"))}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2 py-1 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
                >
                  {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  {t("Obnoviť")}
                </button>
                <button
                  onClick={async () => {
                    if (await potvrd(t("Zmazať doklad natrvalo aj so skenom? Už sa nebude dať obnoviť.")))
                      void akcia(p.id, () => zmaz({ data: { id: p.id } }), t("Zmazané natrvalo"));
                  }}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t("Natrvalo")}
                </button>
              </li>
            ))}
          </ul>
        )}
        {polozky && polozky.length > 0 && (
          <ListPagination
            page={aktStrana}
            pageSize={naStranu}
            total={polozky.length}
            onPageChange={setStrana}
            onPageSizeChange={(n) => {
              setNaStranu(n);
              setStrana(1);
            }}
          />
        )}
        {!vlozene && (
          <div className="mt-4 flex justify-end">
            <button onClick={onClose} className="rounded-md border border-input bg-card px-3 py-1.5 text-sm font-semibold hover:bg-secondary">
              {t("Zavrieť")}
            </button>
          </div>
        )}
    </>,
  );
}
