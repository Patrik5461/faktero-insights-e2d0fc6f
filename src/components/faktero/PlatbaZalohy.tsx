import { IkonaPlatby, ObsahPlatby, type PohybPlatby } from "@/components/faktero/IkonaPlatby";
import { usePlatbyZaloh, type PlatbyZaloh } from "@/hooks/usePlatbyZaloh";
import { useT } from "@/lib/i18n/useT";
import {
  stavPlatbyZalohy,
  zalohaUhradena,
  type DruhZalohy,
  type ZalohaPreStav,
} from "@/lib/faktero/zalohove-platby";

const ODKAZ_BANKY = "/bankove-ucty/transakcie";

/** Údaje okna pri ikonke: spárovaný pohyb alebo nájdený návrh. */
function pohybOkna(
  platby: PlatbyZaloh,
  id: string,
  stav: string | null,
  mena: string | null | undefined,
): PohybPlatby | null {
  const u = platby.uhrady[id];
  const z = platby.podlaDokladu.get(id);
  if (stav === "sparovana" && u)
    return {
      datum: u.datum,
      suma: u.suma,
      mena: mena ?? "EUR",
      protistrana: u.protistrana,
      odkaz: ODKAZ_BANKY,
    };
  if (stav === "navrh" && z?.pohyb)
    return {
      datum: z.pohyb.booking_date,
      suma: z.pohyb.amount,
      mena: z.pohyb.currency ?? mena ?? "EUR",
      vs: z.pohyb.variable_symbol,
      protistrana: z.pohyb.counterparty,
      odkaz: ODKAZ_BANKY,
    };
  return null;
}

/** Stav platby zálohovej (pre ikonku aj filter) z väzieb a návrhov. */
export function stavRiadkuZalohy(platby: PlatbyZaloh, druh: DruhZalohy, r: ZalohaPreStav & { id: string }) {
  return stavPlatbyZalohy(r, druh, {
    sparovana: !!platby.uhrady[r.id],
    maNavrh: platby.podlaDokladu.has(r.id),
  });
}

/** Ikonka banky s bodkou v riadku / na karte zoznamu zálohových faktúr. */
export function IkonaPlatbyZalohy({
  platby,
  druh,
  riadok,
  mena,
}: {
  platby: PlatbyZaloh;
  druh: DruhZalohy;
  riadok: ZalohaPreStav & { id: string };
  mena?: string | null;
}) {
  const { t } = useT();
  const stav = stavRiadkuZalohy(platby, druh, riadok);
  if (!stav) return null;
  const u = platby.uhrady[riadok.id];
  const z = platby.podlaDokladu.get(riadok.id);
  return (
    <IkonaPlatby
      stav={stav}
      pohyb={pohybOkna(platby, riadok.id, stav, mena)}
      dovody={stav === "navrh" ? (z?.dovody ?? []).map((x) => t(x)) : undefined}
      ista={z?.istota === "auto"}
      zaneprazdnene={!!z && platby.parujem === z.transactionId}
      onSparuj={z ? () => platby.sparuj(z) : undefined}
      onNie={z ? () => platby.odmietni(z.transactionId) : undefined}
      onZrus={u ? () => platby.rozparuj(u.transactionId) : undefined}
      popisNenajdena="V banke sme platbu nenašli."
      odkazRucne={ODKAZ_BANKY}
    />
  );
}

/**
 * Karta v detaile zálohovej faktúry: nájdená platba s tlačidlom Spárovať,
 * alebo veta „V banke sme platbu nenašli“. Pri uhradenej (aj ručne) sa
 * nezobrazí nič — stav je v hlavičke dokladu.
 */
export function PlatbaZalohyDetail({
  druh,
  companyId,
  doklad,
  mena,
  onZmena,
}: {
  druh: DruhZalohy;
  companyId: string | null;
  doklad: ZalohaPreStav & { id: string };
  mena?: string | null;
  onZmena?: () => void | Promise<void>;
}) {
  const { t } = useT();
  const platby = usePlatbyZaloh(druh, companyId, [doklad.id], onZmena);
  if (zalohaUhradena(doklad, druh) || platby.uhrady[doklad.id]) return null;
  const stav = stavRiadkuZalohy(platby, druh, doklad);
  if (!stav || stav === "sparovana" || !platby.navrhyNacitane) return null;
  const z = platby.podlaDokladu.get(doklad.id);
  return (
    <section
      aria-label={t("Platba z banky")}
      data-platba-zalohy={stav}
      className="mb-4 rounded-xl border border-border bg-card p-4"
    >
      <ObsahPlatby
        stav={stav}
        pohyb={pohybOkna(platby, doklad.id, stav, mena)}
        dovody={stav === "navrh" ? (z?.dovody ?? []).map((x) => t(x)) : undefined}
        ista
        zaneprazdnene={!!z && platby.parujem === z.transactionId}
        onSparuj={z ? () => platby.sparuj(z) : undefined}
        onNie={z ? () => platby.odmietni(z.transactionId) : undefined}
        popisNenajdena="V banke sme platbu nenašli."
        odkazRucne={ODKAZ_BANKY}
      />
    </section>
  );
}
