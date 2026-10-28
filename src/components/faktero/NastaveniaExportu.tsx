import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import {
  nastaveniaExportu,
  upozornenieOdpoctu,
  type NastaveniaExportu as Nastavenia,
} from "@/lib/faktero/export-nastavenia";
import { ulozNastaveniaUctovaniaFn } from "@/lib/faktero/export-nastavenia.functions";

type Moznost = [string, string];

const ZAPIS: Moznost[] = [
  ["vyhotovenie", "Dátum vyhotovenia dokladu"],
  ["dodanie", "Dátum dodania"],
  ["dorucenie", "Dátum doručenia (uloženia)"],
];
const ODPOCET: Moznost[] = [
  ["dodanie", "Dátum dodania"],
  ["zauctovanie", "Dátum zaúčtovania"],
  ["dorucenie", "Dátum doručenia (uloženia)"],
  ["neskorsi", "Neskorší z dátumu dodania a doručenia"],
];
const TEXT_PRIJATE: Moznost[] = [
  ["auto", "Popis plnenia (text nad položkami, inak dodávateľ a číslo)"],
  ["polozka", "Text účtovnej položky (názov predkontácie)"],
  ["poznamka", "Poznámka dokladu"],
  ["dodavatel_cislo", "Dodávateľ a číslo dokladu"],
];
const TEXT_VYSTAVENE: Moznost[] = [
  ["auto", "Text nad položkami, inak poznámka"],
  ["poznamka", "Poznámka faktúry"],
  ["odberatel_cislo", "Odberateľ a číslo faktúry"],
  ["cislo", "Faktúra a číslo"],
];
const INT_POZNAMKA: Moznost[] = [
  ["interna", "Interná poznámka"],
  ["poznamka", "Poznámka dokladu"],
  ["interna_poznamka", "Interná poznámka a poznámka"],
  ["dodavatel_cislo", "Dodávateľ a číslo dokladu"],
];
const PARTNERI: Moznost[] = [
  ["nepridavat", "Nepridávať — partner ostane len na doklade"],
  ["parovat", "Pridať alebo aktualizovať v adresári a spárovať s dokladom"],
];
const K_PLATBE: Moznost[] = [
  ["interne", "Ako interné doklady"],
  ["vydane", "Ako vydané faktúry"],
];
const ODPOCET_ZALOHY: Moznost[] = [
  ["doklad", "Číslo dokladu k platbe (Odpočet zálohy DD12)"],
  ["sadzba", "Sadzba DPH (Odpočet zálohy 23 %)"],
  ["doklad_sadzba", "Číslo dokladu aj sadzba DPH"],
];

/**
 * Nastavenia exportu do účtovného programu — dátum zápisu a odpočtu, texty a
 * poznámky, partneri v adresári, daňový doklad k platbe a položky odpočtu
 * zálohy. Predvolené voľby sú to, čo Faktero posielalo vždy.
 */
export function NastaveniaExportu({
  companyId,
  firma,
  onUlozene,
}: {
  companyId: string;
  firma: Record<string, any>;
  onUlozene?: () => void;
}) {
  const { t } = useT();
  const uloz = useServerFn(ulozNastaveniaUctovaniaFn);
  const [n, setN] = useState<Nastavenia>(() => nastaveniaExportu(firma?.uctovanie_nastavenia));
  const [busy, setBusy] = useState(false);
  useEffect(() => setN(nastaveniaExportu(firma?.uctovanie_nastavenia)), [firma]);

  const upozornenie = upozornenieOdpoctu(n);

  async function ulozit() {
    setBusy(true);
    try {
      await uloz({ data: { company_id: companyId, export: n } });
      toast.success(t("Uložené"));
      onUlozene?.();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa uložiť"));
    } finally {
      setBusy(false);
    }
  }

  const vyber = (kluc: keyof Nastavenia, nazov: string, moznosti: Moznost[], napoveda?: string) => (
    <label className="block min-w-0">
      <span className="text-xs text-muted-foreground">{t(nazov)}</span>
      <select
        value={String(n[kluc])}
        onChange={(e) => setN({ ...n, [kluc]: e.target.value } as Nastavenia)}
        className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
      >
        {moznosti.map(([v, popis]) => (
          <option key={v} value={v}>
            {t(popis)}
          </option>
        ))}
      </select>
      {napoveda ? (
        <span className="mt-1 block text-xs text-muted-foreground">{t(napoveda)}</span>
      ) : null}
    </label>
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("Export do účtovného programu")}
      </h2>
      <p className="mt-1 max-w-prose text-xs text-muted-foreground">
        {t(
          "Platí pre export do Pohody — súbor z účtovných exportov, mesačný balík aj konektor. Názov položiek odpočtu zálohy aj pre Omegu a Money S3. Predvolené voľby posielajú doklady tak ako doteraz.",
        )}
      </p>

      <fieldset className="mt-4 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t("Prijaté faktúry a bločky")}</legend>
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          {vyber("datumZapisu", "Dátum zápisu do účtovníctva", ZAPIS)}
          <div className="min-w-0">
            {vyber("datumOdpoctu", "Dátum odpočtu DPH", ODPOCET)}
            {upozornenie ? (
              <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                {t(upozornenie)}
              </span>
            ) : (
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("DPH sa odpočíta najskôr v období, keď faktúru máte (§ 51 zákona o DPH).")}
              </span>
            )}
          </div>
          {vyber(
            "textPrijate",
            "Text dokladu",
            TEXT_PRIJATE,
            "Pri názve predkontácie sa berie popis z číselníka nižšie; bez neho ide predvolený text.",
          )}
          {vyber("intPoznamkaPrijate", "Interná poznámka prijatých faktúr", INT_POZNAMKA)}
          {vyber("intPoznamkaBlocky", "Interná poznámka bločkov", INT_POZNAMKA)}
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={n.polozkyZRozpisu}
            onChange={(e) => setN({ ...n, polozkyZRozpisu: e.target.checked })}
          />
          <span>
            {t("Exportovať položky z rozpisu DPH, ak doklad nemá iné položky")}
            <span className="block text-xs text-muted-foreground">
              {t(
                "Doklad bez položiek dostane jednu položku na každú sadzbu DPH s predkontáciou dokladu. Inak ide len súhrn po sadzbách.",
              )}
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="mt-4 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t("Vystavené faktúry")}</legend>
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          {vyber("textVystavene", "Text faktúry", TEXT_VYSTAVENE)}
          {vyber(
            "dokladKPlatbe",
            "Evidencia daňových dokladov k prijatej platbe",
            K_PLATBE,
            "Ako vydané faktúry idú s predkontáciou zálohovej faktúry — nastavte ju tak, aby sa účtovala len daň zo zálohy.",
          )}
          {vyber("nazovOdpoctu", "Názov položiek pre uhradenú zálohu", ODPOCET_ZALOHY)}
        </div>
      </fieldset>

      <fieldset className="mt-4 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t("Dodávatelia a odberatelia")}</legend>
        {vyber(
          "partneri",
          "Export partnera do adresára Pohody",
          PARTNERI,
          "Pri párovaní ide karta partnera z adresára Faktera do Pohody pred dokladom a doklad sa na ňu odvolá. Celý adresár naraz sa zapína v Prepojení s Pohodou.",
        )}
      </fieldset>

      <div className="mt-4 flex justify-end">
        <button
          onClick={ulozit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("Uložiť nastavenia exportu")}
        </button>
      </div>
    </section>
  );
}
