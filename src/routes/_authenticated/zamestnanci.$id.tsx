import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, FileText, Trash2, Upload } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import {
  getZamestnanec,
  listDochadzky,
  nastavCitliveUdaje,
  odkazNaDokument,
  pridajDokument,
  ulozDochadzku,
  ulozNepritomnost,
  ulozZamestnanca,
  ulozZmluvu,
  vyrobDokument,
  zmazDokument,
  zmazZamestnanca,
  zmazZaznam,
  zobrazCitliveUdaje,
} from "@/lib/faktero/zamestnanci.functions";
import {
  celeMeno,
  datumSk,
  DOPLNKY_SABLONY,
  DRUH_DOCHADZKY,
  DRUH_NEPRITOMNOSTI,
  DRUH_ZMLUVY,
  hodinyZaznamu,
  NAZOV_SABLONY,
  type DruhDochadzky,
  type DruhNepritomnosti,
  type DruhZmluvy,
  type KlucSablony,
  type Pripomienka,
} from "@/lib/faktero/zamestnanci";
import {
  ChybaModulu,
  FormularZamestnanca,
  naFormular,
  pole,
  popis,
  tlacidlo,
  tlacidloObrys,
  type UdajeZamestnanca,
} from "@/components/faktero/zamestnanci/ui";

export const Route = createFileRoute("/_authenticated/zamestnanci/$id")({
  head: () => ({ meta: [{ title: "Zamestnanec — Faktero" }] }),
  component: KartaZamestnanca,
});

type Zalozka = "udaje" | "zmluvy" | "dokumenty" | "nepritomnosti" | "dochadzka";
const ZALOZKY: [Zalozka, string][] = [
  ["udaje", "Údaje"],
  ["zmluvy", "Zmluvy"],
  ["dokumenty", "Dokumenty"],
  ["nepritomnosti", "Neprítomnosti"],
  ["dochadzka", "Dochádzka"],
];

type Detail = {
  zamestnanec: any;
  zmluvy: any[];
  dokumenty: any[];
  nepritomnosti: any[];
  maRodneCislo: boolean;
  maOp: boolean;
  pripomienky: Pripomienka[];
};

