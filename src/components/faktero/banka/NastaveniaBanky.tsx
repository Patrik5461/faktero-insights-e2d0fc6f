import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";
import {
  nastaveniaBanky,
  type NastaveniaBanky as Nastavenia,
} from "@/lib/faktero/export-nastavenia";
import { ulozNastaveniaUctovaniaFn } from "@/lib/faktero/export-nastavenia.functions";

const TEXTY: [Nastavenia["textPrijemcu"], string][] = [
  ["cislo", "Faktura a číslo faktúry (Faktura 2026001)"],
  ["len_cislo", "Len číslo faktúry"],
  ["vs", "Variabilný symbol (VS 2026001)"],
  ["poznamka", "Účtovná poznámka faktúry"],
];

/**
 * Nastavenia banky firmy — párovanie bločkov podľa spôsobu platby, odkedy sa
 * pohyby sťahujú a párujú automaticky a čo ide príjemcovi v hromadnom
 * príkaze. Predvolené voľby sú to, ako to fungovalo doteraz.
 */
export function NastaveniaBanky({ companyId }: { companyId: string }) {
  const { t } = useT();
  const uloz = useServerFn(ulozNastaveniaUctovaniaFn);
  const [n, setN] = useState<Nastavenia | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from("companies")
      .select("uctovanie_nastavenia")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data }) => setN(nastaveniaBanky((data as any)?.uctovanie_nastavenia)));
  }, [companyId]);

  async function ulozit() {
    if (!n) return;
    setBusy(true);
    try {
      await uloz({ data: { company_id: companyId, banka: n } });
      toast.success(t("Uložené"));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa uložiť"));
    } finally {
      setBusy(false);
    }
  }

  const pole = "mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
  return (
    <details className="mt-8 rounded-xl border border-border bg-card p-5">
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("Nastavenia banky")}
      </summary>
      {!n ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("Načítavam…")}</p>
      ) : (
        <div className="mt-4 space-y-4 text-sm">
          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 font-medium">{t("Párovanie pohybov s bločkami")}</legend>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={n.ignorovatTypPlatby}
                onChange={(e) => setN({ ...n, ignorovatTypPlatby: e.target.checked })}
              />
              <span>
                {t("Ignorovať typ platby")}
                <span className="block text-xs text-muted-foreground">
                  {t(
                    "Vypnuté = bloček platený kartou sa páruje len s platbou kartou a prevod len s pohybom, ktorý platbou kartou nie je. Platbu kartou Faktero spozná z textu pohybu (napr. „Platba kartou“, POS, číslo karty).",
                  )}
                </span>
              </span>
            </label>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <label className="block">
              <span className="text-xs text-muted-foreground">
                {t("Synchronizovať banku od (vrátane)")}
              </span>
              <input
                type="date"
                value={n.synchronizovatOd ?? ""}
                onChange={(e) => setN({ ...n, synchronizovatOd: e.target.value || null })}
                className={pole}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(
                  "Staršie pohyby sa pri sťahovaní z banky neuložia. Prázdne = všetko, čo banka vydá.",
                )}
              </span>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">
                {t("Najskorší dátum automatického párovania")}
              </span>
              <input
                type="date"
                value={n.autoParovanieOd ?? ""}
                onChange={(e) => setN({ ...n, autoParovanieOd: e.target.value || null })}
                className={pole}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(
                  "Staršie pohyby sa s faktúrami automaticky nespárujú — ostanú na ručné potvrdenie. Prázdne = bez obmedzenia.",
                )}
              </span>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-muted-foreground">
                {t("Predvolený text pre príjemcu pri úhrade faktúr")}
              </span>
              <select
                value={n.textPrijemcu}
                onChange={(e) =>
                  setN({ ...n, textPrijemcu: e.target.value as Nastavenia["textPrijemcu"] })
                }
                className={`${pole} max-w-md`}
              >
                {TEXTY.map(([v, popis]) => (
                  <option key={v} value={v}>
                    {t(popis)}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(
                  "Hromadný príkaz na úhradu a platba cez Tatra banku. Bez poznámky či symbolu ide „Faktura“ a číslo; referencia RF ide vždy štruktúrovane.",
                )}
              </span>
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("Skratku účtu pre účtovníctvo (Pohoda) zadáte pri každom účte na stránke")}{" "}
            <Link to="/firma" className="text-primary underline">
              {t("Firma → Bankové účty")}
            </Link>
            .
          </p>

          <div className="flex justify-end">
            <button
              onClick={ulozit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("Uložiť nastavenia banky")}
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
