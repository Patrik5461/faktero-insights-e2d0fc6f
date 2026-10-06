import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, Pencil, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { KodPohody } from "@/components/faktero/KodPohody";
import { PomerEditor, type PomerHodnota } from "@/components/faktero/PomerEditor";
import { OZNACENIA } from "@/lib/faktero/vypis-oznacenie";
import { KATEGORIE_VYDAVKOV } from "@/lib/mobile/kategorie-vydavkov";
import {
  AGENDY,
  PREDVOLENE,
  STLPCE_PREDVOLENYCH,
  nazovAgendy,
  ponuka,
  ziadostCiselnikov,
  DRUHY_CISELNIKA,
  RADY_POHODY,
  type DruhCiselnika,
} from "@/lib/faktero/predkontacie";
import {
  importCiselnikaFn,
  nacitatZPohodyFn,
  predkontacieFn,
  ulozPredkontaciuFn,
  ulozPredvoleneFn,
  zmazPredkontaciuFn,
} from "@/lib/faktero/predkontacie.functions";

/**
 * Predkontácie a členenia DPH — číselník z Pohody a predvolené kódy podľa
 * druhu dokladu (vydaná faktúra, prijatá faktúra, bloček, pokladňa, banka).
 *
 * Ako v Doklado: kódy sa naťahajú z účtovného programu a pri doklade sa potom
 * vyberajú s popisom, nie píšu naslepo.
 */
export const Route = createFileRoute("/_authenticated/uctovnictvo/predkontacie")({
  head: () => ({ meta: [{ title: "Predkontácie — Faktero" }] }),
  component: Stranka,
});

type Zaznam = {
  id: string;
  druh: DruhCiselnika;
  kod: string;
  popis: string | null;
  agenda: string;
  ucet_md: string | null;
  ucet_d: string | null;
  zdroj: string;
  aktivne: boolean;
  druhy_dokladov: string[];
  kategoria: string | null;
  pomer: PomerHodnota;
};

const ZDROJ: Record<string, string> = { pohoda: "Pohoda", subor: "súbor", rucne: "ručne" };
const vstup = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const kedy = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("sk-SK", { dateStyle: "medium", timeStyle: "short" }) : "";

function Stranka() {
  const companyId = getActiveCompanyId();
  const nacitaj = useServerFn(predkontacieFn);
  const [zaznamy, setZaznamy] = useState<Zaznam[] | null>(null);
  const [firma, setFirma] = useState<Record<string, any>>({});

  const obnov = useCallback(async () => {
    if (!companyId) return;
    try {
      const r = await nacitaj({ data: { company_id: companyId } });
      setZaznamy(r.zaznamy as Zaznam[]);
      setFirma(r.firma);
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa načítať");
      setZaznamy([]);
    }
  }, [companyId, nacitaj]);

  useEffect(() => {
    obnov();
  }, [obnov]);

  if (!companyId || zaznamy === null)
    return (
      <>
        <PageHeader title="Predkontácie" />
        <PageBody>
          <p className="text-sm text-muted-foreground">Načítavam…</p>
        </PageBody>
      </>
    );

  return (
    <>
      <PageHeader
        title="Predkontácie"
        description="Číselník predkontácií a členení DPH z Pohody a čo sa predvolene použije pri faktúrach, prijatých faktúrach, bločkoch, pokladni a banke."
      />
      <PageBody>
        <div className="space-y-4">
          <Predvolene companyId={companyId} firma={firma} zaznamy={zaznamy} onUlozene={obnov} />
          <Import companyId={companyId} firma={firma} onZmena={obnov} />
          <Ciselnik companyId={companyId} zaznamy={zaznamy} onZmena={obnov} />
        </div>
      </PageBody>
    </>
  );
}

/* ------------------------------------------------------------ predvolené */

