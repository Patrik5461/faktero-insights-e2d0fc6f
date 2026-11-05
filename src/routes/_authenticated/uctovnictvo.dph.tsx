import { createFileRoute, Link } from "@tanstack/react-router";
import { escHtml, bezVzorca } from "@/lib/bezpecny-text";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { riadkyPreIds, vsetkoAkoData } from "@/lib/faktero/strankovanie";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  dokladyBezPrepoctu,
  kurzVystavenej,
  sumyPrijatejDomace,
  sumyVystavenej,
  vstupPrehladu,
  vystupPrehladu,
  type RiadokPrehladu,
  denDaneVystavenej,
  denOdpoctuPrijatej,
  filterDatumovObdobia,
  vObdobi,
} from "@/lib/faktero/dph-prehlad";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Download, FileText, Loader2 } from "lucide-react";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { zapocitatelna } from "@/lib/faktero/samofakturacia";
import { domacaMena } from "@/lib/faktero/kurzy";
import { vatBucketLabel, vatBucketOrder } from "@/lib/faktero/vat-rates";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";
import { useKlikNaRiadok, type CielDetailu } from "@/hooks/useKlikNaRiadok";
import { cn } from "@/lib/utils";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/uctovnictvo/dph")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "DPH prehľad — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Informatívny prehľad DPH na výstupe a vstupe za zvolené obdobie.",
        ),
      },
    ],
  }),
  component: DphPage,
});

type Mode = "month" | "quarter";

const MONTHS = [
  "Január",
  "Február",
  "Marec",
  "Apríl",
  "Máj",
  "Jún",
  "Júl",
  "August",
  "September",
  "Október",
  "November",
  "December",
];

function periodBounds(
  year: number,
  mode: Mode,
  m: number,
): { from: string; to: string; label: string } {
  if (mode === "month") {
    const from = new Date(Date.UTC(year, m, 1));
    const to = new Date(Date.UTC(year, m + 1, 0));
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      label: `${MONTHS[m]} ${year}`,
    };
  }
  const startMonth = m * 3;
  const from = new Date(Date.UTC(year, startMonth, 1));
  const to = new Date(Date.UTC(year, startMonth + 3, 0));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    label: `Q${m + 1} ${year}`,
  };
}

function fmtMena(n: number, currency: string) {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n || 0);
}

type Bucket = RiadokPrehladu;

/*
  Riadky prehľadu nie sú pevný zoznam — vznikajú z toho, čo je v dátach
  (`dph-prehlad.ts`). Vďaka tomu sa objaví aj riadok pre historickú sadzbu
  (20 % / 10 %) na opravnom doklade k plneniu spred 2025.
*/
const PRAZDNY_RIADOK: Bucket = { base: 0, vat: 0, count: 0, docs: new Set() };

/** Riadok pre zobrazenie — sadzba sa môže vyskytnúť len na vstupe alebo len na výstupe. */
function riadok(b: Record<string, Bucket>, key: string): Bucket {
  return b[key] ?? PRAZDNY_RIADOK;
}

function sucet(b: Record<string, Bucket>, pole: "base" | "vat"): number {
  return Object.values(b).reduce((s, r) => s + r[pole], 0);
}

