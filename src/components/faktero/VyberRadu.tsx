import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { ciselneRadyFn } from "@/lib/faktero/ciselne-rady.functions";
import { type CiselnyRad, type DruhRadu } from "@/lib/faktero/ciselne-rady";

/**
 * Výber číselného radu pri vystavovaní dokladu.
 *
 * Z ktorého radu doklad dostane číslo, sa rozhoduje pri jeho vystavovaní —
 * nie v nastaveniach. Predvolený rad je prvý v zozname a berie sa, keď
 * človek nič nezmení, takže bežná práca sa nespomalí.
 *
 * Keď firma ešte žiadny rad nemá (zakladajú sa lenivo pri prvom doklade),
 * výber sa nezobrazí — nie je z čoho vyberať a číslo príde z pôvodného tvaru.
 */
export function VyberRadu({
  druh,
  hodnota,
  onZmena,
  label = "Číselný rad",
  className,
}: {
  druh: DruhRadu;
  /** Prázdne = predvolený rad. */
  hodnota: string;
  onZmena: (id: string) => void;
  label?: string;
  className?: string;
}) {
  const nacitaj = useServerFn(ciselneRadyFn);
  const [rady, setRady] = useState<CiselnyRad[]>([]);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    let zrusene = false;
    nacitaj({ data: { company_id: cid } })
      .then((v) => {
        if (zrusene) return;
        setRady(
          v.rady
            .filter((r) => r.kind === druh && r.active)
            .sort((a, b) => Number(b.is_default) - Number(a.is_default)),
        );
      })
      .catch(() => setRady([]));
    return () => {
      zrusene = true;
    };
  }, [nacitaj, druh]);

  if (rady.length === 0) return null;

  return (
    <div className={className}>
      <label className="text-[13px] font-semibold text-foreground">{label}</label>
      <select
        value={hodnota}
        onChange={(e) => onZmena(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {rady.map((r) => (
          /* Predvolený rad má prázdnu hodnotu — doklad sa tak neviaže na konkrétny rad zbytočne. */
          <option key={r.id} value={r.is_default ? "" : r.id}>
            {r.name}
            {r.is_default ? " (predvolený)" : ""} · {r.format}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground">
        Spravujú sa v{" "}
        <Link to="/ciselne-rady" className="text-primary hover:underline">
          Číselných radoch
        </Link>
        .
      </span>
    </div>
  );
}