function Predvolene({
  companyId,
  firma,
  zaznamy,
  onUlozene,
}: {
  companyId: string;
  firma: Record<string, any>;
  zaznamy: Zaznam[];
  onUlozene: () => void;
}) {
  const uloz = useServerFn(ulozPredvoleneFn);
  const [h, setH] = useState<Record<string, string>>({});
  const [oznaceni, setOznaceni] = useState<Record<string, string>>({});
  const [blockyAgenda, setBlockyAgenda] = useState<"faktura" | "podla_platby">("podla_platby");
  const [pokladna, setPokladna] = useState("");
  const [odkazNaDoklady, setOdkazNaDoklady] = useState(true);
  const [polozkyBlockov, setPolozkyBlockov] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setH(Object.fromEntries(STLPCE_PREDVOLENYCH.map((s) => [s, String(firma[s] ?? "")])));
    setOznaceni({ ...((firma.pohoda_predkontacie_oznaceni as Record<string, string> | null) ?? {}) });
    setBlockyAgenda(firma.pohoda_blocky_agenda === "faktura" ? "faktura" : "podla_platby");
    setPokladna(String(firma.pohoda_pokladna ?? ""));
    setOdkazNaDoklady(firma.pohoda_odkaz_na_doklady !== false);
    setPolozkyBlockov(Boolean(firma.pohoda_polozky_blockov));
  }, [firma]);

  const pocetNaVyber = (kluc: string, druh: DruhCiselnika) =>
    zaznamy.filter((z) => z.druh === druh && z.aktivne && z.druhy_dokladov?.includes(kluc)).length;

  async function ulozit() {
    setBusy(true);
    try {
      await uloz({
        data: { company_id: companyId, hodnoty: h, oznaceni, blockyAgenda, pokladna, odkazNaDoklady, polozkyBlockov },
      });
      toast.success("Uložené");
      onUlozene();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa uložiť");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Predvolené podľa druhu dokladu
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Použije sa, keď doklad nemá vlastnú predkontáciu — tú mu dá{" "}
        <Link to="/uctovnictvo/pravidla" className="underline">
          pravidlo účtovania
        </Link>{" "}
        alebo človek pri zaúčtovaní. Prázdne pole = Pohoda doklad nechá nezaúčtovaný.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Doklad</th>
              <th className="py-1 pr-3 font-medium">Predkontácia</th>
              <th className="py-1 font-medium">Členenie DPH</th>
            </tr>
          </thead>
          <tbody>
            {PREDVOLENE.map((p) => (
              <tr key={p.kluc} className="border-t border-border align-top">
                <td className="py-2 pr-3">
                  {p.nazov}
                  {pocetNaVyber(p.kluc, "predkontacia") + pocetNaVyber(p.kluc, "clenenie_dph") > 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      kódov len pre tento doklad:{" "}
                      {pocetNaVyber(p.kluc, "predkontacia") + pocetNaVyber(p.kluc, "clenenie_dph")}
                    </span>
                  ) : null}
                  {p.kluc === "doklady" && !h[p.predkontacia] && h.pohoda_predkontacia_prijata ? (
                    <span className="block text-xs text-muted-foreground">
                      prázdne = ako prijatá faktúra
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3">
                  {p.predkontacia ? (
                    <KodPohody
                      ariaLabel={`Predkontácia — ${p.nazov}`}
                      value={h[p.predkontacia] ?? ""}
                      onChange={(v) => setH({ ...h, [p.predkontacia]: v })}
                      moznosti={ponuka(zaznamy, "predkontacia", p.agendy, p.kluc)}
                      placeholder={
                        p.kluc === "doklady" ? h.pohoda_predkontacia_prijata || "napr. 5Fp" : "—"
                      }
                      className={vstup}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">ako vydaná faktúra</span>
                  )}
                </td>
                <td className="py-2">
                  {p.clenenie ? (
                    <KodPohody
                      ariaLabel={`Členenie DPH — ${p.nazov}`}
                      value={h[p.clenenie] ?? ""}
                      onChange={(v) => setH({ ...h, [p.clenenie!]: v })}
                      moznosti={ponuka(zaznamy, "clenenie_dph", [], p.kluc)}
                      vyber
                      placeholder={
                        p.kluc === "doklady" ? h.pohoda_clenenie_dph_prijata || "—" : "—"
                      }
                      className={vstup}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <fieldset className="mt-4 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Bločky do Pohody</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="blocky-agenda"
            checked={blockyAgenda === "podla_platby"}
            onChange={() => setBlockyAgenda("podla_platby")}
            className="mt-1"
          />
          <span>
            Podľa spôsobu platby (ako Doklado)
            <span className="block text-xs text-muted-foreground">
              Hotovosť ako výdavkový pokladničný doklad, karta ako interný doklad, prevod ako prijatá
              faktúra.
            </span>
          </span>
        </label>
        {blockyAgenda === "podla_platby" && (
          <label className="ml-6 mt-2 block max-w-xs">
            <span className="text-xs text-muted-foreground">Skratka pokladne v Pohode</span>
            <input
              value={pokladna}
              onChange={(e) => setPokladna(e.target.value)}
              placeholder="napr. HP"
              aria-label="Skratka pokladne v Pohode"
              className={vstup}
            />
            {!pokladna.trim() && (
              <span className="mt-1 block text-xs text-amber-700">
                Bez skratky pokladne Pohoda pokladničný doklad nezaloží — hotovostné bločky pôjdu
                zatiaľ ako prijaté faktúry.
              </span>
            )}
          </label>
        )}
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="blocky-agenda"
            checked={blockyAgenda === "faktura"}
            onChange={() => setBlockyAgenda("faktura")}
            className="mt-1"
          />
          <span>
            Všetky ako prijaté faktúry
            <span className="block text-xs text-muted-foreground">
              Doklad sa zaúčtuje ako záväzok a úhradu spáruje účtovníčka.
            </span>
          </span>
        </label>
        <label className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm">
          <input
            type="checkbox"
            checked={polozkyBlockov}
            onChange={(e) => setPolozkyBlockov(e.target.checked)}
            className="mt-1"
          />
          <span>
            Posielať aj položky bločku
            <span className="block text-xs text-muted-foreground">
              Inak ide len súhrn po sadzbách DPH. Položky idú v cenách s DPH, tak ako sú na bločku.
              Doklad s ďalšími pokladňami vyberiete v záložke Pokladne v číselníku nižšie.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="mt-4 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Číselné rady a stredisko v Pohode</legend>
        <p className="text-xs text-muted-foreground">
          Predpona radu, do ktorého Pohoda doklad očísluje. Prázdne = predvolený rad v Pohode.
          Doklad môže mať vlastný rad v zaúčtovaní.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RADY_POHODY.map((r) => (
            <label key={r.stlpec} className="block">
              <span className="text-xs text-muted-foreground">{r.nazov}</span>
              <KodPohody
                ariaLabel={`Číselný rad — ${r.nazov}`}
                value={h[r.stlpec] ?? ""}
                onChange={(v) => setH({ ...h, [r.stlpec]: v })}
                moznosti={ponuka(zaznamy, "ciselny_rad").sort(
                  (a, b) => Number(b.agenda.startsWith(r.agenda)) - Number(a.agenda.startsWith(r.agenda)),
                )}
                placeholder="predvolený v Pohode"
                className={vstup}
                vyber
              />
            </label>
          ))}
          <label className="block">
            <span className="text-xs text-muted-foreground">Predvolené stredisko</span>
            <KodPohody
              ariaLabel="Predvolené stredisko"
              value={h.pohoda_stredisko ?? ""}
              onChange={(v) => setH({ ...h, pohoda_stredisko: v })}
              moznosti={ponuka(zaznamy, "stredisko")}
              placeholder="—"
              className={vstup}
              vyber
            />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={odkazNaDoklady}
            onChange={(e) => setOdkazNaDoklady(e.target.checked)}
            className="mt-1"
          />
          <span>
            Prikladať odkaz na sken bločkov a prijatých faktúr
            <span className="block text-xs text-muted-foreground">
              Doklad má v Pohode v záložke Dokumenty odkaz, ktorým sa otvorí sken. Odkaz je dlhý
              náhodný reťazec.
            </span>
          </span>
        </label>
      </fieldset>

      <label className="mt-4 block max-w-md">
        <span className="text-xs text-muted-foreground">
          Predkontácia hlavičky pri rozúčtovanom doklade
        </span>
        <KodPohody
          ariaLabel="Predkontácia hlavičky pri rozúčtovaní"
          value={h.pohoda_predkontacia_rozuctovat ?? ""}
          onChange={(v) => setH({ ...h, pohoda_predkontacia_rozuctovat: v })}
          moznosti={ponuka(zaznamy, "predkontacia")}
          placeholder="Rozúčtovať"
          className={vstup}
        />
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Keď je doklad rozúčtovaný na viac predkontácií, hlavička v Pohode dostane tento kód a
          predkontácie nesú položky. Prázdne = „Rozúčtovať“.
        </span>
      </label>

      <details className="mt-4 rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Bankové pohyby podľa označenia platby
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Pri{" "}
          <Link to="/uctovnictvo/vypis-do-pohody" className="underline">
            bankovom výpise
          </Link>{" "}
          dostane pohyb s týmto označením vlastnú predkontáciu. Prázdne = predkontácia bankového
          dokladu.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {OZNACENIA.map((o) => (
            <label key={o.kod} className="block">
              <span className="text-xs text-muted-foreground">{o.nazov}</span>
              <KodPohody
                value={oznaceni[o.kod] ?? ""}
                onChange={(v) => setOznaceni({ ...oznaceni, [o.kod]: v })}
                moznosti={ponuka(zaznamy, "predkontacia", ["bankIssued", "bankReceived"])}
                placeholder={h.pohoda_predkontacia_banka || "napr. 3Bv"}
              />
            </label>
          ))}
        </div>
      </details>

      <div className="mt-4 flex justify-end">
        <button
          onClick={ulozit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Uložiť predvolené
        </button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- import */

function Import({
  companyId,
  firma,
  onZmena,
}: {
  companyId: string;
  firma: Record<string, any>;
  onZmena: () => void;
}) {
  const prepni = useServerFn(nacitatZPohodyFn);
  const importuj = useServerFn(importCiselnikaFn);
  const subor = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const caka = Boolean(firma.pohoda_nacitat_ciselniky);

  async function konektor(zapnut: boolean) {
    setBusy("konektor");
    try {
      await prepni({ data: { company_id: companyId, zapnut } });
      toast.success(
        zapnut
          ? "Pri najbližšom behu konektora si Faktero vypýta predkontácie a členenia DPH."
          : "Žiadosť zrušená",
      );
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(null);
    }
  }

  function stiahniZiadost() {
    const blob = new Blob([ziadostCiselnikov(firma.ico)], { type: "text/xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "faktero-ziadost-predkontacie.xml";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function nahraj(f: File) {
    if (f.size > 5 * 1024 * 1024) return toast.error("Súbor je väčší ako 5 MB.");
    setBusy("subor");
    try {
      const b = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
      const r = await importuj({ data: { company_id: companyId, nazov: f.name, base64: btoa(bin) } });
      toast.success(
        `Načítané: ${r.predkontacii} predkontácií, ${r.cleneni} členení DPH` +
          (r.ostatnych ? `, ${r.ostatnych} stredísk, činností a radov` : "") +
          (r.vypnutych ? ` · ${r.vypnutych} už v Pohode nie je, vypnuté` : ""),
      );
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Súbor sa nepodarilo načítať");
    } finally {
      setBusy(null);
      if (subor.current) subor.current.value = "";
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Načítať z Pohody
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {firma.pohoda_ciselniky_nacitane_at
          ? `Naposledy načítané z Pohody ${kedy(firma.pohoda_ciselniky_nacitane_at)}.`
          : "Z Pohody sa ešte nič nenačítalo."}{" "}
        Opakované načítanie prepíše popisy a účty, nič nezdvojí; kódy, ktoré v Pohode už nie sú,
        sa vypnú.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-border p-3">
          <div className="text-sm font-medium">1. Konektorom</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Keď beží{" "}
            <Link to="/uctovnictvo/pohoda" className="underline">
              konektor Pohody
            </Link>
            , pri ďalšom behu si číselníky vypýta sám.
          </p>
          {caka ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Čaká na konektor
              </span>
              <button
                onClick={() => konektor(false)}
                disabled={!!busy}
                className="text-xs underline disabled:opacity-50"
              >
                Zrušiť
              </button>
            </div>
          ) : (
            <button
              onClick={() => konektor(true)}
              disabled={!!busy}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "konektor" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Načítať pri ďalšom behu
            </button>
          )}
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="text-sm font-medium">2. XML súborom</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Žiadosť načítajte v Pohode cez Súbor → Dátová komunikácia → XML import a odpoveď, ktorú
            Pohoda uloží, nahrajte sem.
          </p>
          <button
            onClick={stiahniZiadost}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            <Download className="h-4 w-4" /> Stiahnuť žiadosť
          </button>
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="text-sm font-medium">3. Nahrať súbor</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Odpoveď Pohody (XML), alebo tabuľka CSV či Excel so stĺpcami Kód, Popis, prípadne
            Agenda, MD, D.
          </p>
          <input
            ref={subor}
            type="file"
            accept=".xml,.csv,.xlsx,.xls,.ods,text/xml,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) nahraj(f);
            }}
          />
          <button
            onClick={() => subor.current?.click()}
            disabled={!!busy}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {busy === "subor" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Nahrať súbor
          </button>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- číselník */

const PRAZDNY = {
  id: null as string | null,
  kod: "",
  popis: "",
  agenda: "",
  ucet_md: "",
  ucet_d: "",
  aktivne: true,
  druhy_dokladov: [] as string[],
  kategoria: "",
  pomer: null as PomerHodnota,
};

function Ciselnik({
  companyId,
  zaznamy,
  onZmena,
}: {
  companyId: string;
  zaznamy: Zaznam[];
  onZmena: () => void;
}) {
  const uloz = useServerFn(ulozPredkontaciuFn);
  const zmaz = useServerFn(zmazPredkontaciuFn);
  const [druh, setDruh] = useState<DruhCiselnika>("predkontacia");
  const [hladaj, setHladaj] = useState("");
  const [agenda, setAgenda] = useState("");
  const [vsetky, setVsetky] = useState(false);
  const [form, setForm] = useState<typeof PRAZDNY | null>(null);
  const [busy, setBusy] = useState(false);

  const pocty = Object.fromEntries(
    DRUHY_CISELNIKA.map((d) => [d.kod, zaznamy.filter((z) => z.druh === d.kod).length]),
  ) as Record<DruhCiselnika, number>;
  const jednotne = DRUHY_CISELNIKA.find((d) => d.kod === druh)?.jednotne ?? "kód";
  const agendyVZozname = useMemo(
    () => [...new Set(zaznamy.filter((z) => z.druh === druh).map((z) => z.agenda))].sort(),
    [zaznamy, druh],
  );
  const riadky = zaznamy.filter((z) => {
    if (z.druh !== druh) return false;
    if (!vsetky && !z.aktivne) return false;
    if (agenda && z.agenda !== agenda) return false;
    const q = hladaj.trim().toLowerCase();
    return !q || `${z.kod} ${z.popis ?? ""} ${z.ucet_md ?? ""} ${z.ucet_d ?? ""}`.toLowerCase().includes(q);
  });

  async function ulozit() {
    if (!form) return;
    setBusy(true);
    try {
      await uloz({ data: { company_id: companyId, druh, ...form } });
      toast.success("Uložené");
      setForm(null);
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa uložiť");
    } finally {
      setBusy(false);
    }
  }

  async function prepniAktivne(z: Zaznam) {
    try {
      await uloz({ data: { company_id: companyId, ...z, aktivne: !z.aktivne } });
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    }
  }

  async function zmazat(ids: string[], otazka: string) {
    if (!confirm(otazka)) return;
    try {
      await zmaz({ data: { company_id: companyId, ids } });
      toast.success("Zmazané");
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa zmazať");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-md bg-muted p-1 text-sm" role="tablist">
          {DRUHY_CISELNIKA.map(({ kod: k, nazov: n }) => (
            <button
              key={k}
              role="tab"
              aria-selected={druh === k}
              onClick={() => {
                setDruh(k);
                setAgenda("");
                setForm(null);
              }}
              className={`rounded px-3 py-1 ${druh === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
            >
              {n} <span className="text-xs text-muted-foreground">({pocty[k]})</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setForm({ ...PRAZDNY })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Pridať {jednotne}
        </button>
      </div>

      {form && (
        <div className="mt-4 grid gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:grid-cols-6">
          <label className="block sm:col-span-1">
            <span className="text-xs text-muted-foreground">Kód</span>
            <input
              value={form.kod}
              onChange={(e) => setForm({ ...form, kod: e.target.value })}
              className={vstup}
              placeholder={
                druh === "predkontacia"
                  ? "1Fp"
                  : druh === "clenenie_dph"
                    ? "PD"
                    : druh === "ciselny_rad"
                      ? "26FP"
                      : druh === "pokladna"
                        ? "HP"
                        : "BA"
              }
              autoFocus
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs text-muted-foreground">Popis</span>
            <input
              value={form.popis}
              onChange={(e) => setForm({ ...form, popis: e.target.value })}
              className={vstup}
              placeholder={druh === "predkontacia" ? "Nákup materiálu" : "Tuzemské plnenie"}
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="text-xs text-muted-foreground">
              {druh === "predkontacia" ? "Agenda" : "Typ"}
            </span>
            {druh === "predkontacia" ? (
              <select
                value={form.agenda}
                onChange={(e) => setForm({ ...form, agenda: e.target.value })}
                className={vstup}
              >
                <option value="">všetky</option>
                {AGENDY.map((a) => (
                  <option key={a.kod} value={a.kod}>
                    {a.nazov}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form.agenda}
                onChange={(e) => setForm({ ...form, agenda: e.target.value })}
                className={vstup}
                placeholder="napr. prijaté plnenia"
              />
            )}
          </label>
          {druh === "predkontacia" ? (
            <>
              <label className="block">
                <span className="text-xs text-muted-foreground">MD</span>
                <input
                  value={form.ucet_md}
                  onChange={(e) => setForm({ ...form, ucet_md: e.target.value })}
                  className={vstup}
                  placeholder="501"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">D</span>
                <input
                  value={form.ucet_d}
                  onChange={(e) => setForm({ ...form, ucet_d: e.target.value })}
                  className={vstup}
                  placeholder="321"
                />
              </label>
            </>
          ) : (
            <div className="sm:col-span-2" />
          )}
          <div className="sm:col-span-4">
            <span className="text-xs text-muted-foreground">
              Ponúkať pri dokladoch (nič nezaškrtnuté = všade)
            </span>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {PREDVOLENE.filter((p) => (druh === "clenenie_dph" ? p.clenenie : p.predkontacia)).map((p) => (
                <label key={p.kluc} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={form.druhy_dokladov.includes(p.kluc)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        druhy_dokladov: e.target.checked
                          ? [...form.druhy_dokladov, p.kluc]
                          : form.druhy_dokladov.filter((k) => k !== p.kluc),
                      })
                    }
                  />
                  {p.nazov}
                </label>
              ))}
            </div>
          </div>
          <label className="block sm:col-span-2">
            <span className="text-xs text-muted-foreground">Použiť sám pre kategóriu nákladu</span>
            <select
              value={form.kategoria}
              onChange={(e) => setForm({ ...form, kategoria: e.target.value })}
              className={vstup}
            >
              <option value="">—</option>
              {KATEGORIE_VYDAVKOV.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {k.nazov}
                </option>
              ))}
            </select>
          </label>
          {druh === "predkontacia" && (
            <div className="sm:col-span-6">
              <PomerEditor
                value={form.pomer}
                onChange={(pomer) => setForm({ ...form, pomer })}
                predkontacie={ponuka(zaznamy, "predkontacia")}
                clenenia={ponuka(zaznamy, "clenenie_dph")}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-6">
            <p className="mr-auto text-xs text-muted-foreground">
              Kód musí byť rovnaký ako v Pohode, inak ho Pohoda pri importe nenájde.
            </p>
            <button
              onClick={() => setForm(null)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Zrušiť
            </button>
            <button
              onClick={ulozit}
              disabled={busy || !form.kod.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Uložiť
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={hladaj}
          onChange={(e) => setHladaj(e.target.value)}
          placeholder="Hľadať kód, popis alebo účet"
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
        {agendyVZozname.length > 1 && (
          <select
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            aria-label="Agenda"
          >
            <option value="">Všetky agendy</option>
            {agendyVZozname.map((a) => (
              <option key={a} value={a}>
                {druh === "predkontacia" ? nazovAgendy(a) : a || "bez typu"}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={vsetky} onChange={(e) => setVsetky(e.target.checked)} />
          aj vypnuté
        </label>
      </div>

      {riadky.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {pocty[druh] === 0
            ? "Číselník je prázdny. Načítajte ho z Pohody vyššie alebo pridajte kód ručne."
            : "Nič nevyhovuje filtru."}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Kód</th>
                <th className="py-1 pr-3 font-medium">Popis</th>
                <th className="py-1 pr-3 font-medium">{druh === "predkontacia" ? "Agenda" : "Typ"}</th>
                {druh === "predkontacia" && <th className="py-1 pr-3 font-medium">MD / D</th>}
                <th className="py-1 pr-3 font-medium">Použitie</th>
                <th className="py-1 pr-3 font-medium">Zdroj</th>
                <th className="py-1 pr-3 font-medium">Aktívne</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {riadky.map((z) => (
                <tr key={z.id} className={`border-t border-border ${z.aktivne ? "" : "opacity-50"}`}>
                  <td className="py-1.5 pr-3 font-mono font-medium">{z.kod}</td>
                  <td className="py-1.5 pr-3">
                    {z.popis ?? "—"}
                    {z.pomer ? (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800">
                        {z.pomer.typ === "dph5050"
                          ? `pomer ${z.pomer.zaklad} %, DPH 50 %`
                          : `pomer ${z.pomer.casti.map((c) => `${c.podiel}`).join("/")}`}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {druh === "predkontacia" ? nazovAgendy(z.agenda) : z.agenda || "—"}
                  </td>
                  {druh === "predkontacia" && (
                    <td className="py-1.5 pr-3 font-mono text-xs">
                      {z.ucet_md || z.ucet_d ? `${z.ucet_md ?? "—"} / ${z.ucet_d ?? "—"}` : "—"}
                    </td>
                  )}
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                    {z.druhy_dokladov?.length
                      ? z.druhy_dokladov
                          .map((k) => PREDVOLENE.find((p) => p.kluc === k)?.nazov ?? k)
                          .join(", ")
                      : "všade"}
                    {z.kategoria ? (
                      <span className="block text-foreground">
                        kategória: {KATEGORIE_VYDAVKOV.find((k) => k.kod === z.kategoria)?.nazov ?? z.kategoria}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">{ZDROJ[z.zdroj] ?? z.zdroj}</td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="checkbox"
                      checked={z.aktivne}
                      onChange={() => prepniAktivne(z)}
                      aria-label={`Aktívne ${z.kod}`}
                    />
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <button
                      onClick={() =>
                        setForm({
                          id: z.id,
                          kod: z.kod,
                          popis: z.popis ?? "",
                          agenda: z.agenda,
                          ucet_md: z.ucet_md ?? "",
                          ucet_d: z.ucet_d ?? "",
                          aktivne: z.aktivne,
                          druhy_dokladov: z.druhy_dokladov ?? [],
                          kategoria: z.kategoria ?? "",
                          pomer: z.pomer ?? null,
                        })
                      }
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label={`Upraviť ${z.kod}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => zmazat([z.id], `Zmazať ${z.kod} z číselníka? Doklady, ktoré ho už majú, sa nezmenia.`)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      aria-label={`Zmazať ${z.kod}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {riadky.length > 1 && (
            <div className="mt-3 text-right">
              <button
                onClick={() =>
                  zmazat(
                    riadky.map((r) => r.id),
                    `Zmazať všetkých ${riadky.length} zobrazených záznamov? Doklady, ktoré ich už majú, sa nezmenia.`,
                  )
                }
                className="text-xs text-muted-foreground underline hover:text-destructive"
              >
                Zmazať zobrazené ({riadky.length})
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
