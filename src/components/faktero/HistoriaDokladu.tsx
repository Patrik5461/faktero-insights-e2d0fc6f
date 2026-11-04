import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { casUdalosti, textKto } from "@/lib/faktero/kto-kedy";
import {
  historiaDokladu,
  nazovUdalosti,
  potrebujeMenaHistorie,
  textInfo,
  textZmien,
  type AgendaHistorie,
  type UdalostHistorie,
  type ZaznamHistorie,
} from "@/lib/faktero/historia-dokladu";
import { useMenaClenov } from "./KtoKedyDokladu";

const STLPCE = "id, pole, pred, po, kto, kto_typ, kto_popis, kedy";
const STLPCE_STARE = "id, pole, pred, po, kto, kedy";

async function nacitajZaznamy(agenda: AgendaHistorie, id: string): Promise<ZaznamHistorie[]> {
  const dotaz = (stlpce: string) =>
    supabase
      .from("historia_dokladov")
      .select(stlpce)
      .eq("agenda", agenda)
      .eq("doklad_id", id)
      .order("kedy", { ascending: false })
      .limit(300);
  let { data, error } = await dotaz(STLPCE);
  // Kým nie je migrácia 20261103120000, stĺpce kto_typ/kto_popis nie sú.
  if (error) ({ data, error } = await dotaz(STLPCE_STARE));
  return ((data ?? []) as unknown) as ZaznamHistorie[];
}

/** Jeden riadok: „2. 11. 2026 10:02 · Peter Kováč · Zaúčtovanie: 501/321 → 518/321“. */
function RiadokUdalosti({
  u,
  agenda,
  mena,
}: {
  u: UdalostHistorie;
  agenda: AgendaHistorie;
  mena: Record<string, string>;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const k = textKto(u.kto, mena);
  const kto = [k.meno ?? (k.kluc ? t(k.kluc, k.premenne) : ""), k.pripona ? `(${t(k.pripona)})` : ""]
    .filter(Boolean)
    .join(" ");
  const kedy = casUdalosti(u.kedy, loc);
  const zmeny = textZmien(u, t, loc, agenda);
  const info = textInfo(u, t, loc);
  return (
    <li className="min-w-0 text-xs" data-udalost={u.druh}>
      <div className="flex flex-wrap gap-x-1.5 text-muted-foreground">
        {kedy ? <span className="whitespace-nowrap tabular-nums">{kedy}</span> : null}
        {kedy && kto ? <span aria-hidden>·</span> : null}
        {kto ? <span className="min-w-0 break-words font-medium text-foreground/80">{kto}</span> : null}
      </div>
      <div className="min-w-0 break-words">
        <span className="font-medium">{t(nazovUdalosti(u.druh, agenda))}</span>
        {info ? <span className="text-muted-foreground"> — {info}</span> : null}
        {zmeny.length ? ": " : null}
        {zmeny.map((z, i) => (
          <span key={i}>
            {i > 0 ? <span className="text-muted-foreground"> · </span> : null}
            {z.pole ? <span className="text-muted-foreground">{z.pole} </span> : null}
            {z.pred != null && u.druh !== "zrusenie_zauctovania" ? (
              <>
                <span className="text-muted-foreground line-through">{z.pred}</span> →{" "}
              </>
            ) : null}
            {u.druh === "zrusenie_zauctovania" ? (
              <span className="text-muted-foreground line-through">{z.pred ?? z.po}</span>
            ) : (
              <span>{z.po}</span>
            )}
          </span>
        ))}
      </div>
    </li>
  );
}

/**
 * Kto, kedy a čo s dokladom urobil — nahratie, úpravy, zaúčtovanie,
 * odovzdanie, úhrada… Zápisy robí spúšťač v databáze (web, appka, API aj
 * automat); k starým dokladom sa základné udalosti odvodia zo stĺpcov `row`.
 */
export function HistoriaDokladu({
  companyId,
  agenda,
  id,
  row,
  onPocet,
}: {
  companyId: string;
  agenda: AgendaHistorie;
  id: string;
  /** Riadok dokladu — z neho sa odvodí nahratie, uloženie a udalosti starých dokladov. */
  row?: Record<string, any> | null;
  /** Počet udalostí po načítaní — rodič podľa neho nekreslí prázdny rámček. */
  onPocet?: (n: number) => void;
}) {
  const { t } = useT();
  const [zaznamy, setZaznamy] = useState<ZaznamHistorie[] | null>(null);
  const [vsetko, setVsetko] = useState(false);

  useEffect(() => {
    let zive = true;
    void nacitajZaznamy(agenda, id).then((z) => {
      if (zive) setZaznamy(z);
    });
    return () => {
      zive = false;
    };
  }, [agenda, id]);

  const udalosti = useMemo(
    () => (zaznamy ? historiaDokladu(zaznamy, row, agenda) : []),
    [zaznamy, row, agenda],
  );
  const mena = useMenaClenov(companyId, potrebujeMenaHistorie(udalosti));

  useEffect(() => {
    if (zaznamy) onPocet?.(udalosti.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zaznamy, udalosti.length]);

  if (!zaznamy || !udalosti.length) return null;
  const zobraz = vsetko ? udalosti : udalosti.slice(0, 8);
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-sm" data-testid="historia-dokladu">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <History className="h-3.5 w-3.5" /> {t("História zmien")}
      </div>
      <ul className="mt-3 space-y-2.5">
        {zobraz.map((u, i) => (
          <RiadokUdalosti key={`${u.kedy}-${u.druh}-${i}`} u={u} agenda={agenda} mena={mena} />
        ))}
      </ul>
      {udalosti.length > 8 ? (
        <button type="button" onClick={() => setVsetko(!vsetko)} className="mt-2 text-xs text-primary hover:underline">
          {vsetko ? t("Skryť staršie") : t("Zobraziť všetko ({n})", { n: udalosti.length })}
        </button>
      ) : null}
    </div>
  );
}
