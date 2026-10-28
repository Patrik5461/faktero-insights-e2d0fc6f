import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Undo2, XCircle } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { cakajuNaMnaFn, rozhodnutieFn } from "@/lib/faktero/schvalovanie.functions";
import { NAZVY_AGEND, NAZVY_STAVOV, type AgendaSchvalovania } from "@/lib/faktero/schvalovanie";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";

/** Doklady, ktoré čakajú na moje schválenie — jednotlivo aj hromadne. */
export const Route = createFileRoute("/_authenticated/schvalovanie")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Na schválenie — Faktero") }] }),
  component: Stranka,
});

const ODKAZ: Record<AgendaSchvalovania, (id: string) => { to: string; params?: any; search?: any }> = {
  doklad: (id) => ({ to: "/doklady/novy", search: { id } }),
  prijata: (id) => ({ to: "/prijate-faktury/$id", params: { id } }),
  vystavena: (id) => ({ to: "/faktury/$id", params: { id } }),
  nespracovany: (id) => ({ to: "/nespracovane/$id", params: { id } }),
  vyuctovanie: (id) => ({ to: "/doklady/vyuctovania/$id", params: { id } }),
};

function Stranka() {
  const { t } = useT();
  const companyId = getActiveCompanyId();
  const nacitaj = useServerFn(cakajuNaMnaFn);
  const rozhodni = useServerFn(rozhodnutieFn);
  const [d, setD] = useState<{ zapnute: boolean; polozky: any[] } | null>(null);
  const [vyber, setVyber] = useState<Set<string>>(new Set());
  const [poznamka, setPoznamka] = useState("");
  const [busy, setBusy] = useState(false);

  const obnov = async () => {
    if (!companyId) return;
    try {
      setD(await nacitaj({ data: { company_id: companyId } }));
      setVyber(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa načítať"));
      setD({ zapnute: false, polozky: [] });
    }
  };
  useEffect(() => {
    void obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function hromadne(akcia: "schvalit" | "zamietnut" | "vratit") {
    if (!d || !companyId) return;
    if (akcia !== "schvalit" && !poznamka.trim()) return toast.error(t("Napíšte dôvod."));
    setBusy(true);
    try {
      let spolu = 0;
      for (const agenda of ["doklad", "prijata", "vystavena"] as const) {
        const ids = d.polozky.filter((p) => p.agenda === agenda && vyber.has(`${agenda}:${p.id}`)).map((p) => p.id);
        if (!ids.length) continue;
        const r = await rozhodni({ data: { company_id: companyId, agenda, ids, akcia, poznamka } });
        spolu += r.hotovo;
      }
      toast.success(t("Hotovo: {n}", { n: spolu }));
      setPoznamka("");
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t("Na schválenie")} description={t("Doklady, ktoré čakajú na vaše schválenie.")} />
      <PageBody>
        {!d ? (
          <p className="text-sm text-muted-foreground">{t("Načítavam…")}</p>
        ) : !d.zapnute ? (
          <p className="text-sm text-muted-foreground">
            {t("Schvaľovanie nie je zapnuté. Zapína sa v")}{" "}
            <Link to="/nastavenia/schvalovanie" className="underline">
              {t("Nastavenia → Schvaľovanie dokladov")}
            </Link>
            .
          </p>
        ) : d.polozky.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nič nečaká na vaše schválenie.")}</p>
        ) : (
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={poznamka}
                onChange={(e) => setPoznamka(e.target.value)}
                placeholder={t("Poznámka (pri zamietnutí a vrátení povinná)")}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => hromadne("schvalit")}
                disabled={busy || !vyber.size}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {t("Schváliť ({n})", { n: vyber.size })}
              </button>
              <button
                onClick={() => hromadne("vratit")}
                disabled={busy || !vyber.size}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" /> {t("Vrátiť")}
              </button>
              <button
                onClick={() => hromadne("zamietnut")}
                disabled={busy || !vyber.size}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" /> {t("Zamietnuť")}
              </button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="w-8 py-1">
                      <input
                        type="checkbox"
                        aria-label={t("Vybrať všetky")}
                        checked={vyber.size === d.polozky.length}
                        onChange={(e) =>
                          setVyber(e.target.checked ? new Set(d.polozky.map((p) => `${p.agenda}:${p.id}`)) : new Set())
                        }
                      />
                    </th>
                    <th className="py-1 pr-3 font-medium">{t("Doklad")}</th>
                    <th className="py-1 pr-3 font-medium">{t("Partner")}</th>
                    <th className="py-1 pr-3 font-medium">{t("Dátum")}</th>
                    <th className="py-1 pr-3 text-right font-medium">{t("Suma")}</th>
                    <th className="py-1 font-medium">{t("Stav")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.polozky.map((p) => {
                    const k = `${p.agenda}:${p.id}`;
                    return (
                      <tr key={k} className="border-t border-border">
                        <td className="py-1.5">
                          <input
                            type="checkbox"
                            checked={vyber.has(k)}
                            onChange={(e) => {
                              const n = new Set(vyber);
                              if (e.target.checked) n.add(k);
                              else n.delete(k);
                              setVyber(n);
                            }}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <Link {...(ODKAZ[p.agenda as AgendaSchvalovania](p.id) as any)} className="font-medium hover:underline">
                            {p.cislo || t("bez čísla")}
                          </Link>
                          <span className="block text-xs text-muted-foreground">{t(NAZVY_AGEND[p.agenda as AgendaSchvalovania])}</span>
                        </td>
                        <td className="py-1.5 pr-3">{p.partner ?? "—"}</td>
                        <td className="py-1.5 pr-3">{datumNaDoklade(p.datum)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {p.suma == null ? "—" : formatujMenu(p.suma, p.mena)}
                        </td>
                        <td className="py-1.5 text-xs">
                          {t(NAZVY_STAVOV[p.stav as keyof typeof NAZVY_STAVOV] ?? "")} · {p.odznak}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </PageBody>
    </>
  );
}
