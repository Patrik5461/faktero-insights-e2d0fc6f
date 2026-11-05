import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Banknote, Landmark, Loader2, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ObsahPlatby, BodkaPlatby } from "@/components/faktero/IkonaPlatby";
import { useT } from "@/lib/i18n/useT";
import { potvrd } from "@/lib/potvrdenie";
import { formatovacMeny } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
import { stavPlatbyOstatneho } from "@/lib/faktero/ostatne-doklady";
import { ibanNaZobrazenie, jeNaUhradu } from "@/lib/faktero/ostatne-parovanie";
import {
  navrhniParovanieOstatnych,
  oznacZaplatenyOstatnyFn,
  pohybyNaVyberOstatnehoFn,
  potvrdParovanieOstatneho,
  uhradyOstatnych,
  zrusParovanieOstatneho,
} from "@/lib/faktero/ostatne-parovanie.functions";

type Uhrada = Awaited<ReturnType<typeof uhradyOstatnych>>["uhrady"][string];
type Zhoda = Awaited<ReturnType<typeof navrhniParovanieOstatnych>>["zhody"][number];
type PohybNaVyber = Awaited<ReturnType<typeof pohybyNaVyberOstatnehoFn>>["pohyby"][number];

export type DokladNaPlatbu = {
  id: string;
  kind: string | null;
  amount: number | string | null;
  currency: string | null;
  due_date: string | null;
  status: string | null;
  paid_at: string | null;
};

/**
 * Karta „Platba“ v detaile iného dokladu (predpis, výmer, pokuta…):
 * spárovaný pohyb, nájdená platba na potvrdenie (Spárovať / Nie — ako pri
 * prijatých faktúrach), ručný výber pohybu a „Zaplatené bez pohybu“.
 * Nič sa nepáruje samo — každý zápis je klik človeka.
 */
