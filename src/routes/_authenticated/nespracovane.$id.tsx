import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NespracovanyKompaktny } from "@/components/faktero/NespracovanyKompaktny";
import { PolozkyNespracovaneho } from "@/components/faktero/PolozkyNespracovaneho";
import { PreddefinovanaPoznamka } from "@/components/faktero/PreddefinovanaPoznamka";
import { useVzhladNespracovanych } from "@/hooks/useVzhladNespracovanych";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { NahladPdf } from "@/components/faktero/NahladPdf";
import { PoliaZauctovania, type Navrhy } from "@/components/faktero/ZauctovaniePanel";
import {
  detailNespracovanehoFn,
  docitajNespracovanyFn,
  ulozNespracovaneFn,
  vytvorZNespracovanehoFn,
  zmazNespracovaneFn,
} from "@/lib/faktero/nespracovane.functions";
import { navrhyKodovFn } from "@/lib/faktero/zauctovanie.functions";
import {
  DRUHY_NESPRACOVANYCH,
  NAZVY_POLI,
  chybajuce,
  sucty,
  type DruhNespracovaneho,
  type UdajeNespracovaneho,
} from "@/lib/faktero/nespracovane";
import { DRUHY_OSTATNYCH } from "@/lib/faktero/ostatne-doklady";
import { sadzbyKrajiny } from "@/lib/faktero/vat-rates";

export const Route = createFileRoute("/_authenticated/nespracovane/$id")({
  head: () => ({ meta: [{ title: "Nespracovaný doklad — Faktero" }] }),
  component: Detail,
});

const vstup = "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm";

/**
 * Nespracovaný doklad (ako v Doklado): vľavo doklad, vpravo vyťažené údaje.
 * Človek určí druh, opraví čo treba, zaúčtuje a „Vytvorí" — doklad sa
 * presunie do svojej sekcie. „Uložiť zmeny" ho nechá rozpracovaný.
 */
