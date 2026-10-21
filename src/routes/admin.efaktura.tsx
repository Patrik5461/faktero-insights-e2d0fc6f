/**
 * eFaktúra — žiadosti z Portálu finančnej správy a webhooky ePoštáka.
 *
 * Firma si na Portáli FS vyberie Faktero ako poskytovateľa doručovacej
 * služby; FS nám pošle jej údaje a ePošták ju zaregistruje do Peppolu (White
 * Label). Tu je vidieť, ako to dopadlo, a dá sa zopakovať alebo priradiť.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRightLeft, CheckCircle2, Loader2, RefreshCw, TriangleAlert, Webhook } from "lucide-react";
import { potvrd } from "@/lib/potvrdenie";
import {
  adminEfakturaPrehladFn,
  adminMigrujZiadostFn,
  adminPriradZiadostFn,
  adminSchvalZiadostFn,
  adminZamietniZiadostFn,
  adminZapniWebhookyFn,
  adminZmazWebhookFn,
  adminZopakujZiadostFn,
  type ZiadostFsAdmin,
} from "@/lib/faktero/efaktura-admin.functions";

export const Route = createFileRoute("/admin/efaktura")({ component: Page });

const STAVY: Record<string, { text: string; cls: string }> = {
  na_schvalenie: { text: "Čaká na schválenie", cls: "bg-amber-100 text-amber-800" },
  prijata: { text: "Prijatá", cls: "bg-muted text-muted-foreground" },
  registruje_sa: { text: "Registruje sa", cls: "bg-amber-100 text-amber-800" },
  registrovana: { text: "Registrovaná", cls: "bg-emerald-100 text-emerald-800" },
  na_kontrolu: { text: "Kontrola u ePoštáka", cls: "bg-amber-100 text-amber-800" },
  zamietnuta: { text: "Zamietnutá", cls: "bg-rose-100 text-rose-800" },
  chyba: { text: "Chyba", cls: "bg-rose-100 text-rose-800" },
  cudzi_poskytovatel: { text: "U iného poskytovateľa", cls: "bg-violet-100 text-violet-800" },
};

/** Stavy, z ktorých sa dá firma prevziať migračným kódom (rovnaké ako na serveri). */
const STAVY_PRE_MIGRACIU = new Set(["cudzi_poskytovatel", "chyba", "zamietnuta"]);

const kedy = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("sk-SK", { dateStyle: "short", timeStyle: "short" }) : "—";

