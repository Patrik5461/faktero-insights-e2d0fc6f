import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookCheck, Loader2 } from "lucide-react";
import { navrhyKodovFn, zauctujPrijateFn, zrusZauctovanieFn } from "@/lib/faktero/zauctovanie.functions";
import { KATEGORIE_VYDAVKOV } from "@/lib/mobile/kategorie-vydavkov";

export type Navrhy = {
  predkontacie: string[];
  clenenia: string[];
  predvolenaPredkontacia: string | null;
  predvoleneClenenie: string | null;
};

/** Spoločné polia zaúčtovania — na detaile aj v hromadnom okne. */
export function PoliaZauctovania({
  navrhy,
  hodnoty,
  setHodnoty,
  hromadne,
}: {
  navrhy: Navrhy | null;
  hodnoty: { predkontacia: string; clenenie: string; kategoria: string };
  setHodnoty: (h: { predkontacia: string; clenenie: string; kategoria: string }) => void;
  hromadne?: boolean;
}) {
  const vstup = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block">
        <span className="text-xs text-muted-foreground">Predkontácia (Pohoda)</span>
        <input
          list="navrhy-predkontacie"
          value={hodnoty.predkontacia}
          placeholder={hromadne ? "nemeniť" : (navrhy?.predvolenaPredkontacia ?? "napr. 1Fp")}
          onChange={(e) => setHodnoty({ ...hodnoty, predkontacia: e.target.value })}
          className={vstup}
        />
        <datalist id="navrhy-predkontacie">
          {(navrhy?.predkontacie ?? []).map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">Členenie DPH (plnenie)</span>
        <input
          list="navrhy-clenenia"
          value={hodnoty.clenenie}
          placeholder={hromadne ? "nemeniť" : (navrhy?.predvoleneClenenie ?? "napr. PD")}
          onChange={(e) => setHodnoty({ ...hodnoty, clenenie: e.target.value })}
          className={vstup}
        />
        <datalist id="navrhy-clenenia">
          {(navrhy?.clenenia ?? []).map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
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
  const [h, setH] = useState({
    predkontacia: row.pohoda_predkontacia ?? "",
    clenenie: row.pohoda_clenenie_dph ?? "",
    kategoria: row.category ?? "",
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
    });
  }, [row.pohoda_predkontacia, row.pohoda_clenenie_dph, row.category]);

  const odovzdana = Boolean(row.exported_at);
  const zauctovana = Boolean(row.zauctovane_at);

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
          <p>
            Predkontácia <strong>{row.pohoda_predkontacia || navrhy?.predvolenaPredkontacia || "—"}</strong>
            , členenie DPH <strong>{row.pohoda_clenenie_dph || navrhy?.predvoleneClenenie || "—"}</strong>
            . Faktúra je v Pohode — zmeny robte tam.
          </p>
        ) : (
          <>
            <PoliaZauctovania navrhy={navrhy} hodnoty={h} setHodnoty={setH} />
            <p className="mt-2 text-xs text-muted-foreground">
              Prázdne pole = predvolené z{" "}
              <Link to="/uctovnictvo/pohoda" className="underline">
                nastavení Pohody
              </Link>
              {row.pravidlo_id ? " · doplnené pravidlom účtovania" : ""}. Kódy musia existovať v Pohode.
            </p>
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
                  onClick={zrusit}
                  disabled={busy}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
                >
                  Zrušiť zaúčtovanie
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
