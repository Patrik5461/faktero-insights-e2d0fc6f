import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { NAZVY_KATEGORII, odkazNaPravidlo } from "@/lib/faktero/efaktura/kontrola";
import { zhrnutieKontroly, type UlozenyNalez } from "@/lib/faktero/efaktura/kontrola/ulozenie";

type Filter = "vsetko" | "chyba" | "varovanie";

const OBLASTI: Record<UlozenyNalez["oblast"], string> = {
  xml: "XML",
  en16931: "EN 16931",
  peppol: "Peppol BIS",
  sk: "Slovensko",
};

/**
 * Zoznam nálezov kontroly e-faktúry s filtrom chyby/varovania. Zdieľa ho
 * nástroj Kontrola e-faktúry (výsledok z prehliadača) aj zoznam prijatých
 * eFaktúr (výsledok uložený pri príjme).
 */
export function NalezyKontrolyEfaktury({
  nalezy,
  pocetChyb,
  pocetVarovani,
}: {
  nalezy: UlozenyNalez[];
  pocetChyb: number;
  pocetVarovani: number;
}) {
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>("vsetko");
  if (!nalezy.length) return null;

  const zobrazene = nalezy.filter((n) => filter === "vsetko" || n.zavaznost === filter);

  const popisNalezu = (n: UlozenyNalez) => {
    const p: Record<string, string | number> = { ...n.parametre };
    if (n.kategoria) {
      const nazovKat = NAZVY_KATEGORII[n.kategoria];
      p.kat = nazovKat ? `${n.kategoria} (${t(nazovKat)})` : n.kategoria;
    }
    return t(n.popis, p);
  };

  return (
    <>
      <div className="flex flex-wrap gap-1" role="tablist">
        {(
          [
            ["vsetko", t("Všetko ({n})", { n: pocetChyb + pocetVarovani })],
            ["chyba", t("Chyby ({n})", { n: pocetChyb })],
            ["varovanie", t("Varovania ({n})", { n: pocetVarovani })],
          ] as const
        ).map(([k, popis]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filter === k
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-secondary"
            }`}
          >
            {popis}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {zobrazene.map((n, i) => {
          const odkaz = odkazNaPravidlo(n.kod);
          return (
            <li key={`${n.kod}-${i}`} className="flex gap-3 p-3 text-sm">
              {n.zavaznost === "chyba" ? (
                <XCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                  aria-label={t("Chyba")}
                />
              ) : (
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                  aria-label={t("Varovanie")}
                />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="break-words">{popisNalezu(n)}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {odkaz ? (
                    <a
                      href={odkaz}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono font-semibold text-primary hover:underline"
                    >
                      {n.kod} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="font-mono font-semibold" title={t("Vlastná kontrola Faktera")}>
                      {n.kod}
                    </span>
                  )}
                  <span>{n.oblast === "sk" ? t("Slovensko") : OBLASTI[n.oblast]}</span>
                  {n.riadok != null && (
                    <span>{t("riadok {r}, stĺpec {s}", { r: n.riadok, s: n.stlpec ?? 1 })}</span>
                  )}
                </div>
                {n.cesta && (
                  <p className="break-all font-mono text-[11px] text-muted-foreground">{n.cesta}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Odznak výsledku automatickej kontroly v zozname prijatých eFaktúr. */
export function OdznakKontrolyEfaktury({
  chyby,
  varovania,
  onClick,
  rozbalene,
}: {
  chyby: number | null | undefined;
  varovania: number | null | undefined;
  onClick?: () => void;
  rozbalene?: boolean;
}) {
  const { t } = useT();
  const z = zhrnutieKontroly(chyby, varovania);
  if (z.stav === "neskontrolovane")
    return <span className="text-xs text-muted-foreground">{t("Kontrola: —")}</span>;
  const text =
    z.stav === "ok"
      ? t("Kontrola: OK")
      : z.stav === "chyby"
        ? z.varovania
          ? t("Kontrola: {c} chýb, {v} varovaní", { c: z.chyby, v: z.varovania })
          : t("Kontrola: {n} chýb", { n: z.chyby })
        : t("Kontrola: {n} varovaní", { n: z.varovania });
  const farba =
    z.stav === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : z.stav === "chyby"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  const Ikona = z.stav === "ok" ? CheckCircle2 : z.stav === "chyby" ? XCircle : AlertTriangle;
  const obsah = (
    <>
      <Ikona className="h-3.5 w-3.5 shrink-0" /> {text}
    </>
  );
  const trieda = `inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${farba}`;
  if (!onClick || z.stav === "ok") return <span className={trieda}>{obsah}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={rozbalene}
      title={t("Zobraziť nálezy kontroly")}
      className={`${trieda} hover:opacity-80`}
    >
      {obsah}
    </button>
  );
}

/**
 * Pás na prijatej faktúre, ktorá vznikla z eFaktúry s chybami — kontrola beží
 * pri príjme, a kto doklad otvorí až neskôr, by o chybách inak nevedel.
 */
export function UpozornenieKontrolyEfaktury({ invoiceId }: { invoiceId: string }) {
  const { t } = useT();
  const q = useQuery({
    queryKey: ["efaktura-kontrola-prijatej-faktury", invoiceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("efaktura_received_documents")
        .select("kontrola_chyby, kontrola_varovania")
        .eq("matched_supplier_invoice_id", invoiceId)
        .gt("kontrola_chyby", 0)
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });
  if (!q.data?.kontrola_chyby) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {t("eFaktúra, z ktorej doklad vznikol, má podľa automatickej kontroly chyby ({n}).", {
            n: q.data.kontrola_chyby,
          })}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {t("Skontrolujte sumy, DPH a povinné údaje. Nálezy nájdete v Prijatých eFaktúrach.")}{" "}
          <a href="/efaktura/prijate" className="font-medium text-primary hover:underline">
            {t("Zobraziť")}
          </a>
        </p>
      </div>
    </div>
  );
}
