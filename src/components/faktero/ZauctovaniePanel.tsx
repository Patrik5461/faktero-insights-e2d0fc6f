import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookCheck, Download, Loader2, MoveRight, Undo2 } from "lucide-react";
import {
  exportPrijatychPohodaFn,
  presunPrijatuDoDokladovFn,
  vratZPohodyFn,
} from "@/lib/faktero/vratenie.functions";
import { navrhyKodovFn, zauctujPrijateFn, zrusZauctovanieFn } from "@/lib/faktero/zauctovanie.functions";
import { KATEGORIE_VYDAVKOV } from "@/lib/mobile/kategorie-vydavkov";
import type { MoznostKodu } from "@/lib/faktero/predkontacie";
import { KV_PRIJATE, kvAutomaticky } from "@/lib/faktero/kv-clenenie";
import { KodPohody } from "./KodPohody";
import { RozuctovaniePanel } from "./RozuctovaniePanel";
import { rozpisPrijatej } from "@/lib/faktero/prijate-do-pohody";

export type Navrhy = {
  predkontacie: MoznostKodu[];
  clenenia: MoznostKodu[];
  predvolenaPredkontacia: string | null;
  predvoleneClenenie: string | null;
  maCiselnik?: boolean;
  podlaKategorie?: Record<string, { predkontacia?: string; clenenie?: string }>;
  strediska?: MoznostKodu[];
  cinnosti?: MoznostKodu[];
  rady?: MoznostKodu[];
  predvoleneStredisko?: string | null;
  predvolenyRad?: string | null;
};

type Hodnoty = {
  predkontacia: string;
  clenenie: string;
  kategoria: string;
  kv?: string;
  /** Rozšírené polia Pohody — zobrazia sa, keď sú v hodnotách. */
  stredisko?: string;
  cinnost?: string;
  rad?: string;
  intPoznamka?: string;
};

