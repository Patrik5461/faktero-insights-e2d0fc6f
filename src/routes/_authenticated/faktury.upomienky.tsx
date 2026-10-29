import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Settings, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { DocumentListToolbar, HlavickaViac } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { usePostupneZobrazenie } from "@/hooks/usePostupneZobrazenie";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import { vsetkyRiadky } from "@/lib/faktero/strankovanie";
import { stiahniExcel, tabulka } from "@/lib/faktero/excel-zoznamu";
import {
  filtrujUpomienky,
  moznostiKlientov,
  nazovKlienta,
  jeNeuspesna,
  podlaKlienta,
  suhrnUpomienok,
  type RiadokUpomienky,
} from "@/lib/faktero/upomienky-prehlad";

/*
  Odoslané upomienky — každý e-mail upomienky, automatický aj ručný, aj tie,
  ktoré sa odoslať nepodarilo. Záznamy píše `sendReminder` do
  `invoice_reminders`; táto stránka ich len číta (RLS podľa práva na faktúry).
*/
export const Route = createFileRoute("/_authenticated/faktury/upomienky")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Odoslané upomienky — Faktero") }],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: OdoslaneUpomienky,
});

const casOdoslania = (iso: string) =>
  new Date(iso).toLocaleString("sk-SK", {
    timeZone: "Europe/Bratislava",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function OdoslaneUpomienky() {
  const { t } = useT();
  const [companyId, setCompanyId] = useState<string | null>(null);
  useEffect(() => setCompanyId(getActiveCompanyId()), []);
  const lf = useListFilters({ pageSizeKey: "upomienky" });
  const { od, do: doDna } = lf.rozsah("obdobie");
  const stav = lf.filter("stav") as "" | "sent" | "failed";
  const sposob = lf.filter("sposob") as "" | "auto" | "manual";
  const klient = lf.filter("klient");
  const podlaKlientov = lf.filter("pohlad") === "klient";

  // Všetky upomienky firmy po stránkach — PostgREST vráti naraz najviac 1 000.
  const q = useQuery({
    queryKey: ["odoslane-upomienky", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const riadky = await vsetkyRiadky<RiadokUpomienky>(
        (zac, kon) =>
          supabase
            .from("invoice_reminders")
            .select(
              "id, sent_at, email_to, reminder_number, status, error_message, triggered_by, sent_by, invoice_id, invoices(invoice_number, customer_name, customer_id)",
            )
            .eq("company_id", companyId!)
            .order("sent_at", { ascending: false })
            .order("id")
            .range(zac, kon) as any,
      );
      // Mená tých, čo upomienku odoslali ručne.
      const ids = [...new Set(riadky.map((r) => r.sent_by).filter(Boolean))] as string[];
      const mena: Record<string, string> = {};
      if (ids.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        for (const p of data ?? []) mena[p.id] = p.full_name || p.email || "";
      }
      return { riadky, mena };
    },
  });

  const vsetky = useMemo(() => q.data?.riadky ?? [], [q.data]);
  const mena = q.data?.mena ?? {};
  const zobrazene = useMemo(
    () => filtrujUpomienky(vsetky, { od, do: doDna, klient, stav, sposob, q: lf.q }),
    [vsetky, od, doDna, klient, stav, sposob, lf.q],
  );
  const suhrn = useMemo(() => suhrnUpomienok(zobrazene), [zobrazene]);
  const skupiny = useMemo(
    () => (podlaKlientov ? podlaKlienta(zobrazene) : []),
    [podlaKlientov, zobrazene],
  );
  const klienti = useMemo(() => moznostiKlientov(vsetky), [vsetky]);
  const { viditelne, zarazkaRiadok, zarazka } = usePostupneZobrazenie(zobrazene, {
    reset: [od, doDna, klient, stav, sposob, lf.q],
  });
  const [rozbalene, setRozbalene] = useState<Record<string, boolean>>({});

  const sposobText = (r: RiadokUpomienky) => {
    if (r.triggered_by === "auto") return t("Automaticky");
    const kto = r.sent_by ? mena[r.sent_by] : "";
    return kto ? t("Ručne ({kto})", { kto }) : t("Ručne");
  };
  const stupen = (n: number) => t("{n}. upomienka", { n });

  function stiahni() {
    void stiahniExcel(`odoslane-upomienky-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        nazov: t("Upomienky"),
        data: tabulka(zobrazene, [
          { nazov: t("Dátum a čas"), hodnota: (r) => casOdoslania(r.sent_at) },
          { nazov: t("Klient"), hodnota: (r) => nazovKlienta(r) },
          { nazov: t("E-mail"), hodnota: (r) => r.email_to },
          { nazov: t("Faktúra"), hodnota: (r) => r.invoices?.invoice_number ?? "" },
          { nazov: t("Stupeň"), hodnota: (r) => r.reminder_number },
          { nazov: t("Spôsob"), hodnota: (r) => sposobText(r) },
          {
            nazov: t("Stav"),
            hodnota: (r) => (jeNeuspesna(r) ? t("Chyba") : t("Odoslané")),
          },
          { nazov: t("Dôvod chyby"), hodnota: (r) => r.error_message ?? "" },
        ]),
      },
    ]);
  }

  function stavBunka(r: RiadokUpomienky) {
    return jeNeuspesna(r) ? (
      <span className="text-xs text-destructive">
        <span className="font-medium">{t("Chyba")}</span>
        {r.error_message && (
          <span className="block max-w-xs break-words text-muted-foreground">
            {r.error_message}
          </span>
        )}
      </span>
    ) : (
      <span className="text-xs font-medium text-primary">{t("Odoslané")}</span>
    );
  }

  function fakturaOdkaz(r: RiadokUpomienky) {
    return (
      <Link
        to="/faktury/$id"
        params={{ id: r.invoice_id }}
        className="font-medium text-primary hover:underline"
      >
        {r.invoices?.invoice_number ?? t("Faktúra")}
      </Link>
    );
  }

  function riadokTabulky(r: RiadokUpomienky, sKlientom = true) {
    return (
      <tr key={r.id} className="align-top">
        <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
          {casOdoslania(r.sent_at)}
        </td>
        {sKlientom && <td className="p-3">{nazovKlienta(r)}</td>}
        <td className="break-all p-3 text-xs">{r.email_to}</td>
        <td className="whitespace-nowrap p-3">{fakturaOdkaz(r)}</td>
        <td className="whitespace-nowrap p-3 text-xs">{stupen(r.reminder_number)}</td>
        <td className="p-3 text-xs text-muted-foreground">{sposobText(r)}</td>
        <td className="p-3">{stavBunka(r)}</td>
      </tr>
    );
  }

  const hlavicka = (sKlientom = true) => (
    <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
      <tr>
        <th className="p-3">{t("Dátum a čas")}</th>
        {sKlientom && <th className="p-3">{t("Klient")}</th>}
        <th className="p-3">{t("E-mail")}</th>
        <th className="p-3">{t("Faktúra")}</th>
        <th className="p-3">{t("Stupeň")}</th>
        <th className="p-3">{t("Spôsob")}</th>
        <th className="p-3">{t("Stav")}</th>
      </tr>
    </thead>
  );

  const prazdne = q.isLoading
    ? t("Načítavam…")
    : vsetky.length === 0
      ? t("Zatiaľ neodišla žiadna upomienka.")
      : zobrazene.length === 0
        ? t("Nič nevyhovuje filtru.")
        : null;

  const karta = (label: string, hodnota: number, onClick?: () => void, cervena = false) => {
    const obsah = (
      <>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={`mt-1 text-2xl font-semibold tabular-nums ${cervena && hodnota > 0 ? "text-destructive" : ""}`}
        >
          {hodnota}
        </div>
      </>
    );
    return onClick ? (
      <button
        type="button"
        onClick={onClick}
        className="min-w-0 rounded-xl border border-border bg-card p-4 text-left hover:bg-secondary"
      >
        {obsah}
      </button>
    ) : (
      <div className="min-w-0 rounded-xl border border-border bg-card p-4">{obsah}</div>
    );
  };

  return (
    <>
      <PageHeader
        title={t("Odoslané upomienky")}
        description={t(
          "Všetky e-maily upomienok — automatické aj ručné, komu odišli a či sa odoslanie podarilo.",
        )}
        action={
          <HlavickaViac
            akcie={[
              { label: "Excel", icon: Download, onClick: stiahni },
              { label: "Nastavenie upomienok", icon: Settings, to: "/firma" },
            ]}
          />
        }
      />
      <PageBody>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {karta(t("E-mailov"), suhrn.emailov)}
          {karta(t("Klientov"), suhrn.klientov)}
          {karta(t("Faktúr"), suhrn.faktur)}
          {karta(
            t("Neúspešné"),
            suhrn.neuspesnych,
            suhrn.neuspesnych > 0 ? () => lf.setFilter("stav", "failed") : undefined,
            true,
          )}
        </div>

        <DocumentListToolbar
          lf={lf}
          searchPlaceholder="Hľadať klienta, e-mail, číslo faktúry…"
          filters={[
            { key: "obdobie", label: "Obdobie", type: "dateRange" },
            {
              key: "klient",
              label: "Klient",
              type: "select",
              options: klienti,
              allLabel: "Všetci klienti",
            },
            {
              key: "stav",
              label: "Stav",
              type: "select",
              options: [
                { value: "sent", label: "Odoslané" },
                { value: "failed", label: "Chyba" },
              ],
            },
            {
              key: "sposob",
              label: "Spôsob",
              type: "select",
              options: [
                { value: "auto", label: "Automaticky" },
                { value: "manual", label: "Ručne" },
              ],
            },
          ]}
          extra={
            <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-input text-sm">
              {[
                { v: "", label: t("Zoznam") },
                { v: "klient", label: t("Podľa klienta") },
              ].map((p) => (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => lf.setFilter("pohlad", p.v)}
                  className={`h-9 px-3 ${(podlaKlientov ? "klient" : "") === p.v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-secondary"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          }
        />

        {prazdne ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {prazdne}
          </div>
        ) : podlaKlientov ? (
          <div className="space-y-3">
            {skupiny.map((s) => {
              const otvorena = !!rozbalene[s.kluc];
              return (
                <div key={s.kluc} className="rounded-xl border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setRozbalene((x) => ({ ...x, [s.kluc]: !otvorena }))}
                    aria-expanded={otvorena}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left hover:bg-secondary/50"
                  >
                    {otvorena ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{s.nazov}</div>
                      <div className="break-all text-xs text-muted-foreground">
                        {s.emaily.join(", ")}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{t("Odoslané: {n}", { n: s.odoslanych })}</span>
                      {s.neuspesnych > 0 && (
                        <span className="text-destructive">
                          {t("Chyba: {n}", { n: s.neuspesnych })}
                        </span>
                      )}
                      <span>{t("Faktúr: {n}", { n: s.faktur })}</span>
                      <span>{t("Posledná {cas}", { cas: casOdoslania(s.posledna) })}</span>
                    </div>
                  </button>
                  {otvorena && (
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full text-sm">
                        {hlavicka(false)}
                        <tbody className="divide-y divide-border">
                          {s.riadky.map((r) => riadokTabulky(r, false))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* Mobil: karty namiesto širokej tabuľky. */}
            <div className="space-y-3 md:hidden">
              {viditelne.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{nazovKlienta(r)}</div>
                      <div className="break-all text-xs text-muted-foreground">{r.email_to}</div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {casOdoslania(r.sent_at)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {fakturaOdkaz(r)}
                    <span className="text-xs">{stupen(r.reminder_number)}</span>
                    <span className="text-xs text-muted-foreground">{sposobText(r)}</span>
                  </div>
                  <div className="mt-2">{stavBunka(r)}</div>
                </div>
              ))}
              {zarazka()}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
              <table className="w-full text-sm">
                {hlavicka()}
                <tbody className="divide-y divide-border">
                  {viditelne.map((r) => riadokTabulky(r))}
                  {zarazkaRiadok(7)}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
