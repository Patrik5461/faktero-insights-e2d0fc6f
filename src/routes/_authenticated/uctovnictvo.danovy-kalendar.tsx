import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, Download, Loader2, Settings2 } from "lucide-react";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { danovyKalendarFn, ulozNastaveniaKalendaraFn } from "@/lib/faktero/danovy-kalendar.functions";
import { icsKalendara, type NastaveniaKalendara, type Termin } from "@/lib/faktero/danovy-kalendar";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka, preloz } from "@/lib/i18n/jazyk";
import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";

export const Route = createFileRoute("/_authenticated/uctovnictvo/danovy-kalendar")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Daňový kalendár — Faktero") }],
  }),
  component: DanovyKalendarPage,
});

type Vysledok = Awaited<ReturnType<typeof danovyKalendarFn>>;
type Odstavka = { id: string; institucia: string; sluzba: string | null; zaciatok: string; koniec: string | null; zdroj: string };

const posun = (iso: string, mesiacov: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + mesiacov);
  return d.toISOString().slice(0, 10);
};
const dniDo = (iso: string, dnes: string) =>
  Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${dnes}T12:00:00Z`)) / 86_400_000);

function DanovyKalendarPage() {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const companyId = getActiveCompanyId();
  const nacitaj = useServerFn(danovyKalendarFn);
  const uloz = useServerFn(ulozNastaveniaKalendaraFn);
  const dnes = dnesBratislava();
  const od = posun(dnes, -1);
  const doo = posun(dnes, 12);
  const [v, setV] = useState<Vysledok | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [n, setN] = useState<NastaveniaKalendara>({});
  const [ukazNastavenia, setUkazNastavenia] = useState(false);
  const [uklada, setUklada] = useState(false);
  const [odstavky, setOdstavky] = useState<Odstavka[]>([]);

  const obnov = useCallback(async () => {
    if (!companyId) return;
    try {
      const r = await nacitaj({ data: { company_id: companyId, od, do: doo } });
      setV(r);
      setN(r.nastavenia as NastaveniaKalendara);
      setChyba(null);
    } catch (e: any) {
      setChyba(e?.message ?? t("Kalendár sa nepodarilo načítať."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, od, doo]);

  useEffect(() => {
    void obnov();
    void (supabase as any)
      .from("odstavky_institucii")
      .select("id, institucia, sluzba, zaciatok, koniec, zdroj")
      .eq("stav", "schvalene")
      .gte("zaciatok", `${od}T00:00:00Z`)
      .then(({ data }: any) => setOdstavky((data ?? []) as Odstavka[]));
  }, [obnov, od]);

  const poMesiacoch = useMemo(() => {
    const m = new Map<string, Termin[]>();
    for (const x of v?.terminy ?? []) {
      const k = x.datum.slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(x);
    }
    return [...m.entries()];
  }, [v]);

  /** Odstávka Finančnej správy v 3 dňoch pred lehotou (alebo v jej deň) — upozornenie. */
  const odstavkaPred = (x: Termin) => {
    const koniec = Date.parse(`${x.datum}T23:59:59Z`);
    const zaciatok = koniec - 4 * 86_400_000;
    return odstavky.find((o) => {
      if (o.zdroj !== "fs" && o.zdroj !== "upvs") return false;
      const a = Date.parse(o.zaciatok);
      return a <= koniec && (o.koniec ? Date.parse(o.koniec) : a) >= zaciatok;
    });
  };

  async function ulozit() {
    if (!companyId) return;
    setUklada(true);
    try {
      const cisty = Object.fromEntries(Object.entries(n).filter(([, x]) => x !== undefined && (x as unknown) !== "")) as any;
      await uloz({ data: { company_id: companyId, nastavenia: cisty } });
      toast.success(t("Nastavenia kalendára uložené."));
      setUkazNastavenia(false);
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nastavenia sa nepodarilo uložiť."));
    } finally {
      setUklada(false);
    }
  }

  function stiahniIcs() {
    if (!v) return;
    const blob = new Blob([icsKalendara(v.terminy.filter((x) => x.datum >= dnes), v.firma)], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "danovy-kalendar-faktero.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const sk = v?.fakty.krajina !== "CZ";
  const vyber = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const mesiacNadpis = (k: string) =>
    new Date(`${k}-15T12:00:00Z`).toLocaleDateString(loc, { month: "long", year: "numeric", timeZone: "Europe/Bratislava" });

  return (
    <>
      <PageHeader
        title={t("Daňový kalendár")}
        description={t("Termíny podaní a platieb, ktoré sa týkajú tejto firmy — podľa toho, čo o nej Faktero vie, a podľa nastavenia nižšie. Lehota, ktorá pripadne na víkend alebo sviatok, je už posunutá na najbližší pracovný deň.")}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setUkazNastavenia((x) => !x)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
            >
              <Settings2 className="h-4 w-4" /> {t("Nastavenia")}
            </button>
            <button
              type="button"
              onClick={stiahniIcs}
              disabled={!v}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
              title={t("Súbor .ics na import do Google, Outlook alebo Apple kalendára (s pripomienkou 3 dni vopred)")}
            >
              <Download className="h-4 w-4" /> {t("Do kalendára (.ics)")}
            </button>
          </div>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-4xl space-y-4">
          {chyba && <p className="text-sm text-destructive">{chyba}</p>}
          {!v && !chyba && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
            </p>
          )}

          {v && (ukazNastavenia || Object.keys(v.nastavenia ?? {}).length === 0) && (
            <div className="rounded-xl border border-border bg-card p-4 text-sm sm:p-5">
              <h2 className="text-base font-semibold">{t("Nastavenie kalendára")}</h2>
              <p className="mt-1 text-muted-foreground">
                {t("Toto Faktero z dokladov nevie — vyplňte raz. Platiteľa DPH, zamestnancov, vozidlá, OSS a dodania do EÚ berie z údajov firmy.")}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {v.fakty.platitelDph && (
                  <label className="block">
                    <span className="text-xs text-muted-foreground">{t("Zdaňovacie obdobie DPH")}</span>
                    <select className={vyber} value={n.dph_obdobie ?? "mesacne"} onChange={(e) => setN({ ...n, dph_obdobie: e.target.value as any })}>
                      <option value="mesacne">{t("Mesačne")}</option>
                      <option value="stvrtrocne">{t("Štvrťročne")}</option>
                    </select>
                  </label>
                )}
                {sk ? (
                  <>
                    <label className="block">
                      <span className="text-xs text-muted-foreground">{t("Preddavky na daň z príjmov")}</span>
                      <select className={vyber} value={n.preddavky_dzp ?? "ziadne"} onChange={(e) => setN({ ...n, preddavky_dzp: e.target.value as any })}>
                        <option value="ziadne">{t("Neplatím (daň do 5 000 €)")}</option>
                        <option value="stvrtrocne">{t("Štvrťročne (daň 5 000 – 16 600 €)")}</option>
                        <option value="mesacne">{t("Mesačne (daň nad 16 600 €)")}</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted-foreground">{t("Daňové priznanie k dani z príjmov")}</span>
                      <select className={vyber} value={String(n.odklad_dp ?? 0)} onChange={(e) => setN({ ...n, odklad_dp: Number(e.target.value) as any })}>
                        <option value="0">{t("Do 31. 3.")}</option>
                        <option value="3">{t("S odkladom o 3 mesiace (30. 6.)")}</option>
                        <option value="6">{t("S odkladom o 6 mesiacov — príjmy zo zahraničia (30. 9.)")}</option>
                      </select>
                    </label>
                    {v.fakty.maVozidla && (
                      <label className="block">
                        <span className="text-xs text-muted-foreground">{t("Preddavky na daň z motorových vozidiel")}</span>
                        <select className={vyber} value={n.dmv_preddavky ?? "ziadne"} onChange={(e) => setN({ ...n, dmv_preddavky: e.target.value as any })}>
                          <option value="ziadne">{t("Neplatím (daň do 700 €)")}</option>
                          <option value="stvrtrocne">{t("Štvrťročne (700 – 8 300 €)")}</option>
                          <option value="mesacne">{t("Mesačne (nad 8 300 €)")}</option>
                        </select>
                      </label>
                    )}
                    {v.fakty.maZamestnancov && (
                      <label className="block">
                        <span className="text-xs text-muted-foreground">{t("Deň výplaty miezd (splatnosť poistného)")}</span>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          className={vyber}
                          placeholder={t("prázdne = koniec mesiaca")}
                          value={n.vyplatny_den ?? ""}
                          onChange={(e) => setN({ ...n, vyplatny_den: e.target.value ? Number(e.target.value) : null })}
                        />
                      </label>
                    )}
                    {v.fakty.platitelDph && (
                      <label className="flex items-center gap-2 self-end pb-2">
                        <input type="checkbox" checked={!!n.sv_stvrtrocne} onChange={(e) => setN({ ...n, sv_stvrtrocne: e.target.checked })} />
                        <span>{t("Súhrnný výkaz podávam štvrťročne")}</span>
                      </label>
                    )}
                    <label className="flex items-center gap-2 self-end pb-2">
                      <input type="checkbox" checked={!!n.nehnutelnost_priznanie} onChange={(e) => setN({ ...n, nehnutelnost_priznanie: e.target.checked })} />
                      <span>{t("Tento rok podávam priznanie k dani z nehnuteľností (vznik alebo zmena)")}</span>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="block">
                      <span className="text-xs text-muted-foreground">{t("Zálohy na daň z příjmů")}</span>
                      <select className={vyber} value={n.cz_zalohy ?? "ziadne"} onChange={(e) => setN({ ...n, cz_zalohy: e.target.value as any })}>
                        <option value="ziadne">{t("Neplatím (daň do 30 000 Kč)")}</option>
                        <option value="pololetne">{t("Pololetně (30 000 – 150 000 Kč)")}</option>
                        <option value="stvrtrocne">{t("Čtvrtletně (nad 150 000 Kč)")}</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 self-end pb-2">
                      <input type="checkbox" checked={!!n.cz_poradca} onChange={(e) => setN({ ...n, cz_poradca: e.target.checked })} />
                      <span>{t("Přiznání podává daňový poradce (1. 7.)")}</span>
                    </label>
                  </>
                )}
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void ulozit()}
                  disabled={uklada}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {uklada && <Loader2 className="h-4 w-4 animate-spin" />} {t("Uložiť")}
                </button>
              </div>
            </div>
          )}

          {v && poMesiacoch.length === 0 && <p className="text-sm text-muted-foreground">{t("V najbližších mesiacoch nemá firma žiadny termín.")}</p>}

          {poMesiacoch.map(([mes, zoznam]) => (
            <section key={mes} className="rounded-xl border border-border bg-card">
              <h2 className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold capitalize">
                <CalendarDays className="h-4 w-4 text-primary" /> {mesiacNadpis(mes)}
              </h2>
              <ul className="divide-y divide-border">
                {zoznam.map((x) => {
                  const d = dniDo(x.datum, dnes);
                  const odst = odstavkaPred(x);
                  const minule = d < 0;
                  return (
                    <li key={`${x.druh}-${x.datum}-${x.obdobie}`} className={`flex flex-wrap items-start gap-3 px-4 py-2.5 text-sm ${minule ? "opacity-50" : ""}`}>
                      <div className="w-24 shrink-0 tabular-nums">
                        <div className="font-semibold">
                          {new Date(`${x.datum}T12:00:00Z`).toLocaleDateString(loc, { day: "numeric", month: "numeric", timeZone: "Europe/Bratislava" })}
                        </div>
                        <div className={`text-xs ${!minule && d <= 7 ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                          {minule ? t("uplynulo") : d === 0 ? t("dnes") : t("o {n} dní", { n: d })}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{t(x.nazov)}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("za {obdobie}", { obdobie: x.obdobie })} · {x.paragraf}
                          {x.povodny ? ` · ${t("posunuté z {d} (víkend alebo sviatok)", { d: new Date(`${x.povodny}T12:00:00Z`).toLocaleDateString(loc, { day: "numeric", month: "numeric" }) })}` : ""}
                        </div>
                        {odst && !minule && (
                          <div className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {t("Pred lehotou je plánovaná odstávka: {sluzba} {kedy} — podajte radšej skôr.", {
                              sluzba: odst.sluzba || odst.institucia,
                              kedy: new Date(odst.zaciatok).toLocaleString(loc, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" }),
                            })}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            {t("Lehoty podľa zákonov platných k 26. 11. 2026. Kalendár je pomôcka — za podanie zodpovedá firma alebo jej účtovník.")}
          </p>
        </div>
      </PageBody>
    </>
  );
}