function Page() {
  const qc = useQueryClient();
  const nacitaj = useServerFn(adminEfakturaPrehladFn);
  const zopakuj = useServerFn(adminZopakujZiadostFn);
  const prirad = useServerFn(adminPriradZiadostFn);
  const schval = useServerFn(adminSchvalZiadostFn);
  const zamietni = useServerFn(adminZamietniZiadostFn);
  const zapni = useServerFn(adminZapniWebhookyFn);
  const zmaz = useServerFn(adminZmazWebhookFn);
  const [priradenie, setPriradenie] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin-efaktura"],
    queryFn: () => nacitaj({}),
  });
  const obnov = () => qc.invalidateQueries({ queryKey: ["admin-efaktura"] });

  const akcia = useMutation({
    mutationFn: async (f: () => Promise<unknown>) => f(),
    onSuccess: () => {
      toast.success("Hotovo");
      obnov();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nepodarilo sa"),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">eFaktúra</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Firmy, ktoré si na Portáli finančnej správy vybrali Faktero, a odbery udalostí od ePoštáka.
        </p>
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stav
            ok={data.nastavene.pdsTajomstvo}
            ano="Tajomstvo webhooku FS je nastavené"
            nie="Chýba EFAKTURA_PDS_SECRET — webhook FS odmieta všetko (401)"
          />
          <Stav
            ok={data.nastavene.epostakProdukcia}
            ano="ePošták beží v produkcii"
            nie="ePošták je v pieskovisku (EPOSTAK_ENV=sandbox)"
          />
          <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
            Adresa pre FS: <code>https://www.faktero.sk/api/public/efaktura/pds</code>
            <br />
            Adresa pre ePoštáka: <code>…/api/public/efaktura/epostak</code>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Žiadosti z Portálu FS</h2>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !data?.ziadosti.length ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Zatiaľ žiadna firma si Faktero na Portáli FS nevybrala.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Prijaté</th>
                  <th className="p-3">Firma z FS</th>
                  <th className="p-3">Kontakt</th>
                  <th className="p-3">Stav</th>
                  <th className="p-3">Vo Fakteri</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.ziadosti.map((z) => (
                  <tr key={z.id} className="border-t border-border align-top">
                    <td className="p-3 whitespace-nowrap">{kedy(z.prijate_at)}</td>
                    <td className="p-3">
                      <div className="font-medium">{z.nazov ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">DIČ {z.dic}</div>
                      {z.peppol_id && <div className="text-xs text-muted-foreground">{z.peppol_id}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{z.email ?? "—"}</div>
                      <div>{z.telefon ?? ""}</div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STAVY[z.stav]?.cls ?? ""}`}
                      >
                        {STAVY[z.stav]?.text ?? z.stav}
                      </span>
                      {z.chyba && <div className="mt-1 max-w-xs text-xs text-rose-700">{z.chyba}</div>}
                      {z.cudzi_poskytovatel && (
                        <div className="mt-1 max-w-xs text-xs font-medium">Firma je u: {z.cudzi_poskytovatel}</div>
                      )}
                      {z.migracia_bezi && (
                        <div className="mt-1 max-w-xs text-xs text-amber-800">
                          Prevzatie migračným kódom beží (spustené {kedy(z.migracia_at)})
                        </div>
                      )}
                      {!z.podpis_overeny && (
                        <div className="mt-1 max-w-xs text-xs text-muted-foreground">
                          Podpis neoverený · {z.via ? `prišla cez ${z.via}` : "bez hlavičky Via"}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">pokusov: {z.pokusov}</div>
                    </td>
                    <td className="p-3 text-xs">
                      {z.firma ? (
                        z.firma
                      ) : (
                        <div className="flex gap-1">
                          <input
                            placeholder="id firmy"
                            value={priradenie[z.id] ?? ""}
                            onChange={(e) => setPriradenie((p) => ({ ...p, [z.id]: e.target.value }))}
                            className="w-40 rounded border border-input bg-background px-2 py-1"
                          />
                          <button
                            onClick={() =>
                              akcia.mutate(() =>
                                prirad({ data: { id: z.id, company_id: (priradenie[z.id] ?? "").trim() } }),
                              )
                            }
                            className="rounded border border-border px-2 py-1 hover:bg-secondary"
                          >
                            Priradiť
                          </button>
                        </div>
                      )}
                      {z.pozvanka_odoslana_at && (
                        <div className="mt-1 text-muted-foreground">pozvánka {kedy(z.pozvanka_odoslana_at)}</div>
                      )}
                    </td>
                    <td className="p-3">
                      {z.stav === "na_schvalenie" && (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => akcia.mutate(() => schval({ data: { id: z.id } }))}
                            className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                          >
                            Schváliť
                          </button>
                          <button
                            onClick={() => akcia.mutate(() => zamietni({ data: { id: z.id } }))}
                            className="rounded border border-border px-2 py-1 text-xs hover:bg-secondary"
                          >
                            Zamietnuť
                          </button>
                        </div>
                      )}
                      {STAVY_PRE_MIGRACIU.has(z.stav) && !z.migracia_bezi && (
                        <Prevzatie
                          ziadost={z}
                          smie={Boolean(data?.smieMigrovat)}
                          poHotove={obnov}
                        />
                      )}
                      {z.ma_token && z.stav !== "registrovana" && z.stav !== "na_schvalenie" && (
                        <button
                          onClick={() => akcia.mutate(() => zopakuj({ data: { id: z.id } }))}
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-secondary"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Zopakovať
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Odmietnuté žiadosti FS</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Žiadosti, ktoré Faktero neprijalo. Údaje firiem pri zlom podpise sú neoverené — FS treba
          požiadať o opätovné zaslanie, alebo firma vyberie Faktero na portáli znova.
        </p>
        {!data?.odmietnute.length ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Žiadna odmietnutá žiadosť.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Kedy</th>
                  <th className="p-3">Dôvod</th>
                  <th className="p-3">Firmy v žiadosti</th>
                  <th className="p-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {data.odmietnute.map((o) => (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="p-3 whitespace-nowrap">{kedy(o.prijate_at)}</td>
                    <td className="p-3">
                      <div className="font-medium text-rose-700">{DOVODY[o.dovod] ?? o.dovod}</div>
                      {o.chyba && <div className="mt-1 max-w-sm text-xs text-muted-foreground">{o.chyba}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      {o.firmy.length ? (
                        o.firmy.map((f, i) => (
                          <div key={i}>
                            <span className="font-medium">{f.nazov ?? "—"}</span> · DIČ {f.dic}
                            {f.email ? ` · ${f.email}` : ""}
                            {f.telefon ? ` · ${f.telefon}` : ""}
                          </div>
                        ))
                      ) : (
                        <span className="text-muted-foreground">neznáme</span>
                      )}
                      {!o.overene && o.firmy.length > 0 && (
                        <div className="mt-1 text-muted-foreground">neoverené</div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{o.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Webhooky ePoštáka</h2>
          <button
            onClick={() => akcia.mutate(() => zapni({}))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            <Webhook className="h-4 w-4" /> Zapnúť chýbajúce
          </button>
        </div>
        {!data?.webhooky.length ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Žiadna firma zatiaľ nemá odber udalostí. Doklady dorovnáva nočná úloha.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Firma</th>
                  <th className="p-3">Stav</th>
                  <th className="p-3">Posledná udalosť</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.webhooky.map((w) => (
                  <tr key={w.company_id} className="border-t border-border align-top">
                    <td className="p-3">
                      <div className="font-medium">{w.firma ?? w.company_id}</div>
                      <div className="text-xs text-muted-foreground">ePošták {w.epostak_firm_id}</div>
                    </td>
                    <td className="p-3 text-xs">
                      {w.stav === "aktivny" ? (
                        <span className="text-emerald-700">aktívny</span>
                      ) : (
                        <span className="text-rose-700">{w.chyba ?? "chyba"}</span>
                      )}
                    </td>
                    <td className="p-3 text-xs">{kedy(w.posledna_udalost_at)}</td>
                    <td className="p-3">
                      <button
                        onClick={() => akcia.mutate(() => zmaz({ data: { company_id: w.company_id } }))}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-secondary"
                      >
                        Zmazať záznam
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Prevzatie firmy od iného poskytovateľa migračným kódom. Kód drží len toto
 * políčko (type=password) — po odoslaní sa vymaže; späť zo servera nikdy nepríde.
 */
function Prevzatie({
  ziadost,
  smie,
  poHotove,
}: {
  ziadost: ZiadostFsAdmin;
  smie: boolean;
  poHotove: () => void;
}) {
  const migruj = useServerFn(adminMigrujZiadostFn);
  const [kod, setKod] = useState("");
  const [bezi, setBezi] = useState(false);
  const meno = ziadost.nazov ?? `DIČ ${ziadost.dic}`;

  const prevezmi = async () => {
    if (!kod.trim()) return toast.error("Zadaj migračný kód.");
    const ok = await potvrd(
      `Prevziať ${meno} od ${ziadost.cudzi_poskytovatel ?? "súčasného poskytovateľa"}? ` +
        "Po prevzatí budú eFaktúry firmy chodiť do Faktera a u pôvodného poskytovateľa sa firma odpojí.",
      { potvrdit: "Prevziať firmu" },
    );
    if (!ok) return;
    setBezi(true);
    try {
      const r = await migruj({ data: { id: ziadost.id, kod } });
      setKod("");
      if (r.stav === "registrovana") toast.success(`${meno} je prevzatá — eFaktúry idú cez Faktero.`);
      else if (r.bezi) toast.info("Prevzatie beží u ePoštáka — výsledok príde e-mailom a ukáže sa tu.");
      else toast.error(r.chyba ?? "Prevzatie neprešlo.");
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBezi(false);
      poHotove();
    }
  };

  if (!smie) {
    return (
      <p className="mb-2 max-w-[16rem] text-xs text-muted-foreground">
        Prevziať firmu migračným kódom smie len superadmin.
      </p>
    );
  }
  return (
    <form
      className="mb-2 flex w-64 flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void prevezmi();
      }}
    >
      <label className="text-xs font-medium" htmlFor={`kod-${ziadost.id}`}>
        Migračný kód
      </label>
      <input
        id={`kod-${ziadost.id}`}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={kod}
        onChange={(e) => setKod(e.target.value)}
        className="rounded border border-input bg-background px-2 py-1 text-xs"
      />
      <p className="text-[11px] leading-snug text-muted-foreground">
        Kód vydá firme jej súčasný poskytovateľ a firma ho pošle nám. Po prevzatí jej eFaktúry chodia
        do Faktera a u pôvodného poskytovateľa sa odpojí.
      </p>
      <button
        type="submit"
        disabled={bezi || !kod.trim()}
        className="inline-flex items-center justify-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {bezi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
        Prevziať firmu
      </button>
    </form>
  );
}

const DOVODY: Record<string, string> = {
  bez_tajomstva: "Chýbal verifikačný údaj FS (401)",
  zly_podpis: "Podpis nesedí (401)",
  zly_obsah: "Nezrozumiteľný obsah (400)",
  chyba_servera: "Chyba pri zápise (500)",
};

function Stav({ ok, ano, nie }: { ok: boolean; ano: string; nie: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
    >
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{ok ? ano : nie}</span>
    </div>
  );
}