function DphPage() {
  const klik = useKlikNaRiadok();
  const { t } = useT();
  const now = new Date();
  /* Priehradky aj názvy sadzieb patria krajine registrácie firmy. */
  const krajina = useKrajinaDane();
  /* Súčty prehľadu sú v domácej mene firmy (rozhodnutie 1. 11. 2026), doklady v svojej. */
  const domaca = domacaMena(krajina);
  const fmt = (n: number, currency: string = domaca) => fmtMena(n, currency);
  const [year, setYear] = useState(now.getFullYear());
  const [mode, setMode] = useState<Mode>("month");
  const [periodIdx, setPeriodIdx] = useState(now.getMonth());
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);

  const period = useMemo(() => periodBounds(year, mode, periodIdx), [year, mode, periodIdx]);
  // Názov obdobia na zobrazenie; `period.label` ostáva v názve súboru.
  const nazovObdobia = mode === "month" ? `${t(MONTHS[periodIdx])} ${year}` : period.label;
  // Popis sadzby nesie číslo („23 % (základná)“) — preloží sa len jeho slovo.
  const nazovSadzby = (r: string) => {
    const s = vatBucketLabel(r, krajina);
    const m = s.match(/^(\S+) % \((základná|znížená|historická)\)$/);
    return m ? t(`{n} % (${m[2]})`, { n: m[1] }) : t(s);
  };
  const typDokladu = (typ: string) =>
    typ === "credit_note" ? ` (${t("dobropis")})` : typ === "debit_note" ? ` (${t("ťarchopis")})` : "";

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    try {
      // Po stránkach — Supabase vráti najviac 1 000 riadkov a zvyšok by v prehľade ticho chýbal.
      const [{ data: invs }, { data: purch }] = await Promise.all([
        vsetkoAkoData((zac, kon) =>
          supabase
            .from("invoices")
            .select(
              "id, invoice_number, issue_date, delivery_date, opravuje_fakturu_id, customer_name, subtotal, vat_total, total, currency, exchange_rate, status, reverse_charge, type",
            )
            .eq("company_id", cid)
            // Hrubý výber podľa oboch dátumov; do obdobia ho presne zaradí
            // `denDaneVystavenej` — rovnako ako priznanie (dátum dodania).
            .or(filterDatumovObdobia(["issue_date", "delivery_date"], period.from, period.to))
            .is("deleted_at", null)
            .neq("status", "draft")
            .neq("status", "cancelled")
            // Zálohová faktúra je výzva na zaplatenie preddavku, nie zdaniteľné
            // plnenie — do priznania nepatrí. Plnenie prizná až vyúčtovacia
            // faktúra, inak by tá istá suma bola v prehľade dvakrát.
            .neq("type", "proforma")
            .order("issue_date", { ascending: true })
            .order("id")
            .range(zac, kon),
        ),
        vsetkoAkoData((zac, kon) =>
          supabase
            .from("purchase_invoices")
            .select(
              "id, invoice_number, issue_date, delivery_date, received_date, dph_rezim, reverse_charge, opravuje_cislo, supplier_name, amount_without_vat, vat_amount, amount_total, currency, amount_without_vat_eur, vat_amount_eur, vat_breakdown, samofakturacia, samofakturacia_stav",
            )
            .eq("company_id", cid)
            .or(
              filterDatumovObdobia(
                ["issue_date", "delivery_date", "received_date"],
                period.from,
                period.to,
              ),
            )
            .is("deleted_at", null)
            // Ako výkaz: prijatá zálohová nie je daňový doklad a faktúra iného
            // odberateľa (nepotvrdená) do odpočtu nejde.
            .eq("type", "regular")
            .is("odberatel_nesedi", null)
            .order("issue_date", { ascending: true })
            .order("id")
            .range(zac, kon),
        ),
      ]);
      const invIds = (invs ?? [])
        .filter((i: any) => vObdobi(denDaneVystavenej(i), period.from, period.to))
        .map((i: any) => i.id);
      const itms = await riadkyPreIds<any>(invIds, (kus, zac, kon) =>
        supabase
          .from("invoice_items")
          .select("id, invoice_id, subtotal, vat_amount, vat_rate")
          .in("invoice_id", kus)
          .order("id")
          .range(zac, kon),
      );
      const vystaveneVObdobi = (invs ?? []).filter((i: any) =>
        vObdobi(denDaneVystavenej(i), period.from, period.to),
      );
      const idVObdobi = new Set(vystaveneVObdobi.map((i: any) => i.id));
      setInvoices(vystaveneVObdobi);
      setItems(itms.filter((it: any) => idVObdobi.has(it.invoice_id)));
      setPurchases(
        (purch ?? []).filter(
          // Samofaktúra sa odpočíta až po odsúhlasení dodávateľom (ako výkaz).
          (p: any) => zapocitatelna(p) && vObdobi(denOdpoctuPrijatej(p), period.from, period.to),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [period.from, period.to]);

  // Dobropis vstupuje záporne v súčtoch aj v zozname dokladov (`dph-prehlad.ts`).
  const output = useMemo(
    () => vystupPrehladu(invoices, items, krajina),
    [invoices, items, krajina],
  );

  // Krajina prichádza až po načítaní firmy — bez nej v závislostiach by
  // prijaté faktúry ostali priradené k sadzbám tej predchádzajúcej.
  const input = useMemo(() => vstupPrehladu(purchases, krajina), [purchases, krajina]);

  // Spoločné poradie riadkov pre obe tabuľky, nech sa dajú porovnávať vedľa seba.
  const rateOrder = useMemo(
    () => vatBucketOrder([...Object.keys(output), ...Object.keys(input)], krajina),
    [output, input, krajina],
  );

  // Súčty idú cez všetky vedierka, nie cez poradie zobrazenia — inak by sadzba,
  // na ktorú sa zabudlo, tíško vypadla zo súčtu a priznanie by nesedelo.
  const totalOutputBase = sucet(output, "base");
  const totalOutputVat = sucet(output, "vat");
  const totalInputBase = sucet(input, "base");
  const totalInputVat = sucet(input, "vat");
  const rozdiel = totalOutputVat - totalInputVat;

  // Doklady v cudzej mene: s kurzom sú v súčtoch prepočítané, bez kurzu chýbajú.
  const bezPrepoctu = useMemo(
    () => dokladyBezPrepoctu(invoices, purchases, krajina),
    [invoices, purchases, krajina],
  );
  const prepocitane =
    invoices.some((i) => kurzVystavenej(i, krajina) > 0 && kurzVystavenej(i, krajina) !== 1) ||
    purchases.some(
      (p) => (p.currency || domaca) !== domaca && sumyPrijatejDomace(p, krajina) !== null,
    );
  const cislaBezPrepoctu = bezPrepoctu
    .map((d) =>
      (d.druh === "vystavena" ? invoices : purchases).find((x: any) => x.id === d.id)?.invoice_number,
    )
    .filter(Boolean)
    .join(", ");

  function exportCsv() {
    const lines: string[] = [];
    lines.push(`${t("DPH prehľad")};${nazovObdobia}`);
    lines.push(`${t("Od")};${period.from};${t("Do")};${period.to}`);
    lines.push(`${t("Mena súčtov")};${domaca}`);
    lines.push("");
    lines.push(t("DPH NA VÝSTUPE (vystavené faktúry)"));
    lines.push(t("Sadzba;Základ dane;DPH;Počet faktúr"));
    for (const r of rateOrder) {
      const v = riadok(output, r);
      lines.push(
        `${nazovSadzby(r)};${v.base.toFixed(2)};${v.vat.toFixed(2)};${v.count}`,
      );
    }
    lines.push(`${t("SPOLU")};${totalOutputBase.toFixed(2)};${totalOutputVat.toFixed(2)};`);
    lines.push("");
    lines.push(t("DPH NA VSTUPE (prijaté faktúry)"));
    lines.push(t("Sadzba;Základ dane;DPH;Počet faktúr"));
    for (const r of rateOrder) {
      const v = riadok(input, r);
      lines.push(
        `${nazovSadzby(r)};${v.base.toFixed(2)};${v.vat.toFixed(2)};${v.count}`,
      );
    }
    lines.push(`${t("SPOLU")};${totalInputBase.toFixed(2)};${totalInputVat.toFixed(2)};`);
    lines.push("");
    lines.push(`${t("Rozdiel (odvod/nadmerný odpočet)")};${rozdiel.toFixed(2)}`);
    lines.push("");
    lines.push(t("VYSTAVENÉ FAKTÚRY"));
    lines.push(t("Číslo;Dátum;Odberateľ;Základ;DPH;Spolu;PDP;Mena"));
    for (const i of invoices) {
      const s = sumyVystavenej(i);
      lines.push(
        `${bezVzorca(i.invoice_number)};${denDaneVystavenej(i) ?? ""};${bezVzorca((i.customer_name || "").replace(/;/g, ","))};${s.zaklad.toFixed(2)};${s.dph.toFixed(2)};${s.spolu.toFixed(2)};${i.reverse_charge ? t("áno") : t("nie")};${i.currency || domaca}`,
      );
    }
    lines.push("");
    lines.push(t("PRIJATÉ FAKTÚRY"));
    lines.push(t("Číslo;Dátum;Dodávateľ;Základ;DPH;Spolu;Mena"));
    for (const p of purchases) {
      lines.push(
        `${bezVzorca(p.invoice_number)};${denOdpoctuPrijatej(p) ?? ""};${bezVzorca((p.supplier_name || "").replace(/;/g, ","))};${Number(p.amount_without_vat || 0).toFixed(2)};${Number(p.vat_amount || 0).toFixed(2)};${Number(p.amount_total || 0).toFixed(2)};${p.currency || domaca}`,
      );
    }
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dph-${period.label.replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const win = window.open("", "_blank");
    // Bez tejto hlášky tlačidlo pri zablokovanom vyskakovacom okne len ticho
    // nič neurobí a človek nemá ako zistiť prečo. Rovnako to rieši aj vývoz
    // knihy jázd.
    if (!win) {
      toast.error(t("Prehliadač zablokoval nové okno. Povoľte ho a skúste znova."));
      return;
    }
    const row = (label: string, b: Bucket) =>
      `<tr><td>${label}</td><td style="text-align:right">${fmt(b.base)}</td><td style="text-align:right">${fmt(b.vat)}</td><td style="text-align:right">${b.count}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${t("DPH prehľad")} ${escHtml(nazovObdobia)}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 6px}table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}th{background:#f5f5f5}.tot td{font-weight:bold;background:#fafafa}.note{background:#fef3c7;border:1px solid #f59e0b;padding:10px;border-radius:6px;font-size:12px;margin:12px 0}</style></head><body>
<h1>${t("DPH prehľad")} — ${escHtml(nazovObdobia)}</h1>
<div>${t("Obdobie")}: ${datumNaDoklade(period.from)} – ${datumNaDoklade(period.to)}</div>
<div class="note"><b>${t("Upozornenie:")}</b> ${t("Toto je informatívny prehľad. Pre podanie DPH priznania použite certifikovaný účtovný softvér alebo kontaktujte účtovníka.")}</div>
<h2>${t("DPH na výstupe (vystavené faktúry)")}</h2>
<table><thead><tr><th>${t("Sadzba DPH")}</th><th style="text-align:right">${t("Základ dane")}</th><th style="text-align:right">${t("Suma DPH")}</th><th style="text-align:right">${t("Počet faktúr")}</th></tr></thead>
<tbody>${rateOrder.map((r) => row(nazovSadzby(r), riadok(output, r))).join("")}
<tr class="tot"><td>${t("SPOLU")}</td><td style="text-align:right">${fmt(totalOutputBase)}</td><td style="text-align:right">${fmt(totalOutputVat)}</td><td></td></tr></tbody></table>
<h2>${t("DPH na vstupe (prijaté faktúry)")}</h2>
<table><thead><tr><th>${t("Sadzba DPH")}</th><th style="text-align:right">${t("Základ dane")}</th><th style="text-align:right">${t("Suma DPH")}</th><th style="text-align:right">${t("Počet faktúr")}</th></tr></thead>
<tbody>${rateOrder.map((r) => row(nazovSadzby(r), riadok(input, r))).join("")}
<tr class="tot"><td>${t("SPOLU")}</td><td style="text-align:right">${fmt(totalInputBase)}</td><td style="text-align:right">${fmt(totalInputVat)}</td><td></td></tr></tbody></table>
<h2>${t("Rozdiel (odvod / nadmerný odpočet)")}</h2>
<table><tr class="tot"><td>${rozdiel >= 0 ? t("Odvod DPH") : t("Nadmerný odpočet")}</td><td style="text-align:right">${fmt(Math.abs(rozdiel))}</td></tr></table>
<h2>${t("Vystavené faktúry ({n})", { n: invoices.length })}</h2>
<table><thead><tr><th>${t("Číslo")}</th><th>${t("Dátum")}</th><th>${t("Odberateľ")}</th><th style="text-align:right">${t("Základ")}</th><th style="text-align:right">${t("DPH")}</th><th style="text-align:right">${t("Spolu")}</th></tr></thead>
<tbody>${invoices.map((i) => `<tr><td>${escHtml(i.invoice_number)}</td><td>${escHtml(datumNaDoklade(denDaneVystavenej(i)))}</td><td>${escHtml(i.customer_name)}${i.reverse_charge ? ` (${t("PDP")})` : ""}${typDokladu(i.type)}</td><td style="text-align:right">${fmt(sumyVystavenej(i).zaklad, i.currency || domaca)}</td><td style="text-align:right">${fmt(sumyVystavenej(i).dph, i.currency || domaca)}</td><td style="text-align:right">${fmt(sumyVystavenej(i).spolu, i.currency || domaca)}</td></tr>`).join("")}</tbody></table>
<h2>${t("Prijaté faktúry ({n})", { n: purchases.length })}</h2>
<table><thead><tr><th>${t("Číslo")}</th><th>${t("Dátum")}</th><th>${t("Dodávateľ")}</th><th style="text-align:right">${t("Základ")}</th><th style="text-align:right">${t("DPH")}</th><th style="text-align:right">${t("Spolu")}</th></tr></thead>
<tbody>${purchases.map((p) => `<tr><td>${escHtml(p.invoice_number)}</td><td>${escHtml(datumNaDoklade(denOdpoctuPrijatej(p)))}</td><td>${escHtml(p.supplier_name)}</td><td style="text-align:right">${fmt(Number(p.amount_without_vat || 0), p.currency || domaca)}</td><td style="text-align:right">${fmt(Number(p.vat_amount || 0), p.currency || domaca)}</td><td style="text-align:right">${fmt(Number(p.amount_total || 0), p.currency || domaca)}</td></tr>`).join("")}</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return (
    <>
      <PageHeader
        title={t("DPH prehľad")}
        description={t("Informatívny prehľad DPH na výstupe a vstupe")}
      />
      <PageBody>
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("Tento prehľad je informatívny.")}{" "}
          {t("Doklady sú v období podľa dátumu dodania, rovnako ako v priznaní.")}{" "}
          <Link to="/uctovnictvo/vykazy" className="text-primary underline underline-offset-2">
            {t("Výkazy k DPH")}
          </Link>{" "}
          {krajina === "CZ"
            ? t("z tých istých dokladov zostavia přiznání, kontrolní hlášení aj souhrnné hlášení a stiahnu ich v XML pre EPO.")
            : krajina === "DE"
              ? t("z tých istých dokladov zostavia UStVA a súhrnné hlásenie (ZM) pre ELSTER.")
              : t(
                  "z tých istých dokladov zostavia priznanie, kontrolný výkaz aj súhrnný výkaz a stiahnu ich v XML pre eDane.",
                )}
        </p>
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-[color:var(--stav-pozor-plocha)] p-3 text-[color:var(--stav-pozor-text)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="text-sm">
            <b>{t("Upozornenie:")}</b>{" "}
            {t(
              "Toto je informatívny prehľad. Pre podanie DPH priznania použite certifikovaný účtovný softvér alebo kontaktujte účtovníka.",
            )}
          </div>
        </div>

        {/* Po podaní priznania sa oplatí obdobie zamknúť — inak neskoršia
            oprava staršej faktúry ticho zmení číslo, ktoré je už odovzdané. */}
        <div className="text-sm text-muted-foreground">
          {t("Máte priznanie podané?")}{" "}
          <Link to="/uctovnictvo/uzavierka" className="text-primary underline underline-offset-2">
            {t("Uzamknite obdobie")}
          </Link>
          {t(", aby sa doklady v ňom už nedali zmeniť.")}
        </div>

        <Card>
          <CardHeader className="p-4 sm:p-5">
            <CardTitle className="text-base">{t("Obdobie")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3 p-4 pt-0 sm:p-5 sm:pt-0">
            <div className="w-40">
              <label className="text-xs text-muted-foreground">{t("Typ obdobia")}</label>
              <Select
                value={mode}
                onValueChange={(v) => {
                  setMode(v as Mode);
                  setPeriodIdx(0);
                }}
              >
                <SelectTrigger aria-label={t("Typ obdobia")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">{t("Mesiac")}</SelectItem>
                  <SelectItem value="quarter">{t("Kvartál")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="text-xs text-muted-foreground">
                {mode === "month" ? t("Mesiac") : t("Kvartál")}
              </label>
              <Select value={String(periodIdx)} onValueChange={(v) => setPeriodIdx(Number(v))}>
                <SelectTrigger aria-label={t("Obdobie")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mode === "month"
                    ? MONTHS.map((m, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {t(m)}
                        </SelectItem>
                      ))
                    : [0, 1, 2, 3].map((i) => (
                        <SelectItem key={i} value={String(i)}>
                          Q{i + 1}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <label className="text-xs text-muted-foreground">{t("Rok")}</label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger aria-label={t("Rok")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground ml-auto">
              {datumNaDoklade(period.from)} – {datumNaDoklade(period.to)}
              {loading && <Loader2 className="inline h-4 w-4 ml-2 animate-spin" />}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-1" />
                CSV
              </Button>
              <Button onClick={exportPdf}>
                <FileText className="h-4 w-4 mr-1" />
                PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-5">
            <CardTitle className="text-base">{t("DPH sumár")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-4 pt-0 sm:p-5 sm:pt-0">
            {prepocitane && (
              <p className="text-xs text-muted-foreground" data-testid="dph-prepocitane">
                {t("Sumy sú v {mena}. Doklady v cudzej mene sú prepočítané kurzom {banka} z dokladu.", {
                  mena: domaca,
                  banka: domaca === "CZK" ? "ČNB" : "ECB",
                })}
              </p>
            )}
            {bezPrepoctu.length > 0 && (
              <div
                className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground"
                data-testid="dph-bez-prepoctu"
              >
                {t(
                  "{n} dokladov v cudzej mene nemá kurz, v súčtoch preto nie sú: {cisla}. Otvorte ich a uložte znova, aby sa prepočítali.",
                  { n: bezPrepoctu.length, cisla: cislaBezPrepoctu },
                )}
              </div>
            )}
            <div>
              <h2 className="mb-2 text-sm font-semibold">{t("DPH na výstupe (vystavené faktúry)")}</h2>
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Sadzba DPH")}</TableHead>
                      <TableHead className="whitespace-nowrap text-right">{t("Základ dane")}</TableHead>
                      <TableHead className="whitespace-nowrap text-right">{t("Suma DPH")}</TableHead>
                      <TableHead className="whitespace-nowrap text-right">{t("Počet faktúr")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateOrder.map((r) => (
                      <TableRow key={r}>
                        <TableCell>{nazovSadzby(r)}</TableCell>
                        <TableCell className="suma text-right">{fmt(riadok(output, r).base)}</TableCell>
                        <TableCell className="suma text-right">{fmt(riadok(output, r).vat)}</TableCell>
                        <TableCell className="text-right tabular-nums">{riadok(output, r).count}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-muted/40">
                      <TableCell>{t("SPOLU")}</TableCell>
                      <TableCell className="suma text-right font-bold">{fmt(totalOutputBase)}</TableCell>
                      <TableCell className="suma text-right font-bold">{fmt(totalOutputVat)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <MobilnySuhrnSadzieb
                riadky={rateOrder.map((r) => ({
                  nazov: nazovSadzby(r),
                  zaklad: fmt(riadok(output, r).base),
                  dph: fmt(riadok(output, r).vat),
                  pocet: riadok(output, r).count,
                }))}
                zaklad={fmt(totalOutputBase)}
                dph={fmt(totalOutputVat)}
              />
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold">{t("DPH na vstupe (prijaté faktúry)")}</h2>
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Sadzba DPH")}</TableHead>
                      <TableHead className="whitespace-nowrap text-right">{t("Základ dane")}</TableHead>
                      <TableHead className="whitespace-nowrap text-right">{t("Suma DPH")}</TableHead>
                      <TableHead className="whitespace-nowrap text-right">{t("Počet faktúr")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateOrder.map((r) => (
                      <TableRow key={r}>
                        <TableCell>{nazovSadzby(r)}</TableCell>
                        <TableCell className="suma text-right">{fmt(riadok(input, r).base)}</TableCell>
                        <TableCell className="suma text-right">{fmt(riadok(input, r).vat)}</TableCell>
                        <TableCell className="text-right tabular-nums">{riadok(input, r).count}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-muted/40">
                      <TableCell>{t("SPOLU")}</TableCell>
                      <TableCell className="suma text-right font-bold">{fmt(totalInputBase)}</TableCell>
                      <TableCell className="suma text-right font-bold">{fmt(totalInputVat)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <MobilnySuhrnSadzieb
                riadky={rateOrder.map((r) => ({
                  nazov: nazovSadzby(r),
                  zaklad: fmt(riadok(input, r).base),
                  dph: fmt(riadok(input, r).vat),
                  pocet: riadok(input, r).count,
                }))}
                zaklad={fmt(totalInputBase)}
                dph={fmt(totalInputVat)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 p-4">
              <div className="font-semibold">
                {rozdiel >= 0 ? t("Odvod DPH (na úhradu)") : t("Nadmerný odpočet (v prospech)")}
              </div>
              <div
                className={`suma text-2xl font-bold ${rozdiel >= 0 ? "text-destructive" : "text-[color:var(--stav-uspech-text)]"}`}
              >
                {fmt(Math.abs(rozdiel))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-5">
            <CardTitle className="text-base">{t("Vystavené faktúry ({n})", { n: invoices.length })}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-4 pt-0 sm:p-5 sm:pt-0">
            <MobilnyZoznam
              prazdne={t("Žiadne faktúry v období")}
              riadky={invoices.map((i) => ({
                id: i.id,
                ciel: { to: "/faktury/$id", params: { id: i.id } },
                cislo: i.invoice_number,
                datum: datumNaDoklade(denDaneVystavenej(i)),
                meno: `${i.customer_name ?? ""}${i.reverse_charge ? ` (${t("PDP")})` : ""}${typDokladu(i.type)}`,
                zaklad: fmt(sumyVystavenej(i).zaklad, i.currency || domaca),
                dph: fmt(sumyVystavenej(i).dph, i.currency || domaca),
                spolu: fmt(sumyVystavenej(i).spolu, i.currency || domaca),
              }))}
            />
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Číslo")}</TableHead>
                  <TableHead>{t("Dátum")}</TableHead>
                  <TableHead>{t("Odberateľ")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("Základ")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("DPH")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("Spolu")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id} {...klik({ to: "/faktury/$id", params: { id: i.id } })}>
                    <TableCell className="cislo-dokladu whitespace-nowrap font-medium">
                      <Link to="/faktury/$id" params={{ id: i.id }} className="hover:underline">
                        {i.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{datumNaDoklade(denDaneVystavenej(i))}</TableCell>
                    <TableCell>
                      {i.customer_name}
                      {i.reverse_charge ? ` (${t("PDP")})` : ""}
                      {typDokladu(i.type)}
                    </TableCell>
                    <TableCell className="suma text-right">
                      {fmt(sumyVystavenej(i).zaklad, i.currency || domaca)}
                    </TableCell>
                    <TableCell className="suma text-right">
                      {fmt(sumyVystavenej(i).dph, i.currency || domaca)}
                    </TableCell>
                    <TableCell className="suma text-right">
                      {fmt(sumyVystavenej(i).spolu, i.currency || domaca)}
                    </TableCell>
                  </TableRow>
                ))}
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t("Žiadne faktúry v období")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-5">
            <CardTitle className="text-base">{t("Prijaté faktúry ({n})", { n: purchases.length })}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-4 pt-0 sm:p-5 sm:pt-0">
            <MobilnyZoznam
              prazdne={t("Žiadne prijaté faktúry v období")}
              riadky={purchases.map((p) => ({
                id: p.id,
                ciel: { to: "/prijate-faktury/$id", params: { id: p.id } },
                cislo: p.invoice_number,
                datum: datumNaDoklade(denOdpoctuPrijatej(p)),
                meno: p.supplier_name ?? "",
                zaklad: fmt(Number(p.amount_without_vat || 0), p.currency || domaca),
                dph: fmt(Number(p.vat_amount || 0), p.currency || domaca),
                spolu: fmt(Number(p.amount_total || 0), p.currency || domaca),
              }))}
            />
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Číslo")}</TableHead>
                  <TableHead>{t("Dátum")}</TableHead>
                  <TableHead>{t("Dodávateľ")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("Základ")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("DPH")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("Spolu")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id} {...klik({ to: "/prijate-faktury/$id", params: { id: p.id } })}>
                    <TableCell className="cislo-dokladu whitespace-nowrap font-medium">
                      <Link to="/prijate-faktury/$id" params={{ id: p.id }} className="hover:underline">
                        {p.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{datumNaDoklade(denOdpoctuPrijatej(p))}</TableCell>
                    <TableCell>{p.supplier_name}</TableCell>
                    <TableCell className="suma text-right">
                      {fmt(Number(p.amount_without_vat || 0), p.currency || domaca)}
                    </TableCell>
                    <TableCell className="suma text-right">
                      {fmt(Number(p.vat_amount || 0), p.currency || domaca)}
                    </TableCell>
                    <TableCell className="suma text-right">
                      {fmt(Number(p.amount_total || 0), p.currency || domaca)}
                    </TableCell>
                  </TableRow>
                ))}
                {purchases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t("Žiadne prijaté faktúry v období")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

/** Na mobile tabuľka so šiestimi stĺpcami ukáže len tri — doklady preto ako karty. */
function MobilnyZoznam({
  riadky,
  prazdne,
}: {
  riadky: {
    id: string;
    /** Detail dokladu — celá položka je klikateľná, číslo je odkaz. */
    ciel?: CielDetailu;
    cislo: string | null;
    datum: string;
    meno: string;
    zaklad: string;
    dph: string;
    spolu: string;
  }[];
  prazdne: string;
}) {
  const { t } = useT();
  const klik = useKlikNaRiadok();
  if (riadky.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground md:hidden">{prazdne}</p>;
  }
  return (
    <ul className="divide-y divide-border md:hidden">
      {riadky.map((r) => {
        const pk = klik(r.ciel, { klavesnica: false });
        return (
        <li key={r.id} {...pk} className={cn(pk.className, "py-3 text-sm")}>
          <div className="flex items-baseline justify-between gap-3">
            {r.ciel ? (
              <Link {...r.ciel} className="cislo-dokladu min-w-0 truncate font-medium">
                {r.cislo}
              </Link>
            ) : (
              <span className="cislo-dokladu min-w-0 truncate font-medium">{r.cislo}</span>
            )}
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {r.datum}
            </span>
          </div>
          <div className="mt-0.5 truncate text-muted-foreground">{r.meno}</div>
          <div className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums">
            <span className="whitespace-nowrap">{t("Základ {suma}", { suma: r.zaklad })}</span>
            <span className="whitespace-nowrap">{t("DPH {suma}", { suma: r.dph })}</span>
            <span className="suma">{t("Spolu {suma}", { suma: r.spolu })}</span>
          </div>
        </li>
        );
      })}
    </ul>
  );
}

/**
 * Súhrn podľa sadzieb na telefóne — štyri stĺpce sa na 390 px nezmestili
 * (počet faktúr bol orezaný), preto sadzba a pod ňou základ, DPH a počet.
 */
function MobilnySuhrnSadzieb({
  riadky,
  zaklad,
  dph,
}: {
  riadky: { nazov: string; zaklad: string; dph: string; pocet: number }[];
  zaklad: string;
  dph: string;
}) {
  const { t } = useT();
  return (
    <ul className="divide-y divide-border rounded-md border border-border text-sm sm:hidden">
      {riadky.map((r) => (
        <li key={r.nazov} className="px-3 py-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{r.nazov}</span>
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {t("Počet faktúr")}: {r.pocet}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums">
            <span className="whitespace-nowrap">{t("Základ {suma}", { suma: r.zaklad })}</span>
            <span className="whitespace-nowrap">{t("DPH {suma}", { suma: r.dph })}</span>
          </div>
        </li>
      ))}
      <li className="bg-muted/40 px-3 py-2 font-bold">
        <div>{t("SPOLU")}</div>
        <div className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums">
          <span className="whitespace-nowrap">{t("Základ {suma}", { suma: zaklad })}</span>
          <span className="whitespace-nowrap">{t("DPH {suma}", { suma: dph })}</span>
        </div>
      </li>
    </ul>
  );
}
