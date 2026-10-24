import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageBody } from "@/components/faktero/AppShell";
import {
  DocumentDetailHeader,
  MenuAkcia,
  MenuSkupina,
  SekundarnaAkcia,
  StavOdznak,
} from "@/components/faktero/DocumentDetailHeader";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import { KodPohody } from "@/components/faktero/KodPohody";
import { navrhyKodovFn } from "@/lib/faktero/zauctovanie.functions";
import type { Navrhy } from "@/components/faktero/ZauctovaniePanel";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { potvrd } from "@/lib/potvrdenie";
import {
  detailVyuctovaniaFn,
  dokladyNaVyuctovanieFn,
  pdfVyuctovaniaFn,
  ulozVyuctovanieFn,
  zmazVyuctovanieFn,
} from "@/lib/faktero/vyuctovanie-vydavkov.functions";
import {
  TYPY_VYUCTOVANIA,
  nazovVyuctovania,
  polozkaZBlocku,
  polozkaZPrijatej,
  suhrnVyuctovania,
  type PolozkaVyuctovania,
  type TypVyuctovania,
} from "@/lib/faktero/vyuctovanie-vydavkov";

type Hladanie = { blocky?: string; prijate?: string };
export const Route = createFileRoute("/_authenticated/doklady/vyuctovania/$id")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Vyúčtovanie výdavkov — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>): Hladanie => ({
    blocky: typeof s.blocky === "string" ? s.blocky : undefined,
    prijate: typeof s.prijate === "string" ? s.prijate : undefined,
  }),
  component: Detail,
});

const vstup = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
/** Účtovné polia — väčšie, ako všade inde pri zaúčtovaní. */
const vstupZauctovania =
  "mt-1 h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";
const prvyDen = () => new Date().toISOString().slice(0, 8) + "01";
const dnes = () => new Date().toISOString().slice(0, 10);
const idy = (s?: string) => (s ? s.split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)) : []);

type Form = {
  id: string | null;
  nazov: string;
  nazovRucne: boolean;
  typ: TypVyuctovania;
  zamestnanec_id: string;
  zamestnanec_meno: string;
  obdobie_od: string;
  obdobie_do: string;
  zaloha: string;
  mena: string;
  predkontacia: string;
  clenenie_dph: string;
  datum_uctovania: string;
  poznamka: string;
  stav: "otvorene" | "uzavrete";
};

