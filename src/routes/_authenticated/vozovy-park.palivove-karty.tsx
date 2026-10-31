import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CreditCard,
  FileUp,
  Fuel,
  Plug,
  RefreshCcw,
  Save,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { potvrd } from "@/lib/potvrdenie";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu } from "@/lib/faktero/mena";
import { POSKYTOVATELIA, poskytovatel } from "@/lib/faktero/palivove-karty/register";
import { NahratieVypisuKarty } from "@/components/faktero/palivove-karty/NahratieVypisuKarty";
import {
  nastavPripojenieKartyFn,
  odpojKartuFn,
  priradKartuFn,
  synchronizujKartuFn,
  ulozPripojenieKartyFn,
} from "@/lib/faktero/palivove-karty.functions";

export const Route = createFileRoute("/_authenticated/vozovy-park/palivove-karty")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Palivové karty — Faktero") }],
  }),
  component: PalivoveKarty,
});

/* Tabuľky palivových kariet ešte nie sú v generovaných typoch. */
const db = supabase as any;

type Pripojenie = {
  id: string;
  poskytovatel: string;
  nazov: string;
  prihlasenie_verejne: Record<string, string>;
  rezim: "faktura" | "len_tankovania";
  aktivne: boolean;
  auto_sync: boolean;
  stav: string;
  posledna_sync_at: string | null;
  posledna_chyba: string | null;
};

const POLE = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const TLACIDLO =
  "inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50";

function cas(ts?: string | null) {
  return ts ? new Date(ts).toLocaleString("sk-SK") : "—";
}