/** Spoločné polia zaúčtovania — na detaile aj v hromadnom okne. */
export function PoliaZauctovania({
  navrhy,
  hodnoty,
  setHodnoty,
  hromadne,
  kvAuto,
}: {
  navrhy: Navrhy | null;
  hodnoty: Hodnoty;
  setHodnoty: (h: Hodnoty) => void;
  /** Ktorá sadzba členenia KV sa dá automaticky — ukáže sa v ponuke. */
  kvAuto?: string;
  hromadne?: boolean;
}) {
  const vstup = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  const zKategorie = navrhy?.podlaKategorie?.[hodnoty.kategoria];
  return (
    <div className={`grid gap-3 ${hodnoty.kv !== undefined ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
      <label className="block">
        <span className="text-xs text-muted-foreground">Predkontácia (Pohoda)</span>
        <KodPohody
          value={hodnoty.predkontacia}
          placeholder={
            hromadne ? "nemeniť" : (zKategorie?.predkontacia ?? navrhy?.predvolenaPredkontacia ?? "napr. 1Fp")
          }
          onChange={(v) => setHodnoty({ ...hodnoty, predkontacia: v })}
          moznosti={navrhy?.predkontacie ?? []}
          className={vstup}
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">Členenie DPH (plnenie)</span>
        <KodPohody
          value={hodnoty.clenenie}
          placeholder={
            hromadne ? "nemeniť" : (zKategorie?.clenenie ?? navrhy?.predvoleneClenenie ?? "napr. PD")
          }
          onChange={(v) => setHodnoty({ ...hodnoty, clenenie: v })}
          moznosti={navrhy?.clenenia ?? []}
                      vyber
          className={vstup}
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">Kategória nákladu</span>
        <select
          value={hodnoty.kategoria}
          onChange={(e) => setHodnoty({ ...hodnoty, kategoria: e.target.value })}
          className={vstup}
        >
          <option value="">{hromadne ? "nemeniť" : "—"}</option>
          {KATEGORIE_VYDAVKOV.map((k) => (
            <option key={k.kod} value={k.kod}>
              {k.nazov}
            </option>
          ))}
        </select>
      </label>
      {hodnoty.kv !== undefined && (
        <label className="block">
          <span className="text-xs text-muted-foreground">Členenie KV DPH</span>
          <select
            value={hodnoty.kv}
            onChange={(e) => setHodnoty({ ...hodnoty, kv: e.target.value })}
            className={vstup}
          >
            <option value="">{hromadne ? "nemeniť" : `automaticky${kvAuto ? ` (${kvAuto})` : ""}`}</option>
            {hromadne && <option value="auto">automaticky</option>}
            {KV_PRIJATE.map((k) => (
              <option key={k.kod} value={k.kod}>
                {k.nazov}
              </option>
            ))}
          </select>
        </label>
      )}
      {hodnoty.stredisko !== undefined && (
        <label className="block">
          <span className="text-xs text-muted-foreground">Stredisko</span>
          <KodPohody
            value={hodnoty.stredisko}
            onChange={(v) => setHodnoty({ ...hodnoty, stredisko: v })}
            moznosti={navrhy?.strediska ?? []}
            placeholder={hromadne ? "nemeniť" : (navrhy?.predvoleneStredisko ?? "—")}
            className={vstup}
            vyber
          />
        </label>
      )}
      {hodnoty.cinnost !== undefined && (
        <label className="block">
          <span className="text-xs text-muted-foreground">Činnosť</span>
          <KodPohody
            value={hodnoty.cinnost}
            onChange={(v) => setHodnoty({ ...hodnoty, cinnost: v })}
            moznosti={navrhy?.cinnosti ?? []}
            placeholder={hromadne ? "nemeniť" : "—"}
            className={vstup}
            vyber
          />
        </label>
      )}
      {hodnoty.rad !== undefined && (
        <label className="block">
          <span className="text-xs text-muted-foreground">Číselný rad v Pohode</span>
          <KodPohody
            value={hodnoty.rad}
            onChange={(v) => setHodnoty({ ...hodnoty, rad: v })}
            moznosti={navrhy?.rady ?? []}
            placeholder={hromadne ? "nemeniť" : (navrhy?.predvolenyRad ?? "predvolený v Pohode")}
            className={vstup}
            vyber
          />
        </label>
      )}
      {hodnoty.intPoznamka !== undefined && (
        <label className="block sm:col-span-full">
          <span className="text-xs text-muted-foreground">Interná poznámka pre účtovníka (do Pohody)</span>
          <input
            value={hodnoty.intPoznamka}
            onChange={(e) => setHodnoty({ ...hodnoty, intPoznamka: e.target.value })}
            maxLength={240}
            className={vstup}
          />
        </label>
      )}
    </div>
  );
}

const kedy = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("sk-SK", { dateStyle: "medium", timeStyle: "short" }) : "";

/**
 * Zaúčtovanie prijatej faktúry — ako v Doklado: predkontácia, členenie DPH
 * a kategória; zaúčtovaná faktúra ide do Pohody.
 */
export function ZauctovaniePanel({ row, onZmena }: { row: any; onZmena: () => void }) {
  const nacitajNavrhy = useServerFn(navrhyKodovFn);
  const zauctuj = useServerFn(zauctujPrijateFn);
  const zrus = useServerFn(zrusZauctovanieFn);
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [h, setH] = useState<Hodnoty>({
    predkontacia: row.pohoda_predkontacia ?? "",
    clenenie: row.pohoda_clenenie_dph ?? "",
    kategoria: row.category ?? "",
    kv: row.kv_clenenie ?? "",
    stredisko: row.stredisko ?? "",
    cinnost: row.cinnost ?? "",
    rad: row.pohoda_rad ?? "",
    intPoznamka: row.int_poznamka ?? "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nacitajNavrhy({ data: { company_id: row.company_id } }).then(setNavrhy).catch(() => {});
  }, [row.company_id, nacitajNavrhy]);
  useEffect(() => {
    setH({
      predkontacia: row.pohoda_predkontacia ?? "",
      clenenie: row.pohoda_clenenie_dph ?? "",
      kategoria: row.category ?? "",
      kv: row.kv_clenenie ?? "",
      stredisko: row.stredisko ?? "",
      cinnost: row.cinnost ?? "",
      rad: row.pohoda_rad ?? "",
      intPoznamka: row.int_poznamka ?? "",
    });
  }, [row.pohoda_predkontacia, row.pohoda_clenenie_dph, row.category, row.kv_clenenie, row.stredisko, row.cinnost, row.pohoda_rad, row.int_poznamka]);

  const odovzdana = Boolean(row.exported_at);
  const zauctovana = Boolean(row.zauctovane_at);
  const exportuj = useServerFn(exportPrijatychPohodaFn);
  const vrat = useServerFn(vratZPohodyFn);
  const presun = useServerFn(presunPrijatuDoDokladovFn);
  const navigate = useNavigate();

  async function stiahniXml(oznacit: boolean) {
    setBusy(true);
    try {
      const r = await exportuj({ data: { company_id: row.company_id, ids: [row.id], oznacit } });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([r.xml], { type: "text/xml;charset=utf-8" }));
      a.download = r.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast.success(oznacit ? "XML stiahnuté, faktúra je označená ako odovzdaná" : "XML stiahnuté");
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  async function vratit() {
    if (
      !confirm(
        "Vrátiť faktúru z Pohody? Zaúčtovanie sa zruší a pri ďalšom odovzdaní pôjde znova — v Pohode ju preto najprv zmažte, inak tam bude dvakrát.",
      )
    )
      return;
    setBusy(true);
    try {
      await vrat({ data: { company_id: row.company_id, druh: "prijata", ids: [row.id] } });
      toast.success("Vrátené — opravte zaúčtovanie a zaúčtujte znova");
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  async function doDokladov() {
    if (!confirm("Presunúť túto faktúru medzi doklady (bločky)? Z prijatých faktúr zmizne.")) return;
    setBusy(true);
    try {
      const r = await presun({ data: { company_id: row.company_id, id: row.id } });
      toast.success("Presunuté medzi doklady");
      navigate({ to: "/doklady/novy", search: { id: r.id } as any });
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
      setBusy(false);
    }
  }

  async function uloz(lenUlozit: boolean) {
    setBusy(true);
    try {
      const r = await zauctuj({
        data: {
          company_id: row.company_id,
          ids: [row.id],
          predkontacia: h.predkontacia,
          clenenie: h.clenenie,
          kategoria: h.kategoria,
          kv: h.kv ?? "",
          stredisko: h.stredisko ?? "",
          cinnost: h.cinnost ?? "",
          rad: h.rad ?? "",
          intPoznamka: h.intPoznamka ?? "",
          lenUlozit,
        },
      });
      if (r.preskocene.length) toast.error(r.preskocene.join(" · "));
      else toast.success(lenUlozit ? "Uložené" : "Zaúčtované — pôjde do Pohody pri najbližšom odovzdaní.");
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  async function zrusit() {
    setBusy(true);
    try {
      await zrus({ data: { id: row.id } });
      toast.success("Zaúčtovanie zrušené");
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <BookCheck className="h-3.5 w-3.5" /> Zaúčtovanie
        </div>
        {odovzdana ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            V Pohode od {kedy(row.exported_at)}
          </span>
        ) : zauctovana ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
            Zaúčtovaná {kedy(row.zauctovane_at)} — čaká na odovzdanie
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Nezaúčtovaná
          </span>
        )}
      </div>

      <div className="mt-3">
        {odovzdana ? (
          <>
          <p>
            Predkontácia <strong>{row.pohoda_predkontacia || navrhy?.predvolenaPredkontacia || "—"}</strong>
            , členenie DPH <strong>{row.pohoda_clenenie_dph || navrhy?.predvoleneClenenie || "—"}</strong>
            {Array.isArray(row.rozuctovanie) && row.rozuctovanie.length > 1
              ? ` (rozúčtovaná na ${row.rozuctovanie.length} riadky)`
              : ""}
            . Faktúra je odovzdaná do Pohody.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => stiahniXml(false)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Stiahnuť XML znova
            </button>
            <button
              onClick={vratit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" /> Vrátiť z Pohody (opraviť)
            </button>
          </div>
          </>
        ) : (
          <>
            <PoliaZauctovania
              navrhy={navrhy}
              hodnoty={h}
              setHodnoty={setH}
              kvAuto={kvAutomaticky({
                opravny: Number(row.amount_total ?? 0) < 0 || !!row.opravuje_cislo,
                prenesenie: row.dph_rezim === "samozdanenie" || row.dph_rezim === "nadobudnutie",
              })}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Prázdne pole = predvolené z{" "}
              <Link to="/uctovnictvo/predkontacie" className="underline">
                nastavení predkontácií
              </Link>
              {row.pravidlo_id ? " · doplnené pravidlom účtovania" : ""}.{" "}
              {navrhy?.maCiselnik === false ? (
                <>
                  Číselník je prázdny —{" "}
                  <Link to="/uctovnictvo/predkontacie" className="underline">
                    načítajte ho z Pohody
                  </Link>
                  , nech sa kódy vyberajú s popisom.
                </>
              ) : (
                "Kódy musia existovať v Pohode."
              )}
            </p>
            <RozuctovaniePanel
              companyId={row.company_id}
              druh="prijata"
              id={row.id}
              rozpis={rozpisPrijatej(row)}
              ulozene={row.rozuctovanie}
              navrhy={navrhy}
              kody={{
                predkontacia: h.predkontacia || navrhy?.predvolenaPredkontacia || null,
                clenenie: h.clenenie || navrhy?.predvoleneClenenie || null,
              }}
              onZmena={onZmena}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {!zauctovana && (
                <button
                  onClick={() => uloz(false)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Zaúčtovať
                </button>
              )}
              <button
                onClick={() => uloz(true)}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              >
                Uložiť bez zaúčtovania
              </button>
              {zauctovana && (
                <button
                  onClick={() => stiahniXml(true)}
                  disabled={busy}
                  title="Stiahne XML na import do Pohody a označí faktúru ako odovzdanú, aby ju konektor neposlal druhýkrát."
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" /> Stiahnuť XML pre Pohodu
                </button>
              )}
              {zauctovana && (
                <button
                  onClick={zrusit}
                  disabled={busy}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
                >
                  Zrušiť zaúčtovanie
                </button>
              )}
              {!row.samofakturacia && row.type === "regular" && row.source !== "efaktura" && (
                <button
                  onClick={doDokladov}
                  disabled={busy}
                  title="Zle zatriedené — je to bloček, nie faktúra"
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50"
                >
                  <MoveRight className="h-3.5 w-3.5" /> Presunúť medzi doklady
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
