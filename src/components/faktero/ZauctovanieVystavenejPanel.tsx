import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookCheck, Download, Loader2, Undo2 } from "lucide-react";
import {
  navrhyKodovFn,
  stavVystavenejFn,
  vratVystavenuZPohodyFn,
  zauctujVystavenuFn,
  zrusZauctovanieVystavenejFn,
} from "@/lib/faktero/zauctovanie.functions";
import { KV_CLENENIA } from "@/lib/faktero/kv-clenenie";
import { KodPohody } from "./KodPohody";
import type { Navrhy } from "./ZauctovaniePanel";

const KV_VYDANE = KV_CLENENIA.filter((k) => ["A1", "A2", "C1", "D1", "D2", "X"].includes(k.kod));
const kedy = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("sk-SK", { dateStyle: "medium", timeStyle: "short" }) : "";

type Polozka = {
  id: string;
  name: string;
  subtotal: number;
  vat_rate: number;
  predkontacia: string;
  clenenie: string;
  kv: string;
};

/**
 * Zaúčtovanie vystavenej faktúry — predkontácia, členenie DPH a KV na
 * hlavičke a voliteľne na položkách (ako „účtovné nastavenia položky" v
 * Doklado). Do Pohody ide faktúra konektorom, balíkom alebo tlačidlom.
 */