function KartaZamestnanca() {
  const { id } = Route.useParams();
  const nacitajDetail = useServerFn(getZamestnanec);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [zalozka, setZalozka] = useState<Zalozka>("udaje");
  const cid = getActiveCompanyId();

  const nacitaj = useCallback(() => {
    if (!cid) return;
    nacitajDetail({ data: { company_id: cid, id } })
      .then((d: any) => setDetail(d))
      .catch((e: any) => setChyba(e?.message ?? "Kartu sa nepodarilo načítať."));
  }, [nacitajDetail, cid, id]);
  useEffect(nacitaj, [nacitaj]);

  return (
    <>
      <PageHeader
        title={detail ? celeMeno(detail.zamestnanec) : "Zamestnanec"}
        description={detail?.zamestnanec.position || undefined}
        action={
          <Link to="/zamestnanci" className={tlacidloObrys}>
            <ArrowLeft className="h-4 w-4" /> Zamestnanci
          </Link>
        }
      />
      <PageBody>
        {chyba ? (
          <ChybaModulu sprava={chyba} />
        ) : !detail || !cid ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : (
          <>
            {detail.pripomienky.length > 0 && (
              <section className="mb-4 space-y-2" aria-label="Pripomienky">
                {detail.pripomienky.map((p) => (
                  <div
                    key={p.kluc}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                      p.zavaznost === "danger"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong>{p.nadpis}</strong> — {p.text}
                    </span>
                  </div>
                ))}
              </section>
            )}

            <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-border">
              {ZALOZKY.map(([k, nazov]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={zalozka === k}
                  onClick={() => setZalozka(k)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                    zalozka === k ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {nazov}
                </button>
              ))}
            </div>

            {zalozka === "udaje" && <Udaje cid={cid} detail={detail} obnov={nacitaj} />}
            {zalozka === "zmluvy" && <Zmluvy cid={cid} detail={detail} obnov={nacitaj} />}
            {zalozka === "dokumenty" && <Dokumenty cid={cid} detail={detail} obnov={nacitaj} />}
            {zalozka === "nepritomnosti" && <Nepritomnosti cid={cid} detail={detail} obnov={nacitaj} />}
            {zalozka === "dochadzka" && <DochadzkaZalozka cid={cid} employeeId={detail.zamestnanec.id} />}
          </>
        )}
      </PageBody>
    </>
  );
}

type Vlastnosti = { cid: string; detail: Detail; obnov: () => void };

/* ── Údaje ──────────────────────────────────────────────────────────────── */

function Udaje({ cid, detail, obnov }: Vlastnosti) {
  const uloz = useServerFn(ulozZamestnanca);
  const zmaz = useServerFn(zmazZamestnanca);
  const nav = useNavigate();
  const [udaje, setUdaje] = useState<UdajeZamestnanca>(() => naFormular(detail.zamestnanec));
  const [uklada, setUklada] = useState(false);

  async function ulozit(e: React.FormEvent) {
    e.preventDefault();
    setUklada(true);
    try {
      await uloz({ data: { company_id: cid, id: detail.zamestnanec.id, ...udaje } });
      toast.success("Údaje sú uložené.");
      obnov();
    } catch (err: any) {
      toast.error(err?.message ?? "Údaje sa nepodarilo uložiť.");
    } finally {
      setUklada(false);
    }
  }

  async function zmazat() {
    if (!confirm(`Naozaj zmazať ${celeMeno(detail.zamestnanec)} aj so zmluvami, dokumentmi a dochádzkou? Nedá sa to vrátiť.`)) return;
    try {
      await zmaz({ data: { company_id: cid, id: detail.zamestnanec.id } });
      toast.success("Zamestnanec je zmazaný.");
      nav({ to: "/zamestnanci" });
    } catch (err: any) {
      toast.error(err?.message ?? "Zamestnanca sa nepodarilo zmazať.");
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <form onSubmit={ulozit} className="space-y-4">
        <FormularZamestnanca udaje={udaje} zmen={setUdaje} />
        <div className="flex justify-end">
          <button type="submit" className={tlacidlo} disabled={uklada}>
            {uklada ? "Ukladám…" : "Uložiť zmeny"}
          </button>
        </div>
      </form>
      <CitliveUdaje cid={cid} detail={detail} obnov={obnov} />
      <div className="rounded-xl border border-destructive/30 p-4">
        <div className="text-sm font-semibold">Zmazanie zamestnanca</div>
        <p className="mt-1 text-xs text-muted-foreground">Zmaže kartu, zmluvy, dokumenty, neprítomnosti aj dochádzku.</p>
        <button type="button" onClick={zmazat} className={`${tlacidloObrys} mt-3 text-destructive`}>
          <Trash2 className="h-4 w-4" /> Zmazať zamestnanca
        </button>
      </div>
    </div>
  );
}

/**
 * Rodné číslo a číslo OP. Na kartu prídu len ako „vyplnené / nevyplnené“;
 * odšifrujú sa až na tlačidlo „Zobraziť“ — a to sa zapíše do auditu.
 */
function CitliveUdaje({ cid, detail, obnov }: Vlastnosti) {
  const zobraz = useServerFn(zobrazCitliveUdaje);
  const uloz = useServerFn(nastavCitliveUdaje);
  const [hodnoty, setHodnoty] = useState<{ rodne_cislo: string | null; op_cislo: string | null } | null>(null);
  const [upravuje, setUpravuje] = useState(false);
  const [rc, setRc] = useState("");
  const [op, setOp] = useState("");

  async function zobrazit() {
    try {
      setHodnoty(await zobraz({ data: { company_id: cid, id: detail.zamestnanec.id } }));
    } catch (err: any) {
      toast.error(err?.message ?? "Nepodarilo sa zobraziť.");
    }
  }

  async function ulozit() {
    try {
      await uloz({
        data: {
          company_id: cid,
          id: detail.zamestnanec.id,
          rodne_cislo: rc,
          op_cislo: op,
        },
      });
      toast.success("Citlivé údaje sú uložené.");
      setUpravuje(false);
      setHodnoty(null);
      obnov();
    } catch (err: any) {
      toast.error(err?.message ?? "Nepodarilo sa uložiť.");
    }
  }

  const riadok = (nazov: string, vyplnene: boolean, hodnota: string | null | undefined) => (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{nazov}</span>
      <span className="font-mono">{hodnoty ? hodnota || "—" : vyplnene ? "••••••••" : "nevyplnené"}</span>
    </div>
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-1 text-sm font-semibold">Citlivé údaje</h3>
      <p className="mb-3 text-xs text-muted-foreground">Uložené šifrovane. Každé zobrazenie a zmena sa zapíše do záznamu prístupov.</p>
      {upravuje ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={popis} htmlFor="c-rc">Rodné číslo</label>
            <input id="c-rc" className={pole} value={rc} onChange={(e) => setRc(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label className={popis} htmlFor="c-op">Číslo občianskeho preukazu</label>
            <input id="c-op" className={pole} value={op} onChange={(e) => setOp(e.target.value)} autoComplete="off" />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Prázdne pole údaj vymaže.</p>
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" className={tlacidlo} onClick={ulozit}>Uložiť</button>
            <button type="button" className={tlacidloObrys} onClick={() => setUpravuje(false)}>Zrušiť</button>
          </div>
        </div>
      ) : (
        <>
          {riadok("Rodné číslo", detail.maRodneCislo, hodnoty?.rodne_cislo)}
          {riadok("Číslo OP", detail.maOp, hodnoty?.op_cislo)}
          <div className="mt-3 flex flex-wrap gap-2">
            {hodnoty ? (
              <button type="button" className={tlacidloObrys} onClick={() => setHodnoty(null)}>
                <EyeOff className="h-4 w-4" /> Skryť
              </button>
            ) : (
              <button type="button" className={tlacidloObrys} onClick={zobrazit} disabled={!detail.maRodneCislo && !detail.maOp}>
                <Eye className="h-4 w-4" /> Zobraziť
              </button>
            )}
            <button
              type="button"
              className={tlacidloObrys}
              onClick={() => {
                setRc(hodnoty?.rodne_cislo ?? "");
                setOp(hodnoty?.op_cislo ?? "");
                setUpravuje(true);
              }}
            >
              Upraviť
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/* ── Zmluvy ─────────────────────────────────────────────────────────────── */

const prazdnaZmluva = () => ({
  id: undefined as string | undefined,
  kind: "pracovna_zmluva" as DruhZmluvy,
  number: "",
  signed_at: "",
  start_date: "",
  end_date: "",
  probation_end: "",
  position: "",
  workplace: "",
  weekly_hours: "",
  salary: "",
  salary_period: "mesacne" as "mesacne" | "hodinovo" | "odmena",
  status: "active" as "draft" | "active" | "ended",
  note: "",
});

function Zmluvy({ cid, detail, obnov }: Vlastnosti) {
  const uloz = useServerFn(ulozZmluvu);
  const zmaz = useServerFn(zmazZaznam);
  const [forma, setForma] = useState<ReturnType<typeof prazdnaZmluva> | null>(null);

  async function ulozit(e: React.FormEvent) {
    e.preventDefault();
    if (!forma) return;
    try {
      await uloz({ data: { company_id: cid, employee_id: detail.zamestnanec.id, ...forma } });
      toast.success("Zmluva je uložená.");
      setForma(null);
      obnov();
    } catch (err: any) {
      toast.error(err?.message ?? "Zmluvu sa nepodarilo uložiť.");
    }
  }

  const nastav = (k: string) => (e: { target: { value: string } }) => setForma((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <div className="max-w-3xl space-y-4">
      {!forma && (
        <button type="button" className={tlacidlo} onClick={() => setForma({ ...prazdnaZmluva(), start_date: detail.zamestnanec.start_date ?? "", position: detail.zamestnanec.position ?? "" })}>
          Pridať zmluvu
        </button>
      )}
      {forma && (
        <form onSubmit={ulozit} className="rounded-xl border border-border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={popis} htmlFor="k-kind">Druh</label>
              <select id="k-kind" className={pole} value={forma.kind} onChange={nastav("kind")}>
                {Object.entries(DRUH_ZMLUVY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={popis} htmlFor="k-number">Číslo zmluvy</label>
              <input id="k-number" className={pole} value={forma.number} onChange={nastav("number")} />
            </div>
            <div>
              <label className={popis} htmlFor="k-start">Začiatok *</label>
              <input id="k-start" type="date" className={pole} value={forma.start_date} onChange={nastav("start_date")} required />
            </div>
            <div>
              <label className={popis} htmlFor="k-end">Koniec (prázdne = na dobu neurčitú)</label>
              <input id="k-end" type="date" className={pole} value={forma.end_date} onChange={nastav("end_date")} />
            </div>
            <div>
              <label className={popis} htmlFor="k-prob">Koniec skúšobnej doby</label>
              <input id="k-prob" type="date" className={pole} value={forma.probation_end} onChange={nastav("probation_end")} />
            </div>
            <div>
              <label className={popis} htmlFor="k-signed">Podpísaná dňa</label>
              <input id="k-signed" type="date" className={pole} value={forma.signed_at} onChange={nastav("signed_at")} />
            </div>
            <div>
              <label className={popis} htmlFor="k-pos">Pracovné zaradenie</label>
              <input id="k-pos" className={pole} value={forma.position} onChange={nastav("position")} />
            </div>
            <div>
              <label className={popis} htmlFor="k-work">Miesto výkonu práce</label>
              <input id="k-work" className={pole} value={forma.workplace} onChange={nastav("workplace")} />
            </div>
            <div>
              <label className={popis} htmlFor="k-hours">Týždenný pracovný čas (hod.)</label>
              <input id="k-hours" inputMode="decimal" className={pole} value={forma.weekly_hours} onChange={nastav("weekly_hours")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={popis} htmlFor="k-salary">Mzda / odmena (€)</label>
                <input id="k-salary" inputMode="decimal" className={pole} value={forma.salary} onChange={nastav("salary")} />
              </div>
              <div>
                <label className={popis} htmlFor="k-period">Za</label>
                <select id="k-period" className={pole} value={forma.salary_period} onChange={nastav("salary_period")}>
                  <option value="mesacne">mesiac</option>
                  <option value="hodinovo">hodinu</option>
                  <option value="odmena">prácu</option>
                </select>
              </div>
            </div>
            <div>
              <label className={popis} htmlFor="k-status">Stav</label>
              <select id="k-status" className={pole} value={forma.status} onChange={nastav("status")}>
                <option value="active">Platná</option>
                <option value="draft">Návrh</option>
                <option value="ended">Ukončená</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" className={tlacidlo}>Uložiť zmluvu</button>
            <button type="button" className={tlacidloObrys} onClick={() => setForma(null)}>Zrušiť</button>
          </div>
        </form>
      )}

      {detail.zmluvy.length === 0 ? (
        <p className="text-sm text-muted-foreground">Zatiaľ žiadna zmluva.</p>
      ) : (
        <ul className="space-y-2">
          {detail.zmluvy.map((k) => (
            <li key={k.id} className="rounded-xl border border-border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">
                    {DRUH_ZMLUVY[k.kind as DruhZmluvy]} {k.number ? `č. ${k.number}` : ""}
                  </div>
                  <div className="text-muted-foreground">
                    {datumSk(k.start_date)} – {k.end_date ? datumSk(k.end_date) : "na dobu neurčitú"}
                    {k.probation_end ? ` · skúšobná doba do ${datumSk(k.probation_end)}` : ""}
                    {k.status !== "active" ? ` · ${k.status === "draft" ? "návrh" : "ukončená"}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={tlacidloObrys}
                    onClick={() =>
                      setForma({
                        ...prazdnaZmluva(),
                        ...Object.fromEntries(Object.entries(k).map(([a, b]) => [a, b == null ? "" : String(b)])),
                        id: k.id,
                      } as any)
                    }
                  >
                    Upraviť
                  </button>
                  <button
                    type="button"
                    aria-label="Zmazať zmluvu"
                    className={`${tlacidloObrys} text-destructive`}
                    onClick={async () => {
                      if (!confirm("Zmazať túto zmluvu?")) return;
                      try {
                        await zmaz({ data: { company_id: cid, id: k.id, tabulka: "employee_contracts" } });
                        obnov();
                      } catch (err: any) {
                        toast.error(err?.message ?? "Zmluvu sa nepodarilo zmazať.");
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Dokumenty ──────────────────────────────────────────────────────────── */

function Dokumenty({ cid, detail, obnov }: Vlastnosti) {
  const vyrob = useServerFn(vyrobDokument);
  const pridaj = useServerFn(pridajDokument);
  const odkaz = useServerFn(odkazNaDokument);
  const zmaz = useServerFn(zmazDokument);
  const [sablona, setSablona] = useState<KlucSablony>("pracovna_zmluva");
  const [zmluva, setZmluva] = useState<string>(detail.zmluvy[0]?.id ?? "");
  const [doplnky, setDoplnky] = useState<Record<string, string>>({});
  const [pracuje, setPracuje] = useState(false);

  async function vyrobit() {
    setPracuje(true);
    try {
      await vyrob({
        data: { company_id: cid, employee_id: detail.zamestnanec.id, key: sablona, contract_id: zmluva || null, doplnky },
      });
      toast.success("Dokument je vyrobený.");
      setDoplnky({});
      obnov();
    } catch (err: any) {
      toast.error(err?.message ?? "Dokument sa nepodarilo vyrobiť.");
    } finally {
      setPracuje(false);
    }
  }

  async function nahrat(subor: File) {
    setPracuje(true);
    try {
      const bezpecne = subor.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_");
      const cesta = `${cid}/${detail.zamestnanec.id}/${crypto.randomUUID()}-${bezpecne}`;
      const { error } = await supabase.storage.from("employee-docs").upload(cesta, subor, { contentType: subor.type || undefined });
      if (error) throw new Error(error.message);
      await pridaj({
        data: {
          company_id: cid,
          employee_id: detail.zamestnanec.id,
          title: subor.name,
          file_path: cesta,
          file_mime: subor.type || null,
          file_size: subor.size,
        },
      });
      toast.success("Dokument je nahratý.");
      obnov();
    } catch (err: any) {
      toast.error(err?.message ?? "Dokument sa nepodarilo nahrať.");
    } finally {
      setPracuje(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Vyrobiť zo šablóny</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={popis} htmlFor="d-sab">Šablóna</label>
            <select id="d-sab" className={pole} value={sablona} onChange={(e) => setSablona(e.target.value as KlucSablony)}>
              {Object.entries(NAZOV_SABLONY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={popis} htmlFor="d-zml">Podľa zmluvy</label>
            <select id="d-zml" className={pole} value={zmluva} onChange={(e) => setZmluva(e.target.value)}>
              <option value="">— bez zmluvy —</option>
              {detail.zmluvy.map((k) => (
                <option key={k.id} value={k.id}>
                  {DRUH_ZMLUVY[k.kind as DruhZmluvy]} od {datumSk(k.start_date)}
                </option>
              ))}
            </select>
          </div>
          {(DOPLNKY_SABLONY[sablona] ?? []).map((d) => (
            <div key={d.token}>
              <label className={popis} htmlFor={`d-${d.token}`}>{d.popis}</label>
              <input
                id={`d-${d.token}`}
                className={pole}
                value={doplnky[d.token] ?? ""}
                onChange={(e) => setDoplnky((x) => ({ ...x, [d.token]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className={tlacidlo} onClick={vyrobit} disabled={pracuje}>
            <FileText className="h-4 w-4" /> {pracuje ? "Pracujem…" : "Vyrobiť PDF"}
          </button>
          <Link to="/zamestnanci/sablony" className="text-xs text-muted-foreground underline">
            Upraviť šablóny
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Nahrať vlastný dokument</h3>
        <label className={`${tlacidloObrys} cursor-pointer`}>
          <Upload className="h-4 w-4" /> Vybrať súbor
          <input
            type="file"
            className="sr-only"
            disabled={pracuje}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void nahrat(f);
            }}
          />
        </label>
      </section>

      {detail.dokumenty.length === 0 ? (
        <p className="text-sm text-muted-foreground">Zatiaľ žiadne dokumenty.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {detail.dokumenty.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{d.title}</div>
                <div className="text-xs text-muted-foreground">{datumSk(d.created_at)}</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={tlacidloObrys}
                  onClick={async () => {
                    try {
                      const { url } = await odkaz({ data: { company_id: cid, id: d.id } });
                      window.open(url, "_blank", "noopener");
                    } catch (err: any) {
                      toast.error(err?.message ?? "Dokument sa nepodarilo otvoriť.");
                    }
                  }}
                >
                  Otvoriť
                </button>
                <button
                  type="button"
                  aria-label="Zmazať dokument"
                  className={`${tlacidloObrys} text-destructive`}
                  onClick={async () => {
                    if (!confirm(`Zmazať dokument „${d.title}“?`)) return;
                    try {
                      await zmaz({ data: { company_id: cid, id: d.id } });
                      obnov();
                    } catch (err: any) {
                      toast.error(err?.message ?? "Dokument sa nepodarilo zmazať.");
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Neprítomnosti ──────────────────────────────────────────────────────── */

function Nepritomnosti({ cid, detail, obnov }: Vlastnosti) {
  const uloz = useServerFn(ulozNepritomnost);
  const zmaz = useServerFn(zmazZaznam);
  const [forma, setForma] = useState({ kind: "dovolenka" as DruhNepritomnosti, date_from: "", date_to: "", days: "", note: "" });

  async function ulozit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await uloz({
        data: {
          company_id: cid,
          employee_id: detail.zamestnanec.id,
          ...forma,
          date_to: forma.date_to || forma.date_from,
        },
      });
      toast.success("Neprítomnosť je zapísaná.");
      setForma({ kind: forma.kind, date_from: "", date_to: "", days: "", note: "" });
      obnov();
    } catch (err: any) {
      toast.error(err?.message ?? "Neprítomnosť sa nepodarilo zapísať.");
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <form onSubmit={ulozit} className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className={popis} htmlFor="n-kind">Druh</label>
            <select id="n-kind" className={pole} value={forma.kind} onChange={(e) => setForma({ ...forma, kind: e.target.value as DruhNepritomnosti })}>
              {Object.entries(DRUH_NEPRITOMNOSTI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={popis} htmlFor="n-od">Od *</label>
            <input id="n-od" type="date" required className={pole} value={forma.date_from} onChange={(e) => setForma({ ...forma, date_from: e.target.value })} />
          </div>
          <div>
            <label className={popis} htmlFor="n-do">Do</label>
            <input id="n-do" type="date" className={pole} value={forma.date_to} onChange={(e) => setForma({ ...forma, date_to: e.target.value })} />
          </div>
          <div>
            <label className={popis} htmlFor="n-dni">Pracovných dní</label>
            <input id="n-dni" inputMode="decimal" className={pole} value={forma.days} onChange={(e) => setForma({ ...forma, days: e.target.value })} />
          </div>
          <div className="sm:col-span-4">
            <label className={popis} htmlFor="n-note">Poznámka</label>
            <input id="n-note" className={pole} value={forma.note} onChange={(e) => setForma({ ...forma, note: e.target.value })} />
          </div>
        </div>
        <button type="submit" className={`${tlacidlo} mt-4`}>Zapísať neprítomnosť</button>
      </form>

      {detail.nepritomnosti.length === 0 ? (
        <p className="text-sm text-muted-foreground">Žiadna zapísaná neprítomnosť.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {detail.nepritomnosti.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <span className="font-medium">{DRUH_NEPRITOMNOSTI[n.kind as DruhNepritomnosti]}</span>{" "}
                <span className="text-muted-foreground">
                  {datumSk(n.date_from)}
                  {n.date_to !== n.date_from ? ` – ${datumSk(n.date_to)}` : ""}
                  {n.days != null ? ` · ${String(n.days).replace(".", ",")} dní` : ""}
                  {n.note ? ` · ${n.note}` : ""}
                </span>
              </div>
              <button
                type="button"
                aria-label="Zmazať neprítomnosť"
                className={`${tlacidloObrys} text-destructive`}
                onClick={async () => {
                  try {
                    await zmaz({ data: { company_id: cid, id: n.id, tabulka: "employee_absences" } });
                    obnov();
                  } catch (err: any) {
                    toast.error(err?.message ?? "Nepodarilo sa zmazať.");
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Dochádzka ──────────────────────────────────────────────────────────── */

function tentoMesiac(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(new Date()).slice(0, 7);
}

function DochadzkaZalozka({ cid, employeeId }: { cid: string; employeeId: string }) {
  const nacitajMesiac = useServerFn(listDochadzky);
  const uloz = useServerFn(ulozDochadzku);
  const zmaz = useServerFn(zmazZaznam);
  const [mesiac, setMesiac] = useState(tentoMesiac);
  const [zaznamy, setZaznamy] = useState<any[]>([]);
  const [forma, setForma] = useState({ work_date: "", time_from: "08:00", time_to: "16:30", break_minutes: "30", hours: "", kind: "praca" as DruhDochadzky, note: "" });

  const nacitaj = useCallback(() => {
    nacitajMesiac({ data: { company_id: cid, employee_id: employeeId, mesiac } })
      .then((d: any) => setZaznamy(d ?? []))
      .catch((e: any) => toast.error(e?.message ?? "Dochádzku sa nepodarilo načítať."));
  }, [nacitajMesiac, cid, employeeId, mesiac]);
  useEffect(nacitaj, [nacitaj]);

  const spolu = useMemo(() => zaznamy.reduce((s, z) => s + hodinyZaznamu(z), 0), [zaznamy]);

  async function ulozit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await uloz({
        data: {
          company_id: cid,
          employee_id: employeeId,
          ...forma,
          break_minutes: Number(forma.break_minutes || 0),
        },
      });
      setForma({ ...forma, work_date: "", note: "" });
      nacitaj();
    } catch (err: any) {
      toast.error(err?.message ?? "Záznam sa nepodarilo uložiť.");
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <form onSubmit={ulozit} className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={popis} htmlFor="a-den">Deň *</label>
            <input id="a-den" type="date" required className={pole} value={forma.work_date} onChange={(e) => setForma({ ...forma, work_date: e.target.value })} />
          </div>
          <div>
            <label className={popis} htmlFor="a-od">Príchod</label>
            <input id="a-od" type="time" className={pole} value={forma.time_from} onChange={(e) => setForma({ ...forma, time_from: e.target.value })} />
          </div>
          <div>
            <label className={popis} htmlFor="a-do">Odchod</label>
            <input id="a-do" type="time" className={pole} value={forma.time_to} onChange={(e) => setForma({ ...forma, time_to: e.target.value })} />
          </div>
          <div>
            <label className={popis} htmlFor="a-pr">Prestávka (min.)</label>
            <input id="a-pr" inputMode="numeric" className={pole} value={forma.break_minutes} onChange={(e) => setForma({ ...forma, break_minutes: e.target.value })} />
          </div>
          <div>
            <label className={popis} htmlFor="a-hod">Alebo hodín spolu</label>
            <input id="a-hod" inputMode="decimal" className={pole} value={forma.hours} onChange={(e) => setForma({ ...forma, hours: e.target.value })} />
          </div>
          <div>
            <label className={popis} htmlFor="a-kind">Druh</label>
            <select id="a-kind" className={pole} value={forma.kind} onChange={(e) => setForma({ ...forma, kind: e.target.value as DruhDochadzky })}>
              {Object.entries(DRUH_DOCHADZKY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <button type="submit" className={`${tlacidlo} mt-4`}>Zapísať deň</button>
      </form>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <label className={popis} htmlFor="a-mesiac">Mesiac</label>
          <input id="a-mesiac" type="month" className={pole} value={mesiac} onChange={(e) => e.target.value && setMesiac(e.target.value)} />
        </div>
        <div className="text-sm">
          Spolu <strong>{String(Math.round(spolu * 100) / 100).replace(".", ",")} h</strong> za{" "}
          {new Set(zaznamy.map((z) => z.work_date)).size} dní
        </div>
      </div>

      {zaznamy.length === 0 ? (
        <p className="text-sm text-muted-foreground">V tomto mesiaci nie je zapísaná dochádzka.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {zaznamy.map((z) => (
            <li key={z.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <span className="font-medium">{datumSk(z.work_date)}</span>{" "}
                <span className="text-muted-foreground">
                  {z.time_from && z.time_to ? `${z.time_from.slice(0, 5)}–${z.time_to.slice(0, 5)}` : ""}
                  {z.break_minutes ? ` · prestávka ${z.break_minutes} min.` : ""} · {String(hodinyZaznamu(z)).replace(".", ",")} h ·{" "}
                  {DRUH_DOCHADZKY[z.kind as DruhDochadzky]}
                </span>
              </div>
              <button
                type="button"
                aria-label="Zmazať záznam dochádzky"
                className={`${tlacidloObrys} text-destructive`}
                onClick={async () => {
                  try {
                    await zmaz({ data: { company_id: cid, id: z.id, tabulka: "employee_attendance" } });
                    nacitaj();
                  } catch (err: any) {
                    toast.error(err?.message ?? "Nepodarilo sa zmazať.");
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
