import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ProgramUctovania } from "@/lib/faktero/uctovanie-programy";
import { UCTY_DATEV, type KlucUctu } from "@/lib/faktero/export-datev";
import { useT } from "@/lib/i18n/useT";

type Pole = {
  kluc: string;
  nazov: string;
  napoveda?: string;
  placeholder?: string;
  /** Výber namiesto voľného textu — [hodnota, popis]. */
  moznosti?: [string, string][];
};
type Skupina = { nazov: string; polia: Pole[] };

/**
 * Čo treba programu povedať, aby doklad prijal: kódy evidencií a číselných
 * radov, účty a typy dokladov musia v ňom existovať. Predkontácie a členenia
 * sú spoločné pre všetky programy (Účtovníctvo → Predkontácie).
 */
const POLIA: Record<ProgramUctovania, Skupina[]> = {
  omega: [
    {
      nazov: "Evidencie a číselné rady v Omege",
      polia: [
        {
          kluc: "evidencie.OF.evidencia",
          nazov: "Odoslané faktúry — kód evidencie",
          placeholder: "OF",
        },
        { kluc: "evidencie.OF.rad", nazov: "Odoslané faktúry — číselný rad", placeholder: "OF" },
        {
          kluc: "evidencie.OD.evidencia",
          nazov: "Odoslané dobropisy — kód evidencie",
          placeholder: "OD",
        },
        { kluc: "evidencie.OD.rad", nazov: "Odoslané dobropisy — číselný rad", placeholder: "OD" },
        {
          kluc: "evidencie.OPF.evidencia",
          nazov: "Odoslané preddavkové — kód evidencie",
          placeholder: "OPF",
        },
        {
          kluc: "evidencie.OPF.rad",
          nazov: "Odoslané preddavkové — číselný rad",
          placeholder: "OPF",
        },
        {
          kluc: "evidencie.DF.evidencia",
          nazov: "Došlé faktúry — kód evidencie",
          placeholder: "DF",
        },
        { kluc: "evidencie.DF.rad", nazov: "Došlé faktúry — číselný rad", placeholder: "DF" },
        {
          kluc: "evidencie.DPF.evidencia",
          nazov: "Došlé preddavkové — kód evidencie",
          placeholder: "DPF",
        },
        { kluc: "evidencie.DPF.rad", nazov: "Došlé preddavkové — číselný rad", placeholder: "DPF" },
        {
          kluc: "evidencie.DD.evidencia",
          nazov: "Došlé dobropisy — kód evidencie",
          placeholder: "DD",
        },
        { kluc: "evidencie.DD.rad", nazov: "Došlé dobropisy — číselný rad", placeholder: "DD" },
        {
          kluc: "evidencie.PD.evidencia",
          nazov: "Pokladničné doklady — kód evidencie",
          placeholder: "PD",
        },
        { kluc: "evidencie.PD.rad", nazov: "Pokladničné doklady — číselný rad", placeholder: "PD" },
        {
          kluc: "evidencie.ID.evidencia",
          nazov: "Interné doklady — kód evidencie",
          placeholder: "ID",
        },
        { kluc: "evidencie.ID.rad", nazov: "Interné doklady — číselný rad", placeholder: "ID" },
      ],
    },
    {
      nazov: "Účty",
      polia: [
        { kluc: "ucetOdberatelia", nazov: "Odberatelia", placeholder: "311" },
        { kluc: "ucetDodavatelia", nazov: "Dodávatelia", placeholder: "321" },
        { kluc: "ucetPokladna", nazov: "Pokladňa", placeholder: "211" },
        {
          kluc: "ucetInterne",
          nazov: "Protiúčet bločkov platených kartou",
          placeholder: "ako dodávatelia, napr. 261",
        },
        { kluc: "ucetZaokruhlenieNaklad", nazov: "Zaokrúhlenie — náklad", placeholder: "548" },
        { kluc: "ucetZaokruhlenieVynos", nazov: "Zaokrúhlenie — výnos", placeholder: "648" },
        { kluc: "ucetDphVstup", nazov: "DPH na vstupe", placeholder: "343" },
        { kluc: "ucetDphVystup", nazov: "DPH na výstupe", placeholder: "343" },
        {
          kluc: "ucetVynosy",
          nazov: "Výnosy, keď predkontácia nemá účty",
          placeholder: "602",
        },
        {
          kluc: "ucetNaklady",
          nazov: "Náklady, keď predkontácia nemá účty",
          placeholder: "501",
        },
      ],
    },
  ],
  money_s3: [
    {
      nazov: "Číselné rady a pokladňa v Money S3",
      polia: [
        { kluc: "radVydane", nazov: "Rad vydaných faktúr", placeholder: "napr. FV" },
        { kluc: "radPrijate", nazov: "Rad prijatých faktúr", placeholder: "napr. FP" },
        { kluc: "radPokladna", nazov: "Rad pokladničných dokladov", placeholder: "napr. PV" },
        { kluc: "radInterne", nazov: "Rad interných dokladov", placeholder: "napr. ID" },
        { kluc: "pokladna", nazov: "Skratka pokladne", placeholder: "napr. HP" },
        {
          kluc: "ucetDph",
          nazov: "Účet DPH pre interné doklady",
          placeholder: "napr. 343100",
        },
      ],
    },
  ],
  flexi: [
    {
      nazov: "Typy dokladov v ABRA Flexi",
      polia: [
        { kluc: "typDoklVydana", nazov: "Vydaná faktúra", placeholder: "FAKTURA" },
        { kluc: "typDoklDobropisVydany", nazov: "Vydaný dobropis", placeholder: "DOBROPIS" },
        { kluc: "typDoklPrijata", nazov: "Prijatá faktúra", placeholder: "FAKTURA" },
        {
          kluc: "typDoklDobropisPrijaty",
          nazov: "Prijatý dobropis",
          placeholder: "prázdne = ako prijatá faktúra",
        },
        { kluc: "typDoklPokladna", nazov: "Pokladničný pohyb", placeholder: "STANDARD" },
        { kluc: "typDoklInterny", nazov: "Interný doklad", placeholder: "INT. DOKLAD" },
        { kluc: "pokladna", nazov: "Kód pokladne", placeholder: "napr. POKLADNA" },
      ],
    },
  ],
  datev: [
    {
      nazov: "Mandant v DATEV",
      polia: [
        {
          kluc: "beraternummer",
          nazov: "Beraternummer",
          placeholder: "napr. 29098",
          napoveda: "Číslo daňového poradcu v DATEV (1001–9999999).",
        },
        { kluc: "mandantennummer", nazov: "Mandantennummer", placeholder: "napr. 55003" },
        {
          kluc: "osnova",
          nazov: "Účtová osnova",
          moznosti: [
            ["SKR03", "SKR03"],
            ["SKR04", "SKR04"],
          ],
        },
        { kluc: "dlzkaUctov", nazov: "Dĺžka Sachkonten", placeholder: "4" },
        {
          kluc: "zaciatokRoka",
          nazov: "Hospodársky rok začína v mesiaci",
          placeholder: "1 = január",
        },
        {
          kluc: "osobneUcty",
          nazov: "Debitori a kreditori",
          moznosti: [
            ["zberne", "Zberné účty (10000 / 70000)"],
            ["osobne", "Osobné účty podľa partnera"],
          ],
        },
        { kluc: "diktat", nazov: "Diktatkürzel", placeholder: "napr. FA" },
        {
          kluc: "automatickeUcty",
          nazov: "Ďalšie automatické účty (bez BU-Schlüssel)",
          placeholder: "napr. 3400, 8401",
        },
      ],
    },
    {
      nazov: "Prepis účtov (prázdne = predvolený účet osnovy)",
      polia: (Object.keys(UCTY_DATEV) as KlucUctu[]).map((k) => ({
        kluc: `ucty.${k}`,
        nazov: UCTY_DATEV[k].popis,
        placeholder: `SKR03 ${UCTY_DATEV[k].SKR03} · SKR04 ${UCTY_DATEV[k].SKR04}`,
      })),
    },
    {
      nazov: "BU-Schlüssel pri bežnom účte",
      polia: [
        { kluc: "bu.vstup19", nazov: "Vorsteuer 19 %", placeholder: "9" },
        { kluc: "bu.vstup7", nazov: "Vorsteuer 7 %", placeholder: "8" },
        { kluc: "bu.vystup19", nazov: "Umsatzsteuer 19 %", placeholder: "3" },
        { kluc: "bu.vystup7", nazov: "Umsatzsteuer 7 %", placeholder: "2" },
        { kluc: "bu.rcTuzemsko19", nazov: "§ 13b 19 % (tuzemsko)", placeholder: "94" },
        { kluc: "bu.rcEu19", nazov: "§ 13b 19 % (služba z EÚ)", placeholder: "46" },
        {
          kluc: "bu.nadobudnutie19",
          nazov: "Innergemeinschaftlicher Erwerb 19 %",
          placeholder: "19",
        },
      ],
    },
  ],
  csv: [],
};