function PalivoveKarty() {
  const { t } = useT();
  const cid = getActiveCompanyId();
  const [pripojenia, setPripojenia] = useState<Pripojenie[] | null>(null);
  const [vazby, setVazby] = useState<any[]>([]);
  const [transakcie, setTransakcie] = useState<any[]>([]);
  const [logy, setLogy] = useState<any[]>([]);
  const [vozidla, setVozidla] = useState<any[]>([]);
  const [formular, setFormular] = useState<{ poskytovatel: string; id: string | null } | null>(
    null,
  );
  const [bezi, setBezi] = useState<string | null>(null);
  const [nahratie, setNahratie] = useState<Pripojenie | null>(null);

  const _sync = useServerFn(synchronizujKartuFn);
  const _odpoj = useServerFn(odpojKartuFn);
  const _nastav = useServerFn(nastavPripojenieKartyFn);
  const _prirad = useServerFn(priradKartuFn);

  const nacitaj = useCallback(async () => {
    if (!cid) return;
    const [p, v, tx, l, voz] = await Promise.all([
      db
        .from("palivove_karty_pripojenia")
        .select(
          "id, poskytovatel, nazov, prihlasenie_verejne, rezim, aktivne, auto_sync, stav, posledna_sync_at, posledna_chyba",
        )
        .eq("company_id", cid)
        .order("created_at"),
      db
        .from("palivove_karty_vazby")
        .select("id, pripojenie_id, karta, spz, vodic, vehicle_id, rucne")
        .eq("company_id", cid)
        .order("karta"),
      db
        .from("palivove_karty_transakcie")
        .select(
          "id, pripojenie_id, cas, datum, karta, spz, vehicle_id, produkt, je_palivo, mnozstvo, jednotka, spolu, mena, miesto, tachometer_km, faktura_cislo, purchase_invoice_id, fuel_record_id, blocek_id, dobropis",
        )
        .eq("company_id", cid)
        .order("cas", { ascending: false })
        .limit(100),
      db
        .from("palivove_karty_logy")
        .select("id, pripojenie_id, stav, sprava, created_at")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("vehicles")
        .select("id, name, license_plate, active")
        .eq("company_id", cid)
        .order("name"),
    ]);
    setPripojenia(p.data ?? []);
    setVazby(v.data ?? []);
    setTransakcie(tx.data ?? []);
    setLogy(l.data ?? []);
    setVozidla(voz.data ?? []);
  }, [cid]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  const nazovVozidla = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vozidla)
      m.set(
        v.id,
        [v.name, v.license_plate ? `(${v.license_plate})` : ""].filter(Boolean).join(" "),
      );
    return m;
  }, [vozidla]);

  async function synchronizuj(id: string) {
    if (!cid) return;
    setBezi(id);
    try {
      const r: any = await _sync({ data: { company_id: cid, id } });
      if (r.stav === "ok" || r.stav === "ciastocne") toast.success(r.sprava);
      else if (r.stav === "preskocene") toast.info(r.sprava);
      else toast.error(r.sprava);
    } catch (e: any) {
      toast.error(e?.message ?? t("Synchronizácia zlyhala"));
    } finally {
      setBezi(null);
      void nacitaj();
    }
  }

  async function odpoj(p: Pripojenie) {
    if (!cid) return;
    if (
      !(await potvrd(
        t(
          "Odpojiť {nazov}? Zmaže sa prihlásenie a evidencia nákupov kartou. Tankovania a prijaté faktúry ostanú.",
          { nazov: p.nazov },
        ),
      ))
    )
      return;
    try {
      await _odpoj({ data: { company_id: cid, id: p.id } });
      toast.success(t("Odpojené"));
      void nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }

  async function nastav(
    p: Pripojenie,
    zmena: Partial<Pick<Pripojenie, "auto_sync" | "rezim" | "aktivne">>,
  ) {
    if (!cid) return;
    try {
      await _nastav({ data: { company_id: cid, id: p.id, ...zmena } });
      void nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }

  async function prirad(vazbaId: string, vehicleId: string | null) {
    if (!cid) return;
    try {
      const r = await _prirad({
        data: { company_id: cid, vazba_id: vazbaId, vehicle_id: vehicleId },
      });
      toast.success(t("Uložené — upravených nákupov: {n}", { n: r.zmenene }));
      void nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }

  const duplicity = transakcie.filter((x) => x.blocek_id && !x.dobropis);

  return (
    <>
      <PageHeader
        title={t("Palivové karty")}
        description={t(
          "Nákupy palivovými kartami: tankovania s tachometrom k vozidlám, náklady vozidiel a mesačná faktúra ako prijatá faktúra s rozpisom. Karty s API (Shell) sa načítajú samy, pri kartách bez API (Up Déjeuner) nahráte mesačný výpis.",
        )}
        action={
          <Link to="/vozovy-park" className={TLACIDLO}>
            {t("Späť na vozový park")}
          </Link>
        }
      />
      <PageBody>
        <div className="space-y-6">
          {duplicity.length > 0 && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                {t(
                  "Pri {n} nákupoch kartou je vo Fakteri aj bloček z pumpy s rovnakým dňom a sumou. Daňovým dokladom je faktúra od vydavateľa karty — bloček nezaúčtujte, inak bude náklad aj DPH dvakrát.",
                  { n: duplicity.length },
                )}
              </div>
            </div>
          )}

          {/* Pripojenia */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">{t("Pripojené karty")}</h2>
            {pripojenia === null ? (
              <p className="mt-3 text-xs text-muted-foreground">{t("Načítavam…")}</p>
            ) : pripojenia.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("Zatiaľ žiadna. Vyberte poskytovateľa nižšie.")}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {pripojenia.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        <CreditCard className="h-4 w-4" /> {p.nazov}
                        <StavPripojenia stav={p.aktivne ? p.stav : "vypnute"} />
                      </div>
                      {poskytovatel(p.poskytovatel)?.nahratie ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("Zmluva")}: {p.prihlasenie_verejne?.zmluva || "—"} ·{" "}
                          {t("Posledné nahratie")}: {cas(p.posledna_sync_at)}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("Payer number")}: {p.prihlasenie_verejne?.payer_number ?? "—"} ·{" "}
                          {t("Client ID")}: {p.prihlasenie_verejne?.client_id_koniec ?? "••••"} ·{" "}
                          {t("Posledná synchronizácia")}: {cas(p.posledna_sync_at)}
                        </p>
                      )}
                      {p.posledna_chyba && (
                        <p className="mt-1 text-xs text-destructive">{p.posledna_chyba}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        <label className="inline-flex items-center gap-2">
                          <span className="text-muted-foreground">{t("Doklady")}</span>
                          <select
                            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                            value={p.rezim}
                            onChange={(e) =>
                              void nastav(p, { rezim: e.target.value as Pripojenie["rezim"] })
                            }
                          >
                            <option value="faktura">
                              {t("Mesačná faktúra ako prijatá faktúra")}
                            </option>
                            <option value="len_tankovania">
                              {t("Len tankovania, bez dokladov")}
                            </option>
                          </select>
                        </label>
                        {!poskytovatel(p.poskytovatel)?.nahratie && (
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={p.auto_sync}
                              onChange={(e) => void nastav(p, { auto_sync: e.target.checked })}
                            />
                            {t("Každú noc")}
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {poskytovatel(p.poskytovatel)?.nahratie ? (
                        <button
                          type="button"
                          className={TLACIDLO}
                          disabled={!p.aktivne}
                          onClick={() => {
                            setFormular(null);
                            setNahratie(p);
                          }}
                        >
                          <FileUp className="h-4 w-4" />
                          {t("Nahrať výpis")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={TLACIDLO}
                          disabled={bezi === p.id}
                          onClick={() => void synchronizuj(p.id)}
                        >
                          <RefreshCcw
                            className={`h-4 w-4 ${bezi === p.id ? "animate-spin" : ""}`}
                          />
                          {t("Synchronizovať teraz")}
                        </button>
                      )}
                      <button
                        type="button"
                        className={TLACIDLO}
                        onClick={() => setFormular({ poskytovatel: p.poskytovatel, id: p.id })}
                      >
                        {poskytovatel(p.poskytovatel)?.nahratie
                          ? t("Upraviť")
                          : t("Upraviť prístup")}
                      </button>
                      <button
                        type="button"
                        className={TLACIDLO}
                        onClick={() => void odpoj(p)}
                        aria-label={t("Odpojiť")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {formular && cid && (
            <FormularPripojenia
              companyId={cid}
              poskytovatelId={formular.poskytovatel}
              pripojenie={pripojenia?.find((p) => p.id === formular.id) ?? null}
              onZavri={() => setFormular(null)}
              onUlozene={(id) => {
                const nahratim = poskytovatel(formular.poskytovatel)?.nahratie;
                setFormular(null);
                void nacitaj().then(() => {
                  if (!nahratim) return synchronizuj(id);
                  // Pripojenie bez API — rovno ponúkni nahratie výpisu.
                  setNahratie({
                    id,
                    nazov: poskytovatel(formular.poskytovatel)?.nazov ?? "",
                  } as Pripojenie);
                });
              }}
            />
          )}

          {nahratie && cid && (
            <NahratieVypisuKarty
              key={nahratie.id}
              companyId={cid}
              pripojenieId={nahratie.id}
              nazov={nahratie.nazov}
              onZavri={() => setNahratie(null)}
              onUlozene={() => {
                setNahratie(null);
                void nacitaj();
              }}
            />
          )}

          {/* Poskytovatelia */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">{t("Pripojiť palivovú kartu")}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {POSKYTOVATELIA.map((p) => (
                <div key={p.id} className="min-w-0 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{p.nazov}</span>
                    {p.dostupne ? (
                      <button
                        type="button"
                        className={TLACIDLO}
                        onClick={() => setFormular({ poskytovatel: p.id, id: null })}
                      >
                        <Plug className="h-4 w-4" /> {t("Pripojiť")}
                      </button>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t("Pripravujeme")}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{t(p.pristup)}</p>
                  <a
                    href={p.dokumentacia}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-primary hover:underline"
                  >
                    {p.nahratie ? t("Web vydavateľa") : t("Dokumentácia API")}
                  </a>
                </div>
              ))}
            </div>
          </section>

          {/* Karty → vozidlá */}
          {vazby.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold">{t("Karty a vozidlá")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(
                  "Karta sa k vozidlu priradí sama podľa ŠPZ, ktorú má vydavateľ pri karte. Kartu vodiča alebo kartu bez ŠPZ priraďte ručne.",
                )}
              </p>
              <ul className="mt-3 divide-y divide-border text-sm">
                {vazby.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="font-mono">{v.karta}</span>
                      {v.spz && <span className="ml-2 text-muted-foreground">{v.spz}</span>}
                      {v.vodic && <span className="ml-2 text-muted-foreground">· {v.vodic}</span>}
                    </span>
                    <select
                      className="w-full max-w-xs rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                      value={v.vehicle_id ?? ""}
                      onChange={(e) => void prirad(v.id, e.target.value || null)}
                      aria-label={t("Vozidlo karty {karta}", { karta: v.karta })}
                    >
                      <option value="">{t("— bez vozidla —")}</option>
                      {vozidla
                        .filter((x) => x.active !== false || x.id === v.vehicle_id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {nazovVozidla.get(x.id)}
                          </option>
                        ))}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Nákupy */}
          {transakcie.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold">{t("Posledné nákupy kartou")}</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2">{t("Dátum")}</th>
                      <th className="py-1 pr-2">{t("Vozidlo")}</th>
                      <th className="py-1 pr-2">{t("Nákup")}</th>
                      <th className="py-1 pr-2 text-right">{t("Množstvo")}</th>
                      <th className="py-1 pr-2 text-right">{t("Suma")}</th>
                      <th className="py-1 pr-2 text-right">{t("Tachometer")}</th>
                      <th className="py-1">{t("Doklad")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transakcie.map((x) => (
                      <tr key={x.id}>
                        <td className="py-1.5 pr-2 whitespace-nowrap">{datumNaDoklade(x.datum)}</td>
                        <td className="py-1.5 pr-2">
                          {x.vehicle_id ? (
                            nazovVozidla.get(x.vehicle_id)
                          ) : (
                            <span className="text-muted-foreground">{x.spz || x.karta || "—"}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2">
                          <span className="inline-flex items-center gap-1">
                            {x.je_palivo && <Fuel className="h-3.5 w-3.5 text-muted-foreground" />}
                            {x.produkt ?? "—"}
                          </span>
                          {x.miesto && (
                            <span className="block text-xs text-muted-foreground">{x.miesto}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {x.mnozstvo != null
                            ? `${Number(x.mnozstvo).toLocaleString("sk-SK")} ${String(x.jednotka ?? "").toLowerCase()}`
                            : "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {formatujMenu(Number(x.spolu), x.mena || "EUR")}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {x.tachometer_km != null
                            ? `${Number(x.tachometer_km).toLocaleString("sk-SK")} km`
                            : "—"}
                        </td>
                        <td className="py-1.5 text-xs">
                          {x.purchase_invoice_id ? (
                            <Link
                              to="/prijate-faktury/$id"
                              params={{ id: x.purchase_invoice_id }}
                              className="text-primary hover:underline"
                            >
                              {x.faktura_cislo ?? t("prijatá faktúra")}
                            </Link>
                          ) : x.faktura_cislo ? (
                            <span className="text-muted-foreground">{x.faktura_cislo}</span>
                          ) : (
                            <span className="text-muted-foreground">{t("čaká na faktúru")}</span>
                          )}
                          {x.blocek_id && (
                            <Link
                              to="/doklady/novy"
                              search={{ id: x.blocek_id } as any}
                              className="ml-1 inline-flex items-center gap-1 text-amber-700 hover:underline dark:text-amber-300"
                            >
                              <AlertTriangle className="h-3 w-3" /> {t("aj bloček")}
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {logy.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold">{t("Priebeh synchronizácie")}</h2>
              <ul className="mt-2 space-y-1 text-xs">
                {logy.map((l) => (
                  <li key={l.id} className="flex flex-wrap gap-2">
                    <span className="text-muted-foreground">{cas(l.created_at)}</span>
                    <span className={l.stav === "chyba" ? "text-destructive" : ""}>
                      {l.sprava ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </PageBody>
    </>
  );
}

function StavPripojenia({ stav }: { stav: string }) {
  const { t } = useT();
  const m: Record<string, [string, string]> = {
    ok: [
      t("V poriadku"),
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    ],
    nove: [t("Nové"), "bg-muted text-muted-foreground"],
    prebieha: [t("Prebieha"), "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"],
    chyba: [t("Chyba"), "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"],
    limit: [t("Obmedzené"), "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"],
    vypnute: [t("Vypnuté"), "bg-muted text-muted-foreground"],
  };
  const [text, trieda] = m[stav] ?? [stav, "bg-muted text-muted-foreground"];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${trieda}`}>{text}</span>;
}

function FormularPripojenia({
  companyId,
  poskytovatelId,
  pripojenie,
  onZavri,
  onUlozene,
}: {
  companyId: string;
  poskytovatelId: string;
  pripojenie: Pripojenie | null;
  onZavri: () => void;
  onUlozene: (id: string) => void;
}) {
  const { t } = useT();
  const meta = poskytovatel(poskytovatelId);
  const _uloz = useServerFn(ulozPripojenieKartyFn);
  const [nazov, setNazov] = useState(pripojenie?.nazov ?? meta?.nazov ?? "");
  const [rezim, setRezim] = useState<Pripojenie["rezim"]>(pripojenie?.rezim ?? "faktura");
  const [polia, setPolia] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const p of meta?.polia ?? []) {
      o[p.kluc] = p.tajne ? "" : (pripojenie?.prihlasenie_verejne?.[p.kluc] ?? p.predvolene ?? "");
    }
    return o;
  });
  const [uklada, setUklada] = useState(false);
  if (!meta) return null;

  async function uloz(e: FormEvent) {
    e.preventDefault();
    setUklada(true);
    try {
      const r = await _uloz({
        data: {
          company_id: companyId,
          id: pripojenie?.id ?? null,
          poskytovatel: poskytovatelId,
          nazov,
          rezim,
          auto_sync: pripojenie?.auto_sync ?? true,
          polia,
        },
      });
      toast.success(meta?.nahratie ? t("Uložené") : t("Pripojenie funguje a je uložené"));
      onUlozene(r.id);
    } catch (e: any) {
      toast.error(e?.message ?? t("Uloženie zlyhalo"));
    } finally {
      setUklada(false);
    }
  }

  return (
    <section className="rounded-xl border border-primary/40 bg-card p-5">
      <h2 className="text-base font-semibold">
        {pripojenie
          ? t("Upraviť prístup — {nazov}", { nazov: meta.nazov })
          : t("Pripojiť {nazov}", { nazov: meta.nazov })}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t(meta.pristup)}</p>
      <form onSubmit={uloz} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm">
          <span className="mb-1 block text-muted-foreground">{t("Názov")}</span>
          <input
            className={POLE}
            value={nazov}
            onChange={(e) => setNazov(e.target.value)}
            maxLength={120}
          />
        </label>
        {meta.faktury && (
          <label className="min-w-0 text-sm">
            <span className="mb-1 block text-muted-foreground">{t("Doklady")}</span>
            <select
              className={POLE}
              value={rezim}
              onChange={(e) => setRezim(e.target.value as Pripojenie["rezim"])}
            >
              <option value="faktura">{t("Mesačná faktúra ako prijatá faktúra")}</option>
              <option value="len_tankovania">{t("Len tankovania, bez dokladov")}</option>
            </select>
          </label>
        )}
        {meta.polia.map((p) => (
          <label key={p.kluc} className="min-w-0 text-sm">
            <span className="mb-1 block text-muted-foreground">
              {t(p.nazov)}
              {p.povinne && " *"}
            </span>
            {p.typ === "vyber" ? (
              <select
                className={POLE}
                value={polia[p.kluc] ?? ""}
                onChange={(e) => setPolia({ ...polia, [p.kluc]: e.target.value })}
              >
                {(p.moznosti ?? []).map((m) => (
                  <option key={m.hodnota} value={m.hodnota}>
                    {t(m.nazov)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={POLE}
                type={p.typ === "heslo" ? "password" : "text"}
                autoComplete="off"
                value={polia[p.kluc] ?? ""}
                placeholder={
                  p.tajne && pripojenie
                    ? `${pripojenie.prihlasenie_verejne?.[`${p.kluc}_koniec`] ?? "••••"} — ${t("nechať uložené")}`
                    : undefined
                }
                required={p.povinne && !(p.tajne && pripojenie)}
                onChange={(e) => setPolia({ ...polia, [p.kluc]: e.target.value })}
              />
            )}
            {p.pomoc && (
              <span className="mt-1 block text-xs text-muted-foreground">{t(p.pomoc)}</span>
            )}
          </label>
        ))}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={uklada}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />{" "}
            {uklada ? t("Overujem…") : meta.nahratie ? t("Uložiť") : t("Overiť a uložiť")}
          </button>
          <button type="button" className={TLACIDLO} onClick={onZavri}>
            {t("Zrušiť")}
          </button>
        </div>
      </form>
    </section>
  );
}