function Detail() {
  const { t } = useT();
  const { id } = Route.useParams();
  const hladanie = Route.useSearch();
  const navigate = useNavigate();
  const cid = useMemo(() => getActiveCompanyId(), []);
  const novy = id === "novy";
  const detail = useServerFn(detailVyuctovaniaFn);
  const predvyber = useServerFn(dokladyNaVyuctovanieFn);
  const uloz = useServerFn(ulozVyuctovanieFn);
  const zmaz = useServerFn(zmazVyuctovanieFn);
  const pdf = useServerFn(pdfVyuctovaniaFn);
  const kody = useServerFn(navrhyKodovFn);
  const clenovia = useServerFn(menaClenovFirmy);
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [mena, setMena] = useState<Record<string, string>>({});
  const [f, setF] = useState<Form | null>(null);
  const [polozky, setPolozky] = useState<PolozkaVyuctovania[]>([]);
  const [busy, setBusy] = useState(false);
  const [vyber, setVyber] = useState(false);
  const zmen = (z: Partial<Form>) => setF((x) => (x ? { ...x, ...z } : x));

  useEffect(() => {
    if (!cid) return;
    kody({ data: { company_id: cid, pre: "doklad" } })
      .then(setNavrhy)
      .catch(() => {});
    clenovia({ data: { company_id: cid } })
      .then((m) => setMena(m as Record<string, string>))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  useEffect(() => {
    if (!cid) return;
    (async () => {
      if (novy) {
        const { data: u } = await supabase.auth.getUser();
        const ja = u.user?.id ?? "";
        setF({
          id: null,
          nazov: "",
          nazovRucne: false,
          typ: "vlastne",
          zamestnanec_id: ja,
          zamestnanec_meno: "",
          obdobie_od: prvyDen(),
          obdobie_do: dnes(),
          zaloha: "0",
          mena: "EUR",
          predkontacia: "",
          clenenie_dph: "",
          datum_uctovania: dnes(),
          poznamka: "",
          stav: "otvorene",
        });
        const b = idy(hladanie.blocky);
        const p = idy(hladanie.prijate);
        if (b.length || p.length) {
          const r = await predvyber({ data: { company_id: cid, blocky: b, prijate: p } });
          setPolozky(r.polozky.filter((x) => !r.vInom.includes(x.id)));
          if (r.vInom.length)
            toast.warning(
              r.vInom.length === 1
                ? t("1 doklad už je v inom vyúčtovaní — vynechaný.")
                : t("{n} doklady už sú v inom vyúčtovaní — vynechané.", { n: r.vInom.length }),
            );
          const datumy = r.polozky
            .map((x) => x.datum)
            .filter(Boolean)
            .sort() as string[];
          if (datumy.length) zmen({ obdobie_od: datumy[0], obdobie_do: datumy[datumy.length - 1] });
        }
      } else {
        try {
          const r = await detail({ data: { id } });
          const v = r.vyuctovanie;
          setF({
            id: v.id,
            nazov: v.nazov,
            nazovRucne: true,
            typ: v.typ,
            zamestnanec_id: v.zamestnanec_id ?? "",
            zamestnanec_meno: v.zamestnanec_meno ?? "",
            obdobie_od: v.obdobie_od ?? "",
            obdobie_do: v.obdobie_do ?? "",
            zaloha: String(v.zaloha ?? 0),
            mena: v.mena ?? "EUR",
            predkontacia: v.predkontacia ?? "",
            clenenie_dph: v.clenenie_dph ?? "",
            datum_uctovania: v.datum_uctovania ?? "",
            poznamka: v.poznamka ?? "",
            stav: v.stav,
          });
          setPolozky(r.polozky);
        } catch (e: any) {
          toast.error(e?.message ?? t("Vyúčtovanie sa nenašlo"));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, id]);

  // Meno zamestnanca z člena firmy, ak ho človek neprepísal.
  const menoZam = f ? f.zamestnanec_meno || mena[f.zamestnanec_id] || "" : "";
  const navrhNazvu = f ? nazovVyuctovania(menoZam, f.obdobie_od, f.obdobie_do) : "";
  const s = f
    ? suhrnVyuctovania(polozky, f.typ, Number(f.zaloha.replace(",", ".")) || 0, f.mena)
    : null;
  const uzavrete = f?.stav === "uzavrete";

  async function ulozit(stav?: "otvorene" | "uzavrete") {
    if (!f || !cid) return;
    setBusy(true);
    try {
      const r = await uloz({
        data: {
          company_id: cid,
          id: f.id,
          nazov: (f.nazovRucne ? f.nazov : navrhNazvu) || "Vyúčtovanie výdavkov",
          typ: f.typ,
          zamestnanec_id: f.zamestnanec_id || null,
          zamestnanec_meno: menoZam || null,
          obdobie_od: f.obdobie_od || null,
          obdobie_do: f.obdobie_do || null,
          zaloha: Number(f.zaloha.replace(",", ".")) || 0,
          mena: f.mena,
          predkontacia: f.predkontacia || null,
          clenenie_dph: f.clenenie_dph || null,
          datum_uctovania: f.datum_uctovania || null,
          poznamka: f.poznamka || null,
          stav: stav ?? f.stav,
          doklady: polozky.map((p) => ({ druh: p.druh, id: p.id })),
        },
      });
      if (r.vInom)
        toast.warning(t("Počet dokladov v inom vyúčtovaní: {n} — nepridali sa.", { n: r.vInom }));
      toast.success(stav === "uzavrete" ? t("Vyúčtovanie uzavreté") : t("Vyúčtovanie uložené"));
      if (!f.id) navigate({ to: "/doklady/vyuctovania/$id", params: { id: r.id! }, replace: true });
      else {
        zmen({ stav: stav ?? f.stav });
        const d = await detail({ data: { id: f.id } });
        setPolozky(d.polozky);
      }
    } catch (e: any) {
      toast.error(e?.message ?? t("Uloženie zlyhalo"));
    } finally {
      setBusy(false);
    }
  }

  async function stiahnutPdf() {
    if (!f?.id) return;
    setBusy(true);
    try {
      const r = await pdf({ data: { id: f.id } });
      const b = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([b], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nazov;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) {
      toast.error(e?.message ?? t("PDF sa nepodarilo vytvoriť"));
    } finally {
      setBusy(false);
    }
  }

  async function zmazat() {
    if (!f?.id || !cid) return;
    if (!(await potvrd(t("Zmazať vyúčtovanie?\nDoklady v ňom ostanú, len sa z vyúčtovania uvoľnia."))))
      return;
    await zmaz({ data: { company_id: cid, id: f.id } });
    toast.success(t("Vyúčtovanie zmazané"));
    navigate({ to: "/doklady/vyuctovania" });
  }

  if (!f || !s)
    return (
      <PageBody>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
        </div>
      </PageBody>
    );

  return (
    <>
      <DocumentDetailHeader
        title={f.id ? f.nazov : t("Nové vyúčtovanie výdavkov")}
        status={
          f.id ? (
            uzavrete ? (
              <StavOdznak className="bg-primary/15 text-primary">{t("Uzavreté")}</StavOdznak>
            ) : (
              <StavOdznak>{t("Rozpracované")}</StavOdznak>
            )
          ) : null
        }
        meta={
          uzavrete
            ? t("Uzavreté — na úpravu ho otvorte.")
            : t("Zamestnanec, obdobie, doklady a výsledok na podpis.")
        }
        secondaryActions={
          f.id ? (
            <SekundarnaAkcia
              ikona={Download}
              label={t("PDF vyúčtovania")}
              onClick={() => void stiahnutPdf()}
              disabled={busy}
            />
          ) : null
        }
        menuActions={
          f.id ? (
            <MenuSkupina>
              <MenuAkcia ikona={Trash2} nebezpecna onClick={() => void zmazat()}>
                {t("Zmazať")}
              </MenuAkcia>
            </MenuSkupina>
          ) : null
        }
      />
      <PageBody>
        <fieldset disabled={uzavrete} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-6">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">{t("Vyúčtovanie")}</h2>
              <div className="mt-3 grid gap-2">
                {TYPY_VYUCTOVANIA.map((typ) => (
                  <label
                    key={typ.kod}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-sm has-[:checked]:border-primary"
                  >
                    <input
                      type="radio"
                      name="typ"
                      checked={f.typ === typ.kod}
                      onChange={() => zmen({ typ: typ.kod })}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{t(typ.nazov)}</span>
                      <span className="block text-xs text-muted-foreground">{t(typ.popis)}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="text-xs text-muted-foreground">{t("Názov")}</span>
                  <input
                    value={f.nazovRucne ? f.nazov : navrhNazvu}
                    onChange={(e) => zmen({ nazov: e.target.value, nazovRucne: true })}
                    className={vstup}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">{t("Zamestnanec")}</span>
                  <select
                    value={f.zamestnanec_id}
                    onChange={(e) => zmen({ zamestnanec_id: e.target.value, zamestnanec_meno: "" })}
                    className={vstup}
                  >
                    <option value="">{t("— iný (napíšte meno) —")}</option>
                    {Object.entries(mena).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">{t("Meno na vyúčtovaní")}</span>
                  <input
                    value={menoZam}
                    onChange={(e) => zmen({ zamestnanec_meno: e.target.value })}
                    placeholder={t("Meno a priezvisko")}
                    className={vstup}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">{t("Obdobie od")}</span>
                  <input
                    type="date"
                    value={f.obdobie_od}
                    onChange={(e) => zmen({ obdobie_od: e.target.value })}
                    className={vstup}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">{t("Obdobie do")}</span>
                  <input
                    type="date"
                    value={f.obdobie_do}
                    onChange={(e) => zmen({ obdobie_do: e.target.value })}
                    className={vstup}
                  />
                </label>
                {f.typ === "zaloha" && (
                  <label className="block text-sm">
                    <span className="text-xs text-muted-foreground">
                      {t("Poskytnutá záloha ({mena})", { mena: f.mena })}
                    </span>
                    <input
                      inputMode="decimal"
                      value={f.zaloha}
                      onChange={(e) => zmen({ zaloha: e.target.value })}
                      className={vstup}
                    />
                  </label>
                )}
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">{t("Mena")}</span>
                  <select
                    value={f.mena}
                    onChange={(e) => zmen({ mena: e.target.value })}
                    className={vstup}
                  >
                    {["EUR", "CZK", "USD", "HUF", "PLN", "GBP"].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  {t("Doklady")} ({polozky.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setVyber(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                >
                  <Plus className="h-4 w-4" /> {t("Pridať doklady")}
                </button>
              </div>
              {polozky.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("Zatiaľ žiadny doklad.")}</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-2">{t("Dátum")}</th>
                        <th className="py-1 pr-2">{t("Dodávateľ")}</th>
                        <th className="py-1 pr-2">{t("Doklad")}</th>
                        <th className="py-1 pr-2 text-right">{t("Spolu")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {[...polozky]
                        .sort((a, b) => String(a.datum ?? "").localeCompare(String(b.datum ?? "")))
                        .map((p) => (
                          <tr key={p.druh + p.id} className="border-t border-border">
                            <td className="py-1.5 pr-2 whitespace-nowrap">
                              {datumNaDoklade(p.datum)}
                            </td>
                            <td className="py-1.5 pr-2">{p.dodavatel ?? "—"}</td>
                            <td className="py-1.5 pr-2">
                              {p.druh === "prijata" ? (
                                <Link
                                  to="/prijate-faktury/$id"
                                  params={{ id: p.id }}
                                  className="text-primary hover:underline"
                                >
                                  {p.cislo ?? t("faktúra")}
                                </Link>
                              ) : (
                                <Link
                                  to="/doklady/novy"
                                  search={{ id: p.id } as any}
                                  className="text-primary hover:underline"
                                >
                                  {p.cislo ?? t("bloček")}
                                </Link>
                              )}
                              <span className="ml-1 text-xs text-muted-foreground">
                                {p.druh === "prijata" ? t("faktúra") : t("bloček")}
                              </span>
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">
                              {formatujMenu(p.spolu, p.mena)}
                            </td>
                            <td className="py-1.5 text-right">
                              <button
                                type="button"
                                aria-label={t("Vybrať z vyúčtovania")}
                                onClick={() =>
                                  setPolozky((x) =>
                                    x.filter((y) => !(y.id === p.id && y.druh === p.druh)),
                                  )
                                }
                                className="rounded p-1 text-muted-foreground hover:bg-secondary"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">{t("Účtovné nastavenia")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Predkontácia a členenie sa doplnia dokladom vo vyúčtovaní, ktoré ich ešte nemajú a neodišli do účtovníctva (napr. náklad voči záväzku zamestnancovi, 5xx/335).")}
              </p>
              <div className="@container mt-3 grid grid-cols-1 gap-3 @lg:grid-cols-2 [&>*]:min-w-0">
                <label className="block text-sm @lg:col-span-2">
                  <span className="font-medium">{t("Predkontácia (Pohoda)")}</span>
                  <KodPohody
                    value={f.predkontacia}
                    onChange={(v) => zmen({ predkontacia: v })}
                    moznosti={navrhy?.predkontacie ?? []}
                    placeholder={t("nemeniť")}
                    className={vstupZauctovania}
                    vyber
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">{t("Členenie DPH")}</span>
                  <KodPohody
                    value={f.clenenie_dph}
                    onChange={(v) => zmen({ clenenie_dph: v })}
                    moznosti={navrhy?.clenenia ?? []}
                    placeholder={t("nemeniť")}
                    className={vstupZauctovania}
                    vyber
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">{t("Dátum účtovania")}</span>
                  <input
                    type="date"
                    value={f.datum_uctovania}
                    onChange={(e) => zmen({ datum_uctovania: e.target.value })}
                    className={vstupZauctovania}
                  />
                </label>
                <label className="block text-sm @lg:col-span-2">
                  <span className="font-medium">{t("Poznámka")}</span>
                  <input
                    value={f.poznamka}
                    onChange={(e) => zmen({ poznamka: e.target.value })}
                    className={vstupZauctovania}
                  />
                </label>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 lg:sticky lg:top-20">
              <h2 className="text-sm font-semibold">{t("Výsledok")}</h2>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("Doklady spolu")}</dt>
                  <dd className="tabular-nums">{formatujMenu(s.spolu, f.mena)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("z toho DPH")}</dt>
                  <dd className="tabular-nums">{formatujMenu(s.dph, f.mena)}</dd>
                </div>
                {f.typ === "zaloha" && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("Záloha")}</dt>
                    <dd className="tabular-nums">−{formatujMenu(s.zaloha, f.mena)}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-3 rounded-md bg-secondary/60 p-3 text-sm font-medium">
                {f.typ === "karta"
                  ? t("Platené firemnou kartou — nič sa nedopláca.")
                  : s.rozdiel > 0
                    ? t("Firma doplatí zamestnancovi {suma}.", { suma: formatujMenu(Math.abs(s.rozdiel), f.mena) })
                    : s.rozdiel < 0
                      ? t("Zamestnanec vráti firme {suma}.", { suma: formatujMenu(Math.abs(s.rozdiel), f.mena) })
                      : t("Vyrovnané — nikto nikomu nič nedlhuje.")}
              </p>
              {s.inaMena ? (
                <p className="mt-2 text-xs text-amber-700">
                  {t("Doklady v inej mene ako {mena}: {n} — do súčtu nevstupujú.", {
                    n: s.inaMena,
                    mena: f.mena,
                  })}
                </p>
              ) : null}
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => void ulozit()}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("Uložiť")}
                </button>
                {f.id && !uzavrete ? (
                  <button
                    type="button"
                    onClick={() => void ulozit("uzavrete")}
                    disabled={busy}
                    className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    {t("Uzavrieť vyúčtovanie")}
                  </button>
                ) : null}
              </div>
            </div>
          </aside>
        </fieldset>
        {uzavrete ? (
          <button
            type="button"
            onClick={() => void ulozit("otvorene")}
            disabled={busy}
            className="mt-4 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            {t("Otvoriť na úpravu")}
          </button>
        ) : null}
      </PageBody>
      {vyber && cid && (
        <VyberDokladov
          companyId={cid}
          od={f.obdobie_od}
          doDna={f.obdobie_do}
          vyuctovanieId={f.id}
          uz={polozky}
          onClose={() => setVyber(false)}
          onPridaj={(nove) => {
            setPolozky((x) => [
              ...x,
              ...nove.filter((n) => !x.some((y) => y.id === n.id && y.druh === n.druh)),
            ]);
            setVyber(false);
          }}
        />
      )}
    </>
  );
}

/** Výber bločkov a prijatých faktúr z obdobia, ktoré ešte nie sú v inom vyúčtovaní. */
function VyberDokladov({
  companyId,
  od,
  doDna,
  vyuctovanieId,
  uz,
  onClose,
  onPridaj,
}: {
  companyId: string;
  od: string;
  doDna: string;
  vyuctovanieId: string | null;
  uz: PolozkaVyuctovania[];
  onClose: () => void;
  onPridaj: (p: PolozkaVyuctovania[]) => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const [kandidati, setKandidati] = useState<PolozkaVyuctovania[] | null>(null);
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());
  const [hladat, setHladat] = useState("");
  useEffect(() => {
    (async () => {
      const volne = vyuctovanieId
        ? `vyuctovanie_id.is.null,vyuctovanie_id.eq.${vyuctovanieId}`
        : "vyuctovanie_id.is.null";
      let qb = supabase
        .from("expense_documents")
        .select(
          "id, issue_date, supplier_name, document_number, payment_method, total_amount, vat_amount, currency",
        )
        .eq("company_id", companyId)
        .or(volne)
        .order("issue_date", { ascending: false })
        .limit(500);
      let qp = supabase
        .from("purchase_invoices")
        .select(
          "id, issue_date, supplier_name, invoice_number, payment_method, amount_without_vat, vat_amount, amount_total, currency",
        )
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .or(volne)
        .order("issue_date", { ascending: false })
        .limit(500);
      if (od) {
        qb = qb.gte("issue_date", od);
        qp = qp.gte("issue_date", od);
      }
      if (doDna) {
        qb = qb.lte("issue_date", doDna);
        qp = qp.lte("issue_date", doDna);
      }
      const [{ data: b }, { data: p }] = await Promise.all([qb, qp]);
      setKandidati(
        [...(b ?? []).map(polozkaZBlocku), ...(p ?? []).map(polozkaZPrijatej)].filter(
          (k) => !uz.some((u) => u.id === k.id && u.druh === k.druh),
        ),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const h = hladat.trim().toLowerCase();
  const zobrazene = (kandidati ?? []).filter(
    (k) => !h || `${k.dodavatel ?? ""} ${k.cislo ?? ""}`.toLowerCase().includes(h),
  );
  const kluc = (k: PolozkaVyuctovania) => `${k.druh}:${k.id}`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Pridať doklady do vyúčtovania")}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col rounded-xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-5">
          <h3 className="text-lg font-semibold">{t("Pridať doklady")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {od || doDna
              ? t("Bločky a prijaté faktúry z obdobia {od} – {do}, ktoré nie sú v inom vyúčtovaní.", {
                  od: od || "…",
                  do: doDna || "…",
                })
              : t("Bločky a prijaté faktúry, ktoré nie sú v inom vyúčtovaní.")}
          </p>
          <input
            value={hladat}
            onChange={(e) => setHladat(e.target.value)}
            placeholder={t("Hľadať dodávateľa alebo číslo")}
            className={`${vstup} mt-3`}
          />
        </div>
        <div className="overflow-y-auto p-5">
          {kandidati === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
            </div>
          ) : zobrazene.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Žiadne voľné doklady v tomto období.")}</p>
          ) : (
            <ul className="space-y-1">
              {zobrazene.map((k) => (
                <li key={kluc(k)}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/50">
                    <input
                      type="checkbox"
                      checked={vybrane.has(kluc(k))}
                      onChange={(e) =>
                        setVybrane((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(kluc(k));
                          else n.delete(kluc(k));
                          return n;
                        })
                      }
                    />
                    <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                      {datumNaDoklade(k.datum)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {k.dodavatel ?? "—"}{" "}
                      <span className="text-xs text-muted-foreground">
                        · {k.druh === "prijata" ? t("faktúra") : t("bloček")} {k.cislo ?? ""}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatujMenu(k.spolu, k.mena)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            {t("Zrušiť")}
          </button>
          <button
            onClick={() => onPridaj((kandidati ?? []).filter((k) => vybrane.has(kluc(k))))}
            disabled={!vybrane.size}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {t("Pridať")} ({vybrane.size})
          </button>
        </div>
      </div>
    </div>
  );
}