const NAPOVEDA: Record<ProgramUctovania, string> = {
  omega:
    "Omega prijme len evidencie a rady, ktoré v nej existujú. Účty predkontácií (MD/Dal) vyplňte v Účtovníctvo → Predkontácie — Omega dostane rovno účtovné zápisy.",
  money_s3:
    "Predkontácie a členenia DPH zadajte v Účtovníctvo → Predkontácie s rovnakými skratkami, aké máte v Money S3.",
  flexi:
    "Predkontácie (predpisy zaúčtovania) a členenia DPH zadajte v Účtovníctvo → Predkontácie s kódmi z ABRA Flexi — napr. členenie „40-41“, nie pohodové PD.",
  datev:
    "Beraternummer a Mandantennummer vám dá daňový poradca. Daň si DATEV rozpočíta sám: výnosy a nákupy v prenesení idú na automatické účty, bežné náklady s BU-Schlüssel. Účet z predkontácie (Účtovníctvo → Predkontácie, MD pri nákupe, Dal pri predaji) má prednosť pred predvoleným.",
  csv: "Súpiska nemá čo nastavovať — obsahuje kódy aj účty z Účtovníctvo → Predkontácie.",
};

function zPloche(h: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const prejdi = (o: any, cesta: string) => {
    for (const [k, v] of Object.entries(o ?? {})) {
      const c = cesta ? `${cesta}.${k}` : k;
      if (v && typeof v === "object") prejdi(v, c);
      else if (v != null) out[c] = String(v);
    }
  };
  prejdi(h, "");
  return out;
}