function Detail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const nacitaj = useServerFn(detailNespracovanehoFn);
  const uloz = useServerFn(ulozNespracovaneFn);
  const vytvor = useServerFn(vytvorZNespracovanehoFn);
  const zmaz = useServerFn(zmazNespracovaneFn);
  const docitaj = useServerFn(docitajNespracovanyFn);
  const nacitajNavrhy = useServerFn(navrhyKodovFn);

  const [d, setD] = useState<Awaited<ReturnType<typeof nacitaj>> | null>(null);
  const [druh, setDruh] = useState<DruhNespracovaneho | "">("");
  const [u, setU] = useState<UdajeNespracovaneho | null>(null);
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [busy, setBusy] = useState(false);
  const [nenajdene, setNenajdene] = useState<string | null>(null);
  const { vzhlad, zmen: zmenVzhlad } = useVzhladNespracovanych();

  async function obnov() {
    try {
      const r = await nacitaj({ data: { id } });
      setD(r);
      setDruh((r.druh as DruhNespracovaneho) ?? "");
      setU(r.udaje);
    } catch (e: any) {
      setNenajdene(e?.message ?? "Doklad sa nenašiel.");
    }
  }
  useEffect(() => {
    setD(null);
    setU(null);
    void obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Kým AI číta, doptávame sa.
  useEffect(() => {
    if (d?.stav !== "cita") return;
    const t = setInterval(() => void obnov(), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.stav]);

  const blocek = druh === "blocek";
  const faktura = druh === "faktura" || druh === "zalohova" || druh === "dobropis";
  useEffect(() => {
    if (!d || !druh || druh === "ostatny") return;
    nacitajNavrhy({ data: { company_id: d.companyId, pre: blocek ? "doklad" : "prijata" } })
      .then((r) => setNavrhy(r as Navrhy))
      .catch(() => setNavrhy(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.companyId, druh]);

  const chyby = useMemo(() => (u ? chybajuce(druh || null, u, d?.povinne ?? []) : []), [u, druh, d?.povinne]);
  const zle = (k: string) => chyby.includes(k);
  const ram = (k: string) => (zle(k) ? "border-red-500 ring-1 ring-red-300" : "border-input");
  const s = u ? sucty(u) : { zaklad: 0, dph: 0, celkom: 0 };
  const sadzby = useMemo(() => sadzbyKrajiny("SK", u?.datumVystavenia || null), [u?.datumVystavenia]);

  if (nenajdene)
    return (
      <>
        <PageHeader title="Nespracovaný doklad" />
        <PageBody>
          <p className="text-sm text-muted-foreground">{nenajdene}</p>
          <Link to="/nespracovane" className="mt-3 inline-block text-sm text-primary hover:underline">
            Späť na nespracované doklady
          </Link>
        </PageBody>
      </>
    );
  if (!d || !u)
    return (
      <>
        <PageHeader title="Nespracovaný doklad" />
        <PageBody>
          <p className="text-sm text-muted-foreground">Načítavam…</p>
        </PageBody>
      </>
    );

  const set = (z: Partial<UdajeNespracovaneho>) => setU({ ...u, ...z });
  const setDod = (z: Partial<UdajeNespracovaneho["dodavatel"]>) => setU({ ...u, dodavatel: { ...u.dodavatel, ...z } });
  const setRozpis = (i: number, z: Partial<UdajeNespracovaneho["rozpis"][number]>) =>
    set({ rozpis: u.rozpis.map((r, j) => (j === i ? { ...r, ...z } : r)), celkom: null });

  async function ulozZmeny() {
    setBusy(true);
    try {
      await uloz({ data: { id, druh: druh || null, udaje: u as any } });
      toast.success("Zmeny sú uložené — doklad ostáva v nespracovaných");
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  async function vytvorDoklad() {
    if (chyby.length) {
      toast.error(`Doplňte: ${chyby.map((k) => NAZVY_POLI[k] ?? k).join(", ")}`);
      return;
    }
    setBusy(true);
    try {
      const r = await vytvor({ data: { id, druh: druh as DruhNespracovaneho, udaje: u as any } });
      const kam =
        r.agenda === "prijata" ? "medzi prijaté faktúry" : r.agenda === "doklad" ? "medzi doklady" : "medzi ostatné doklady";
      toast.success(`Doklad je vytvorený a presunutý ${kam}`, {
        action: {
          label: "Otvoriť",
          onClick: () =>
            r.agenda === "prijata"
              ? navigate({ to: "/prijate-faktury/$id", params: { id: r.id } })
              : r.agenda === "doklad"
                ? navigate({ to: "/doklady/novy", search: { id: r.id } as any })
                : navigate({ to: "/ostatne-doklady/novy", search: { id: r.id } as any }),
        },
      });
      // Ako v Doklado: rovno ďalší nespracovaný doklad.
      if (d!.dalsiId) navigate({ to: "/nespracovane/$id", params: { id: d!.dalsiId } });
      else navigate({ to: "/nespracovane" });
    } catch (e: any) {
      toast.error(e?.message ?? "Doklad sa nepodarilo vytvoriť");
    } finally {
      setBusy(false);
    }
  }

  async function zmazDoklad() {
    if (!confirm("Presunúť doklad do koša?")) return;
    try {
      await zmaz({ data: { id } });
      toast.success("Doklad je v koši");
      navigate({ to: d!.dalsiId ? "/nespracovane/$id" : "/nespracovane", params: { id: d!.dalsiId ?? "" } } as any);
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    }
  }

  // Uloží rozpracované a nechá doklad prečítať znova — doplnia sa len prázdne polia.
  async function docitajDoklad() {
    if (!u) return;
    setBusy(true);
    try {
      await uloz({ data: { id, druh: druh || null, udaje: u as any } });
      await docitaj({ data: { id } });
      await obnov();
      toast.success("Čítam doklad znova — chýbajúce údaje sa doplnia");
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  // Prepínač rozloženia — voľba sa pamätá v účte používateľa.
  const prepinac = (
    <div className="flex flex-wrap items-center gap-2">
      {d.subor.url && d.stav !== "cita" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void docitajDoklad()}
          title="Prečíta doklad znova a doplní chýbajúce údaje (VS, IBAN, splatnosť, adresu). Vyplnené neprepíše."
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-60"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Dočítať z dokladu
        </button>
      ) : null}
    <div className="inline-flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Rozloženie">
      {(
        [
          ["klasicky", "Klasické"],
          ["kompaktny", "Kompaktné"],
        ] as const
      ).map(([k, n]) => (
        <button
          key={k}
          type="button"
          aria-pressed={vzhlad === k}
          onClick={() => void zmenVzhlad(k)}
          className={`rounded-md px-3 py-1.5 ${vzhlad === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
        >
          {n}
        </button>
      ))}
    </div>
    </div>
  );
  const nadpis = u.dodavatel.nazov ? `${u.dodavatel.nazov}${u.cislo ? ` — ${u.cislo}` : ""}` : "Nespracovaný doklad";

  if (vzhlad === "kompaktny")
    return (
      <>
        <PageHeader
          title={nadpis}
          description={`Nespracované doklady › ${d.subor.nazov ?? "doklad"}`}
          action={prepinac}
        />
        <PageBody>
          <NespracovanyKompaktny
            subor={d.subor}
            stav={d.stav}
            chybaCitania={d.chyba}
            varovania={d.varovania}
            druh={druh}
            setDruh={setDruh}
            u={u}
            setU={setU}
            navrhy={navrhy}
            chyby={chyby}
            sucty={s}
            sadzby={sadzby}
            busy={busy}
            onVytvor={() => void vytvorDoklad()}
            onUloz={() => void ulozZmeny()}
            onZmaz={() => void zmazDoklad()}
          />
        </PageBody>
      </>
    );

  const hodnotyKodov = {
    predkontacia: u.kody.predkontacia,
    clenenie: u.kody.clenenie,
    kategoria: u.kategoria,
    kv: u.kody.kv,
    stredisko: u.kody.stredisko,
    cinnost: u.kody.cinnost,
    rad: u.kody.rad,
    intPoznamka: u.kody.intPoznamka,
  };

  return (
    <>
      <PageHeader
        title={nadpis}
        description={
          d.stav === "cita"
            ? "Faktero doklad práve číta…"
            : "Určte druh dokladu, skontrolujte údaje, zaúčtujte a vytvorte. Povinné polia, ktoré chýbajú, sú červené."
        }
        action={prepinac}
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Doklad */}
          <div className="min-w-0 rounded-xl border border-border bg-card p-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
            {d.subor.url ? (
              <>
                {String(d.subor.mime ?? "").includes("pdf") ? (
                  <NahladPdf url={d.subor.url} />
                ) : (
                  <img src={d.subor.url} alt={d.subor.nazov ?? "Doklad"} className="w-full rounded-md" />
                )}
                <a
                  href={d.subor.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Otvoriť {d.subor.nazov ?? "súbor"}
                </a>
              </>
            ) : (
              <p className="p-6 text-sm text-muted-foreground">Doklad nemá súbor.</p>
            )}
          </div>

          {/* Údaje */}
          <div className="min-w-0 space-y-4">
            {d.stav === "cita" && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Čítam doklad — údaje sa doplnia samy.
              </div>
            )}
            {d.chyba && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{d.chyba}</div>}
            {d.varovania.map((v) => (
              <div key={v} role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {v}
              </div>
            ))}

            <section className="rounded-xl border border-border bg-card p-4">
              <label className="block text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Druh dokladu</span>
                <select
                  aria-label="Druh dokladu"
                  value={druh}
                  onChange={(e) => setDruh(e.target.value as DruhNespracovaneho)}
                  className={`${vstup} ${ram("druh")}`}
                >
                  <option value="">— vyberte —</option>
                  {DRUHY_NESPRACOVANYCH.map((x) => (
                    <option key={x.kluc} value={x.kluc}>
                      {x.nazov}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {druh === "ostatny" ? "Odosielateľ" : "Dodávateľ"}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="text-xs text-muted-foreground">Názov</span>
                  <input aria-label="Dodávateľ" value={u.dodavatel.nazov} onChange={(e) => setDod({ nazov: e.target.value })} className={`${vstup} ${ram("dodavatel")}`} />
                </label>
                {druh !== "ostatny" && (
                  <>
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">IČO</span>
                      <input value={u.dodavatel.ico} onChange={(e) => setDod({ ico: e.target.value })} className={`${vstup} border-input`} />
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">IČ DPH</span>
                      <input value={u.dodavatel.icDph} onChange={(e) => setDod({ icDph: e.target.value })} className={`${vstup} border-input`} />
                    </label>
                  </>
                )}
                {faktura && (
                  <>
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">DIČ</span>
                      <input value={u.dodavatel.dic} onChange={(e) => setDod({ dic: e.target.value })} className={`${vstup} border-input`} />
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">IBAN</span>
                      <input value={u.dodavatel.iban} onChange={(e) => setDod({ iban: e.target.value })} className={`${vstup} border-input`} />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="text-xs text-muted-foreground">Ulica a číslo</span>
                      <input value={u.dodavatel.ulica} onChange={(e) => setDod({ ulica: e.target.value })} className={`${vstup} border-input`} />
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">Mesto</span>
                      <input value={u.dodavatel.mesto} onChange={(e) => setDod({ mesto: e.target.value })} className={`${vstup} border-input`} />
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">PSČ</span>
                      <input value={u.dodavatel.psc} onChange={(e) => setDod({ psc: e.target.value })} className={`${vstup} border-input`} />
                    </label>
                  </>
                )}
              </div>
            </section>

            {druh === "ostatny" ? (
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-xs text-muted-foreground">Druh</span>
                    <select value={u.ostatny.druh} onChange={(e) => set({ ostatny: { ...u.ostatny, druh: e.target.value } })} className={`${vstup} border-input`}>
                      {DRUHY_OSTATNYCH.map((x) => (
                        <option key={x.kluc} value={x.kluc}>
                          {x.nazov}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs text-muted-foreground">Lehota</span>
                    <input type="date" value={u.ostatny.lehota} onChange={(e) => set({ ostatny: { ...u.ostatny, lehota: e.target.value } })} className={`${vstup} border-input`} />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="text-xs text-muted-foreground">Predmet</span>
                    <input value={u.ostatny.predmet} onChange={(e) => set({ ostatny: { ...u.ostatny, predmet: e.target.value } })} className={`${vstup} border-input`} />
                  </label>
                </div>
              </section>
            ) : druh ? (
              <>
                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Doklad</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">Číslo dokladu</span>
                      <input aria-label="Číslo dokladu" value={u.cislo} onChange={(e) => set({ cislo: e.target.value })} className={`${vstup} ${ram("cislo")}`} />
                    </label>
                    {faktura && (
                      <label className="block text-sm sm:col-span-2">
                        <span className="text-xs text-muted-foreground">Popis plnenia (text faktúry v Pohode)</span>
                        <input value={u.popis ?? ""} onChange={(e) => set({ popis: e.target.value })} className={`${vstup} border-input`} />
                      </label>
                    )}
                    {faktura && (
                      <label className="block text-sm">
                        <span className="text-xs text-muted-foreground">Variabilný symbol</span>
                        <input value={u.vs} onChange={(e) => set({ vs: e.target.value })} className={`${vstup} border-input`} />
                      </label>
                    )}
                    {faktura && (
                      <label className="block text-sm">
                        <span className="text-xs text-muted-foreground">Konštantný / špecifický symbol</span>
                        <div className="flex gap-2">
                          <input aria-label="Konštantný symbol" placeholder="KS" maxLength={4} value={u.ks ?? ""} onChange={(e) => set({ ks: e.target.value })} className={`${vstup} border-input`} />
                          <input aria-label="Špecifický symbol" placeholder="ŠS" maxLength={10} value={u.ss ?? ""} onChange={(e) => set({ ss: e.target.value })} className={`${vstup} border-input`} />
                        </div>
                      </label>
                    )}
                    {faktura && (
                      <label className="block text-sm">
                        <span className="text-xs text-muted-foreground">Číslo objednávky</span>
                        <input value={u.objednavka ?? ""} onChange={(e) => set({ objednavka: e.target.value })} className={`${vstup} border-input`} />
                      </label>
                    )}
                    {faktura && (
                      <label className="block text-sm">
                        <span className="text-xs text-muted-foreground">Číslo dodacieho listu</span>
                        <input value={u.dodaciList ?? ""} onChange={(e) => set({ dodaciList: e.target.value })} className={`${vstup} border-input`} />
                      </label>
                    )}
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">Dátum vystavenia</span>
                      <input type="date" aria-label="Dátum vystavenia" value={u.datumVystavenia} onChange={(e) => set({ datumVystavenia: e.target.value })} className={`${vstup} ${ram("datumVystavenia")}`} />
                    </label>
                    {faktura && (
                      <>
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">Dátum dodania (DUZP)</span>
                          <input type="date" value={u.datumDodania} onChange={(e) => set({ datumDodania: e.target.value })} className={`${vstup} border-input`} />
                        </label>
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">Splatnosť</span>
                          <input type="date" aria-label="Splatnosť" value={u.splatnost} onChange={(e) => set({ splatnost: e.target.value })} className={`${vstup} ${ram("splatnost")}`} />
                        </label>
                      </>
                    )}
                    {druh === "dobropis" && (
                      <label className="block text-sm">
                        <span className="text-xs text-muted-foreground">Opravuje faktúru č.</span>
                        <input value={u.opravuje} onChange={(e) => set({ opravuje: e.target.value })} className={`${vstup} ${ram("opravuje")}`} />
                      </label>
                    )}
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">Spôsob úhrady</span>
                      <select aria-label="Spôsob úhrady" value={u.platba} onChange={(e) => set({ platba: e.target.value })} className={`${vstup} ${ram("platba")}`}>
                        <option value="">{blocek ? "— vyberte —" : "prevodom (predvolené)"}</option>
                        <option value="hotovost">Hotovosťou</option>
                        <option value="karta">Kartou</option>
                        <option value="prevod">Prevodom</option>
                        {faktura && <option value="inkaso">Inkasom</option>}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs text-muted-foreground">Mena</span>
                      <input value={u.mena} maxLength={3} onChange={(e) => set({ mena: e.target.value.toUpperCase() })} className={`${vstup} border-input`} />
                    </label>
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sumy podľa sadzieb DPH</span>
                    <button type="button" onClick={() => set({ rozpis: [...u.rozpis, { sadzba: sadzby[0] ?? 23, zaklad: 0, dph: 0 }], celkom: null })} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <Plus className="h-3.5 w-3.5" /> Pridať sadzbu
                    </button>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-2 font-medium">Sadzba</th>
                        <th className="py-1 pr-2 text-right font-medium">Základ</th>
                        <th className="py-1 pr-2 text-right font-medium">DPH</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {u.rozpis.map((r, i) => (
                        <tr key={i}>
                          <td className="py-1 pr-2">
                            <select value={String(r.sadzba)} onChange={(e) => setRozpis(i, { sadzba: Number(e.target.value) })} className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                              {[...new Set([...sadzby, 0, Number(r.sadzba)])].map((x) => (
                                <option key={x} value={x}>
                                  {x} %
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1 pr-2">
                            <input inputMode="decimal" value={String(r.zaklad)} onChange={(e) => {
                              const z = Number(e.target.value.replace(",", ".")) || 0;
                              setRozpis(i, { zaklad: z, dph: Math.round(z * Number(r.sadzba)) / 100 });
                            }} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm tabular-nums" />
                          </td>
                          <td className="py-1 pr-2">
                            <input inputMode="decimal" value={String(r.dph)} onChange={(e) => setRozpis(i, { dph: Number(e.target.value.replace(",", ".")) || 0 })} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm tabular-nums" />
                          </td>
                          <td className="py-1 text-right">
                            <button type="button" aria-label="Odstrániť sadzbu" onClick={() => set({ rozpis: u.rozpis.filter((_, j) => j !== i), celkom: null })} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className={`mt-2 flex flex-wrap items-center justify-end gap-3 text-sm ${zle("celkom") ? "text-red-600" : ""}`}>
                    <span className="text-muted-foreground">Základ {s.zaklad.toFixed(2)} · DPH {s.dph.toFixed(2)}</span>
                    <label className="inline-flex items-center gap-2 font-medium">
                      Spolu
                      <input aria-label="Suma spolu" inputMode="decimal" value={u.celkom ?? s.celkom} onChange={(e) => set({ celkom: Number(e.target.value.replace(",", ".")) || 0 })} className={`w-28 rounded-md border bg-background px-2 py-1.5 text-right tabular-nums ${ram("celkom")}`} />
                      {u.mena}
                    </label>
                  </div>
                  {druh === "dobropis" && <p className="mt-1 text-xs text-muted-foreground">Sumy zadajte kladne — dobropis ich odpočíta sám.</p>}
                </section>

                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Položky</div>
                  <PolozkyNespracovaneho u={u} setU={setU} sadzby={sadzby} />
                </section>

                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Zaúčtovanie</div>
                  <PoliaZauctovania
                    navrhy={navrhy}
                    hodnoty={hodnotyKodov}
                    setHodnoty={(h: any) =>
                      setU({
                        ...u,
                        kategoria: h.kategoria ?? "",
                        kody: {
                          predkontacia: h.predkontacia ?? "",
                          clenenie: h.clenenie ?? "",
                          kv: h.kv ?? "",
                          stredisko: h.stredisko ?? "",
                          cinnost: h.cinnost ?? "",
                          rad: h.rad ?? "",
                          intPoznamka: h.intPoznamka ?? "",
                        },
                      })
                    }
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Prázdne pole = predvolené z{" "}
                    <Link to="/uctovnictvo/predkontacie" className="underline">
                      nastavení predkontácií
                    </Link>
                    .
                  </p>
                </section>
              </>
            ) : null}

            {druh ? (
              <section className="rounded-xl border border-border bg-card p-4">
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">Poznámka</span>
                  <textarea rows={2} value={u.poznamka} onChange={(e) => set({ poznamka: e.target.value })} className={`${vstup} border-input`} />
                  <PreddefinovanaPoznamka companyId={d.companyId} onVyber={(t) => set({ poznamka: u.poznamka ? `${u.poznamka}\n${t}` : t })} />
                </label>
              </section>
            ) : null}

            <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 p-3 pr-24 backdrop-blur">
              <button type="button" disabled={busy || d.stav === "cita"} onClick={vytvorDoklad} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Vytvoriť
              </button>
              <button type="button" disabled={busy} onClick={ulozZmeny} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-60">
                Uložiť zmeny
              </button>
              {chyby.length > 0 && druh ? (
                <span className="text-xs text-red-600">Chýba: {chyby.map((k) => NAZVY_POLI[k] ?? k).join(", ")}</span>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void zmazDoklad()}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> Zmazať
              </button>
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}
