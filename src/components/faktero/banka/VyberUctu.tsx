import { useEffect, useState } from "react";
import { VyberZoZoznamu } from "@/components/faktero/VyberZoZoznamu";
import { supabase } from "@/integrations/supabase/client";
import { formatujIban } from "@/lib/faktero/platobny-ucet";
import { useT } from "@/lib/i18n/useT";

export type UcetFirmy = {
  id: string;
  name: string | null;
  iban: string;
  swift: string | null;
  bank_name: string | null;
  currency: string;
  is_default: boolean;
  /** Skratka účtu v Pohode (pre účtovníctvo). */
  pohoda_skratka?: string | null;
};

/** Bankové účty firmy — predvolený prvý. */
export function useUctyFirmy(companyId: string | null | undefined) {
  const [ucty, setUcty] = useState<UcetFirmy[] | null>(null);
  const [verzia, setVerzia] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    let zive = true;
    supabase
      .from("company_bank_accounts")
      .select("id, name, iban, swift, bank_name, currency, is_default, pohoda_skratka")
      .eq("company_id", companyId)
      .order("is_default", { ascending: false })
      .order("position")
      .order("created_at")
      .then(({ data }) => zive && setUcty((data ?? []) as UcetFirmy[]));
    return () => {
      zive = false;
    };
  }, [companyId, verzia]);
  return { ucty, obnov: () => setVerzia((v) => v + 1) };
}

export function popisUctu(u: UcetFirmy): string {
  return [
    u.name || u.bank_name || "Účet",
    formatujIban(u.iban),
    u.currency !== "EUR" ? u.currency : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Výber účtu, na ktorý majú prísť peniaze. Pri jedinom účte sa neukazuje —
 * nie je z čoho vyberať a faktúra dostane predvolený účet sama.
 */
export function VyberUctu({
  companyId,
  value,
  onChange,
  className = "",
  predvyplnit = true,
}: {
  companyId: string | null | undefined;
  value: string | null;
  onChange: (id: string) => void;
  className?: string;
  /** Vo formulári predvyplní predvolený účet; v detaile nie — zmenilo by to faktúru. */
  predvyplnit?: boolean;
}) {
  const { t } = useT();
  const { ucty } = useUctyFirmy(companyId);
  useEffect(() => {
    if (predvyplnit && !value && ucty?.length)
      onChange((ucty.find((u) => u.is_default) ?? ucty[0])!.id);
    // eslint-disable-next-line
  }, [ucty]);
  if (!ucty || ucty.length < 2) return null;
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-xs text-muted-foreground">{t("Účet na úhradu")}</span>
      <VyberZoZoznamu
        value={value ?? ""}
        ariaLabel={t("Účet na úhradu")}
        onChange={onChange}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        moznosti={[
          ...(!value ? [{ value: "", label: t("— účet firmy —") }] : []),
          ...ucty.map((u) => ({
            value: u.id,
            label: `${popisUctu(u)}${u.is_default ? ` ${t("(predvolený)")}` : ""}`,
          })),
        ]}
      />
    </label>
  );
}
