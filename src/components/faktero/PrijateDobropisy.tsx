import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useListFilters } from "@/hooks/useListFilters";
import { useStrankovanie } from "@/hooks/useStrankovanie";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { TabulkaZoznamu } from "@/components/faktero/TabulkaZoznamu";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { OdovzdaneIkona } from "@/components/faktero/OdovzdaneIkona";
import { StavOdznak, type TonStavu } from "@/components/faktero/web/Stav";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import {
  OR_PRIJATY_DOBROPIS,
  TYPY_MIMO_DOBROPISU,
  hladajPrijateDobropisy,
  jePrijatyDobropis,
  smerDobropisov,
  sumaPrijatehoDobropisu,
} from "@/lib/faktero/prijate-dobropisy";

const STLPCE =
  "id,invoice_number,supplier_name,supplier_ico,issue_date,datum_dph,due_date,amount_total,currency,status,type,opravuje_cislo,exported_at";

// Stavy prijatej faktúry — rovnaké texty a tóny ako v zozname Prijatých faktúr.
const STAV: Record<string, [string, TonStavu]> = {
  draft: ["Koncept", "neutralny"],
  received: ["Prijaté", "informacia"],
  booked: ["Zaúčtované", "priebeh"],
  paid: ["Zaplatené", "uspech"],
  cancelled: ["Stornované", "zruseny"],
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const [text, ton] = STAV[status] ?? [status, "neutralny" as TonStavu];
  return <StavOdznak ton={ton}>{t(text)}</StavOdznak>;
}

/**
 * Karty Vydané | Prijaté nad zoznamom dobropisov. Parametre ostávajú v
 * `search` (nie v `to`), položka menu „Dobropisy“ svieti na oboch, lebo
 * `activeChildKey` porovnáva len `type=credit`.
 */
export function KartyDobropisov({ smer }: { smer: unknown }) {
  const { t } = useT();
  const aktivna = smerDobropisov(smer) ?? "vydane";
  const karta = (k: "vydane" | "prijate", text: string) => (
    <Link
      to="/faktury"
      search={(k === "prijate" ? { type: "credit", smer: "prijate" } : { type: "credit" }) as any}
      role="tab"
      aria-selected={aktivna === k}
      className={
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium " +
        (aktivna === k
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground")
      }
    >
      {t(text)}
    </Link>
  );
  return (
    <div role="tablist" aria-label={t("Dobropisy")} className="mb-3 flex gap-1 border-b border-border">
      {karta("vydane", "Vydané")}
      {karta("prijate", "Prijaté")}
    </div>
  );
}

/** Prijaté dobropisy — len pohľad, detail je v Prijatých faktúrach. */
export function PrijateDobropisy() {
  const { t } = useT();
  const lf = useListFilters({ pageSizeKey: "prijate-dobropisy" });
  const [riadky, setRiadky] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hladanie, setHladanie] = useState(lf.q);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    let zrusene = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await (supabase as any)
        .from("purchase_invoices")
        .select(STLPCE)
        .eq("company_id", cid)
        .is("deleted_at", null)
        .not("type", "in", TYPY_MIMO_DOBROPISU)
        .or(OR_PRIJATY_DOBROPIS)
        .order("issue_date", { ascending: false })
        .limit(1000);
      if (zrusene) return;
      if (error) setChyba(error.message);
      // Rovnaké pravidlo aj na klientovi — „Opravuje číslo“ zo samých medzier dobropis nerobí.
      setRiadky(((data ?? []) as any[]).filter(jePrijatyDobropis));
      setLoading(false);
    })();
    return () => {
      zrusene = true;
    };
  }, []);

  const najdene = useMemo(() => hladajPrijateDobropisy(riadky, lf.q), [riadky, lf.q]);
  const str = useStrankovanie(najdene, lf, { reset: lf.q });

  const ciel = (id: string) => ({ to: "/prijate-faktury/$id", params: { id } }) as any;

  return (
    <>
      <form
        className="mb-3 flex max-w-md items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          lf.setQ(hladanie.trim());
        }}
      >
        <label className="relative flex-1">
          <span className="sr-only">{t("Hľadať")}</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={hladanie}
            onChange={(e) => setHladanie(e.target.value)}
            onBlur={() => lf.setQ(hladanie.trim())}
            placeholder={t("Hľadať číslo, dodávateľa, IČO…")}
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm"
          />
        </label>
      </form>
      <p className="mb-2 text-xs text-muted-foreground">
        {t("Prijaté dobropisy ostávajú aj v Prijatých faktúrach — tu sú len pre prehľad.")}
      </p>
      {chyba ? <p className="mb-2 text-sm text-destructive">{chyba}</p> : null}
      <ResponsiveTable
        items={str.viditelne}
        loading={loading}
        emptyText={t("Žiadne prijaté dobropisy.")}
        mobileCard={(r: any) => (
          <MobileListCard
            ciel={ciel(r.id)}
            title={
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="cislo-dokladu">{r.invoice_number || t("bez čísla")}</span>
                <OdovzdaneIkona kedy={r.exported_at} doklad={r} />
              </span>
            }
            subtitle={r.supplier_name ?? "—"}
            status={<StatusBadge status={r.status} />}
            meta={`${datumNaDoklade(r.issue_date)}${r.opravuje_cislo ? ` · ${t("k faktúre {cislo}", { cislo: r.opravuje_cislo })}` : ""}`}
            amount={formatujMenu(sumaPrijatehoDobropisu(r), r.currency ?? "EUR")}
          />
        )}
        desktop={
          <TabulkaZoznamu>
            <table className="w-full text-sm">
              <thead className="whitespace-nowrap bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-2 py-3">{t("Číslo")}</th>
                  <th className="px-2 py-3">{t("Dodávateľ")}</th>
                  <th className="px-2 py-3">{t("Opravuje faktúru")}</th>
                  <th className="px-2 py-3">{t("Vystavená")}</th>
                  <th className="px-2 py-3">{t("Splatnosť")}</th>
                  <th className="px-2 py-3 text-right">{t("Suma")}</th>
                  <th className="px-2 py-3">{t("Stav")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {t("Načítavam…")}
                    </td>
                  </tr>
                )}
                {!loading && str.viditelne.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {t("Žiadne prijaté dobropisy.")}
                    </td>
                  </tr>
                )}
                {!loading &&
                  str.viditelne.map((r: any) => (
                    <KlikatelnyRiadok key={r.id} ciel={ciel(r.id)} className="cursor-pointer hover:bg-muted/30">
                      <td className="px-2 py-3 font-medium">
                        <Link
                          to="/prijate-faktury/$id"
                          params={{ id: r.id }}
                          className="cislo-dokladu hover:underline"
                        >
                          {r.invoice_number || t("bez čísla")}
                        </Link>{" "}
                        <OdovzdaneIkona kedy={r.exported_at} doklad={r} />
                      </td>
                      <td className="px-2 py-3">{r.supplier_name ?? "—"}</td>
                      <td className="px-2 py-3">{r.opravuje_cislo || "—"}</td>
                      <td className="whitespace-nowrap px-2 py-3">{datumNaDoklade(r.issue_date)}</td>
                      <td className="whitespace-nowrap px-2 py-3">{datumNaDoklade(r.due_date)}</td>
                      <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">
                        {formatujMenu(sumaPrijatehoDobropisu(r), r.currency ?? "EUR")}
                      </td>
                      <td className="px-2 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                    </KlikatelnyRiadok>
                  ))}
              </tbody>
            </table>
          </TabulkaZoznamu>
        }
      />
      {str.stranky()}
    </>
  );
}
