import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, FileCheck2, Send, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  stavEfakturyZVyberu,
  STLPCE_DORUCENIA,
  type StavEfaktury,
} from "@/lib/faktero/efaktura/stav-efaktury";
import {
  klucCasuEfaktury,
  klucDovoduEfaktury,
  klucKanalaEfaktury,
  klucOdpovedeEfaktury,
  klucStavuEfaktury,
  tonEfaktury,
  ukazatDetail,
} from "@/lib/mobile/efaktura-stav";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { Card } from "./ui";

/*
  Stav eFaktúry v appke — odznak v zozname vystavených a sekcia v detaile.
  Pravidlá sú spoločné s webom (`lib/faktero/efaktura/stav-efaktury.ts`).
*/

/** Čas „31. 10. 2026 14:05“ v jazyku appky. */
export function casEfaktury(iso: string | null | undefined, loc: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(loc, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Malý odznak pri čísle faktúry v zozname. Bez eFaktúry sa nekreslí nič.
 *
 * Len ikona (stav je v popise pre čítačku aj v `title`) — riadok na 390 px
 * nesie číslo, odznak a splatnosť a s textom „eFaktúra“ by sa číslo faktúry
 * skrátilo na „FA…“.
 */
export function OdznakEfaktury({ stav }: { stav: StavEfaktury | null | undefined }) {
  const { t } = usePreklad();
  if (!stav) return null;
  const cervena = tonEfaktury(stav) === "cervena";
  const popis = t(klucStavuEfaktury(stav));
  const Ikona = cervena ? AlertTriangle : FileCheck2;
  return (
    <span
      data-efaktura-stav={stav.stav}
      title={popis}
      aria-label={popis}
      role="img"
      className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
        cervena ? "bg-app-chyba-jemna text-app-chyba" : "bg-app-zelena-jemna text-app-zelena"
      }`}
    >
      <Ikona className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}

/**
 * Sekcia „eFaktúra“ v detaile faktúry.
 *
 * Pri otvorení sa stav dopýta znova (jeden dotaz na túto faktúru) — zoznam
 * mohol byť načítaný pred hodinou alebo z pamäte. Bez signálu ostane stav zo
 * zoznamu a pod ním poznámka, že ide o posledný známy.
 */
export function SekciaEfaktury({
  fakturaId,
  typ,
  stav: zoZoznamu,
  zPamateKedy,
  obnova = 0,
  onStav,
}: {
  fakturaId: string;
  /** Typ faktúry — zálohová sa eFaktúrou neposiela. */
  typ: string;
  stav: StavEfaktury | null | undefined;
  /** Zoznam prišiel z pamäte telefónu (čas uloženia), nie zo servera. */
  zPamateKedy?: number | null;
  /** Zvýši sa po odoslaní eFaktúry — stav sa vtedy dopýta znova. */
  obnova?: number;
  /** Čerstvý stav pre okolie (napr. tlačidlo odoslania pod sekciou). */
  onStav?: (s: StavEfaktury | null) => void;
}) {
  const { t, locale: loc } = usePreklad();
  const [stav, setStav] = useState<StavEfaktury | null>(zoZoznamu ?? null);
  /** Čerstvý stav sa nepodarilo zistiť — ukazuje sa ten zo zoznamu. */
  const [nedopytany, setNedopytany] = useState(false);

  useEffect(() => {
    let zrusene = false;
    supabase
      .from("efaktura_documents")
      .select(`efaktura_deliveries(${STLPCE_DORUCENIA})`)
      .eq("invoice_id", fakturaId)
      // Bez siete dotaz nevráti chybu, ale vyhodí — zachytiť, inak by visel.
      .then(
        (r) => r,
        (e) => ({ data: null, error: e }),
      )
      .then(({ data, error }) => {
        if (zrusene) return;
        if (error) {
          setNedopytany(true);
          return;
        }
        const cerstvy = stavEfakturyZVyberu(data);
        setNedopytany(false);
        setStav(cerstvy);
        onStav?.(cerstvy);
      });
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fakturaId, obnova]);

  /* Poznámka len keď je naozaj bez signálu (alebo zoznam prišiel z pamäte) —
     iná chyba dotazu nie je dôvod tvrdiť, že telefón je offline. */
  const offline =
    nedopytany &&
    (!!zPamateKedy || (typeof navigator !== "undefined" && navigator.onLine === false));
  const poznamka = offline ? (
    <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-app-text-2">
      <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {zPamateKedy
        ? t("efs.zPamate", { kedy: casEfaktury(new Date(zPamateKedy).toISOString(), loc) })
        : t("efs.bezPripojenia")}
    </p>
  ) : null;

  if (!stav) {
    return (
      <Card className="p-4">
        <section aria-label={t("efs.nadpis")} data-efaktura-sekcia="ziadna">
          <div className="text-[13px] font-semibold text-app-text-2">{t("efs.nadpis")}</div>
          <p className="mt-1 text-[14px] text-app-text-2">
            {typ === "proforma" || typ === "advance_payment"
              ? t("efs.zalohova")
              : t("efs.neodoslana")}
          </p>
          {poznamka}
        </section>
      </Card>
    );
  }

  const cervena = tonEfaktury(stav) === "cervena";
  const Ikona =
    stav.stav === "zlyhala"
      ? AlertTriangle
      : stav.stav === "zamietnuta"
        ? XCircle
        : stav.stav === "odoslana"
          ? Send
          : CheckCircle2;
  const dovod = klucDovoduEfaktury(stav);
  const odpoved = klucOdpovedeEfaktury(stav);
  const kanal = klucKanalaEfaktury(stav.kanal);

  return (
    <Card className="p-4">
      <section aria-label={t("efs.nadpis")} data-efaktura-sekcia={stav.stav}>
        <div className="text-[13px] font-semibold text-app-text-2">{t("efs.nadpis")}</div>
        <div
          className={`mt-1 flex items-center gap-2 text-[15px] font-semibold ${
            cervena ? "text-app-chyba" : "text-app-zelena"
          }`}
        >
          <Ikona className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t(klucStavuEfaktury(stav))}
        </div>

        {dovod && (
          <p className="mt-2 text-[14px] leading-snug text-app-text" data-efaktura-dovod>
            {t(dovod)}
          </p>
        )}
        {ukazatDetail(stav) && (
          <p className="mt-1 break-words text-[12px] leading-snug text-app-text-2">
            {t("efs.podrobnosti", { text: stav.detail ?? "" })}
          </p>
        )}
        {odpoved && <p className="mt-2 text-[14px] leading-snug text-app-text">{t(odpoved)}</p>}

        <div className="mt-3 space-y-1.5 text-[13px]">
          {stav.stav !== "odoslana" && stav.kedy && (
            <RiadokEf label={t(klucCasuEfaktury(stav))} value={casEfaktury(stav.kedy, loc)} />
          )}
          {stav.odoslana && (
            <RiadokEf label={t("efs.odoslanaKedy")} value={casEfaktury(stav.odoslana, loc)} />
          )}
          {stav.kanal && <RiadokEf label={t("efs.kanal")} value={kanal ? t(kanal) : stav.kanal} />}
          {stav.pokusov > 1 && <RiadokEf label={t("efs.pokusov")} value={String(stav.pokusov)} />}
        </div>
        {poznamka}
      </section>
    </Card>
  );
}

function RiadokEf({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-app-text-2">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}
