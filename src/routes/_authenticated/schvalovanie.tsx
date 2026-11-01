import { createFileRoute, Link } from "@tanstack/react-router";
import { obnovPoctyMenu } from "@/lib/faktero/pocty-menu";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Undo2, XCircle } from "lucide-react";
import { EmptyState } from "@/components/faktero/ListControls";
import { StavOdznak, type TonStavu } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { cakajuNaMnaFn, rozhodnutieFn } from "@/lib/faktero/schvalovanie.functions";
import {
  NAZVY_AGEND,
  NAZVY_STAVOV,
  odkazNaDetail,
  vyberPoAgendach,
  type AgendaSchvalovania,
} from "@/lib/faktero/schvalovanie";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";

/** Tón stavu schvaľovania (redizajn) — text stavu ostáva z NAZVY_STAVOV. */
const TON_STAVU_SCHVALOVANIA: Record<string, TonStavu> = {
  caka: "pozor",
  vrateny: "priebeh",
  schvaleny: "uspech",
  zamietnuty: "chyba",
};

/** Doklady, ktoré čakajú na moje schválenie — jednotlivo aj hromadne. */
export const Route = createFileRoute("/_authenticated/schvalovanie")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Na schválenie — Faktero") }] }),
  component: Stranka,
});

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
      // Všetky agendy zo spoločného zoznamu — aj nespracované doklady a vyúčtovania.
      for (const { agenda, ids } of vyberPoAgendach(d.polozky, vyber)) {
        const r = await rozhodni({ data: { company_id: companyId, agenda, ids, akcia, poznamka } });
        spolu += r.hotovo;
      }
      toast.success(t("Hotovo: {n}", { n: spolu }));
      if (spolu) obnovPoctyMenu();
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
          <div className="rounded-xl border border-border bg-card">
            <NacitavanieStav />
          </div>
        ) : !d.zapnute ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            {t("Schvaľovanie nie je zapnuté. Zapína sa v")}{" "}
            <Link to="/nastavenia/schvalovanie" className="font-semibold text-primary underline underline-offset-2">
              {t("Nastavenia → Schvaľovanie dokladov")}
            </Link>
            .
          </p>
        ) : d.polozky.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState title="Nič nečaká na vaše schválenie." icon={CheckCircle2} />
          </div>
        ) : (
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={poznamka}
                onChange={(e) => setPoznamka(e.target.value)}
                placeholder={t("Poznámka (pri zamietnutí a vrátení povinná)")}
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              />
              <button
                onClick={() => hromadne("schvalit")}
                disabled={busy || !vyber.size}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {t("Schváliť ({n})", { n: vyber.size })}
              </button>
              <button
                onClick={() => hromadne("vratit")}
                disabled={busy || !vyber.size}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" /> {t("Vrátiť")}
              </button>
              <button
                onClick={() => hromadne("zamietnut")}
                disabled={busy || !vyber.size}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/40 bg-card px-3 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" /> {t("Zamietnuť")}
              </button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="whitespace-nowrap bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="w-8 py-2 pl-2">
                      <input
                        type="checkbox"
                        aria-label={t("Vybrať všetky")}
                        checked={vyber.size === d.polozky.length}
                        onChange={(e) =>
                          setVyber(e.target.checked ? new Set(d.polozky.map((p) => `${p.agenda}:${p.id}`)) : new Set())
                        }
                      />
                      <span className="sr-only">{t("Výber")}</span>
                    </th>
                    <th className="py-2 pr-3 font-semibold">{t("Doklad")}</th>
                    <th className="py-2 pr-3 font-semibold">{t("Partner")}</th>
                    <th className="py-2 pr-3 font-semibold">{t("Dátum")}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t("Suma")}</th>
                    <th className="py-2 pr-2 font-semibold">{t("Stav")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.polozky.map((p) => {
                    const k = `${p.agenda}:${p.id}`;
                    return (
                      <tr key={k} className="border-t border-border">
                        <td className="py-2 pl-2">
                          <input
                            type="checkbox"
                            aria-label={t("Vybrať riadok")}
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
                          <Link {...(odkazNaDetail(p.agenda, p.id) as any)} className="cislo-dokladu text-primary hover:underline">
                            {p.cislo || t("bez čísla")}
                          </Link>
                          <span className="block text-xs text-muted-foreground">{t(NAZVY_AGEND[p.agenda as AgendaSchvalovania])}</span>
                        </td>
                        <td className="py-1.5 pr-3">{p.partner ?? "—"}</td>
                        <td className="whitespace-nowrap py-1.5 pr-3">{datumNaDoklade(p.datum)}</td>
                        <td className="suma py-1.5 pr-3 text-right">
                          {p.suma == null ? "—" : formatujMenu(p.suma, p.mena)}
                        </td>
                        <td className="py-1.5 pr-2 text-xs">
                          <StavOdznak ton={TON_STAVU_SCHVALOVANIA[p.stav] ?? "neutralny"} maly>
                            {t(NAZVY_STAVOV[p.stav as keyof typeof NAZVY_STAVOV] ?? "")}
                          </StavOdznak>{" "}
                          <span className="text-muted-foreground">· {p.odznak}</span>
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
