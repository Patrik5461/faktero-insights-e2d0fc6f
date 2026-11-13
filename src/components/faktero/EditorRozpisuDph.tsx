/*
  Rozpis DPH prijatého dokladu po sadzbách — jediné miesto, kde človek DPH
  zadáva (Patrik 13. 11.: „nedovoľ prepisovať zákonné sadzby DPH“).

  - sadzba je výber zo zákonných sadzieb (`VolbaSadzbyDph`), nie voľné číslo,
  - DPH riadku sa počíta zo základu; doladiť sa dá len o zaokrúhlenie
    (±0,02) — väčšiu zmenu pole po opustení vráti a povie prečo,
  - hlavička dokladu sa počíta zo súčtov (`suctyRozpisu`).
*/
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatujMenu } from "@/lib/faktero/mena";
import { DesatinnePole, precitajCislo } from "@/components/faktero/DesatinnePole";
import { VolbaSadzbyDph } from "@/components/faktero/VolbaSadzbyDph";
import type { KategoriaDph, VysledokKontroly } from "@/lib/faktero/rozpis-dph-kontrola";
import {
  dphZoVstupu,
  nesieDph,
  suctyRozpisu,
  vypocitanaDph,
  zleRiadky,
  zmenaZakladu,
  type RiadokRozpisu,
} from "./dph-formular";

const naText = (v: number) => String(v).replace(".", ",");

/**
 * DPH riadku: píše sa voľne, posúdi sa po opustení poľa — v rozsahu
 * zaokrúhlenia (±0,02) ostane, inak sa vráti vypočítaná a pole povie prečo.
 */
export function PoleDph({
  riadok,
  onChange,
  className,
  label,
}: {
  riadok: RiadokRozpisu;
  onChange: (dph: number) => void;
  className: string;
  label: string;
}) {
  const { t } = useT();
  const [text, setText] = useState(naText(riadok.dph));
  const [odmietnute, setOdmietnute] = useState(false);
  useEffect(() => setText(naText(riadok.dph)), [riadok.dph]);
  const potvrd = () => {
    const v = precitajCislo(text) ?? 0;
    const { dph, odmietnuta } = dphZoVstupu(riadok, v);
    setOdmietnute(odmietnuta);
    setText(naText(dph));
    if (dph !== riadok.dph) onChange(dph);
  };
  return (
    <>
    <input
      inputMode="decimal"
      aria-label={label}
      value={text}
      disabled={!nesieDph(riadok)}
      onChange={(e) => {
        if (/^-?[\d\s]*[.,]?\d*$/.test(e.target.value)) setText(e.target.value);
      }}
      onBlur={potvrd}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          potvrd();
        }
      }}
      className={className}
    />
    {odmietnute ? (
      <span role="alert" className="mt-1 block text-right text-xs text-destructive">
        {t("DPH sa počíta zo základu — doladiť sa dá len o zaokrúhlenie (±0,02).")}
      </span>
    ) : null}
    </>
  );
}

export function EditorRozpisuDph({
  riadky,
  onChange,
  sadzby,
  historicke,
  dobropis = false,
  mena,
  kontrola,
  kompaktne = false,
  minRiadkov = 1,
  className = "",
}: {
  riadky: RiadokRozpisu[];
  onChange: (r: RiadokRozpisu[]) => void;
  /** Zákonné sadzby krajiny firmy v deň dodania (`sadzbyNaVyber`). */
  sadzby: number[];
  /** Historické zákonné sadzby (`historickeSadzbyNaVyber`) — záporný riadok a dobropis. */
  historicke?: number[];
  /** Dobropis / opravný doklad: ponúkne sadzby pôvodného obdobia. */
  dobropis?: boolean;
  mena: string | null | undefined;
  /** Živá kontrola — riadky s chybou sa orámujú. */
  kontrola?: VysledokKontroly | null;
  kompaktne?: boolean;
  /** Koľko riadkov musí ostať (Nespracované môžu byť aj bez rozpisu). */
  minRiadkov?: number;
  className?: string;
}) {
  const { t } = useT();
  const m = mena || "EUR";
  const s = suctyRozpisu(riadky);
  const zle = zleRiadky(riadky, sadzby, historicke ?? []);
  for (const c of kontrola?.chyby ?? []) if (c.riadok != null) zle.add(c.riadok);
  const zmen = (i: number, r: RiadokRozpisu) => onChange(riadky.map((x, j) => (j === i ? r : x)));
  const pole = `w-full min-w-[5rem] rounded-md border bg-background px-2 ${kompaktne ? "py-1" : "py-1.5"} text-right text-sm tabular-nums disabled:opacity-60`;
  return (
    <div className={`text-sm ${className}`} data-testid="editor-rozpisu-dph">
      <table className="w-full">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 pr-2 font-medium">{t("Sadzba")}</th>
            <th className="py-1 pr-2 text-right font-medium">{t("Základ")}</th>
            <th className="py-1 pr-2 text-right font-medium">{t("DPH")}</th>
            <th>
              <span className="sr-only">{t("Akcie")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {riadky.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="py-1 pr-2">
                <VolbaSadzbyDph
                  riadok={{ ...r, vat_category: (r.pdp ? "reverse_charge" : r.vat_category) as KategoriaDph | undefined }}
                  sadzby={sadzby}
                  historicke={historicke}
                  dobropis={dobropis}
                  onChange={(z) => {
                    const n = { ...r, ...z, pdp: z.vat_category === "reverse_charge" ? true : undefined };
                    if (n.pdp === undefined) delete n.pdp;
                    zmen(i, { ...n, dph: vypocitanaDph(n) });
                  }}
                  className={`w-24 max-w-full rounded-md border border-input bg-background px-1.5 ${kompaktne ? "py-1" : "py-1.5"} text-sm sm:w-36 sm:px-2`}
                />
              </td>
              <td className="py-1 pr-2">
                <DesatinnePole
                  aria-label={t("Základ dane")}
                  hodnota={r.zaklad}
                  naZmenu={(z) => zmen(i, zmenaZakladu(r, z))}
                  className={`${pole} ${zle.has(i) ? "dk-ramik-chyba" : "border-input"}`}
                />
              </td>
              <td className="py-1 pr-2">
                <PoleDph
                  label={t("DPH")}
                  riadok={r}
                  onChange={(dph) => zmen(i, { ...r, dph })}
                  className={`${pole} ${zle.has(i) ? "dk-ramik-chyba" : "border-input"}`}
                />
              </td>
              <td className="py-1 text-right">
                <button
                  type="button"
                  aria-label={t("Odstrániť sadzbu")}
                  disabled={riadky.length <= minRiadkov}
                  onClick={() => onChange(riadky.filter((_, j) => j !== i))}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            const sadzba = sadzby[0] ?? 0;
            onChange([...riadky, { sadzba, zaklad: 0, dph: 0, vat_category: sadzba > 0 ? "standard" : "needs_review" }]);
          }}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> {t("Pridať sadzbu")}
        </button>
        <span className="text-xs text-muted-foreground tabular-nums" data-testid="sucty-rozpisu-dph">
          {t("Bez DPH {zaklad} · DPH {dph} · spolu {spolu}", {
            zaklad: formatujMenu(s.zaklad, m),
            dph: formatujMenu(s.dph, m),
            spolu: formatujMenu(s.spolu, m),
          })}
        </span>
      </div>
    </div>
  );
}
