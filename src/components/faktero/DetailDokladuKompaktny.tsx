import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Copy, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatujCislo, formatujMenu } from "@/lib/faktero/mena";
import { formatujIban, upravIban } from "@/lib/faktero/platobny-ucet";
import { bicZIban, kodBankyZIban } from "@/lib/faktero/bic-z-iban";
import { sumarPoSadzbach } from "@/lib/faktero/uhrady-prijatej";
import { useT } from "@/lib/i18n/useT";

/*
  Spoločné kúsky detailu dokladu v kompaktnom rozložení (prijatá faktúra,
  bloček): karta s nadpisom, údaj s ikonou, kopírovanie, dodávateľ |
  odberateľ, položky s „Zobraziť ďalšie“, platobné údaje a sumár po sadzbách.
  Farby len z tém (primary, destructive, muted) — rozloženie mení tvary.
*/

export function KartaK({
  nadpis,
  akcia,
  children,
  id,
  className = "",
}: {
  nadpis?: string;
  akcia?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const { t } = useT();
  return (
    <section
      id={id}
      aria-label={nadpis ? t(nadpis) : undefined}
      className={`min-w-0 scroll-mt-24 rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}
    >
      {nadpis || akcia ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {nadpis ? <h2 className="text-base font-semibold">{t(nadpis)}</h2> : <span />}
          {akcia}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Údaj v hlavičke: ikona, malý popis a hodnota. */
export function UdajK({
  ikona: Ikona,
  popis,
  children,
  doplnok,
}: {
  ikona?: LucideIcon;
  popis: string;
  children: ReactNode;
  doplnok?: ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {Ikona ? (
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
          <Ikona className="h-4 w-4" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{t(popis)}</div>
        <div className="flex min-w-0 items-center gap-1.5 break-words text-sm font-medium">
          <span className="min-w-0 break-words">{children}</span>
          {doplnok}
        </div>
      </div>
    </div>
  );
}

/** Kruh s iniciálami — „avatar“ kolegu bez fotky. */
export function Avatar({ meno }: { meno: string | null | undefined }) {
  const ini = String(meno ?? "")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
    >
      {ini || "?"}
    </span>
  );
}

export function Kopirovat({
  hodnota,
  popis,
}: {
  hodnota: string | null | undefined;
  popis: string;
}) {
  const { t } = useT();
  const [ok, setOk] = useState(false);
  if (!hodnota) return null;
  return (
    <button
      type="button"
      aria-label={t("Kopírovať {co}", { co: t(popis) })}
      title={t("Kopírovať")}
      onClick={() => {
        void navigator.clipboard?.writeText(hodnota).then(
          () => {
            setOk(true);
            setTimeout(() => setOk(false), 1200);
          },
          () => toast.error(t("Kopírovanie sa nepodarilo")),
        );
      }}
      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      {ok ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function RiadokK({
  popis,
  hodnota,
  kopirovat,
}: {
  popis: string;
  hodnota: ReactNode;
  kopirovat?: string | null;
}) {
  const { t } = useT();
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{t(popis)}</span>
      <span className="flex min-w-0 items-center gap-1 text-right">
        <span className="min-w-0 break-all tabular-nums">{hodnota || "—"}</span>
        {kopirovat ? <Kopirovat hodnota={kopirovat} popis={popis} /> : null}
      </span>
    </div>
  );
}

export type Strana = {
  nazov: string | null | undefined;
  ulica?: string | null;
  mesto?: string | null;
  psc?: string | null;
  krajina?: string | null;
  ico?: string | null;
  dic?: string | null;
  icDph?: string | null;
};

function StranaK({ nadpis, s }: { nadpis: string; s: Strana | null }) {
  const { t } = useT();
  const adresa = s
    ? [s.ulica, [s.psc, s.mesto].filter(Boolean).join(" "), s.krajina].filter(Boolean).join(", ")
    : "";
  return (
    <KartaK nadpis={nadpis}>
      {s ? (
        <div className="space-y-0.5 text-sm">
          <div className="break-words font-medium">{s.nazov || "—"}</div>
          {adresa ? <div className="break-words text-muted-foreground">{adresa}</div> : null}
          <div className="pt-1">
            <RiadokK popis="IČO" hodnota={s.ico} kopirovat={s.ico} />
            <RiadokK popis="DIČ" hodnota={s.dic} kopirovat={s.dic} />
            <RiadokK popis="IČ DPH" hodnota={s.icDph} kopirovat={s.icDph} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("Načítavam…")}</p>
      )}
    </KartaK>
  );
}

/** Dodávateľ | Odberateľ vedľa seba (na mobile pod sebou). Odberateľ = vlastná firma. */
export function StranyDokladuK({ dodavatel, companyId }: { dodavatel: Strana; companyId: string }) {
  const [firma, setFirma] = useState<Strana | null>(null);
  useEffect(() => {
    let zive = true;
    supabase
      .from("companies")
      .select("name, street, city, zip, country, ico, dic, ic_dph")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (!zive || !data) return;
        setFirma({
          nazov: data.name,
          ulica: data.street,
          mesto: data.city,
          psc: data.zip,
          krajina: data.country,
          ico: data.ico,
          dic: data.dic,
          icDph: data.ic_dph,
        });
      });
    return () => {
      zive = false;
    };
  }, [companyId]);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
      <StranaK nadpis="Dodávateľ" s={dodavatel} />
      <StranaK nadpis="Odberateľ" s={firma} />
    </div>
  );
}

export type PolozkaK = {
  name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  vat_rate?: number | null;
  vat?: number | null;
  total?: number | null;
};

/** Položky — prvé tri a „Zobraziť ďalšie položky“. */
export function PolozkyK({
  polozky,
  mena,
  vypnute,
  akcia,
  poznamka,
}: {
  polozky: PolozkaK[];
  mena: string;
  vypnute?: boolean;
  akcia?: ReactNode;
  poznamka?: string;
}) {
  const { t } = useT();
  const [vsetky, setVsetky] = useState(false);
  if (!polozky.length && !akcia) return null;
  const zobraz = vsetky ? polozky : polozky.slice(0, 3);
  const cena = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? formatujMenu(n, mena) : "—";
  return (
    <KartaK
      nadpis="Položky"
      akcia={
        <div className="flex flex-wrap items-center gap-2">
          {vypnute ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t("vypnuté")}
            </span>
          ) : null}
          {akcia}
        </div>
      }
    >
      {polozky.length ? (
        <div className={`overflow-x-auto ${vypnute ? "opacity-50" : ""}`}>
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">{t("Názov")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Počet")}</th>
                <th className="px-2 py-2 font-medium">{t("Jednotka")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Cena")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("DPH %")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("DPH")}</th>
                <th className="py-2 pl-2 text-right font-medium">{t("Spolu")}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-border ${vypnute ? "line-through" : ""}`}>
              {zobraz.map((p, i) => {
                const dph =
                  typeof p.vat === "number"
                    ? p.vat
                    : typeof p.total === "number" && p.vat_rate != null
                      ? Math.round((p.total - p.total / (1 + Number(p.vat_rate) / 100)) * 100) / 100
                      : null;
                return (
                  <tr key={i}>
                    <td className="py-2 pr-3">{p.name ?? "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {p.quantity != null ? formatujCislo(p.quantity, 0, 4) : "—"}
                    </td>
                    <td className="px-2 py-2">{p.unit ?? ""}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{cena(p.unit_price)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {p.vat_rate != null ? `${p.vat_rate} %` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{cena(dph)}</td>
                    <td className="py-2 pl-2 text-right font-medium tabular-nums">
                      {cena(p.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {polozky.length > 3 ? (
        <button
          type="button"
          onClick={() => setVsetky((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          {vsetky ? (
            <>
              {t("Zobraziť menej")} <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              {t("Zobraziť ďalšie položky ({n})", { n: polozky.length - 3 })}{" "}
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      ) : null}
      {poznamka ? <p className="mt-2 text-xs text-muted-foreground">{poznamka}</p> : null}
    </KartaK>
  );
}

/** Platobné údaje s kopírovaním; zelená fajka pri IBAN-e s platným tvarom (kontrolný súčet). */
export function PlatbaK({
  iban,
  vs,
  ks,
  ss,
  doplnok,
}: {
  iban?: string | null;
  vs?: string | null;
  ks?: string | null;
  ss?: string | null;
  doplnok?: ReactNode;
}) {
  const { t } = useT();
  const ibanOk = iban ? upravIban(iban) : null;
  const ciste = iban ? iban.replace(/\s+/g, "").toUpperCase() : null;
  return (
    <KartaK nadpis="Platba">
      <div className="flex min-w-0 items-center justify-between gap-3 py-1 text-sm">
        <span className="shrink-0 text-muted-foreground">{t("IBAN")}</span>
        <span className="flex min-w-0 items-center gap-1 text-right">
          {ibanOk ? (
            <Check
              className="h-4 w-4 shrink-0 text-primary"
              aria-label={t("IBAN má platný tvar")}
            />
          ) : null}
          <span className="min-w-0 break-all font-mono text-xs">
            {ciste ? formatujIban(ciste) : "—"}
          </span>
          {ciste ? <Kopirovat hodnota={ciste} popis="IBAN" /> : null}
        </span>
      </div>
      <RiadokK popis="Kód banky" hodnota={kodBankyZIban(ciste)} kopirovat={kodBankyZIban(ciste)} />
      <RiadokK popis="BIC" hodnota={bicZIban(ciste)} kopirovat={bicZIban(ciste)} />
      <RiadokK popis="Variabilný symbol" hodnota={vs} kopirovat={vs} />
      <RiadokK popis="Konštantný symbol" hodnota={ks} kopirovat={ks} />
      {ss ? <RiadokK popis="Špecifický symbol" hodnota={ss} kopirovat={ss} /> : null}
      {doplnok ? <div className="mt-3 border-t border-border pt-3">{doplnok}</div> : null}
    </KartaK>
  );
}

/** Sumár po sadzbách DPH krajiny firmy + celková suma. */
export function SumarK({
  rozpis,
  sadzby,
  mena,
  celkom,
}: {
  rozpis: { sadzba: number; zaklad: number; dph: number; pdp?: boolean }[];
  sadzby: number[];
  mena: string;
  celkom: number;
}) {
  const { t } = useT();
  const s = sumarPoSadzbach(rozpis, sadzby);
  return (
    <KartaK nadpis="Sumár">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5 pr-2 text-left font-medium">{t("Sadzba")}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t("Základ")}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t("DPH")}</th>
              <th className="py-1.5 pl-2 text-right font-medium">{t("Spolu")}</th>
            </tr>
          </thead>
          <tbody>
            {s.riadky.map((r) => (
              <tr
                key={`${r.sadzba}-${r.pdp ? 1 : 0}`}
                className={r.zaklad || r.dph ? "" : "text-muted-foreground"}
              >
                <td className="py-1 pr-2">
                  {r.sadzba} %{r.pdp ? ` ${t("(prenesenie)")}` : ""}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {formatujMenu(r.zaklad, mena)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{formatujMenu(r.dph, mena)}</td>
                <td className="py-1 pl-2 text-right tabular-nums">{formatujMenu(r.spolu, mena)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <span className="text-sm font-medium">{t("Celková suma")}</span>
        <span className="text-lg font-semibold tabular-nums">{formatujMenu(celkom, mena)}</span>
      </div>
    </KartaK>
  );
}

/** Zbalená sekcia (história dokladu). */
export function ZbaleneK({ nadpis, children }: { nadpis: string; children: ReactNode }) {
  const { t } = useT();
  return (
    <details className="group min-w-0 rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-base font-semibold sm:px-5">
        {t(nadpis)}
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border p-3 sm:p-4">{children}</div>
    </details>
  );
}
