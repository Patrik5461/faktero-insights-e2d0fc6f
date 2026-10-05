import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Download, Loader2, Pencil, Send } from "lucide-react";
import {
  odoslatSamofakturuFn,
  oznacitOdsuhlasenuFn,
  pdfSamofakturyFn,
} from "@/lib/faktero/samofakturacia.functions";
import { NAZVY_STAVOV, stavSamofaktury } from "@/lib/faktero/samofakturacia";

const FARBY: Record<string, string> = {
  koncept: "border-border bg-muted/40",
  caka: "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
  odsuhlasena: "border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
  zamietnuta: "border-rose-300 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30",
};

function kedy(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString("sk-SK", { dateStyle: "medium", timeStyle: "short" }) : "";
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
  const stav = stavSamofaktury(row);
  const odosli = useServerFn(odoslatSamofakturuFn);
  const odsuhlas = useServerFn(oznacitOdsuhlasenuFn);
  const pdf = useServerFn(pdfSamofakturyFn);
  const [email, setEmail] = useState<string>(row.supplier_email ?? "");
  const [sprava, setSprava] = useState("");
  const [busy, setBusy] = useState<null | "posli" | "pdf" | "ok">(null);
  const [rucne, setRucne] = useState(false);
  const [rucnePozn, setRucnePozn] = useState("");

  async function posli() {
    setBusy("posli");
    try {
      await odosli({ data: { id: row.id, email: email.trim(), sprava: sprava || undefined } });
      toast.success(`Poslané na ${email.trim()} — dodávateľ dostal PDF a odkaz na odsúhlasenie.`);
      setSprava("");
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Odoslanie zlyhalo");
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
      toast.error(e?.message ?? "PDF sa nepodarilo vyrobiť");
    } finally {
      setBusy(null);
    }
  }

  async function oznac() {
    setBusy("ok");
    try {
      await odsuhlas({ data: { id: row.id, poznamka: rucnePozn || undefined } });
      toast.success("Samofaktúra je odsúhlasená — vstupuje do DPH a dá sa uhradiť.");
      setRucne(false);
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
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
              ? `Dobropis k samofaktúre ${row.opravuje_cislo}`
              : "Samofaktúra · vyhotovenie faktúry odberateľom"}
          </div>
          <div className="mt-1 text-base font-semibold">{NAZVY_STAVOV[stav]}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={stiahni}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            PDF faktúry
          </button>
          {stav === "odsuhlasena" && !row.opravuje_cislo && (
            <Link
              to="/prijate-faktury/samofaktura"
              search={{ opravuje: row.id }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <Pencil className="h-4 w-4" /> Vystaviť dobropis
            </Link>
          )}
          {stav !== "odsuhlasena" && (
            <Link
              to="/prijate-faktury/samofaktura"
              search={{ id: row.id }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <Pencil className="h-4 w-4" /> Upraviť
            </Link>
          )}
        </div>
      </div>

      {stav === "koncept" && (
        <p className="mt-2 text-muted-foreground">
          Faktúru ste vyhotovili za dodávateľa. Kým ju neodsúhlasí, nevstupuje do DPH ani na úhradu.
        </p>
      )}
      {stav === "caka" && (
        <p className="mt-2">
          Poslané na <strong>{row.supplier_email}</strong> {kedy(row.samofakturacia_odoslana_at)}.
          Dodávateľ ju odsúhlasí cez odkaz v e-maile.
        </p>
      )}
      {stav === "zamietnuta" && (
        <div className="mt-2">
          <p>Dodávateľ s faktúrou nesúhlasí ({kedy(row.samofakturacia_rozhodnutie_at)}):</p>
          {row.samofakturacia_poznamka && (
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-background/70 p-2">
              {row.samofakturacia_poznamka}
            </p>
          )}
          <p className="mt-1 text-muted-foreground">Opravte ju a pošlite znova.</p>
        </div>
      )}
      {stav === "odsuhlasena" && (
        <p className="mt-2">
          {row.samofakturacia_rozhodol === "dodavatel"
            ? `Dodávateľ odsúhlasil ${kedy(row.samofakturacia_rozhodnutie_at)} cez odkaz.`
            : `Označené ako odsúhlasené ${kedy(row.samofakturacia_rozhodnutie_at)}.`}
          {row.samofakturacia_poznamka ? ` Poznámka: ${row.samofakturacia_poznamka}` : ""} PDF v
          odsúhlasenej podobe je uložené ako príloha.
        </p>
      )}

      {stav !== "odsuhlasena" && (
        <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
          <label className="block">
            <span className="text-xs text-muted-foreground">E-mail dodávateľa</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Správa (nepovinné)</span>
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
              {busy === "posli" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {stav === "caka" ? "Poslať znova" : "Poslať na odsúhlasenie"}
            </button>
            <button
              type="button"
              onClick={() => setRucne((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <CheckCircle2 className="h-4 w-4" /> Odsúhlasil inak
            </button>
          </div>
          {rucne && (
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">
                Napríklad podpísal papierovú faktúru, potvrdil e-mailom, alebo dohoda hovorí, že mlčanie
                v lehote je súhlas. Zapíše sa, kto a kedy to označil.
              </p>
              <input
                value={rucnePozn}
                onChange={(e) => setRucnePozn(e.target.value)}
                placeholder="Ako odsúhlasil (napr. podpis 6. 10. 2026)"
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={oznac}
                disabled={busy !== null}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === "ok" && <Loader2 className="h-4 w-4 animate-spin" />}
                Označiť ako odsúhlasenú
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