export function ZauctovanieVystavenejPanel({
  inv,
  onZmena,
  onStiahnut,
}: {
  inv: any;
  onZmena: () => void;
  onStiahnut: () => Promise<void> | void;
}) {
  const nacitajNavrhy = useServerFn(navrhyKodovFn);
  const nacitajStav = useServerFn(stavVystavenejFn);
  const zauctuj = useServerFn(zauctujVystavenuFn);
  const zrus = useServerFn(zrusZauctovanieVystavenejFn);
  const vrat = useServerFn(vratVystavenuZPohodyFn);
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [stav, setStav] = useState<{
    vPohode: { kedy: string; cislo: string | null } | null;
  } | null>(null);
  const [h, setH] = useState({
    predkontacia: "",
    clenenie: "",
    kv: "",
    stredisko: "",
    cinnost: "",
    intPoznamka: "",
  });
  const [polozky, setPolozky] = useState<Polozka[]>([]);
  const [poPolozkach, setPoPolozkach] = useState(false);
  const [busy, setBusy] = useState(false);

  async function obnov() {
    const s = await nacitajStav({ data: { id: inv.id } });
    setStav({ vPohode: s.vPohode });
    const p = s.polozky.map((x: any) => ({
      id: x.id,
      name: x.name,
      subtotal: Number(x.subtotal ?? 0),
      vat_rate: Number(x.vat_rate ?? 0),
      predkontacia: x.pohoda_predkontacia ?? "",
      clenenie: x.pohoda_clenenie_dph ?? "",
      kv: x.kv_clenenie ?? "",
    }));
    setPolozky(p);
    setPoPolozkach(p.some((x: Polozka) => x.predkontacia || x.clenenie || x.kv));
  }

  useEffect(() => {
    nacitajNavrhy({ data: { company_id: inv.company_id, pre: "vystavena", typ: inv.type } })
      .then(setNavrhy)
      .catch(() => {});
    void obnov().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.id]);
  useEffect(() => {
    setH({
      predkontacia: inv.pohoda_predkontacia ?? "",
      clenenie: inv.pohoda_clenenie_dph ?? "",
      kv: inv.kv_clenenie ?? "",
      stredisko: inv.stredisko ?? "",
      cinnost: inv.cinnost ?? "",
      intPoznamka: inv.int_poznamka ?? "",
    });
  }, [
    inv.pohoda_predkontacia,
    inv.pohoda_clenenie_dph,
    inv.kv_clenenie,
    inv.stredisko,
    inv.cinnost,
    inv.int_poznamka,
  ]);

  if (inv.status === "draft") return null;
  const vPohode = stav?.vPohode;
  const zauctovana = Boolean(inv.zauctovane_at);
  const vstup = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  async function uloz(lenUlozit: boolean) {
    setBusy(true);
    try {
      await zauctuj({
        data: {
          company_id: inv.company_id,
          id: inv.id,
          predkontacia: h.predkontacia,
          clenenie: h.clenenie,
          kv: h.kv,
          stredisko: h.stredisko,
          cinnost: h.cinnost,
          intPoznamka: h.intPoznamka,
          lenUlozit,
          polozky: polozky.map((p) =>
            poPolozkach ? p : { ...p, predkontacia: "", clenenie: "", kv: "" },
          ),
        },
      });
      toast.success(lenUlozit ? "Uložené" : "Zaúčtované");
      onZmena();
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  async function akcia(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onZmena();
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id="zauctovanie"
      className="scroll-mt-24 rounded-xl border border-border bg-card p-5 text-sm transition-shadow"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <BookCheck className="h-3.5 w-3.5" /> Zaúčtovanie
        </div>
        {vPohode ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            V Pohode od {kedy(vPohode.kedy)}
            {vPohode.cislo ? ` · č. ${vPohode.cislo}` : ""}
          </span>
        ) : zauctovana ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
            Zaúčtovaná {kedy(inv.zauctovane_at)}
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Nezaúčtovaná
          </span>
        )}
      </div>

      {vPohode ? (
        <>
          <p className="mt-3">
            Predkontácia{" "}
            <strong>{inv.pohoda_predkontacia || navrhy?.predvolenaPredkontacia || "—"}</strong>,
            členenie DPH{" "}
            <strong>{inv.pohoda_clenenie_dph || navrhy?.predvoleneClenenie || "—"}</strong>
            {inv.kv_clenenie ? (
              <>
                , KV <strong>{inv.kv_clenenie}</strong>
              </>
            ) : null}
            . Faktúra je v Pohode.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void Promise.resolve(onStiahnut()).then(obnov)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Stiahnuť XML znova
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    "Vrátiť faktúru z Pohody? Pri ďalšom odovzdaní pôjde znova — v Pohode ju preto najprv zmažte, inak tam bude dvakrát.",
                  )
                )
                  void akcia(
                    () => vrat({ data: { company_id: inv.company_id, id: inv.id } }),
                    "Vrátené — opravte zaúčtovanie a odovzdajte znova",
                  );
              }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" /> Vrátiť z Pohody (opraviť)
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Predkontácia (Pohoda)</span>
              <KodPohody
                odkazNaCiselnik
                value={h.predkontacia}
                onChange={(v) => setH({ ...h, predkontacia: v })}
                moznosti={navrhy?.predkontacie ?? []}
                placeholder={navrhy?.predvolenaPredkontacia ?? "napr. 3Fv"}
                className={vstup}
                vyber
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Členenie DPH</span>
              <KodPohody
                value={h.clenenie}
                onChange={(v) => setH({ ...h, clenenie: v })}
                moznosti={navrhy?.clenenia ?? []}
                placeholder={navrhy?.predvoleneClenenie ?? "napr. UD"}
                className={vstup}
                vyber
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Členenie KV DPH</span>
              <select
                value={h.kv}
                onChange={(e) => setH({ ...h, kv: e.target.value })}
                className={vstup}
              >
                <option value="">automaticky</option>
                {KV_VYDANE.map((k) => (
                  <option key={k.kod} value={k.kod}>
                    {k.nazov}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Stredisko</span>
              <KodPohody
                value={h.stredisko}
                onChange={(v) => setH({ ...h, stredisko: v })}
                moznosti={navrhy?.strediska ?? []}
                placeholder={navrhy?.predvoleneStredisko ?? "—"}
                className={vstup}
                vyber
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Činnosť</span>
              <KodPohody
                value={h.cinnost}
                onChange={(v) => setH({ ...h, cinnost: v })}
                moznosti={navrhy?.cinnosti ?? []}
                placeholder="—"
                className={vstup}
                vyber
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Interná poznámka (do Pohody)</span>
              <input
                value={h.intPoznamka}
                onChange={(e) => setH({ ...h, intPoznamka: e.target.value })}
                maxLength={240}
                className={vstup}
              />
            </label>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={poPolozkach}
              onChange={(e) => setPoPolozkach(e.target.checked)}
            />
            Účtovať po položkách (každá položka vlastná predkontácia)
          </label>
          {poPolozkach && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Položka</th>
                    <th className="py-1 pr-2 text-right font-medium">Základ</th>
                    <th className="py-1 pr-2 font-medium">Predkontácia</th>
                    <th className="py-1 pr-2 font-medium">Členenie DPH</th>
                    <th className="py-1 font-medium">KV</th>
                  </tr>
                </thead>
                <tbody>
                  {polozky.map((p, i) => {
                    const zmen = (z: Partial<Polozka>) =>
                      setPolozky((ps) => ps.map((x, j) => (j === i ? { ...x, ...z } : x)));
                    return (
                      <tr key={p.id} className="border-t border-border align-top">
                        <td className="py-1.5 pr-2">
                          {p.name}
                          <span className="block text-xs text-muted-foreground">
                            {p.vat_rate} %
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {p.subtotal.toFixed(2)}
                        </td>
                        <td className="py-1.5 pr-2 w-36">
                          <KodPohody
                            ariaLabel={`Predkontácia položky ${i + 1}`}
                            value={p.predkontacia}
                            onChange={(v) => zmen({ predkontacia: v })}
                            moznosti={navrhy?.predkontacie ?? []}
                            placeholder={h.predkontacia || navrhy?.predvolenaPredkontacia || ""}
                            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                            bezPopisu
                            vyber
                          />
                        </td>
                        <td className="py-1.5 pr-2 w-36">
                          <KodPohody
                            ariaLabel={`Členenie DPH položky ${i + 1}`}
                            value={p.clenenie}
                            onChange={(v) => zmen({ clenenie: v })}
                            moznosti={navrhy?.clenenia ?? []}
                            placeholder={h.clenenie || navrhy?.predvoleneClenenie || ""}
                            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                            vyber
                          />
                        </td>
                        <td className="py-1.5 w-24">
                          <select
                            aria-label={`KV položky ${i + 1}`}
                            value={p.kv}
                            onChange={(e) => zmen({ kv: e.target.value })}
                            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                          >
                            <option value="">z faktúry</option>
                            {KV_VYDANE.map((k) => (
                              <option key={k.kod} value={k.kod} title={k.nazov}>
                                {k.kod === "X" ? "nezahŕňať" : k.kod}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-muted-foreground">
                Položka bez kódu dostane kód faktúry. Keď majú položky rôzne predkontácie, hlavička
                v Pohode dostane „Rozúčtovať“.
              </p>
            </div>
          )}

          <p className="mt-2 text-xs text-muted-foreground">
            Prázdne pole = predvolené z{" "}
            <Link to="/uctovnictvo/predkontacie" className="underline">
              nastavení predkontácií
            </Link>
            . Do Pohody ide faktúra konektorom alebo mesačným balíkom; hneď ju stiahnete tlačidlom.
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
            <button
              onClick={() => void Promise.resolve(onStiahnut()).then(obnov)}
              disabled={busy}
              title="Stiahne XML na import do Pohody a zapíše faktúru ako odovzdanú."
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Stiahnuť XML pre Pohodu
            </button>
            {zauctovana && (
              <button
                onClick={() =>
                  void akcia(
                    () => zrus({ data: { company_id: inv.company_id, id: inv.id } }),
                    "Zaúčtovanie zrušené",
                  )
                }
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
  );
}