function doStromu(plocha: Record<string, string>): Record<string, unknown> {
  const out: Record<string, any> = {};
  for (const [c, v] of Object.entries(plocha)) {
    if (!v.trim()) continue;
    const casti = c.split(".");
    let o = out;
    casti.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
    o[casti[casti.length - 1]!] = v.trim();
  }
  return out;
}

export function NastaveniaProgramu({
  program,
  hodnoty,
  onUlozit,
}: {
  program: ProgramUctovania;
  hodnoty: Record<string, unknown>;
  onUlozit: (h: Record<string, unknown>) => Promise<void>;
}) {
  const { t } = useT();
  const [h, setH] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setH(zPloche(hodnoty)), [hodnoty]);
  const skupiny = POLIA[program] ?? [];

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 text-sm">
      <p className="text-muted-foreground">{t(NAPOVEDA[program])}</p>
      {skupiny.map((s) => (
        <div key={s.nazov} className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t(s.nazov)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.polia.map((p) => (
              <label key={p.kluc} className="block">
                <span className="text-xs text-muted-foreground">{t(p.nazov)}</span>
                {p.moznosti ? (
                  <select
                    value={h[p.kluc] ?? p.moznosti[0]![0]}
                    onChange={(e) => setH({ ...h, [p.kluc]: e.target.value })}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {p.moznosti.map(([v, n]) => (
                      <option key={v} value={v}>
                        {t(n)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={h[p.kluc] ?? ""}
                    placeholder={p.placeholder ? t(p.placeholder) : undefined}
                    onChange={(e) => setH({ ...h, [p.kluc]: e.target.value })}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                )}
                {p.napoveda && (
                  <span className="mt-1 block text-xs text-muted-foreground">{t(p.napoveda)}</span>
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
      {skupiny.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onUlozit(doStromu(h));
            } catch (e: any) {
              toast.error(t(e?.message ?? "Nepodarilo sa uložiť"));
            } finally {
              setBusy(false);
            }
          }}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {t("Uložiť nastavenia")}
        </button>
      )}
    </div>
  );
}
