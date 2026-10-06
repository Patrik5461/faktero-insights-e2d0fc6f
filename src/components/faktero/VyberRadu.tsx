import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
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
  datum,
  bezNahladu,
}: {
  druh: DruhRadu;
  /** Prázdne = predvolený rad. */
  hodnota: string;
  onZmena: (id: string) => void;
  label?: string;
  className?: string;
  /** Dátum dokladu — rad s mesiacom v čísle (`{MM}`) dá v inom mesiaci iné číslo. */
  datum?: string;
  /** Opakovaná faktúra číslo dostane až pri vystavení — tam náhľad nedáva zmysel. */
  bezNahladu?: boolean;
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

  /*
    Náhľad čísla, ktoré doklad dostane — ten istý výpočet, ktorým sa číslo
    pridelí pri uložení (vrátane zapĺňania dier po zmazaných faktúrach).
    Nič sa nerezervuje; ak medzitým niekto iný vystaví doklad, pri uložení
    príde ďalšie voľné.
  */
  const [nahlad, setNahlad] = useState<string | null>(null);
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid || bezNahladu) return;
    let zrusene = false;
    const t = setTimeout(async () => {
      const den = datum && /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : null;
      const faktura = ["invoice", "proforma", "advance_payment", "credit_note"].includes(druh);
      const { data, error } = faktura
        ? await supabase.rpc("faktero_next_invoice_number", {
            _company_id: cid,
            _issue_date: den,
            _type: druh === "invoice" ? "regular" : druh,
            _series_id: hodnota || null,
          } as never)
        : await supabase.rpc("faktero_next_series_number", {
            _company_id: cid,
            _kind: druh,
            _series_id: hodnota || null,
            _date: den,
          } as never);
      if (zrusene) return;
      const r = data as { invoice_number?: string; number?: string } | null;
      setNahlad(error ? null : (r?.invoice_number ?? r?.number ?? null));
    }, 250);
    return () => {
      zrusene = true;
      clearTimeout(t);
    };
  }, [druh, hodnota, datum, bezNahladu, rady.length]);

  const cisloRiadok = nahlad ? (
    <span className="mt-1 block text-sm">
      Číslo dokladu: <strong className="font-mono">{nahlad}</strong>
      <span className="text-xs text-muted-foreground"> — pridelí sa pri uložení</span>
    </span>
  ) : null;

  if (rady.length === 0) return cisloRiadok ? <div className={className}>{cisloRiadok}</div> : null;

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
      {cisloRiadok}
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
