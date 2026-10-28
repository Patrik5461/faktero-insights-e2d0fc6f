import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useT } from "@/lib/i18n/useT";
import { podielOdpoctuVozidla } from "@/lib/faktero/rozuctovanie";
import { kodyBezOdpoctu } from "@/lib/faktero/vozidlo-odpocet";

/**
 * Výber vozidla na doklade — náklad na auto (palivo, servis, poistka).
 *
 * Ako výber zákazky: kto vozový park nepoužíva, pole nevidí. Ponúkajú sa
 * aktívne vozidlá a k tomu to, ktoré je už na doklade, aj keď je vyradené.
 *
 * Vozidlo s kráteným odpočtom DPH (50 % pri zmiešanom použití) doklad pri
 * zaúčtovaní a vo výkazoch DPH rozdelí samo — pod výberom to povie.
 */
export function VozidloPicker({
  value,
  onChange,
  companyId,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  companyId?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useT();
  const cid = useMemo(() => companyId ?? getActiveCompanyId(), [companyId]);
  const [vozidla, setVozidla] = useState<
    { id: string; nazov: string; active: boolean; odpocet: number | null }[] | null
  >(null);
  // Kódy pre neodpočítateľnú časť: `null` = ešte nenačítané, `false` = firma účtovanie nevedie.
  const [kody, setKody] = useState<
    { zNastavenia: boolean; clenenie: string | null } | false | null
  >(null);

  useEffect(() => {
    if (!cid) return setVozidla([]);
    let zive = true;
    supabase
      .from("vehicles")
      .select("id, name, license_plate, active, odpocet_dph")
      .eq("company_id", cid)
      .order("name")
      .then(({ data }) => {
        if (!zive) return;
        setVozidla(
          (data ?? []).map((v: any) => ({
            id: v.id,
            nazov: v.license_plate ? `${v.name} (${v.license_plate})` : v.name,
            active: v.active !== false,
            odpocet: podielOdpoctuVozidla(v.odpocet_dph),
          })),
        );
      });
    return () => {
      zive = false;
    };
  }, [cid]);

  const zvolene = (vozidla ?? []).find((v) => v.id === value) ?? null;
  const krateny = zvolene?.odpocet ?? null;

  // Číselník firmy sa číta, až keď je vybrané auto s kráteným odpočtom.
  useEffect(() => {
    if (krateny === null || !cid || kody !== null) return;
    let zive = true;
    supabase
      .from("predkontacie")
      .select("druh, kod, popis, agenda, aktivne, pomer")
      .eq("company_id", cid)
      .eq("aktivne", true)
      .limit(1000)
      .then(({ data }) => {
        if (!zive) return;
        const riadky = (data ?? []) as any[];
        if (!riadky.length) return setKody(false);
        const pomery = Object.fromEntries(
          riadky.filter((r) => r.druh === "predkontacia" && r.pomer).map((r) => [r.kod, r.pomer]),
        );
        const k = kodyBezOdpoctu(
          pomery,
          riadky.filter((r) => r.druh === "clenenie_dph"),
        );
        setKody({ zNastavenia: k.zNastavenia, clenenie: k.clenenie });
      });
    return () => {
      zive = false;
    };
  }, [krateny, cid, kody]);

  const ponuka = (vozidla ?? []).filter((v) => v.active || v.id === value);
  if (!ponuka.length) return null;

  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-sm font-medium">{t("Vozidlo")}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">{t("— bez vozidla —")}</option>
        {ponuka.map((v) => (
          <option key={v.id} value={v.id}>
            {v.nazov}
            {v.active ? "" : ` (${t("vyradené")})`}
          </option>
        ))}
      </select>
      {zvolene && krateny !== null && (
        <span className="mt-1 block text-xs text-muted-foreground">
          {krateny === 50
            ? t(
                "Odpočet DPH 50 % podľa vozidla {v} — polovica DPH sa odpočíta, druhá ide do nákladu. Vlastné rozúčtovanie dokladu alebo pravidlo má prednosť.",
                { v: zvolene.nazov },
              )
            : t(
                "Bez odpočtu DPH podľa vozidla {v} — celá DPH ide do nákladu. Vlastné rozúčtovanie dokladu alebo pravidlo má prednosť.",
                { v: zvolene.nazov },
              )}
          {kody && !kody.zNastavenia && (
            <span className="mt-0.5 block text-amber-700 dark:text-amber-300">
              {t(
                "Firma nemá predkontáciu s pomerom DPH 50/50 — neodpočítateľná časť pôjde s predkontáciou dokladu a členením {c}. Nastavíte ju v Predkontáciách.",
                { c: kody.clenenie ?? "PN" },
              )}
            </span>
          )}
        </span>
      )}
    </label>
  );
}