export function PlatbaOstatneho({
  companyId,
  doklad,
  onZmena,
}: {
  companyId: string;
  doklad: DokladNaPlatbu;
  onZmena: () => void | Promise<void>;
}) {
  const { t } = useT();
  const uhradyFn = useServerFn(uhradyOstatnych);
  const navrhyFn = useServerFn(navrhniParovanieOstatnych);
  const sparujFn = useServerFn(potvrdParovanieOstatneho);
  const zrusFn = useServerFn(zrusParovanieOstatneho);
  const oznacFn = useServerFn(oznacZaplatenyOstatnyFn);
  const pohybyFn = useServerFn(pohybyNaVyberOstatnehoFn);

  const [uhrada, setUhrada] = useState<Uhrada | null>(null);
  const [navrh, setNavrh] = useState<Zhoda | null>(null);
  const [nacitane, setNacitane] = useState(false);
  const [vyber, setVyber] = useState<PohybNaVyber[] | null>(null);
  const [hladat, setHladat] = useState("");
  const [hladam, setHladam] = useState(false);
  const [hotovost, setHotovost] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState(false);

  async function nacitaj() {
    try {
      const [u, n] = await Promise.all([
        uhradyFn({ data: { company_id: companyId, ids: [doklad.id] } }),
        navrhyFn({ data: { company_id: companyId } }).catch(() => ({ zhody: [] as Zhoda[] })),
      ]);
      setUhrada(u.uhrady[doklad.id] ?? null);
      setNavrh(n.zhody.find((z) => z.otherDocumentId === doklad.id) ?? null);
    } catch {
      setUhrada(null);
      setNavrh(null);
    } finally {
      setNacitane(true);
    }
  }
  useEffect(() => {
    void nacitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doklad.id, doklad.paid_at, doklad.amount, doklad.due_date]);

  const naUhradu = jeNaUhradu({ kind: doklad.kind, amount: Number(doklad.amount ?? 0) });
  if (!nacitane || (!naUhradu && !uhrada && !doklad.paid_at)) return null;

  const stav = stavPlatbyOstatneho(doklad, { sparovana: !!uhrada, maNavrh: !!navrh });
  const mena = doklad.currency || "EUR";
  const fmt = (n: number, m = mena) => formatovacMeny(m, "sk-SK")(n);

  async function po(akcia: () => Promise<unknown>, ok: string) {
    setPracuje(true);
    try {
      await akcia();
      toast.success(t(ok));
      setVyber(null);
      setHotovost(null);
      await onZmena();
      await nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa uložiť."));
    } finally {
      setPracuje(false);
    }
  }

  async function hladajPohyby(text = hladat) {
    setHladam(true);
    try {
      const r = await pohybyFn({
        data: { company_id: companyId, id: doklad.id, hladat: text.trim() || undefined },
      });
      setVyber(r.pohyby);
    } catch (e: any) {
      toast.error(e?.message ?? t("Pohyby sa nepodarilo načítať."));
    } finally {
      setHladam(false);
    }
  }

  async function vyberPohyb(p: PohybNaVyber) {
    const sumaSedi = Math.abs(Math.abs(p.amount) - Number(doklad.amount ?? 0)) < 0.005;
    const ok = await potvrd(
      sumaSedi
        ? t("Spárovať doklad s pohybom {suma} z {datum}?", {
            suma: fmt(p.amount, p.currency || mena),
            datum: datumNaDoklade(p.booking_date),
          })
        : t("Suma pohybu ({suma}) nesedí so sumou dokladu. Spárovať aj tak?", {
            suma: fmt(p.amount, p.currency || mena),
          }),
      { potvrdit: t("Spárovať") },
    );
    if (!ok) return;
    await po(
      () => sparujFn({ data: { transaction_id: p.id, other_document_id: doklad.id } }),
      "Spárované, doklad je zaplatený.",
    );
  }

  const pohybUhrady = uhrada
    ? {
        datum: uhrada.datum,
        suma: uhrada.suma,
        mena: uhrada.mena ?? mena,
        protistrana: uhrada.protistrana,
        vs: uhrada.vs,
        ucet: ibanNaZobrazenie(uhrada.ucet),
        odkaz: "/bankove-ucty/transakcie",
      }
    : null;
  const pohybNavrhu = navrh?.pohyb
    ? {
        datum: navrh.pohyb.booking_date,
        suma: navrh.pohyb.amount,
        mena: navrh.pohyb.currency ?? mena,
        protistrana: navrh.pohyb.counterparty,
        vs: navrh.pohyb.variable_symbol,
        ucet: ibanNaZobrazenie(navrh.pohyb.counterparty_iban),
        odkaz: "/bankove-ucty/transakcie",
      }
    : null;

  return (
    <section
      data-platba-ostatneho={stav ?? "bez"}
      className="min-w-0 rounded-xl border border-border bg-card p-5"
      aria-labelledby="platba-ostatneho-nadpis"
    >
      <h2 id="platba-ostatneho-nadpis" className="flex items-center gap-2 text-sm font-semibold">
        <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t("Platba")}
        {stav && <BodkaPlatby stav={stav} className="h-2 w-2" />}
      </h2>

      {stav === "sparovana" && (
        <div className="mt-3">
          <ObsahPlatby stav="sparovana" pohyb={pohybUhrady} onZrus={() => po(() => zrusFn({ data: { transaction_id: uhrada!.transactionId } }), "Väzba zrušená.")} />
        </div>
      )}

      {stav === "navrh" && navrh && (
        <div className="fk-oznam fk-oznam-pozor mt-3 rounded-lg p-3" data-pas-navrhu-platby="">
          <ObsahPlatby
            stav="navrh"
            pohyb={pohybNavrhu}
            dovody={navrh.dovody.map((d) => t(d))}
            ista={navrh.istota === "auto"}
            zaneprazdnene={pracuje}
            onSparuj={() =>
              po(
                () => sparujFn({ data: { transaction_id: navrh.transactionId, other_document_id: doklad.id } }),
                "Spárované, doklad je zaplatený.",
              )
            }
            onNie={() => setNavrh(null)}
          />
        </div>
      )}

      {!uhrada && doklad.paid_at && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("Zaplatené bez pohybu z účtu {datum}.", { datum: datumNaDoklade(doklad.paid_at) })}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={pracuje}
            onClick={async () => {
              if (!(await potvrd(t("Zrušiť označenie „Zaplatené bez pohybu“?"), { potvrdit: t("Zrušiť označenie") })))
                return;
              await po(
                () => oznacFn({ data: { company_id: companyId, id: doklad.id, paid_at: null } }),
                "Označenie zrušené.",
              );
            }}
          >
            {t("Zrušiť označenie")}
          </Button>
        </div>
      )}

      {!uhrada && !doklad.paid_at && (
        <div className="mt-3 space-y-3">
          {stav === "nenajdena" && !navrh && (
            <p className="text-sm text-muted-foreground">
              {t("Pohyb z účtu, ktorý by k dokladu sedel, sme zatiaľ nenašli.")}
            </p>
          )}
          {stav === null && !navrh && doklad.status !== "exported" && (
            <p className="text-sm text-muted-foreground">
              {t("Doplňte lehotu, variabilný symbol alebo IBAN — podľa nich sa platba hľadá v banke.")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pracuje || hladam}
              data-vybrat-pohyb=""
              onClick={() => (vyber ? setVyber(null) : void hladajPohyby(""))}
            >
              {hladam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
              {t("Vybrať pohyb z účtu")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pracuje}
              data-zaplatene-bez-pohybu=""
              onClick={() => setHotovost((h) => (h === null ? dnesBratislava() : null))}
            >
              <Banknote className="h-4 w-4" />
              {t("Zaplatené bez pohybu")}
            </Button>
          </div>

          {hotovost !== null && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/70 p-3">
              <label className="block min-w-0 text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">
                  {t("Dátum úhrady (napr. v hotovosti na pošte)")}
                </span>
                <input
                  type="date"
                  value={hotovost}
                  max={dnesBratislava()}
                  onChange={(e) => setHotovost(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                />
              </label>
              <Button
                size="sm"
                disabled={pracuje || !hotovost}
                onClick={() =>
                  po(
                    () => oznacFn({ data: { company_id: companyId, id: doklad.id, paid_at: hotovost } }),
                    "Doklad je označený ako zaplatený.",
                  )
                }
              >
                {t("Uložiť")}
              </Button>
            </div>
          )}

          {vyber && (
            <div className="rounded-lg border border-border/70 p-2">
              <form
                className="flex gap-2 p-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  void hladajPohyby();
                }}
              >
                <input
                  value={hladat}
                  onChange={(e) => setHladat(e.target.value)}
                  placeholder={t("Hľadať protistranu, VS, popis")}
                  aria-label={t("Hľadať pohyb")}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                />
                <Button type="submit" size="sm" variant="outline" disabled={hladam} aria-label={t("Hľadať")}>
                  <Search className="h-4 w-4" />
                </Button>
              </form>
              {vyber.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted-foreground">
                  {t("V okolí lehoty nie je žiadny voľný odchádzajúci pohyb.")}
                </p>
              ) : (
                <ul className="mt-1 max-h-72 divide-y divide-border/60 overflow-y-auto" data-zoznam-pohybov="">
                  {vyber.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={pracuje}
                        onClick={() => void vyberPohyb(p)}
                        className="flex w-full min-w-0 items-start justify-between gap-2 rounded px-1 py-1.5 text-left text-sm hover:bg-secondary disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block break-words">
                            {p.counterparty || p.description || "—"}
                            {p.poradie >= 10 && (
                              <span className="stav stav-maly stav-pozor ml-1.5 align-middle">{t("sedí")}</span>
                            )}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {[datumNaDoklade(p.booking_date), p.variable_symbol ? `${t("VS")} ${p.variable_symbol}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-destructive">
                          {fmt(p.amount, p.currency || mena)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
