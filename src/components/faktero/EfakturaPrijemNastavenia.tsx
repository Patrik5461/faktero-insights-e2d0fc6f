import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import {
  nastaveniePrijmuEfakturFn,
  ulozNastaveniePrijmuEfakturFn,
} from "@/lib/faktero/efaktura/efaktura.functions";
import type { CielPrijmu, NastaveniePrijmu } from "@/lib/faktero/efaktura/zaevidovanie-efaktury";

/**
 * eFaktúra → Príjem: kam sa zaradí zaevidovaná prijatá eFaktúra, či sa
 * eviduje sama a či sa po zaevidovaní otvorí. Meniť smie len majiteľ alebo
 * správca firmy; ostatní nastavenie vidia.
 */
export function EfakturaPrijemNastavenia({ companyId }: { companyId: string | null }) {
  const { t } = useT();
  const nacitajFn = useServerFn(nastaveniePrijmuEfakturFn);
  const ulozFn = useServerFn(ulozNastaveniePrijmuEfakturFn);
  const q = useQuery({
    queryKey: ["efaktura-prijem-nastavenie", companyId],
    queryFn: () => nacitajFn({ data: { company_id: companyId! } }),
    enabled: !!companyId,
  });
  const [f, setF] = useState<NastaveniePrijmu | null>(null);
  const [ukladam, setUkladam] = useState(false);
  useEffect(() => {
    if (q.data) setF(q.data.nastavenie);
  }, [q.data]);

  if (!companyId || !q.data?.maProfil || !f) return null;
  const smie = q.data.smieMenit;
  const stavy = q.data.stavy;
  const zmenene = JSON.stringify(f) !== JSON.stringify(q.data.nastavenie);

  async function uloz() {
    if (!companyId || !f) return;
    setUkladam(true);
    try {
      await ulozFn({
        data: {
          company_id: companyId,
          ciel: f.ciel,
          stav_id: f.stavId,
          automaticky: f.automaticky,
          otvorit: f.otvorit,
        },
      });
      toast.success(t("Nastavenie príjmu eFaktúr je uložené."));
      await q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUkladam(false);
    }
  }

  const volba = (ciel: CielPrijmu, nazov: string, popis: string) => (
    <label
      className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
        f.ciel === ciel ? "border-primary bg-primary/5" : "border-border"
      } ${smie ? "" : "cursor-default opacity-80"}`}
    >
      <input
        type="radio"
        name="efaktura-prijem-ciel"
        className="mt-1"
        checked={f.ciel === ciel}
        disabled={!smie}
        onChange={() => setF({ ...f, ciel, stavId: ciel === "prijate" ? f.stavId : null })}
      />
      <span className="min-w-0">
        <span className="block font-medium">{t(nazov)}</span>
        <span className="block text-muted-foreground">{t(popis)}</span>
      </span>
    </label>
  );

  return (
    <div id="prijem" className="mb-6 scroll-mt-20 rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <Inbox className="mt-1 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{t("Príjem eFaktúr")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Kam sa prijatá eFaktúra zaradí, keď ju zaevidujete. Platí pre faktúry a dobropisy — zálohová faktúra ide vždy medzi prijaté zálohové faktúry a samofaktúru od odberateľa evidujete vo Faktúrach.",
            )}
          </p>
          {!smie && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Nastavenie môže meniť len majiteľ alebo správca firmy.")}
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {volba(
              "prijate",
              "Prijaté faktúry",
              "Faktúra vznikne hneď so všetkými údajmi z eFaktúry. Ak máte zapnuté schvaľovanie prijatých faktúr, pôjde rovno na schválenie.",
            )}
            {volba(
              "nespracovane",
              "Nespracované doklady",
              "Doklad počká na kontrolu ako doklady z e-mailu. Údaje sa prenesú z eFaktúry presne, nič sa nečíta zo skenu.",
            )}
          </div>

          {f.ciel === "prijate" && stavy.length > 0 && (
            <label className="mt-4 block sm:max-w-xs">
              <span className="mb-1 block text-sm font-medium">{t("Stav dokladu")}</span>
              <select
                className="input w-full"
                value={f.stavId ?? ""}
                disabled={!smie}
                onChange={(e) => setF({ ...f, stavId: e.target.value || null })}
              >
                <option value="">{t("Bez stavu")}</option>
                {stavy.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nazov}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="mt-4 space-y-2 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={f.automaticky}
                disabled={!smie}
                onChange={(e) => setF({ ...f, automaticky: e.target.checked })}
              />
              <span className="min-w-0">
                {t("Zaevidovať automaticky hneď po prijatí")}
                <span className="block text-xs text-muted-foreground">
                  {t(
                    "Bez kliknutia na Zaevidovať. Faktúra, ktorá už prišla inou cestou, sa len pripojí — druhá nevznikne.",
                  )}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={f.otvorit}
                disabled={!smie}
                onChange={(e) => setF({ ...f, otvorit: e.target.checked })}
              />
              <span className="min-w-0">
                {t("Po zaevidovaní otvoriť doklad")}
                <span className="block text-xs text-muted-foreground">
                  {t("Inak ostanete v zozname prijatých eFaktúr a doklad otvoríte odkazom.")}
                </span>
              </span>
            </label>
          </div>

          {smie && (
            <button
              onClick={() => void uloz()}
              disabled={ukladam || !zmenene}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {ukladam && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("Uložiť")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
