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
import { otlacok } from "@/lib/faktero/formular-z-firmy";
import {
  jeParUctov,
  mapaPredkontacii,
  normParUctov,
  skratkaPredkontacie,
} from "@/lib/faktero/pohoda-predkontacia";

/** Riadok číselníka predkontácií (stránka Predkontácie). */
type KodCiselnika = {
  druh: string;
  kod: string;
  popis: string | null;
  zdroj: string;
  ucet_md: string | null;
  ucet_d: string | null;
  aktivne: boolean;
};

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
  predkontacie,
  onUlozene,
}: {
  companyId: string;
  firma: Record<string, any>;
  /** Číselník firmy — pre tabuľku skratiek predkontácií v Pohode. */
  predkontacie?: KodCiselnika[] | null;
  onUlozene?: () => void;
}) {
  const { t } = useT();
  const uloz = useServerFn(ulozNastaveniaUctovaniaFn);
  const [n, setN] = useState<Nastavenia>(() => nastaveniaExportu(firma?.uctovanie_nastavenia));
  const [busy, setBusy] = useState(false);
  // Prepísať len pri zmene nastavení exportu, nie pri každom novom objekte firmy (E-22) —
  // inak uloženie Predvolených či číselníka zahodí neuložené zmeny v tejto karte.
  const zFirmy = nastaveniaExportu(firma?.uctovanie_nastavenia);
  const otlacokFirmy = otlacok(zFirmy);
  useEffect(
    () => setN(zFirmy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyId, otlacokFirmy],
  );

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
      <span className="text-xs font-medium text-muted-foreground">{t(nazov)}</span>
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
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">
        {t("Export do účtovného programu")}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        {t(
          "Platí pre export do Pohody — súbor z účtovných exportov, mesačný balík aj konektor. Názov položiek odpočtu zálohy aj pre Omegu a Money S3. Predvolené voľby posielajú doklady tak ako doteraz.",
        )}
      </p>

      <fieldset className="mt-4 rounded-lg border border-border p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold">{t("Prijaté faktúry a bločky")}</legend>
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          {vyber("datumZapisu", "Dátum zápisu do účtovníctva", ZAPIS)}
          <div className="min-w-0">
            {vyber("datumOdpoctu", "Dátum odpočtu DPH", ODPOCET)}
            {upozornenie ? (
              <span className="mt-1 block text-xs text-warning">
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

      <fieldset className="mt-4 rounded-lg border border-border p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold">{t("Vystavené faktúry")}</legend>
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

      <fieldset className="mt-4 rounded-lg border border-border p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold">{t("Dodávatelia a odberatelia")}</legend>
        {vyber(
          "partneri",
          "Export partnera do adresára Pohody",
          PARTNERI,
          "Pri párovaní ide karta partnera z adresára Faktera do Pohody pred dokladom a doklad sa na ňu odvolá. Celý adresár naraz sa zapína v Prepojení s Pohodou.",
        )}
      </fieldset>

      <SkratkyPredkontacii
        predkontacie={predkontacie ?? []}
        hodnoty={n.skratkyPredkontacii}
        onZmena={(skratkyPredkontacii) => setN({ ...n, skratkyPredkontacii })}
      />

      <div className="mt-4 flex justify-end">
        <button
          onClick={ulozit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("Uložiť nastavenia exportu")}
        </button>
      </div>
    </section>
  );
}

/**
 * Skratky predkontácií v Pohode pre kódy, ktoré sú dvojicou účtov
 * („501000 325000“ z Doklada či zo súboru). Pohoda predkontáciu pozná len
 * podľa skratky — bez nej by doklad dostal „Neviem“. Kód, ktorý číselník
 * Pohody preloží sám (rovnaké účty MD/D), sa ukáže ako návrh.
 */
function SkratkyPredkontacii({
  predkontacie,
  hodnoty,
  onZmena,
}: {
  predkontacie: KodCiselnika[];
  hodnoty: Record<string, string>;
  onZmena: (v: Record<string, string>) => void;
}) {
  const { t } = useT();
  const predk = predkontacie.filter((r) => r.druh === "predkontacia");
  const mapa = mapaPredkontacii(predk, {});
  const kody = [
    ...new Set([
      ...predk
        .filter((r) => r.aktivne !== false && r.zdroj !== "pohoda" && jeParUctov(r.kod))
        .map((r) => normParUctov(r.kod) ?? r.kod),
      ...Object.keys(hodnoty),
    ]),
  ].sort();
  if (!kody.length) return null;
  const popis = (kod: string) =>
    predk.find((r) => (normParUctov(r.kod) ?? r.kod) === kod && r.popis)?.popis ?? "";
  return (
    <fieldset className="mt-4 rounded-lg border border-border p-3 sm:p-4">
      <legend className="px-1 text-sm font-semibold">{t("Skratky predkontácií v Pohode")}</legend>
      <p className="max-w-prose text-xs text-muted-foreground">
        {t(
          "Pohoda pozná predkontáciu len podľa skratky (napr. 1Fp), nie podľa účtov. Ku každej predkontácii pomenovanej účtami doplňte skratku z Pohody (Účtovníctvo → Predkontácie). Bez skratky pôjde doklad bez predkontácie a kontrola pred exportom na to upozorní.",
        )}
      </p>
      {mapa.pohoda.length ? (
        <datalist id="skratky-pohody">
          {mapa.pohoda.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      ) : null}
      <div className="mt-3 grid gap-2">
        {kody.map((kod) => {
          const navrh = skratkaPredkontacie(kod, mapa);
          return (
            <label key={kod} className="grid min-w-0 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <span className="min-w-0 text-sm">
                <span className="font-mono">{kod}</span>
                {popis(kod) ? <span className="text-muted-foreground"> · {popis(kod)}</span> : null}
              </span>
              <input
                value={hodnoty[kod] ?? ""}
                maxLength={19}
                list={mapa.pohoda.length ? "skratky-pohody" : undefined}
                placeholder={navrh.zdroj === "ciselnik" ? navrh.skratka : t("skratka")}
                aria-label={`${t("Skratka v Pohode pre")} ${kod}`}
                onChange={(e) => {
                  const v = { ...hodnoty };
                  const s = e.target.value.trim();
                  if (s) v[kod] = e.target.value;
                  else delete v[kod];
                  onZmena(v);
                }}
                className="block w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-sm"
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
