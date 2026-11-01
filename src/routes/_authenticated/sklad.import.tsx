import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { importStockCsv } from "@/lib/faktero/stock.functions";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import {
  automatickeMapovanie,
  dekodujCsv,
  NAZVY_POLI,
  POLIA_IMPORTU,
  pripravRiadky,
} from "@/lib/faktero/sklad-import";

export const Route = createFileRoute("/_authenticated/sklad/import")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Import skladu (CSV, XLSX) — Faktero") }],
  }),
  component: ImportStockPage,
});

function ImportStockPage() {
  const { t } = useT();
  const fetchImport = useServerFn(importStockCsv);
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // header -> field
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function onFile(file: File) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    /*
      CSV dekódujeme sami: SheetJS bez `codepage` číta súbor bez BOM ako
      latin1 a z „Čiarový kód“ urobí „ÄŒiarovÃ½ kÃ³d“. `raw: true` necháva
      bunky ako text — „1,50“ prečíta `cisloZImportu`, nie SheetJS.
    */
    const jeCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    const wb = jeCsv
      ? XLSX.read(dekodujCsv(buf), { type: "string", raw: true })
      : XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(ws, { header: 1, raw: true, defval: "" });
    if (!json.length) return toast.error(t("Súbor je prázdny."));
    const hdr = (json[0] as string[]).map((h) =>
      String(h ?? "")
        .replace(/^\uFEFF/, "")
        .trim(),
    );
    setHeaders(hdr);
    setMapping(automatickeMapovanie(hdr));
    const data = (json.slice(1) as any[])
      .map((arr) => {
        const o: Record<string, any> = {};
        hdr.forEach((h, i) => {
          o[h] = arr[i] ?? "";
        });
        return o;
      })
      .filter((r) => Object.values(r).some((v) => String(v).trim() !== ""));
    setRows(data);
    setResult(null);
  }

  const pripravene = pripravRiadky(rows, mapping);

  async function runImport() {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error(t("Vyberte firmu."));
    const payload = pripravene.riadky;
    if (!payload.length) return toast.error(t("Žiadne riadky s názvom produktu."));
    setBusy(true);
    try {
      const res = await fetchImport({ data: { company_id: cid, rows: payload as any } });
      // Riadky, ktoré neprešli už v prehliadači, patria do výsledku tiež.
      const chybyVopred = pripravene.chyby.map((c) => ({
        row: c.riadok,
        reason: `${c.pole ? `${t(NAZVY_POLI[c.pole])}: ` : ""}${t(c.dovod, c.parametre)}`,
      }));
      setResult({
        ...res,
        errors: res.errors + chybyVopred.length,
        errorList: [...chybyVopred, ...res.errorList].sort((a, b) => a.row - b.row),
      });
      toast.success(
        t("Import dokončený. Vytvorené {n}, aktualizované {u}.", {
          n: res.createdItems,
          u: res.updatedItems,
        }),
      );
    } catch (e: any) {
      toast.error(e?.message ?? t("Import zlyhal."));
    } finally {
      setBusy(false);
    }
  }

  const preview = pripravene.riadky.slice(0, 10).map(({ riadok: _r, ...zvysok }) => zvysok);
  const stlpceNahladu = POLIA_IMPORTU.filter((p) =>
    preview.some((r) => (r as any)[p] !== undefined),
  );

  return (
    <>
      <PageHeader
        title={t("Import skladu (CSV, XLSX)")}
        description={t("Nahrajte CSV alebo XLSX so skladovými kartami.")}
      />
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Upload className="h-4 w-4" /> {t("Vybrať CSV / XLSX")}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Podporované stĺpce: SKU (kód položky), Názov, Čiarový kód, Jednotka, Nákupná cena, Predajná cena, DPH, Minimálny stav, Počiatočný stav, Sklad.",
            )}{" "}
            {t(
              "Prázdna bunka hodnotu na karte nemení. Súbor exportovaný zo Skladových položiek sa dá nahrať späť — stĺpec „Stav“ sa ignoruje, príjem vytvorí len „Počiatočný stav“.",
            )}
          </p>
        </div>

        {headers.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">{t("Mapovanie stĺpcov")}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {headers.map((h) => (
                <label key={h} className="flex items-center gap-2 text-sm">
                  <span className="w-1/2 truncate text-muted-foreground">{h}</span>
                  <select
                    value={mapping[h] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">{t("— ignorovať —")}</option>
                    {POLIA_IMPORTU.map((f) => (
                      <option key={f} value={f}>
                        {t(NAZVY_POLI[f])}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        {preview.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">
              {t("Náhľad ({n} riadkov, zobrazujem 10)", { n: rows.length })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    {stlpceNahladu.map((k) => (
                      <th key={k} className="p-1">
                        {t(NAZVY_POLI[k])}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.map((r, i) => (
                    <tr key={i}>
                      {stlpceNahladu.map((k) => (
                        <td key={k} className="p-1">
                          {String((r as any)[k] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              disabled={busy}
              onClick={runImport}
              className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy
                ? t("Importujem…")
                : t("Potvrdiť import ({n} riadkov)", { n: pripravene.riadky.length })}
            </button>
            {pripravene.chyby.length > 0 && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                <div className="mb-1 font-medium text-destructive">
                  {t("{n} riadkov sa neimportuje:", { n: pripravene.chyby.length })}
                </div>
                <ul className="space-y-0.5">
                  {pripravene.chyby.slice(0, 20).map((c) => (
                    <li key={c.riadok}>
                      {t("Riadok {n}:", { n: c.riadok })}{" "}
                      {c.pole ? `${t(NAZVY_POLI[c.pole])}: ` : ""}
                      {t(c.dovod, c.parametre)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="mb-2 font-semibold">{t("Výsledok importu")}</div>
            <ul className="space-y-1">
              <li>
                {t("Nové produkty:")} <strong>{result.createdProducts}</strong>
              </li>
              <li>
                {t("Aktualizované produkty:")} <strong>{result.updatedProducts}</strong>
              </li>
              <li>
                {t("Nové skladové karty:")} <strong>{result.createdItems}</strong>
              </li>
              <li>
                {t("Aktualizované skladové karty:")} <strong>{result.updatedItems}</strong>
              </li>
              <li>
                {t("Počiatočné pohyby:")} <strong>{result.initialMovements}</strong>
              </li>
              {result.errors > 0 && (
                <li className="text-destructive">
                  {t("Chyby:")} <strong>{result.errors}</strong>
                </li>
              )}
            </ul>
            {result.errorList?.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {t("Detaily chýb")}
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {result.errorList.map((e: any, i: number) => (
                    <li key={i}>
                      {t("Riadok {n}:", { n: e.row })} {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}
