import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  overPlatitelaDphFn,
  prevezmiPlatitelaDphFn,
  stavPlatitelaDphFn,
} from "@/lib/faktero/platitel-dph.functions";
import {
  datumSk,
  icDphNaVymazanie,
  nazovRezimu,
  porovnaj,
  type ZdrojRegistra,
} from "@/lib/faktero/platitel-dph";
import { krajinaDane } from "@/lib/faktero/vat-rates";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

type Stav = Awaited<ReturnType<typeof stavPlatitelaDphFn>>;

type Firma = {
  country?: string | null;
  ico?: string | null;
  dic?: string | null;
  ic_dph?: string | null;
  vat_payer?: boolean | null;
  vat_scheme?: string | null;
  dph_auto_overenie?: boolean | null;
};

/**
 * Overenie platiteľstva DPH v registri — pod výberom režimu DPH v nastaveniach
 * firmy. Ukazuje, čo povedal register (FS SR s paragrafom registrácie,
 * Registr plátců DPH), upozorní na nesúlad s nastavením a ponúkne ho
 * prevziať. Nastavenie, ktoré firma má, sa samo nikdy neprepíše.
 */
export function PlatitelDphRegister({
  companyId,
  firma,
  onAuto,
  onPrevzate,
}: {
  companyId: string;
  /** Rozpísané nastavenie z formulára — nesúlad sa počíta proti nemu. */
  firma: Firma;
  onAuto: (zapnute: boolean) => void;
  /** Zmena, ktorú server zapísal do firmy — formulár si ju prevezme, nech ju neprepíše starou. */
  onPrevzate: (zmena: { vat_scheme?: string; vat_payer?: boolean; ic_dph?: string | null }) => void;
}) {
  const { t, jazyk } = useT();
  const nacitajStav = useServerFn(stavPlatitelaDphFn);
  const over = useServerFn(overPlatitelaDphFn);
  const prevezmi = useServerFn(prevezmiPlatitelaDphFn);
  const [stav, setStav] = useState<Stav | null>(null);
  const [pracujem, setPracujem] = useState<"" | "over" | "prevezmi">("");
  const krajina = krajinaDane(firma.country);

  const obnov = useCallback(() => {
    nacitajStav({ data: { company_id: companyId } })
      .then(setStav)
      .catch(() => setStav(null));
  }, [companyId, nacitajStav]);
  useEffect(obnov, [obnov]);

  // Nemecko verejný register platiteľov nemá.
  if (krajina === "DE") return null;

  const p = stav?.posledne as any;
  const zdroj = (p?.zdroj ?? (krajina === "CZ" ? "adis_cz" : "fs_sk")) as ZdrojRegistra;
  const nesulad = p
    ? porovnaj(firma, {
        zdroj,
        stav: p.stav,
        schema: p.schema,
        icDph: p.ic_dph,
        platneOd: p.platne_od,
        zruseneOd: p.zrusene_od,
        dovodyNaZrusenie: null,
        nespolehlivy: false,
        zoznamK: p.zoznam_k,
        odpoved: null,
        chyba: null,
      }).nesulad
    : false;
  const rezim = p ? t(nazovRezimu(p.schema)) : "";
  const od = p ? datumSk(p.zrusene_od ?? p.platne_od) : "";
  const nastavene = t(nazovRezimu(firma.vat_scheme));
  // Uprostred vety malým písmenom — v nemčine nie, podstatné mená ostávajú veľkým.
  const voVete = (s: string) => (jazyk === "de" ? s : s.charAt(0).toLowerCase() + s.slice(1));

  async function overTeraz() {
    setPracujem("over");
    try {
      const r = await over({ data: { company_id: companyId } });
      if (r.stav === "chyba")
        toast.error(t("Register sa nepodarilo overiť: {chyba}", { chyba: r.chyba ?? "" }));
      else if (r.doplnene) {
        onPrevzate(r.doplnene);
        toast.success(t("Prázdne údaje DPH sa doplnili z registra"));
      } else toast.success(t("Overené v registri"));
      obnov();
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setPracujem("");
    }
  }

  async function prevezmiZRegistra() {
    // Register firmu nevedie → jej IČ DPH sa vymaže; povedať to vopred.
    const vymaze = icDphNaVymazanie(p?.stav, firma.ic_dph);
    const otazka = t(
      "Prevziať nastavenie DPH z registra? Režim DPH firmy sa nastaví na „{rezim}“. Ovplyvní sadzby a vety na nových dokladoch, vystavené doklady sa nemenia.",
      { rezim },
    );
    const ok = await potvrd(
      vymaze
        ? `${otazka} ${t(
            "IČ DPH {ic} sa z firmy vymaže, lebo ho register nevedie. Predošlá hodnota ostane v histórii registrácie DPH.",
            { ic: vymaze },
          )}`
        : otazka,
      { potvrdit: t("Prevziať z registra"), nebezpecne: false },
    );
    if (!ok) return;
    setPracujem("prevezmi");
    try {
      const r = await prevezmi({ data: { company_id: companyId } });
      onPrevzate({
        vat_scheme: String(r.schema),
        vat_payer: r.vat_payer,
        ...(r.ic_dph ? { ic_dph: r.ic_dph } : r.vymazane_ic_dph ? { ic_dph: null } : {}),
      });
      toast.success(t("Nastavenie DPH je prevzaté z registra"));
      obnov();
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setPracujem("");
    }
  }

  const ZMENA: Record<string, string> = {
    nova_registracia: "nová registrácia",
    zrusenie: "zrušenie registrácie",
    zmena_druhu: "zmena druhu registrácie",
  };

  return (
    <div className="sm:col-span-2 min-w-0 space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("Overenie v registri DPH")}</span>
        <button
          type="button"
          onClick={overTeraz}
          disabled={!!pracujem}
          className="rounded-md border border-input px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-50"
        >
          {pracujem === "over" ? t("Overujem…") : t("Overiť teraz")}
        </button>
      </div>

      {p ? (
        <p className="text-xs text-muted-foreground">
          {zdroj === "fs_sk"
            ? t("Podľa registra Finančnej správy SR: {rezim}{od}. Overené {datum}.", {
                rezim,
                od: od ? t(" od {datum}", { datum: od }) : "",
                datum: datumSk(stav?.overene_at ?? p.naposledy_at),
              })
            : t("Podľa Registra plátců DPH: {rezim}. Overené {datum}.", {
                rezim,
                datum: datumSk(stav?.overene_at ?? p.naposledy_at),
              })}
        </p>
      ) : (
        stav && (
          <p className="text-xs text-muted-foreground">
            {t("Firma sa v registri ešte neoverovala.")}
          </p>
        )
      )}

      {stav?.chyba && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("Register sa naposledy nepodarilo overiť ({datum}) — skúsi sa to znova.", {
            datum: datumSk(stav.chyba.at),
          })}
        </p>
      )}

      {nesulad && p && (
        <div
          role="alert"
          className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
        >
          <span className="min-w-0 flex-1">
            {zdroj === "fs_sk"
              ? t(
                  "Podľa registra FS je firma {rezim}{od}, vo Faktere je nastavená ako {nastavene}.",
                  {
                    rezim: voVete(rezim),
                    od: od ? t(" od {datum}", { datum: od }) : "",
                    nastavene: voVete(nastavene),
                  },
                )
              : t(
                  "Podľa Registra plátců DPH je firma {rezim}, vo Faktere je nastavená ako {nastavene}.",
                  {
                    rezim: voVete(rezim),
                    nastavene: voVete(nastavene),
                  },
                )}
            {p.ic_dph &&
            firma.ic_dph &&
            p.ic_dph !== String(firma.ic_dph).replace(/\s+/g, "").toUpperCase()
              ? ` ${t("IČ DPH v registri: {ic}.", { ic: p.ic_dph })}`
              : ""}
          </span>
          <button
            type="button"
            onClick={prevezmiZRegistra}
            disabled={!!pracujem}
            className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground disabled:opacity-50"
          >
            {pracujem === "prevezmi" ? t("Preberám…") : t("Prevziať z registra")}
          </button>
        </div>
      )}

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={firma.dph_auto_overenie !== false}
          onChange={(e) => onAuto(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <span className="text-sm">
          {t("Automaticky overovať platiteľstvo DPH")}
          <span className="block text-xs text-muted-foreground">
            {t(
              "Raz denne a po zmene IČO alebo IČ DPH. Prázdny režim DPH sa doplní sám, vyplnený sa nikdy neprepíše — pri nesúlade sa ozve zvonček.",
            )}
          </span>
        </span>
      </label>

      {(stav?.historia?.length ?? 0) > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {t("História registrácie DPH")}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {stav!.historia.map((h: any) => (
              <li key={h.id} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-muted-foreground">{datumSk(h.overene_at)}</span>
                <span>{t(nazovRezimu(h.schema))}</span>
                {(h.zrusene_od || h.platne_od) && (
                  <span className="text-muted-foreground">
                    {t("od {datum}", { datum: datumSk(h.zrusene_od ?? h.platne_od) })}
                  </span>
                )}
                {h.zmena && <span className="font-medium">{t(ZMENA[h.zmena])}</span>}
                {h.doplnene && (
                  <span className="text-muted-foreground">{t("doplnené do firmy")}</span>
                )}
                {h.sposob === "prevzatie" && (
                  <span className="text-muted-foreground">{t("prevzaté z registra")}</span>
                )}
                {h.doplnene?.vymazane_ic_dph && (
                  <span className="text-muted-foreground">
                    {t("vymazané IČ DPH {ic}", { ic: h.doplnene.vymazane_ic_dph })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
