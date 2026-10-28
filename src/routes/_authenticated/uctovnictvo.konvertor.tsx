import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  DRUHY_KONVERTORA,
  STLPCE_KONVERTORA,
  sablonaKonvertora,
  type DruhKonvertora,
} from "@/lib/faktero/konvertor";
import { konvertorDoPohodyFn } from "@/lib/faktero/konvertor.functions";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

/**
 * Konvertor XLS/CSV → XML Pohody. Šablóna sa stiahne, vyplní v Exceli a
 * nahrá späť; z riadkov vznikne dávka XML s predkontáciami a nastaveniami
 * firmy. Doklady sa do Faktera neukladajú — je to len prevodník.
 */
export const Route = createFileRoute("/_authenticated/uctovnictvo/konvertor")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Konvertor do Pohody — Faktero") }],
  }),
  component: KonvertorPage,
});

const NAZOV_SABLONY: Record<DruhKonvertora, string> = {
  vydane: "sablona-vydane-faktury.xlsx",
  prijate: "sablona-prijate-faktury.xlsx",
  blocky: "sablona-blocky.xlsx",
};

/** Dátum z bunky Excelu (Date) ako RRRR-MM-DD v miestnom čase. */
function bunka(v: unknown): unknown {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${v.getFullYear()}-${m}-${d}`;
  }
  return v;
}

function KonvertorPage() {
  const { t } = useT();
  const preved = useServerFn(konvertorDoPohodyFn);
  const [druh, setDruh] = useState<DruhKonvertora>("prijate");
  const [busy, setBusy] = useState(false);
  const [vysledok, setVysledok] = useState<{
    pocet: number;
    preskocene: string[];
    subor: string;
  } | null>(null);

  async function stiahniSablonu() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sablonaKonvertora(druh));
    ws["!cols"] = STLPCE_KONVERTORA[druh].map((s) => ({ wch: Math.max(12, s.nazov.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, "Doklady");
    const navod = XLSX.utils.aoa_to_sheet([
      [t("Ako vyplniť šablónu")],
      [
        t(
          "Jeden riadok = jedna položka (vydané faktúry) alebo jedna sadzba DPH (prijaté faktúry, bločky).",
        ),
      ],
      [t("Riadky s rovnakým číslom dokladu sa spoja do jedného dokladu.")],
      [t("Stĺpce s hviezdičkou sú povinné. Vzorový riadok prepíšte alebo zmažte.")],
      [t("Dátumy ako 2026-10-01 alebo 1.10.2026, sumy s desatinnou čiarkou alebo bodkou.")],
      [t("Predkontácia a členenie DPH sú skratky z Pohody; prázdne = predvolené kódy firmy.")],
    ]);
    navod["!cols"] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, navod, t("Návod"));
    XLSX.writeFile(wb, NAZOV_SABLONY[druh]);
  }

  async function nahraj(file: File) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(true);
    setVysledok(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const riadky = XLSX.utils
        .sheet_to_json<Record<string, unknown>>(ws, { raw: true, defval: "" })
        .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, bunka(v)])));
      if (!riadky.length) throw new Error(t("Súbor je prázdny."));
      const r = await preved({ data: { company_id: cid, druh, riadky } });
      const url = URL.createObjectURL(new Blob([r.xml], { type: "application/xml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setVysledok({ pocet: r.pocet, preskocene: r.preskocene, subor: r.fileName });
      toast.success(t("Prevedené doklady: {n}. Súbor sa stiahol.", { n: r.pocet }));
    } catch (e: any) {
      toast.error(e?.message ?? t("Prevod sa nepodaril"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("Konvertor do Pohody")}
        description={t(
          "Doklady z Excelu alebo CSV prevedie na dávku XML pre import do Pohody. Do Faktera sa nič neukladá.",
        )}
      />
      <PageBody>
        <div className="max-w-3xl space-y-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("1. Druh dokladov")}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {DRUHY_KONVERTORA.map((d) => (
                <button
                  key={d.kod}
                  type="button"
                  aria-pressed={druh === d.kod}
                  onClick={() => {
                    setDruh(d.kod);
                    setVysledok(null);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    druh === d.kod
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  {t(d.nazov)}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("2. Šablóna")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Stiahnite si šablónu, vyplňte ju v Exceli (prvý hárok) a uložte ako XLSX alebo CSV v kódovaní UTF-8.",
              )}
            </p>
            <button
              type="button"
              onClick={stiahniSablonu}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              <Download className="h-4 w-4" /> {t("Stiahnuť šablónu XLSX")}
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("Stĺpce")}: {/* Názvy stĺpcov ostávajú po slovensky — podľa nich sa súbor číta. */}
              {STLPCE_KONVERTORA[druh]
                .map((s) => (s.povinny ? `${s.nazov} *` : s.nazov))
                .join(", ")}
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("3. Prevod")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Predkontácie, členenia DPH a číselné rady sa doplnia z nastavení firmy v")}{" "}
              <Link to="/uctovnictvo/predkontacie" className="text-primary underline">
                {t("Predkontáciách")}
              </Link>
              .
            </p>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {t("Nahrať vyplnenú šablónu a stiahnuť XML")}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void nahraj(f);
                }}
              />
            </label>
            {vysledok && (
              <div className="mt-4 rounded-md border border-border p-3 text-sm">
                <p>
                  {t("Počet dokladov v súbore {subor}: {n}.", {
                    subor: vysledok.subor,
                    n: vysledok.pocet,
                  })}
                </p>
                {vysledok.preskocene.length > 0 && (
                  <>
                    <p className="mt-2 font-medium text-amber-700 dark:text-amber-400">
                      {t("Vynechané ({n}):", { n: vysledok.preskocene.length })}
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                      {vysledok.preskocene.slice(0, 50).map((p, i) => (
                        <li key={i} className="break-words">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </PageBody>
    </>
  );
}
