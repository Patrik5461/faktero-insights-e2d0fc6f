import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatujMenu } from "@/lib/faktero/mena";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { zoznamVyuctovaniFn } from "@/lib/faktero/vyuctovanie-vydavkov.functions";
import { nazovTypu, TYPY_VYUCTOVANIA } from "@/lib/faktero/vyuctovanie-vydavkov";
import { DocumentListToolbar } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";

/**
 * Súhrnné vyúčtovanie výdavkov zamestnancov (ako modul Vyúčtovanie výdavkov
 * v Doklado). Nové vznikne tu alebo z označených bločkov a prijatých faktúr.
 */
export const Route = createFileRoute("/_authenticated/doklady/vyuctovania/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Vyúčtovanie výdavkov — Faktero") }] }),
  // Hľadanie a filtre zoznamu sú v adrese (`q`, `f`).
  validateSearch: (s: Record<string, unknown>) => zoznamSearch(s),
  component: Zoznam,
});

const datum = (d?: string | null) => (d ? new Date(d).toLocaleDateString("sk-SK") : "");

/** Výsledok vyúčtovania v jazyku webu — server ho skladá po slovensky aj so sumou. */
function vysledokVyuctovania(
  t: (s: string, p?: Record<string, string | number>) => string,
  typ: string,
  rozdiel: number,
  mena: string,
): string {
  const suma = `${Math.abs(rozdiel).toFixed(2).replace(".", ",")} ${mena || "EUR"}`;
  if (typ === "karta") return t("Platené firemnou kartou — nič sa nedopláca.");
  if (rozdiel > 0) return t("Firma doplatí zamestnancovi {suma}.", { suma });
  if (rozdiel < 0) return t("Zamestnanec vráti firme {suma}.", { suma });
  return t("Vyrovnané — nikto nikomu nič nedlhuje.");
}

function Zoznam() {
  const { t } = useT();
  const cid = useMemo(() => getActiveCompanyId(), []);
  const nacitaj = useServerFn(zoznamVyuctovaniFn);
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    if (!cid) return;
    nacitaj({ data: { company_id: cid } })
      .then(setRows)
      .catch((e) => {
        toast.error(e?.message ?? t("Vyúčtovania sa nepodarilo načítať"));
        setRows([]);
      });
  }, [cid, nacitaj]);
  // Vyúčtovaní je málo — načítajú sa všetky a hľadá sa v prehliadači.
  const lf = useListFilters({ pageSizeKey: "vyuctovania" });
  const typ = lf.filter("typ");
  const stav = lf.filter("stav");
  const zobrazene = useMemo(() => {
    if (!rows) return rows;
    const h = lf.q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!typ || r.typ === typ) &&
        (!stav || (stav === "uzavrete" ? r.stav === "uzavrete" : r.stav !== "uzavrete")) &&
        (!h ||
          [r.nazov, r.zamestnanec_meno]
            .filter(Boolean)
            .some((x) => String(x).toLowerCase().includes(h))),
    );
  }, [rows, lf.q, typ, stav]);

  return (
    <>
      <PageHeader
        title={t("Vyúčtovanie výdavkov")}
        description={t("Bločky a faktúry, ktoré zamestnanec zaplatil zo zálohy, z vlastných peňazí alebo firemnou kartou — súhrn, doplatok a PDF na podpis.")}
        action={
          <Link
            to="/doklady/vyuctovania/$id"
            params={{ id: "novy" }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t("Nové vyúčtovanie")}
          </Link>
        }
      />
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {t("Vyúčtovanie založíte aj priamo zo zoznamu")}{" "}
          <Link to="/doklady" className="text-primary hover:underline">
            {t("Bločkov")}
          </Link>{" "}
          {t("alebo")}{" "}
          <Link to="/prijate-faktury" className="text-primary hover:underline">
            {t("Prijatých faktúr")}
          </Link>{" "}
          {t("— označte doklady a kliknite na")} <em>{t("Vyúčtovanie")}</em>
          {t(". Doklad vo vyúčtovaní ide do Pohody ako interný doklad (nie z firemnej pokladne) a prijatá faktúra sa už neponúkne v hromadnom príkaze na úhradu.")}
        </div>
        <div className="mt-6">
          <DocumentListToolbar
            lf={lf}
            filters={[
              {
                key: "typ",
                label: "Typ",
                type: "select",
                options: TYPY_VYUCTOVANIA.map((x) => ({ value: x.kod, label: x.nazov })),
              },
              {
                key: "stav",
                label: "Stav",
                type: "select",
                options: [
                  { value: "otvorene", label: "otvorené" },
                  { value: "uzavrete", label: "uzavreté" },
                ],
              },
            ]}
          />
        </div>
        {rows === null || zobrazene === null ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("Zatiaľ žiadne vyúčtovanie.")}
          </div>
        ) : zobrazene.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("Nič nevyhovuje filtru.")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">{t("Vyúčtovanie")}</th>
                  <th className="p-3">{t("Zamestnanec")}</th>
                  <th className="p-3">{t("Typ")}</th>
                  <th className="p-3 text-right">{t("Doklady")}</th>
                  <th className="p-3 text-right">{t("Spolu")}</th>
                  <th className="p-3">{t("Výsledok")}</th>
                  <th className="p-3">{t("Stav")}</th>
                </tr>
              </thead>
              <tbody>
                {zobrazene.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/40"
                  >
                    <td className="p-3">
                      <Link
                        to="/doklady/vyuctovania/$id"
                        params={{ id: r.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.nazov}
                      </Link>
                      <div className="text-xs text-muted-foreground">{datum(r.created_at)}</div>
                    </td>
                    <td className="p-3">{r.zamestnanec_meno ?? "—"}</td>
                    <td className="p-3 text-xs">{t(nazovTypu(r.typ)).replace("Vyúčtovanie ", "").replace("Abrechnung ", "")}</td>
                    <td className="p-3 text-right tabular-nums">{r.suhrn.pocet}</td>
                    <td className="p-3 text-right tabular-nums">
                      {formatujMenu(r.suhrn.spolu, r.mena)}
                    </td>
                    <td className="p-3 text-xs">
                      {vysledokVyuctovania(t, r.typ, Number(r.suhrn.rozdiel) || 0, r.mena)}
                    </td>
                    <td className="p-3 text-xs">
                      {r.stav === "uzavrete" ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                          {t("uzavreté")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5">{t("otvorené")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
