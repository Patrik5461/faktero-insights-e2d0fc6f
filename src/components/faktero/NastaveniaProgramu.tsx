import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ProgramUctovania } from "@/lib/faktero/uctovanie-programy";

type Pole = { kluc: string; nazov: string; napoveda?: string; placeholder?: string };
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
  csv: [],
};

const NAPOVEDA: Record<ProgramUctovania, string> = {
  omega:
    "Omega prijme len evidencie a rady, ktoré v nej existujú. Účty predkontácií (MD/Dal) vyplňte v Účtovníctvo → Predkontácie — Omega dostane rovno účtovné zápisy.",
  money_s3:
    "Predkontácie a členenia DPH zadajte v Účtovníctvo → Predkontácie s rovnakými skratkami, aké máte v Money S3.",
  flexi:
    "Predkontácie (predpisy zaúčtovania) a členenia DPH zadajte v Účtovníctvo → Predkontácie s kódmi z ABRA Flexi — napr. členenie „40-41“, nie pohodové PD.",
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
  const [h, setH] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setH(zPloche(hodnoty)), [hodnoty]);
  const skupiny = POLIA[program] ?? [];

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 text-sm">
      <p className="text-muted-foreground">{NAPOVEDA[program]}</p>
      {skupiny.map((s) => (
        <div key={s.nazov} className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {s.nazov}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.polia.map((p) => (
              <label key={p.kluc} className="block">
                <span className="text-xs text-muted-foreground">{p.nazov}</span>
                <input
                  value={h[p.kluc] ?? ""}
                  placeholder={p.placeholder}
                  onChange={(e) => setH({ ...h, [p.kluc]: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
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
              toast.error(e?.message ?? "Nepodarilo sa uložiť");
            } finally {
              setBusy(false);
            }
          }}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          Uložiť nastavenia
        </button>
      )}
    </div>
  );
}
