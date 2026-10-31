import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileInput, Inbox, RefreshCw, Send, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOperacia } from "@/lib/mobile/server-most";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { potvrd } from "@/lib/potvrdenie";
import { NahladPdf } from "@/components/faktero/NahladPdf";
import {
  NAZOV_STAVU,
  bajtyZBase64,
  daSaZaevidovatVAppke,
  filtrujEfaktury,
  poZaevidovani,
  spravaPoZaevidovani,
  stavEfaktury,
  tonStavu,
  type FilterEfaktur,
  type StavEfaktury,
  type PrijataEfakturaApp,
  type VysledokZaevidovaniaApp,
} from "@/lib/mobile/efaktury-prijate";
import { MobilObrazovka } from "./MobilChrome";
import { datum } from "./PrijateDoklady";
import {
  Card,
  FilterChips,
  ListCard,
  ListRow,
  PrazdnyStav,
  StatusBadge,
  suma,
  type Ton,
} from "./ui";

/**
 * Prijaté eFaktúry v telefóne — zoznam, náhľad dokladu a zaevidovanie
 * jedným ťuknutím.
 *
 * Všetko ide cez tie isté serverové funkcie ako obrazovka Prijaté eFaktúry
 * na webe (`efaktura.prijate.tsx`): zoznam, náhľad (priložené PDF alebo
 * vykreslené z UBL) a zaevidovanie podľa nastavenia príjmu firmy — vznikne
 * prijatá faktúra, prípadne doklad v Nespracovaných. Odmietnutie eFaktúry
 * web nemá, takže ani appka.
 *
 * Bez signálu sa nič nezaraďuje do fronty: zaevidovanie potrebuje server
 * (číslo, kontrola duplicity, zámok proti dvojitému kliknutiu), tak appka
 * rovno povie, že to pôjde až po pripojení.
 */
