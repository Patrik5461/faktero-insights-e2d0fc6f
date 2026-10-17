import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Download, Loader2, Pencil, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createStockMovementDebug } from "@/lib/faktero/stock.functions";
import {
  odoslatSamofakturuFn,
  odoslatSamofakturuEfakturouFn,
  stavSamofakturyEfakturaFn,
  oznacitOdsuhlasenuFn,
  pdfSamofakturyFn,
} from "@/lib/faktero/samofakturacia.functions";
import {
  NAZVY_STAVOV,
  prepocitajPolozku,
  stavSamofaktury,
  sumySamofaktury,
} from "@/lib/faktero/samofakturacia";
import { useT } from "@/lib/i18n/useT";

const FARBY: Record<string, string> = {
  koncept: "border-border bg-muted/40",
  caka: "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
  odsuhlasena: "border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
  zamietnuta: "border-rose-300 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30",
};

function kedy(iso: string | null | undefined, loc = "sk-SK") {
  return iso ? new Date(iso).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" }) : "";
}

export function stiahniBase64(base64: string, fileName: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Stav samofaktúry a kroky k odsúhlaseniu — na detaile prijatej faktúry. */
export function SamofakturaPanel({ row, onZmena }: { row: any; onZmena: () => void }) {
  const { t, jazyk } = useT();
  const loc = jazyk === "de" ? "de-DE" : "sk-SK";
  const stav = stavSamofaktury(row);
  const odosli = useServerFn(odoslatSamofakturuFn);
  const odsuhlas = useServerFn(oznacitOdsuhlasenuFn);
  const pdf = useServerFn(pdfSamofakturyFn);
  const [email, setEmail] = useState<string>(row.supplier_email ?? "");
  const [sprava, setSprava] = useState("");
  const [busy, setBusy] = useState<null | "posli" | "pdf" | "ok" | "sklad" | "efaktura">(null);
  const posliEfakturou = useServerFn(odoslatSamofakturuEfakturouFn);
  const stavEfaktury = useServerFn(stavSamofakturyEfakturaFn);
  const [efaktura, setEfaktura] = useState<{
    efakturaZapnuta: boolean;
    odoslana: boolean;
    stav: string | null;
    odoslanaAt: string | null;
    chyba: string | null;
  } | null>(null);
  useEffect(() => {
    if (stav !== "odsuhlasena") return;
    stavEfaktury({ data: { id: row.id } })
      .then(setEfaktura)
      .catch(() => setEfaktura(null));
  }, [row.id, stav, stavEfaktury]);

  async function odosliEfakturou() {
    setBusy("efaktura");
    try {
      await posliEfakturou({ data: { id: row.id } });
      toast.success(t("Odoslané cez eFaktúru — dodávateľ ju dostane do svojho systému."));
      setEfaktura(await stavEfaktury({ data: { id: row.id } }));
    } catch (e: any) {
      toast.error(t(e?.message ?? "Odoslanie cez eFaktúru zlyhalo"));
    } finally {
      setBusy(null);
    }
  }
  const pohyb = useServerFn(createStockMovementDebug);
  /*
    Skladové položky odsúhlasenej samofaktúry (výkup tovaru). Cena na sklad je
    základ riadku po zľave riadku aj pomernej časti zľavy na doklad.
  */
  const skladove = (Array.isArray(row.items) ? row.items : []).filter(
    (p: any) => p.stock_item_id && Number(p.quantity) > 0,
  );
  const mozeNaskladnit =
    stav === "odsuhlasena" && !row.opravuje_cislo && !row.naskladnene_at && skladove.length > 0;

  async function naskladni() {
    setBusy("sklad");
    try {
      const polozky = (row.items as any[]).map((p) => prepocitajPolozku(p, true));
      const zaklad = polozky.reduce((s, p) => s + p.total, 0);
      const k =
        zaklad > 0 ? sumySamofaktury(polozky, Number(row.discount_total ?? 0)).zaklad / zaklad : 1;
      for (const p of skladove) {
        const mnozstvo = Number(p.quantity);
        const zakladRiadku = prepocitajPolozku(p, true).total * k;
        const r = await pohyb({
          data: {
            company_id: row.company_id,
            stock_item_id: p.stock_item_id,
            type: "prijem",
            quantity: mnozstvo,
            unit_price: Math.round((zakladRiadku / mnozstvo) * 10000) / 10000,
            note: `Samofaktúra ${row.invoice_number} — ${row.supplier_name}`,
            source_document_type: "self_billing",
            source_document_id: row.id,
            job_id: row.job_id ?? null,
          },
        });
        if (!r.ok) throw new Error(`${p.name}: ${r.error}`);
      }
      const { error } = await (supabase as any)
        .from("purchase_invoices")
        .update({ naskladnene_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw error;
      const n = skladove.length;
      toast.success(
        t(
          n === 1
            ? "Na sklad prijaté: {n} položka."
            : n < 5
              ? "Na sklad prijaté: {n} položky."
              : "Na sklad prijaté: {n} položiek.",
          {
            n,
          },
        ),
      );
      onZmena();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Naskladnenie zlyhalo"));
    } finally {
      setBusy(null);
    }
  }
  const [rucne, setRucne] = useState(false);
  const [rucnePozn, setRucnePozn] = useState("");

  async function posli() {
    setBusy("posli");
    try {
      await odosli({ data: { id: row.id, email: email.trim(), sprava: sprava || undefined } });
      toast.success(
        t("Poslané na {email} — dodávateľ dostal PDF a odkaz na odsúhlasenie.", {
          email: email.trim(),
        }),
      );
      setSprava("");
      onZmena();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Odoslanie zlyhalo"));
    } finally {
      setBusy(null);
    }
  }

  async function stiahni() {
    setBusy("pdf");
    try {
      const r = await pdf({ data: { id: row.id } });
      stiahniBase64(r.base64, r.fileName);
    } catch (e: any) {
      toast.error(t(e?.message ?? "PDF sa nepodarilo vyrobiť"));
    } finally {
      setBusy(null);
    }
  }

  async function oznac() {
    setBusy("ok");
    try {
      await odsuhlas({ data: { id: row.id, poznamka: rucnePozn || undefined } });
      toast.success(t("Samofaktúra je odsúhlasená — vstupuje do DPH a dá sa uhradiť."));
      setRucne(false);
      onZmena();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`rounded-xl border p-5 text-sm ${FARBY[stav]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {row.opravuje_cislo
              ? t("Dobropis k samofaktúre {cislo}", { cislo: row.opravuje_cislo })
              : t("Samofaktúra · vyhotovenie faktúry odberateľom")}
          </div>
          <div className="mt-1 text-base font-semibold">{t(NAZVY_STAVOV[stav])}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={stiahni}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {busy === "pdf" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t("PDF faktúry")}
          </button>
          {stav === "odsuhlasena" && efaktura?.efakturaZapnuta && !efaktura.odoslana && (
            <button
              type="button"
              onClick={odosliEfakturou}
              disabled={busy !== null}
              title={t(
                "Od 1. 1. 2027 sa aj samofaktúra medzi platiteľmi posiela cez eFaktúru (Peppol)",
              )}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "efaktura" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t("Poslať cez eFaktúru")}
            </button>
          )}
          {mozeNaskladnit && (
            <button
              type="button"
              onClick={naskladni}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "sklad" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {t("Prijať na sklad")}
            </button>
          )}
          {stav === "odsuhlasena" && !row.opravuje_cislo && (
            <Link
              to="/prijate-faktury/samofaktura"
              search={{ opravuje: row.id }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <Pencil className="h-4 w-4" /> {t("samofaktura::Vystaviť dobropis")}
            </Link>
          )}
          {stav !== "odsuhlasena" && (
            <Link
              to="/prijate-faktury/samofaktura"
              search={{ id: row.id }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <Pencil className="h-4 w-4" /> {t("Upraviť")}
            </Link>
          )}
        </div>
      </div>

      {stav === "koncept" && (
        <p className="mt-2 text-muted-foreground">
          {t(
            "Faktúru ste vyhotovili za dodávateľa. Kým ju neodsúhlasí, nevstupuje do DPH ani na úhradu.",
          )}
        </p>
      )}
      {stav === "caka" && (
        <p className="mt-2">
          {t("Poslané na")} <strong>{row.supplier_email}</strong>{" "}
          {kedy(row.samofakturacia_odoslana_at, loc)}.{" "}
          {t("Dodávateľ ju odsúhlasí cez odkaz v e-maile.")}
        </p>
      )}
      {stav === "zamietnuta" && (
        <div className="mt-2">
          <p>
            {t("Dodávateľ s faktúrou nesúhlasí ({kedy}):", {
              kedy: kedy(row.samofakturacia_rozhodnutie_at, loc),
            })}
          </p>
          {row.samofakturacia_poznamka && (
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-background/70 p-2">
              {row.samofakturacia_poznamka}
            </p>
          )}
          <p className="mt-1 text-muted-foreground">{t("Opravte ju a pošlite znova.")}</p>
        </div>
      )}
      {stav === "odsuhlasena" && (
        <p className="mt-2">
          {row.samofakturacia_rozhodol === "dodavatel"
            ? t("Dodávateľ odsúhlasil {kedy} cez odkaz.", {
                kedy: kedy(row.samofakturacia_rozhodnutie_at, loc),
              })
            : t("Označené ako odsúhlasené {kedy}.", {
                kedy: kedy(row.samofakturacia_rozhodnutie_at, loc),
              })}
          {row.samofakturacia_poznamka
            ? ` ${t("Poznámka: {text}", { text: row.samofakturacia_poznamka })}`
            : ""}{" "}
          {t("PDF v odsúhlasenej podobe je uložené ako príloha.")}
          {row.naskladnene_at
            ? ` ${t("Tovar prijatý na sklad {kedy}.", { kedy: kedy(row.naskladnene_at, loc) })}`
            : ""}
          {efaktura?.odoslana
            ? ` ${
                efaktura.stav
                  ? t("Cez eFaktúru odoslaná {kedy} ({stav}).", {
                      kedy: kedy(efaktura.odoslanaAt, loc),
                      stav: efaktura.stav,
                    })
                  : t("Cez eFaktúru odoslaná {kedy}.", { kedy: kedy(efaktura.odoslanaAt, loc) })
              }`
            : ""}
        </p>
      )}

      {stav !== "odsuhlasena" && (
        <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
          <label className="block">
            <span className="text-xs text-muted-foreground">{t("E-mail dodávateľa")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">{t("Správa (nepovinné)")}</span>
            <textarea
              rows={2}
              value={sprava}
              onChange={(e) => setSprava(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={posli}
              disabled={busy !== null || !email.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy === "posli" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {stav === "caka" ? t("Poslať znova") : t("Poslať na odsúhlasenie")}
            </button>
            <button
              type="button"
              onClick={() => setRucne((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <CheckCircle2 className="h-4 w-4" /> {t("Odsúhlasil inak")}
            </button>
          </div>
          {rucne && (
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">
                {t(
                  "Napríklad podpísal papierovú faktúru, potvrdil e-mailom, alebo dohoda hovorí, že mlčanie v lehote je súhlas. Zapíše sa, kto a kedy to označil.",
                )}
              </p>
              <input
                value={rucnePozn}
                onChange={(e) => setRucnePozn(e.target.value)}
                placeholder={t("Ako odsúhlasil (napr. podpis 6. 10. 2026)")}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={oznac}
                disabled={busy !== null}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === "ok" && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("Označiť ako odsúhlasenú")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
