import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listJobOptions } from "@/lib/faktero/jobs.functions";

/**
 * Výber zákazky na doklade.
 *
 * Keď firma žiadnu zákazku nezaložila, komponent sa nevykreslí vôbec — kto
 * zákazky nepoužíva, nemá dôvod vidieť na každej faktúre prázdne pole. Len čo
 * vznikne prvá zákazka, pole sa objaví samo všade, kde sa dá priradiť.
 *
 * Ponúkajú sa iba otvorené zákazky. Na uzavretú zákazku doklad nepustí ani
 * databázový trigger, takže by to bola len ponuka na chybovú hlášku.
 */
export function JobPicker({
  value,
  onChange,
  customerId,
  label = "Zákazka",
  companyId,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Odberateľ dokladu — podľa neho sa doplní jeho predvolená zákazka. */
  customerId?: string | null;
  label?: string;
  companyId?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const fetchJobs = useServerFn(listJobOptions);
  const [jobs, setJobs] = useState<any[] | null>(null);

  const cid = useMemo(() => companyId ?? getActiveCompanyId(), [companyId]);

  useEffect(() => {
    if (!cid) {
      setJobs([]);
      return;
    }
    fetchJobs({ data: { company_id: cid } })
      .then((d: any) => setJobs(d ?? []))
      .catch(() => setJobs([]));
  }, [cid, fetchJobs]);

  // Predvolená zákazka odberateľa (rovnako ako v POHODE). Dopĺňa sa len do
  // prázdneho poľa, aby ručný výber nikdy neprepísala.
  useEffect(() => {
    if (!cid || !customerId || value || !jobs?.length) return;
    let zrusene = false;
    supabase
      .from("customers")
      .select("default_job_id")
      .eq("id", customerId)
      .eq("company_id", cid)
      .maybeSingle()
      .then(({ data }) => {
        const predvolena = data?.default_job_id;
        if (zrusene || !predvolena) return;
        if (jobs.some((j) => j.id === predvolena)) onChange(predvolena);
      });
    return () => {
      zrusene = true;
    };
  }, [cid, customerId, value, jobs, onChange]);

  if (!jobs?.length) return null;

  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">— bez zákazky —</option>
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>
            {j.job_number} — {j.name}
          </option>
        ))}
      </select>
    </label>
  );
}