export function PrijateEfaktury({
  firma,
  onSpat,
  onOtvorPrijate,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
  /** Prijaté faktúry v Dokladoch — kam patrí zaevidovaná eFaktúra. */
  onOtvorPrijate?: () => void;
}) {
  const { t, locale: loc } = usePreklad();
  const zoznamFn = useOperacia<PrijataEfakturaApp[]>("efaktury-prijate-zoznam");
  const [riadky, setRiadky] = useState<PrijataEfakturaApp[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nedostupne, setNedostupne] = useState(false);
  const [lenOdosielanie, setLenOdosielanie] = useState(false);
  const [filter, setFilter] = useState<FilterEfaktur>("nove");
  const [otvorena, setOtvorena] = useState<PrijataEfakturaApp | null>(null);
  const [nacitavam, setNacitavam] = useState(false);

  async function nacitaj() {
    setChyba(null);
    setNedostupne(false);
    setNacitavam(true);
    try {
      const r = await zoznamFn({ data: { company_id: firma.id } });
      setRiadky(r ?? []);
    } catch (e) {
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      if (!(await isOnline())) setNedostupne(true);
      else setChyba((e as Error).message);
      setRiadky((r) => r ?? []);
    } finally {
      setNacitavam(false);
    }
  }

  useEffect(() => {
    setRiadky(null);
    setOtvorena(null);
    void nacitaj();
    /* Firma „len odosielanie“ prijíma u iného poskytovateľa — tu nič nepribudne. */
    void Promise.resolve(
      supabase.from("efaktura_profiles").select("rezim").eq("company_id", firma.id).maybeSingle(),
    )
      .then((r: { data: { rezim?: string | null } | null }) =>
        setLenOdosielanie(r.data?.rezim === "len_odosielanie"),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma.id]);

  function aktualizuj(novy: PrijataEfakturaApp) {
    setRiadky((rr) => (rr ?? []).map((r) => (r.id === novy.id ? novy : r)));
    setOtvorena((o) => (o?.id === novy.id ? novy : o));
  }

  if (otvorena)
    return (
      <DetailEfaktury
        firma={firma}
        efaktura={otvorena}
        onSpat={() => setOtvorena(null)}
        onZmena={aktualizuj}
        onOtvorPrijate={onOtvorPrijate}
      />
    );

  const vsetky = riadky ?? [];
  const zobrazene = filtrujEfaktury(vsetky, filter);
  const novych = filtrujEfaktury(vsetky, "nove").length;

  return (
    <MobilObrazovka
      title={t("efp.nazov")}
      subtitle={firma.name}
      onBack={onSpat}
      akcia={
        <button
          onClick={() => void nacitaj()}
          disabled={nacitavam}
          aria-label={t("efp.obnovit")}
          className="grid h-9 w-9 place-items-center rounded-app-sm border border-app-ramik bg-app-karta active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${nacitavam ? "animate-spin" : ""}`} />
        </button>
      }
    >
      <div className="space-y-4" data-efaktury-prijate>
        {lenOdosielanie && (
          <Card className="flex items-start gap-3 p-4">
            <Send className="mt-0.5 h-4 w-4 shrink-0 text-app-zelena" />
            <p className="text-[13px] text-app-text-2">{t("efp.lenOdosielanie")}</p>
          </Card>
        )}

        {chyba && (
          <p className="rounded-app-sm border border-destructive/30 bg-app-chyba-jemna p-3 text-sm text-app-chyba">
            {chyba}
          </p>
        )}

        {vsetky.length > 0 && (
          <FilterChips
            ariaLabel={t("efp.nazov")}
            aktivna={filter}
            onZmen={setFilter}
            moznosti={[
              { kod: "nove", popis: `${t("efp.filterNove")} (${novych})` },
              { kod: "vsetky", popis: t("efp.filterVsetky") },
            ]}
          />
        )}

        {riadky === null ? (
          <p className="text-sm text-app-text-2">{t("spolocne.nacitavam")}</p>
        ) : nedostupne && vsetky.length === 0 ? (
          <PrazdnyStav icon={Inbox} title={t("efp.bezPripojenia")} />
        ) : vsetky.length === 0 ? (
          chyba || lenOdosielanie ? null : (
            <PrazdnyStav icon={Inbox} title={t("efp.ziadne")} popis={t("efp.ziadnePopis")} />
          )
        ) : zobrazene.length === 0 ? (
          <PrazdnyStav icon={Inbox} title={t("efp.ziadneNove")} popis={t("efp.ziadneNovePopis")} />
        ) : (
          <ListCard>
            {zobrazene.map((r) => {
              const s = stavEfaktury(r);
              return (
                <ListRow
                  key={r.id}
                  icon={Inbox}
                  ikonaTon={tonStavu(s)}
                  title={r.sender_name?.trim() || t("efp.neznamyDodavatel")}
                  subtitle={`${r.document_number?.trim() || t("efp.bezCisla")} · ${datum(r.issue_date, loc)}`}
                  right={suma(r.total, r.currency, loc)}
                  rightSub={<StatusBadge text={t(NAZOV_STAVU[s])} ton={tonStitku(s)} />}
                  chevron
                  onClick={() => setOtvorena(r)}
                />
              );
            })}
          </ListCard>
        )}
      </div>
    </MobilObrazovka>
  );
}

/** Štítok nemá oranžovú — nová eFaktúra je v ňom neutrálna, oranžová je ikona riadku. */
function tonStitku(s: StavEfaktury): Ton {
  const v = tonStavu(s);
  return v === "pozor" ? "neutral" : v;
}

type Nahlad = { url: string; base64: string; nazov: string; prilozene: boolean };

export function DetailEfaktury({
  firma,
  efaktura: r,
  onSpat,
  onZmena,
  onOtvorPrijate,
}: {
  firma: { id: string; name: string };
  efaktura: PrijataEfakturaApp;
  onSpat: () => void;
  onZmena: (r: PrijataEfakturaApp) => void;
  onOtvorPrijate?: () => void;
}) {
  const { t, locale: loc } = usePreklad();
  const nahladFn = useOperacia("efaktura-prijata-nahlad");
  const zaevidujFn = useOperacia<VysledokZaevidovaniaApp>("efaktura-prijata-zaeviduj");
  const [nahlad, setNahlad] = useState<Nahlad | null>(null);
  const [chybaNahladu, setChybaNahladu] = useState<string | null>(null);
  const [evidujem, setEvidujem] = useState(false);
  const s = stavEfaktury(r);
  const chyby = Number(r.kontrola_chyby ?? 0);
  const varovania = Number(r.kontrola_varovania ?? 0);

  /* Náhľad sa pripraví hneď — kvôli nemu človek detail otvára. */
  useEffect(() => {
    let zive = true;
    let url: string | null = null;
    setNahlad(null);
    setChybaNahladu(null);
    nahladFn({ data: { company_id: firma.id, received_id: r.id } })
      .then((v: { pdf: string; nazov: string; prilozene: boolean }) => {
        if (!zive) return;
        url = URL.createObjectURL(
          new Blob([bajtyZBase64(v.pdf) as BlobPart], { type: "application/pdf" }),
        );
        setNahlad({ url, base64: v.pdf, nazov: v.nazov, prilozene: v.prilozene });
      })
      .catch((e: Error) => zive && setChybaNahladu(e?.message || t("efp.nahladZlyhal")));
    return () => {
      zive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, firma.id]);

  async function zdielaj() {
    if (!nahlad) return;
    const { sharePdf } = await import("@/lib/mobile/share-pdf");
    const v = await sharePdf({
      fileName: nahlad.nazov,
      base64: nahlad.base64,
      title: r.document_number ?? nahlad.nazov,
    });
    if (!v.ok && !/cancel|zrušen|dismiss/i.test(v.error ?? ""))
      toast.error(v.error ?? t("efp.nahladZlyhal"));
  }

  async function zaeviduj() {
    if (
      chyby > 0 &&
      !(await potvrd(t("efp.potvrditSChybami", { n: chyby }), {
        potvrdit: t("efp.zaevidovatAjTak"),
        zrusit: t("spolocne.zrusit"),
      }))
    )
      return;
    const { isOnline } = await import("@/lib/mobile/offline-queue");
    if (!(await isOnline())) {
      toast.error(t("efp.bezPripojeniaZaevidovat"));
      return;
    }
    setEvidujem(true);
    try {
      const v = await zaevidujFn({ data: { company_id: firma.id, received_id: r.id } });
      const doPrijatych = v.kam === "prijate" && !!onOtvorPrijate;
      toast.success(t(spravaPoZaevidovani(v)), {
        duration: 8000,
        action: doPrijatych
          ? { label: t("efp.otvoritVDokladoch"), onClick: () => onOtvorPrijate?.() }
          : undefined,
      });
      if (chyby > 0) toast.warning(t("efp.poZaevidovaniChyby", { n: chyby }), { duration: 10000 });
      onZmena(poZaevidovani(r, v));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEvidujem(false);
    }
  }

  const mozeEvidovat = daSaZaevidovatVAppke(r);

  return (
    <MobilObrazovka
      title={r.document_number?.trim() || t("efp.bezCisla")}
      subtitle={r.sender_name?.trim() || t("efp.neznamyDodavatel")}
      onBack={onSpat}
      footer={
        mozeEvidovat ? (
          <div className="space-y-1.5 pb-1">
            <button
              type="button"
              onClick={() => void zaeviduj()}
              disabled={evidujem}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[16px] bg-app-zelena-plocha px-4 py-3 text-[16px] font-bold text-white transition active:scale-[0.99] disabled:opacity-60"
            >
              <FileInput className="h-5 w-5" />
              {evidujem ? t("efp.evidujem") : t("efp.zaevidovat")}
            </button>
            <p className="text-center text-[12px] text-app-text-2">{t("efp.zaevidovatPopis")}</p>
          </div>
        ) : s === "zaevidovana" && onOtvorPrijate ? (
          <div className="pb-1">
            <button
              type="button"
              onClick={onOtvorPrijate}
              className="min-h-[52px] w-full rounded-[16px] border border-app-obrys bg-app-karta px-4 py-3 text-[15px] font-semibold text-app-text active:bg-app-pozadie"
            >
              {t("efp.otvoritVDokladoch")}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4" data-efaktura-detail>
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-app-text-2">{t("efp.suma")}</p>
              <p className="text-[24px] font-bold tabular-nums leading-tight text-app-text">
                {suma(r.total, r.currency, loc)}
              </p>
              {r.vat_total != null && (
                <p className="mt-0.5 text-[13px] text-app-text-2">
                  {t("efp.dph")} {suma(r.vat_total, r.currency, loc)}
                </p>
              )}
            </div>
            <StatusBadge text={t(NAZOV_STAVU[s])} ton={tonStitku(s)} />
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-app-text-2">{t("efp.dodavatel")}</dt>
            <dd className="min-w-0 break-words text-right text-app-text">
              {r.sender_name?.trim() || t("efp.neznamyDodavatel")}
            </dd>
            <dt className="text-app-text-2">{t("efp.vystavena")}</dt>
            <dd className="text-right tabular-nums">{datum(r.issue_date, loc)}</dd>
            <dt className="text-app-text-2">{t("efp.splatnost")}</dt>
            <dd className="text-right tabular-nums">{datum(r.due_date, loc)}</dd>
            <dt className="text-app-text-2">{t("efp.dorucena")}</dt>
            <dd className="text-right tabular-nums">{datum(r.received_at, loc)}</dd>
          </dl>
        </Card>

        {chyby > 0 ? (
          <p className="flex items-start gap-2 rounded-app-sm border border-app-chyba/40 bg-app-chyba-jemna p-3 text-[13px] text-app-text">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-app-chyba" />
            {t("efp.chybyKontroly", { n: chyby })}
          </p>
        ) : varovania > 0 ? (
          <p className="text-[12px] text-app-text-2">
            {t("efp.varovaniaKontroly", { n: varovania })}
          </p>
        ) : null}

        {s === "nespracovane" && (
          <p className="text-[13px] text-app-text-2">{t("efp.vNespracovanychPopis")}</p>
        )}
        {s === "samofaktura" && (
          <p className="text-[13px] text-app-text-2">{t("efp.samofakturaPopis")}</p>
        )}
        {s === "necitatelna" && (
          <p className="text-[13px] text-app-text-2">{t("efp.necitatelnaPopis")}</p>
        )}

        <section aria-label={t("efp.nahlad")} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-app-text">{t("efp.nahlad")}</h2>
            {nahlad && (
              <button
                type="button"
                onClick={() => void zdielaj()}
                className="inline-flex items-center gap-1.5 rounded-app-sm border border-app-ramik bg-app-karta px-3 py-1.5 text-[13px] font-medium active:scale-95"
              >
                <Share2 className="h-4 w-4" /> {t("efp.zdielatPdf")}
              </button>
            )}
          </div>
          {nahlad ? (
            <>
              {!nahlad.prilozene && (
                <p className="text-[12px] text-app-text-2">{t("efp.nahladBezPdf")}</p>
              )}
              <div className="overflow-hidden rounded-app-sm border border-app-ramik bg-white">
                <NahladPdf url={nahlad.url} />
              </div>
            </>
          ) : chybaNahladu ? (
            <p className="rounded-app-sm border border-app-ramik bg-app-karta p-3 text-[13px] text-app-text-2">
              {chybaNahladu}
            </p>
          ) : (
            <p className="text-[13px] text-app-text-2">{t("efp.nahladNacitavam")}</p>
          )}
        </section>
      </div>
    </MobilObrazovka>
  );
}
