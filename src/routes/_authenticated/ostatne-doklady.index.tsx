import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { supabase } from "@/integrations/supabase/client";
import { ZdrojovyMailTlacidlo } from "@/components/faktero/ZdrojovyMail";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { TabulkaZoznamu } from "@/components/faktero/TabulkaZoznamu";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  exportOstatnychZipFn,
  nastavStavOstatnychFn,
  odkazPrilohyOstatnehoFn,
  pocetNespracovanychOstatnychFn,
  zmazOstatnyFn,
  zoznamOstatnychFn,
} from "@/lib/faktero/ostatne-doklady.functions";
import {
  DRUHY_OSTATNYCH,
  nazovDruhu,
  stavLehoty,
  stavPlatbyOstatneho,
  type DruhOstatneho,
} from "@/lib/faktero/ostatne-doklady";
import { IkonaPlatby } from "@/components/faktero/IkonaPlatby";
import { PasNavrhovPlatieb } from "@/components/faktero/PasNavrhovPlatieb";
import {
  navrhniParovanieOstatnych,
  potvrdParovanieOstatneho,
  uhradyOstatnych,
  zrusParovanieOstatneho,
} from "@/lib/faktero/ostatne-parovanie.functions";
import type { StavPlatby } from "@/lib/faktero/stav-platby";
import { ibanNaZobrazenie } from "@/lib/faktero/ostatne-parovanie";
import {
  STAV_DOKLADU_NAZOV,
  ZALOZKY_DOKLADOV,
  jeZalozkaDokladov,
  type ZalozkaDokladov,
} from "@/lib/faktero/doklad-stav";
import { CheckCircle2, Download, FolderOpen, Paperclip, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { potvrd, zadaj } from "@/lib/potvrdenie";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu } from "@/lib/faktero/mena";
import { DocumentListToolbar, PRVOK } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { HromadnaAkciaDokladov } from "@/components/faktero/HromadnaAkciaDokladov";
import { useCiselnikyDokladov } from "@/hooks/useCiselnikyDokladov";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
import {
  naHromadnuAkciu,
  prepniVsetkyZobrazene,
  vsetkyZobrazeneVybrane,
  vybraneZobrazene,
} from "@/lib/faktero/vyber-dokladov";
import { StavOdznak, tonStavu, type TonStavu } from "@/components/faktero/web/Stav";
export const Route = createFileRoute("/_authenticated/ostatne-doklady/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Iné doklady — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    ...(jeZalozkaDokladov(s.stav) ? { stav: s.stav as ZalozkaDokladov } : {}),
    ...zoznamSearch(s),
  }),
  component: OstatneDokladyPage,
});

/** Tón stavového odznaku (redizajn webu) — texty ostávajú zo `STAV_DOKLADU_NAZOV`. */
const STAV_TON: Record<string, TonStavu> = {
  new: "pozor",
  processed: "informacia",
  exported: "uspech",
};

function OstatneDokladyPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const zoznamFn = useServerFn(zoznamOstatnychFn);
  const stavFn = useServerFn(nastavStavOstatnychFn);
  const pocetFn = useServerFn(pocetNespracovanychOstatnychFn);
  const odkazFn = useServerFn(odkazPrilohyOstatnehoFn);
  const zmazFn = useServerFn(zmazOstatnyFn);
  const exportFn = useServerFn(exportOstatnychZipFn);
  const cid = getActiveCompanyId();

  const { stav: zalozkaZAdresy } = Route.useSearch();
  const zalozka: ZalozkaDokladov = zalozkaZAdresy ?? "nespracovane";
  const stav = ZALOZKY_DOKLADOV.find((z) => z.kluc === zalozka)!.stav;
  /** Nespracované zo všetkých mesiacov — nič nesmie ostať schované. */
  const bezMesiaca = zalozka === "nespracovane";

  const lf = useListFilters();
  // Mesiac doručenia je v adrese; bez neho platí aktuálny mesiac, „vsetky“ = všetky mesiace.
  const mesiacZAdresy = lf.filter("mesiac");
  const month =
    mesiacZAdresy === "vsetky" ? "" : mesiacZAdresy || new Date().toISOString().slice(0, 7);
  const setMonth = (m: string) => lf.setFilter("mesiac", m || "vsetky");
  const druh = lf.filter("druh") as DruhOstatneho | "";
  const [rows, setRows] = useState<any[]>([]);
  // Priečinky (zmluvy, objednávky…) — filtrujú sa na obrazovke z načítaných dokladov.
  const priecinok = lf.filter("priecinok");
  const stitokFiltra = lf.filter("stitok");
  // Platba: spárovaná / nájdená (návrh) / nenájdená — počíta sa z väzieb a návrhov.
  const platbaFiltra = lf.filter("platba") as "" | StavPlatby;
  /* Väzba na banku: ktorý pohyb doklad uhradil a čo sa ponúka spárovať. */
  type Uhrada = {
    datum: string;
    transactionId: string;
    suma: number;
    mena: string | null;
    protistrana: string | null;
    vs: string | null;
    ucet: string | null;
  };
  const [uhrady, setUhrady] = useState<Record<string, Uhrada>>({});
  const [navrhy, setNavrhy] = useState<any[]>([]);
  const [parujem, setParujem] = useState<string | null>(null);
  const navrhPodlaDokladu = useMemo(() => {
    const m = new Map<string, any>();
    for (const z of navrhy) m.set(z.otherDocumentId, z);
    return m;
  }, [navrhy]);
  const platbaRiadku = (r: any): StavPlatby | null =>
    stavPlatbyOstatneho(r, { sparovana: !!uhrady[r.id], maNavrh: navrhPodlaDokladu.has(r.id) });
  const cis = useCiselnikyDokladov(cid, null, false);
  // Štítky na výber: číselník firmy a tie, čo sú na načítaných dokladoch.
  const stitkyNaVyber = [...new Set([...cis.stitky, ...rows.flatMap((r) => (r.stitky ?? []) as string[])])].sort();
  const priecinky = [...new Set(rows.map((r) => String(r.priecinok ?? "").trim()).filter(Boolean))].sort();
  // Hľadanie len prechádza načítané doklady.
  const hladane = lf.q.trim().toLowerCase();
  const zobrazene = rows.filter(
    (r) =>
      (!priecinok ||
        String(r.priecinok ?? "").trim() === (priecinok === "__bez" ? "" : priecinok)) &&
      (!stitokFiltra || (r.stitky ?? []).includes(stitokFiltra)) &&
      (!platbaFiltra || platbaRiadku(r) === platbaFiltra) &&
      (!hladane ||
        [r.sender, r.subject, r.priecinok, ...(r.stitky ?? [])]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(hladane))),
  );
  async function doPriecinka() {
    const nazov = await zadaj(t("Do ktorého priečinka?\nPrázdne = bez priečinka."), {
      predvolene: priecinok && priecinok !== "__bez" ? priecinok : "",
      povolitPrazdne: true,
      moznosti: priecinky,
    }, { potvrdit: t("Presunúť") });
    if (nazov === null) return;
    const { error } = await supabase
      .from("other_documents")
      .update({ priecinok: nazov.trim().slice(0, 60) || null } as any)
      .in("id", idsVybranych);
    if (error) return toast.error(error.message);
    toast.success(
      nazov.trim()
        ? t("Presunuté do priečinka „{nazov}\"", { nazov: nazov.trim() })
        : t("Priečinok zrušený"),
    );
    await refresh();
  }
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Hromadné akcie len nad zobrazenými — vybraný riadok skrytý filtrom sa nepočíta.
  const vybrane = vybraneZobrazene(selected, zobrazene);
  const idsVybranych = vybrane.map((r) => r.id);
  // Zmena filtra na obrazovke výber zruší, aby sa nemiešal so skrytými riadkami.
  useEffect(() => {
    setSelected(new Set());
  }, [priecinok, stitokFiltra, platbaFiltra, hladane]);
  const [nespracovanych, setNespracovanych] = useState<number | null>(null);
  const [pracujem, setPracujem] = useState(false);
  const dnes = dnesBratislava();

  async function refresh() {
    if (!cid) return;
    setLoading(true);
    try {
      const data = await zoznamFn({
        data: {
          company_id: cid,
          stav,
          month: bezMesiaca ? null : month || null,
          kind: druh || null,
        },
      });
      setRows(data);
      setSelected(new Set());
      void nacitajUhrady(data.map((r: any) => r.id));
      void pocetFn({ data: { company_id: cid } })
        .then((v) => setNespracovanych(v.pocet))
        .catch(() => {
          /* počet je len na záložke */
        });
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba pri načítaní"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(); /* eslint-disable-next-line */
  }, [stav, month, druh]);

  const navrhyFn = useServerFn(navrhniParovanieOstatnych);
  const sparujFn = useServerFn(potvrdParovanieOstatneho);
  const rozparujFn = useServerFn(zrusParovanieOstatneho);
  const uhradyFn = useServerFn(uhradyOstatnych);

  async function nacitajUhrady(ids: string[]) {
    if (!cid || !ids.length) return setUhrady({});
    try {
      const kusy: string[][] = [];
      for (let i = 0; i < ids.length; i += 300) kusy.push(ids.slice(i, i + 300));
      const v = await Promise.all(kusy.map((kus) => uhradyFn({ data: { company_id: cid, ids: kus } })));
      setUhrady(Object.assign({}, ...v.map((u) => u?.uhrady ?? {})));
    } catch {
      setUhrady({});
    }
  }
  async function nacitajNavrhy() {
    if (!cid) return;
    try {
      const r = await navrhyFn({ data: { company_id: cid } });
      setNavrhy(r?.zhody ?? []);
    } catch {
      // Návrhy sú pomoc navyše — bez nich zoznam funguje ďalej.
      setNavrhy([]);
    }
  }
  useEffect(() => {
    void nacitajNavrhy(); /* eslint-disable-next-line */
  }, [cid]);

  async function sparuj(z: any, ticho = false) {
    setParujem(z.transactionId);
    try {
      await sparujFn({ data: { transaction_id: z.transactionId, other_document_id: z.otherDocumentId } });
      if (!ticho) toast.success(t("Spárované, doklad je zaplatený."));
      setNavrhy((n) => n.filter((i) => i.transactionId !== z.transactionId));
      if (!ticho) await refresh();
      return true;
    } catch (e: any) {
      if (!ticho) toast.error(e?.message ?? t("Spárovať sa to nepodarilo."));
      return false;
    } finally {
      setParujem(null);
    }
  }
  /* Návrhy k dokladom v zozname; isté sa dajú potvrdiť jedným klikom (stále človek). */
  const navrhyVZozname = navrhy.filter((z) =>
    rows.some((r: any) => r.id === z.otherDocumentId && platbaRiadku(r) === "navrh"),
  );
  const isteVZozname = navrhyVZozname.filter((z) => z.istota === "auto");
  async function sparujVsetkyIste() {
    let ok = 0;
    for (const z of [...isteVZozname]) if (await sparuj(z, true)) ok++;
    toast.success(t("Spárované: {n} z {m}.", { n: ok, m: isteVZozname.length }));
    await refresh();
    await nacitajNavrhy();
  }
  async function rozparuj(transactionId: string) {
    try {
      await rozparujFn({ data: { transaction_id: transactionId } });
      toast.success(t("Väzba zrušená."));
      await refresh();
      await nacitajNavrhy();
    } catch (e: any) {
      toast.error(e?.message ?? t("Zrušiť sa to nepodarilo."));
    }
  }

  /** Ikonka banky s bodkou pri doklade — v tabuľke aj na karte. */
  function ikonaPlatby(r: any, className?: string) {
    const stavPl = platbaRiadku(r);
    if (!stavPl) return null;
    const u = uhrady[r.id];
    const z = navrhPodlaDokladu.get(r.id);
    const pohyb =
      stavPl === "sparovana" && u
        ? { datum: u.datum, suma: u.suma, mena: u.mena ?? r.currency, protistrana: u.protistrana, vs: u.vs, ucet: ibanNaZobrazenie(u.ucet), odkaz: "/bankove-ucty/transakcie" }
        : stavPl === "navrh" && z?.pohyb
          ? {
              datum: z.pohyb.booking_date,
              suma: z.pohyb.amount,
              mena: z.pohyb.currency ?? r.currency,
              vs: z.pohyb.variable_symbol,
              ucet: ibanNaZobrazenie(z.pohyb.counterparty_iban),
              protistrana: z.pohyb.counterparty,
              odkaz: "/bankove-ucty/transakcie",
            }
          : null;
    return (
      <IkonaPlatby
        stav={stavPl}
        pohyb={pohyb}
        dovody={stavPl === "navrh" ? (z?.dovody ?? []).map((x: string) => t(x)) : undefined}
        ista={z?.istota === "auto"}
        zaneprazdnene={!!z && parujem === z.transactionId}
        onSparuj={z ? () => void sparuj(z) : undefined}
        onNie={z ? () => setNavrhy((n) => n.filter((i) => i.transactionId !== z.transactionId)) : undefined}
        onZrus={u ? () => rozparuj(u.transactionId) : undefined}
        odkazRucne={`/ostatne-doklady/novy?id=${r.id}`}
        textRucne="Vybrať platbu v detaile"
        popisNenajdena="Pohyb z účtu, ktorý by k dokladu sedel, sme zatiaľ nenašli. V detaile dokladu ho vyberiete ručne, alebo označíte „Zaplatené bez pohybu“."
        className={className}
      />
    );
  }

  function prepniZalozku(kluc: ZalozkaDokladov) {
    // Hľadanie a filtre z adresy ostávajú aj na inej záložke.
    navigate({
      to: "/ostatne-doklady",
      search: (prev: Record<string, unknown>) => ({ ...prev, stav: kluc }),
      replace: true,
    } as any);
  }

  async function zmenStav(ids: string[], novy: "new" | "processed") {
    if (!cid || !ids.length) return;
    setPracujem(true);
    try {
      const v = await stavFn({ data: { company_id: cid, ids, stav: novy } });
      if (v.zmenene)
        toast.success(
          novy === "processed"
            ? v.zmenene === 1
              ? t("Doklad je spracovaný.")
              : t("Spracovaných dokladov: {n}.", { n: v.zmenene })
            : t("Vrátené medzi nespracované."),
        );
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? t("Zmena stavu sa nepodarila."));
    } finally {
      setPracujem(false);
    }
  }

  async function otvorPrilohu(id: string) {
    try {
      const { url } = await odkazFn({ data: { id } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? t("Prílohu sa nepodarilo otvoriť."));
    }
  }

  async function zmaz(r: any) {
    if (
      !(await potvrd(
        t("Naozaj zmazať doklad „{nazov}“ aj s prílohami?", {
          nazov: r.subject || r.sender || t(nazovDruhu(r.kind)),
        }),
      ))
    )
      return;
    try {
      await zmazFn({ data: { id: r.id } });
      toast.success(t("Doklad zmazaný."));
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? t("Zmazanie zlyhalo."));
    }
  }

  async function odovzdaj(oznacit: boolean) {
    // Bez výberu všetky zobrazené (filter priečinka, štítka a hľadania platí), nie celá záložka.
    const vyber = naHromadnuAkciu(selected, zobrazene);
    if (!cid || !vyber.length) return;
    const nesprac = vyber.filter((r) => r.status === "new").length;
    if (
      oznacit &&
      nesprac > 0 &&
      !(await potvrd(
        nesprac === 1
          ? t("Jeden doklad je ešte nespracovaný. Odovzdať aj ten?")
          : t("{n} dokladov je ešte nespracovaných. Odovzdať aj tie?", { n: nesprac }),
      ))
    )
      return;
    setPracujem(true);
    try {
      const res = await exportFn({
        data: { company_id: cid, ids: vyber.map((r) => r.id), oznacit },
      });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("Počet dokladov v balíku: {n}.", { n: res.count }));
      if (oznacit) refresh();
    } catch (e: any) {
      toast.error(e?.message ?? t("Export zlyhal."));
    } finally {
      setPracujem(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  return (
    <>
      <PageHeader
        title={t("Iné doklady")}
        description={t("Listy, predpisy, exekúcie, zmluvy a ďalšie podklady pre účtovníka.")}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => odovzdaj(false)}
              disabled={pracujem || !zobrazene.length}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> ZIP{" "}
              {vybrane.length ? `(${vybrane.length})` : t("všetky zobrazené ({n})", { n: zobrazene.length })}
            </button>
            <button
              onClick={() => odovzdaj(true)}
              disabled={pracujem || !zobrazene.length || zalozka === "odovzdane"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {t("Odovzdať účtovníkovi")} ({vybrane.length || zobrazene.length})
            </button>
            <Link
              to="/ostatne-doklady/novy"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> {t("Pridať doklad")}
            </Link>
          </div>
        }
      />
      <PageBody>
        <div
          role="tablist"
          aria-label={t("Stav dokladov")}
          className="mb-4 flex flex-wrap gap-1 border-b border-border"
        >
          {ZALOZKY_DOKLADOV.map((z) => (
            <button
              key={z.kluc}
              role="tab"
              aria-selected={zalozka === z.kluc}
              onClick={() => prepniZalozku(z.kluc)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
                zalozka === z.kluc
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(z.nazov)}
              {z.kluc === "nespracovane" && nespracovanych ? (
                <span className="dk-pozor rounded-full px-1.5 text-xs font-semibold tabular-nums">
                  {nespracovanych}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {bezMesiaca && (
          <p className="mb-4 text-sm text-muted-foreground">
            {t("Sem padne každý nový doklad. Účtovník ho pozrie a označí ako spracovaný; ukazujú sa tu nespracované zo všetkých mesiacov.")}
          </p>
        )}

        <DocumentListToolbar
          lf={lf}
          searchPlaceholder="Hľadať odosielateľa alebo predmet…"
          filters={[
            {
              key: "druh",
              label: "Druh",
              type: "select",
              allLabel: "Všetky druhy",
              options: DRUHY_OSTATNYCH.map((d) => ({ value: d.kluc, label: d.nazov })),
            },
            {
              key: "priecinok",
              label: "Priečinok",
              type: "select",
              allLabel: "Všetky priečinky",
              options: [
                ...priecinky.map((p) => ({ value: p, label: p })),
                { value: "__bez", label: "Bez priečinka" },
              ],
            },
            {
              key: "platba",
              label: "Platba",
              type: "select",
              allLabel: "Všetky stavy platby",
              options: [
                { value: "sparovana", label: "Spárovaná" },
                { value: "navrh", label: "Nájdená" },
                { value: "nenajdena", label: "Nenájdená" },
              ],
            },
            ...(stitkyNaVyber.length
              ? [
                  {
                    key: "stitok",
                    label: "Štítok",
                    type: "select" as const,
                    options: stitkyNaVyber.map((x) => ({ value: x, label: x })),
                  },
                ]
              : []),
          ]}
          extra={
            !bezMesiaca && (
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  aria-label={t("Mesiac doručenia")}
                  title={t("Mesiac doručenia")}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className={`${PRVOK} px-2`}
                />
                <button
                  type="button"
                  onClick={() => setMonth("")}
                  disabled={!month}
                  className={`${PRVOK} px-3 hover:bg-secondary disabled:opacity-40`}
                >
                  {t("Všetky")}
                </button>
              </div>
            )
          }
        />

        {vybrane.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void doPriecinka()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary"
            >
              <FolderOpen className="h-4 w-4" /> {t("Do priečinka")} ({vybrane.length})
            </button>
            {cid ? (
              <HromadnaAkciaDokladov
                companyId={cid}
                agenda="ostatny"
                ids={idsVybranych}
                onHotovo={() => void refresh()}
              />
            ) : null}
            {(zalozka === "nespracovane" || zalozka === "spracovane") && (
              <button
                onClick={() =>
                  zmenStav(idsVybranych, zalozka === "nespracovane" ? "processed" : "new")
                }
                disabled={pracujem}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
              >
                {zalozka === "nespracovane" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-primary" /> {t("Označiť ako spracované")} (
                    {vybrane.length})
                  </>
                ) : (
                  <>
                    <Undo2 className="h-4 w-4" /> {t("Vrátiť medzi nespracované")} ({vybrane.length})
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/*
          Nájdené platby sú ikonkou v riadku; tu len tenký pás. Nič sa
          nepáruje potichu — aj istá dvojica čaká na klik človeka.
        */}
        {(navrhyVZozname.length > 0 || platbaFiltra === "navrh") && (
          <div className="mb-4">
            <PasNavrhovPlatieb
              pocet={navrhyVZozname.length}
              istych={isteVZozname.length}
              lenTieto={platbaFiltra === "navrh"}
              onLenTieto={(zapnut) => lf.setFilter("platba", zapnut ? "navrh" : "")}
              onSparujIste={sparujVsetkyIste}
            />
          </div>
        )}

        {/* Pri kartách na telefóne bez vonkajšieho rámika — karty majú vlastný. */}
        <div
          className={`overflow-clip rounded-xl border border-border bg-card ${!loading && zobrazene.length > 0 ? "max-sm:overflow-visible max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent" : ""}`}
        >
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">{t("Načítavam…")}</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <FolderOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {bezMesiaca
                ? t("Žiadny iný doklad nečaká na spracovanie.")
                : t("Vo výbere nie je žiadny doklad.")}
              <div className="mt-4 flex justify-center gap-2">
                <Link
                  to="/ostatne-doklady/novy"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  <Plus className="h-4 w-4" /> {t("Pridať doklad")}
                </Link>
              </div>
            </div>
          ) : zobrazene.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {t("Nič nevyhovuje filtru.")}
            </div>
          ) : (
            // Na telefóne karty — v tabuľke na 390 px nebolo vidieť sumu ani stav.
            <ResponsiveTable
              items={zobrazene}
              mobileCard={(r: any) => {
                const lehota = r.status === "exported" ? null : stavLehoty(r.due_date, dnes);
                const prilohy = [...(r.other_document_files ?? [])].sort(
                  (a: any, b: any) => a.position - b.position,
                );
                return (
                  <MobileListCard
                    vybrane={selected.has(r.id)}
                    onVyber={() => toggle(r.id)}
                    vyberPopis={t("Označiť doklad")}
                    ciel={{ to: "/ostatne-doklady/novy", search: { id: r.id } }}
                    title={
                      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                        {r.sender || (
                          <span className="italic text-muted-foreground">{t("bez odosielateľa")}</span>
                        )}
                        {(r.stitky ?? []).map((stitok: string) => (
                          <span
                            key={stitok}
                            className="rounded-full bg-secondary px-1.5 text-[11px] font-normal text-muted-foreground"
                          >
                            {stitok}
                          </span>
                        ))}
                      </span>
                    }
                    subtitle={r.subject || undefined}
                    meta={
                      <>
                        {datumNaDoklade(r.received_date)} · {t(nazovDruhu(r.kind))}
                        {r.priecinok ? ` · ${r.priecinok}` : ""}
                        {r.due_date ? (
                          <>
                            {" · "}
                            {t("Lehota")}{" "}
                            <span
                              className={
                                lehota === "po"
                                  ? "dk-text-chyba font-medium"
                                  : lehota === "blizko"
                                    ? "dk-text-pozor font-medium"
                                    : ""
                              }
                            >
                              {datumNaDoklade(r.due_date)}
                            </span>
                          </>
                        ) : null}
                      </>
                    }
                    amount={r.amount != null ? formatujMenu(r.amount, r.currency) : undefined}
                    status={
                      // Ikonka mimo názvu — názov je odkaz na detail, tlačidlo v ňom by ho otvorilo.
                      <span className="inline-flex items-center gap-1">
                        {ikonaPlatby(r)}
                        <StavOdznak ton={tonStavu(STAV_TON, r.status)}>
                          {t(
                            STAV_DOKLADU_NAZOV[r.status as keyof typeof STAV_DOKLADU_NAZOV] ??
                              r.status,
                          )}
                        </StavOdznak>
                      </span>
                    }
                    actions={
                      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
                        {prilohy.map((p: any) => (
                          <button
                            key={p.id}
                            onClick={() => otvorPrilohu(p.id)}
                            className="inline-flex max-w-[10rem] items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                            title={p.name}
                          >
                            <Paperclip className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{p.name}</span>
                          </button>
                        ))}
                        <ZdrojovyMailTlacidlo druh="ostatny" id={r.id} inboxMessageId={r.inbox_message_id} ikona />
                        {r.status === "new" && (
                          <button
                            onClick={() => zmenStav([r.id], "processed")}
                            disabled={pracujem}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-primary-hover hover:bg-primary/10 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> {t("Spracovať")}
                          </button>
                        )}
                        {r.status === "processed" && (
                          <button
                            onClick={() => zmenStav([r.id], "new")}
                            disabled={pracujem}
                            title={t("Vrátiť medzi nespracované")}
                            aria-label={t("Vrátiť medzi nespracované")}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => zmaz(r)}
                          aria-label={t("Zmazať doklad")}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {t("Zmazať")}
                        </button>
                      </div>
                    }
                  />
                );
              }}
              desktop={
                <TabulkaZoznamu className="rounded-none border-0">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 text-xs font-semibold whitespace-nowrap text-muted-foreground">
                      <tr>
                        <th className="w-8 px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={t("Označiť všetky")}
                            checked={vsetkyZobrazeneVybrane(selected, zobrazene)}
                            onChange={() => setSelected((p) => prepniVsetkyZobrazene(p, zobrazene))}
                          />
                          <span className="sr-only">{t("Výber")}</span>
                        </th>
                        <th className="px-3 py-2 text-left">{t("Doručené")}</th>
                        <th className="px-3 py-2 text-left">{t("Druh")}</th>
                        <th className="px-3 py-2 text-left">{t("Odosielateľ a predmet")}</th>
                        <th className="px-3 py-2 text-right">{t("Suma")}</th>
                        <th className="px-3 py-2 text-left">{t("Lehota")}</th>
                        <th className="px-3 py-2 text-left">{t("Stav")}</th>
                        <th className="px-3 py-2"><span className="sr-only">{t("Akcie")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {zobrazene.map((r) => {
                        const lehota = r.status === "exported" ? null : stavLehoty(r.due_date, dnes);
                        const prilohy = [...(r.other_document_files ?? [])].sort(
                          (a: any, b: any) => a.position - b.position,
                        );
                        return (
                          <KlikatelnyRiadok
                            key={r.id}
                            ciel={{ to: "/ostatne-doklady/novy", search: { id: r.id } }}
                            className="border-t border-border align-top"
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                aria-label={t("Označiť doklad")}
                                checked={selected.has(r.id)}
                                onChange={() => toggle(r.id)}
                              />
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{datumNaDoklade(r.received_date)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {t(nazovDruhu(r.kind))}
                              {r.priecinok ? (
                                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                  <FolderOpen className="h-3 w-3" /> {r.priecinok}
                                </span>
                              ) : null}
                            </td>
                            <td className="min-w-0 px-3 py-2">
                              {ikonaPlatby(r, "mr-1 align-middle")}
                              <button
                                onClick={() =>
                                  navigate({ to: "/ostatne-doklady/novy", search: { id: r.id } })
                                }
                                className="text-left hover:underline"
                              >
                                {r.sender || (
                                  <span className="italic text-muted-foreground">{t("bez odosielateľa")}</span>
                                )}
                              </button>
                              {r.subject && (
                                <div className="text-xs text-muted-foreground">{r.subject}</div>
                              )}
                              {r.stitky?.length ? (
                                <div className="mt-0.5 flex flex-wrap gap-1">
                                  {r.stitky.map((stitok: string) => (
                                    <span key={stitok} className="rounded-full bg-secondary px-1.5 text-[11px] text-muted-foreground">
                                      {stitok}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <ZdrojovyMailTlacidlo druh="ostatny" id={r.id} inboxMessageId={r.inbox_message_id} ikona />
                              {(r.zamestnanec || r.zmluva) && (
                                <div className="text-xs text-primary">
                                  {r.zamestnanec &&
                                    t("Zamestnanec: {meno}", {
                                      meno: [r.zamestnanec.first_name, r.zamestnanec.last_name]
                                        .filter(Boolean)
                                        .join(" "),
                                    })}
                                  {r.zamestnanec && r.zmluva ? " · " : ""}
                                  {r.zmluva &&
                                    t("Zmluva: {nazov}", {
                                      nazov: `${r.zmluva.name || r.zmluva.provider_name || ""}${r.zmluva.contract_number ? ` ${t("č.")} ${r.zmluva.contract_number}` : ""}`,
                                    })}
                                </div>
                              )}
                              {prilohy.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {prilohy.map((p: any) => (
                                    <button
                                      key={p.id}
                                      onClick={() => otvorPrilohu(p.id)}
                                      className="inline-flex max-w-[14rem] items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs hover:bg-secondary"
                                      title={p.name}
                                    >
                                      <Paperclip className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{p.name}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="suma px-3 py-2 text-right">
                              {r.amount != null ? formatujMenu(r.amount, r.currency) : "—"}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.due_date ? (
                                <span
                                  className={
                                    lehota === "po"
                                      ? "dk-text-chyba font-medium"
                                      : lehota === "blizko"
                                        ? "dk-text-pozor font-medium"
                                        : ""
                                  }
                                >
                                  {datumNaDoklade(r.due_date)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <StavOdznak
                                  ton={tonStavu(STAV_TON, r.status)}
                                  title={
                                    r.processed_at
                                      ? t("Spracované {datum}", {
                                          datum: new Date(r.processed_at).toLocaleDateString("sk-SK"),
                                        })
                                      : undefined
                                  }
                                >
                                  {t(
                                    STAV_DOKLADU_NAZOV[r.status as keyof typeof STAV_DOKLADU_NAZOV] ??
                                      r.status,
                                  )}
                                </StavOdznak>
                                {r.status === "new" && (
                                  <button
                                    onClick={() => zmenStav([r.id], "processed")}
                                    disabled={pracujem}
                                    className="inline-flex h-6 items-center gap-1 rounded-md border border-input bg-card px-2 text-xs font-semibold text-primary-hover hover:bg-accent disabled:opacity-50"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" /> {t("Spracovať")}
                                  </button>
                                )}
                                {r.status === "processed" && (
                                  <button
                                    onClick={() => zmenStav([r.id], "new")}
                                    disabled={pracujem}
                                    title={t("Vrátiť medzi nespracované")}
                                    aria-label={t("Vrátiť medzi nespracované")}
                                    className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary disabled:opacity-50"
                                  >
                                    <Undo2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => zmaz(r)}
                                title={t("Zmazať")}
                                aria-label={t("Zmazať doklad")}
                                className="rounded-md p-1.5 hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </button>
                            </td>
                          </KlikatelnyRiadok>
                        );
                      })}
                    </tbody>
                  </table>
                </TabulkaZoznamu>
              }
            />
          )}
        </div>
      </PageBody>
    </>
  );
}
