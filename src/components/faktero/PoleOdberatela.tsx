import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

export type Odberatel = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  zip: string | null;
};

/** Adresa odberateľa v tvare, ktorý sa dá vložiť do poľa „Kam". */
export function adresaOdberatela(o: Odberatel | null | undefined): string {
  if (!o) return "";
  // Bez mesta je adresa na hľadanie trasy nepoužiteľná — ulica sama sa nájde
  // v každom druhom meste. Preto sa berie len to, čo dá zmysel.
  const casti = [o.street, [o.zip, o.city].filter(Boolean).join(" ")].filter(
    (c) => c && String(c).trim(),
  );
  return casti.length ? casti.join(", ") : (o.name ?? "");
}

/**
 * Výber odberateľa, za ktorým sa išlo.
 *
 * Ponúka len odberateľov aktívnej firmy — cudzí sa na jazdu nesmie dostať ani
 * menom. Meno sa odovzdáva zvlášť, aby sa dalo uložiť ako odtlačok: odberateľ
 * sa dá premenovať aj zmazať, ale kniha jázd musí ostať čitateľná aj po rokoch.
 */
export function PoleOdberatela({
  value,
  onChange,
  label = "Odberateľ, za ktorým ste išli",
  napoveda,
  className,
}: {
  value: string;
  onChange: (id: string, odberatel: Odberatel | null) => void;
  label?: string;
  napoveda?: string;
  className?: string;
}) {
  const [zoznam, setZoznam] = useState<Odberatel[] | null>(null);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return setZoznam([]);
    supabase
      .from("customers")
      .select("id, name, street, city, zip")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("name")
      .limit(1000)
      .then(({ data }) => setZoznam((data ?? []) as Odberatel[]));
  }, []);

  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          onChange(id, zoznam?.find((o) => o.id === id) ?? null);
        }}
        className="input mt-1"
      >
        <option value="">— nevybraný —</option>
        {(zoznam ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {zoznam !== null && zoznam.length === 0 && (
        <span className="mt-1 block text-xs text-muted-foreground">
          Firma zatiaľ nemá odberateľov —{" "}
          <a href="/odberatelia?new=1" className="text-primary underline-offset-2 hover:underline">
            pridajte prvého
          </a>
          .
        </span>
      )}
      {napoveda && zoznam !== null && zoznam.length > 0 && (
        <span className="mt-1 block text-xs text-muted-foreground">{napoveda}</span>
      )}
    </label>
  );
}
