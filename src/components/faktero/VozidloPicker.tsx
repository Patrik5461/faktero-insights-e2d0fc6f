import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useT } from "@/lib/i18n/useT";

/**
 * Výber vozidla na doklade — náklad na auto (palivo, servis, poistka).
 *
 * Ako výber zákazky: kto vozový park nepoužíva, pole nevidí. Ponúkajú sa
 * aktívne vozidlá a k tomu to, ktoré je už na doklade, aj keď je vyradené.
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
  const [vozidla, setVozidla] = useState<{ id: string; nazov: string; active: boolean }[] | null>(
    null,
  );

  useEffect(() => {
    if (!cid) return setVozidla([]);
    let zive = true;
    supabase
      .from("vehicles")
      .select("id, name, license_plate, active")
      .eq("company_id", cid)
      .order("name")
      .then(({ data }) => {
        if (!zive) return;
        setVozidla(
          (data ?? []).map((v: any) => ({
            id: v.id,
            nazov: v.license_plate ? `${v.name} (${v.license_plate})` : v.name,
            active: v.active !== false,
          })),
        );
      });
    return () => {
      zive = false;
    };
  }, [cid]);

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
    </label>
  );
}
