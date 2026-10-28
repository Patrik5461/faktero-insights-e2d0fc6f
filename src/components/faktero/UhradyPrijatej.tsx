import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Landmark, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import {
  dniPoSplatnosti,
  stavUhradyPrijatej,
  zostaneKUhrade,
  type UhradaPrijatej,
} from "@/lib/faktero/uhrady-prijatej";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

/*
  Úhrady prijatej faktúry (aj čiastočné) — riadky v `purchase_invoice_payments`.
  Stav uhradená / neuhradená prepočíta spúšťač v databáze; tu sa úhrady len
  čítajú, pridávajú a mažú. Úhradu z banky zmaže len zrušenie spárovania.
*/

const dnes = () => new Date().toLocaleDateString("sv-SE");

/** Načíta úhrady faktúry a zaplatenú zálohu, ktorú faktúra zúčtováva. */
export function useUhradyPrijatej(row: any | null) {
  const [uhrady, setUhrady] = useState<UhradaPrijatej[]>([]);
  const [zaloha, setZaloha] = useState(0);
  const [nacitane, setNacitane] = useState(false);
  const id = row?.id as string | undefined;
  const zalohaId = row?.advance_invoice_id as string | undefined;
  const nacitaj = useCallback(async () => {
    if (!id) return;
    const [{ data }, z] = await Promise.all([
      supabase
        .from("purchase_invoice_payments")
        .select("id, amount, paid_at, currency, zdroj, bank_transaction_id, note")
        .eq("purchase_invoice_id", id)
        .order("paid_at", { ascending: true }),
      zalohaId
        ? supabase
            .from("purchase_invoices")
            .select("amount_total, status")
            .eq("id", zalohaId)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);
    setUhrady((data ?? []) as UhradaPrijatej[]);
    setZaloha(z.data?.status === "paid" ? Math.abs(Number(z.data.amount_total ?? 0)) : 0);
    setNacitane(true);
  }, [id, zalohaId]);
  useEffect(() => {
    void nacitaj();
  }, [nacitaj, row?.status, row?.amount_total]);
  const stav = stavUhradyPrijatej({
    amount_total: row?.amount_total,
    status: row?.status,
    uhrady,
    zaloha,
  });
  return { uhrady, stav, nacitane, nacitaj };
}

/** „Označiť ako uhradenú“ — úhrada za celý zvyšok k zvolenému dňu. */
export async function oznacitUhradenu(
  row: any,
  zostava: number,
  t: (s: string, p?: Record<string, string | number>) => string,
  zadajDatum: () => Promise<string | null>,
): Promise<boolean> {
  const d = await zadajDatum();
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  if (zostava <= 0) {
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ status: "paid", payment_date: d })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return false;
    }
  } else {
    const { error } = await supabase.from("purchase_invoice_payments").insert({
      company_id: row.company_id,
      purchase_invoice_id: row.id,
      amount: zostava,
      paid_at: d,
      currency: row.currency ?? "EUR",
      method: row.payment_method ?? null,
      zdroj: "oznacenie",
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
  }
  toast.success(t("Faktúra je označená ako uhradená"));
  return true;
}

/** Okno Úhrady: celková suma, už uhradené, nová úhrada a zoznam úhrad. */
export function UhradyOkno({
  row,
  uhrady,
  stav,
  onClose,
  onZmena,
}: {
  row: any;
  uhrady: UhradaPrijatej[];
  stav: ReturnType<typeof stavUhradyPrijatej>;
  onClose: () => void;
  onZmena: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const mena = row.currency ?? "EUR";
  const [suma, setSuma] = useState(stav.zostava ? stav.zostava.toFixed(2).replace(".", ",") : "");
  const [datum, setDatum] = useState(dnes());
  const [busy, setBusy] = useState(false);
  const aktualna = Number(suma.replace(/\s/g, "").replace(",", ".")) || 0;

  async function pridaj() {
    if (!(aktualna > 0)) return toast.error(t("Zadajte sumu úhrady."));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return toast.error(t("Zadajte dátum úhrady."));
    setBusy(true);
    const { error } = await supabase.from("purchase_invoice_payments").insert({
      company_id: row.company_id,
      purchase_invoice_id: row.id,
      amount: Math.round(aktualna * 100) / 100,
      paid_at: datum,
      currency: mena,
      method: row.payment_method ?? null,
      zdroj: "rucne",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("Úhrada je pridaná"));
    onZmena();
    onClose();
  }

  async function zmaz(u: UhradaPrijatej) {
    if (u.bank_transaction_id) return;
    if (!(await potvrd(t("Zmazať túto úhradu?"), { nebezpecne: true }))) return;
    const { error } = await supabase.from("purchase_invoice_payments").delete().eq("id", u.id);
    if (error) return toast.error(error.message);
    toast.success(t("Úhrada je zmazaná"));
    onZmena();
  }

  const riadok = (popis: string, hodnota: number, silne?: boolean) => (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="min-w-0 text-muted-foreground">{popis}</span>
      <span className={`tabular-nums ${silne ? "font-semibold" : ""}`}>
        {formatujMenu(hodnota, mena)}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Úhrady")}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">{t("Úhrady")}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Zavrieť")}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-secondary/50 px-4 py-2">
          {riadok(t("Celková suma"), stav.celkom)}
          {stav.zaloha > 0 ? riadok(t("Odpočet uhradenej zálohy"), -stav.zaloha) : null}
          {riadok(t("Už uhradené"), stav.uhradene)}
          {riadok(t("Aktuálna úhrada"), aktualna)}
          <div className="mt-1 border-t border-border pt-1">
            {riadok(t("Zostane k úhrade"), zostaneKUhrade(stav.zostava, aktualna), true)}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">{t("Dátum úhrady")}</span>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              {t("Suma ({mena})", { mena })}
            </span>
            <input
              inputMode="decimal"
              value={suma}
              onChange={(e) => setSuma(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-right text-sm tabular-nums"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void pridaj()}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("Pridať úhradu")}
        </button>

        <div className="mt-5">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("Zaznamenané úhrady")}
          </div>
          {uhrady.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {row.status === "paid"
                ? t("Faktúra je označená ako uhradená {datum}.", {
                    datum: datumNaDoklade(row.payment_date),
                  })
                : t("Zatiaľ žiadna úhrada.")}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {uhrady.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                >
                  <span className="tabular-nums">{datumNaDoklade(u.paid_at)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {u.bank_transaction_id
                      ? t("z banky")
                      : u.zdroj === "oznacenie"
                        ? t("označená ako uhradená")
                        : t("zadaná ručne")}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatujMenu(Number(u.amount), u.currency ?? mena)}
                  </span>
                  {u.bank_transaction_id ? (
                    <span
                      className="p-1.5 text-muted-foreground"
                      title={t("Úhrada z banky — zmizne, keď zrušíte spárovanie s pohybom.")}
                    >
                      <Landmark className="h-4 w-4" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void zmaz(u)}
                      aria-label={t("Zmazať úhradu")}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Karta úhrady vpravo v hlavičke detailu: pruh hore podľa stavu (po
 * splatnosti = destructive, uhradená = primary), splatnosť, zostatok a akcie.
 */
export function KartaUhrady({
  row,
  stav,
  zamknute,
  onOznacit,
  onUhradit,
  onPridat,
}: {
  row: any;
  stav: ReturnType<typeof stavUhradyPrijatej>;
  /** Návrh samofaktúry, storno — platiť sa nedá. */
  zamknute?: boolean;
  onOznacit: () => void;
  onUhradit?: () => void;
  onPridat: () => void;
}) {
  const { t } = useT();
  const mena = row.currency ?? "EUR";
  const dni = dniPoSplatnosti(row.due_date);
  const uhradena = stav.stav === "uhradena";
  const poSplatnosti = !uhradena && dni != null && dni > 0 && row.status !== "cancelled";
  const pruh = uhradena ? "bg-primary" : poSplatnosti ? "bg-destructive" : "bg-muted-foreground/40";
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className={`h-1.5 ${pruh}`} />
      <div className="space-y-2 p-4">
        {row.due_date ? (
          <div
            className={`text-sm ${poSplatnosti ? "font-medium text-destructive" : "text-muted-foreground"}`}
          >
            {t("Splatná {datum}", { datum: datumNaDoklade(row.due_date) })}
            {!uhradena && dni != null
              ? ` (${
                  dni > 0
                    ? t(
                        dni === 1
                          ? "{n} deň po splatnosti"
                          : dni < 5
                            ? "{n} dni po splatnosti"
                            : "{n} dní po splatnosti",
                        { n: dni },
                      )
                    : dni === 0
                      ? t("splatná dnes")
                      : t(-dni === 1 ? "o {n} deň" : -dni < 5 ? "o {n} dni" : "o {n} dní", {
                          n: -dni,
                        })
                })`
              : ""}
          </div>
        ) : null}
        {uhradena ? (
          <div className="flex items-center gap-1.5 text-base font-semibold text-primary">
            <CheckCircle2 className="h-5 w-5" />
            {row.payment_date
              ? t("Uhradená {datum}", { datum: datumNaDoklade(row.payment_date) })
              : t("Uhradená")}
          </div>
        ) : (
          <div>
            <div className="text-xs text-muted-foreground">{t("Zostáva k úhrade")}</div>
            <div className="text-xl font-semibold tabular-nums">
              {formatujMenu(stav.zostava, mena)}
            </div>
            {stav.stav === "ciastocne" ? (
              <div className="text-xs text-muted-foreground">
                {t("Čiastočne uhradená — {suma}", { suma: formatujMenu(stav.uhradene, mena) })}
              </div>
            ) : null}
          </div>
        )}
        {stav.preplatene > 0 ? (
          <div className="text-xs text-destructive">
            {t("Preplatená o {suma}", { suma: formatujMenu(stav.preplatene, mena) })}
          </div>
        ) : null}
        {!zamknute ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {!uhradena ? (
              <button
                type="button"
                onClick={onOznacit}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <CheckCircle2 className="h-4 w-4" /> {t("Označiť ako uhradenú")}
              </button>
            ) : null}
            {!uhradena && onUhradit ? (
              <button
                type="button"
                onClick={onUhradit}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                <Landmark className="h-4 w-4" /> {t("Uhradiť")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onPridat}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <Plus className="h-4 w-4" /> {uhradena ? t("Úhrady") : t("Pridať úhradu")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
