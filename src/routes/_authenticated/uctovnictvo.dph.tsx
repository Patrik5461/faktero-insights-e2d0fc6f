import { createFileRoute, Link } from "@tanstack/react-router";
import { escHtml, bezVzorca } from "@/lib/bezpecny-text";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { riadkyPreIds, vsetkoAkoData } from "@/lib/faktero/strankovanie";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { znamienkoDokladu } from "@/lib/faktero/faktury-sumy";
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
import {
  najblizsiaSadzba,
  vatBucketKey,
  vatBucketLabel,
  vatBucketOrder,
} from "@/lib/faktero/vat-rates";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";
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

function fmt(n: number, currency = "EUR") {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n || 0);
}

type Bucket = { base: number; vat: number; count: number; docs: Set<string> };

/**
 * Riadky prehľadu nie sú pevný zoznam — vznikajú z toho, čo je v dátach. Vďaka
 * tomu sa objaví aj riadok pre historickú sadzbu (20 % / 10 %) na opravnom
 * doklade k plneniu spred 2025, namiesto toho, aby taká suma spadla medzi
 * oslobodené plnenia.
 */
function emptyBuckets(): Record<string, Bucket> {
  const b: Record<string, Bucket> = {};
  for (const r of ["exempt", "pdp"]) b[r] = { base: 0, vat: 0, count: 0, docs: new Set() };
  return b;
}

function bucket(b: Record<string, Bucket>, key: string): Bucket {
  b[key] ??= { base: 0, vat: 0, count: 0, docs: new Set() };
  return b[key];
}

const PRAZDNY_RIADOK: Bucket = { base: 0, vat: 0, count: 0, docs: new Set() };

/** Riadok pre zobrazenie — sadzba sa môže vyskytnúť len na vstupe alebo len na výstupe. */
function riadok(b: Record<string, Bucket>, key: string): Bucket {
  return b[key] ?? PRAZDNY_RIADOK;
}

function sucet(b: Record<string, Bucket>, pole: "base" | "vat"): number {
  return Object.values(b).reduce((s, r) => s + r[pole], 0);
}

function DphPage() {
  const { t } = useT();
  const now = new Date();
  /* Priehradky aj názvy sadzieb patria krajine registrácie firmy. */
  const krajina = useKrajinaDane();
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
              "id, invoice_number, issue_date, customer_name, subtotal, vat_total, total, currency, status, reverse_charge, type",
            )
            .eq("company_id", cid)
            .gte("issue_date", period.from)
            .lte("issue_date", period.to)
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
              "id, invoice_number, issue_date, supplier_name, amount_without_vat, vat_amount, amount_total, currency",
            )
            .eq("company_id", cid)
            .gte("issue_date", period.from)
            .lte("issue_date", period.to)
            .is("deleted_at", null)
            // Samofaktúra sa odpočíta až po odsúhlasení dodávateľom.
            .or("samofakturacia.eq.false,samofakturacia_stav.eq.odsuhlasena")
            .order("issue_date", { ascending: true })
            .order("id")
            .range(zac, kon),
        ),
      ]);
      const invIds = (invs ?? []).map((i: any) => i.id);
      const itms = await riadkyPreIds<any>(invIds, (kus, zac, kon) =>
        supabase
          .from("invoice_items")
          .select("id, invoice_id, subtotal, vat_amount, vat_rate")
          .in("invoice_id", kus)
          .order("id")
          .range(zac, kon),
      );
      setInvoices(invs ?? []);
      setItems(itms);
      setPurchases(purch ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [period.from, period.to]);

  const output = useMemo(() => {
    const b = emptyBuckets();
    const invById = new Map(invoices.map((i) => [i.id, i]));
    for (const it of items) {
      const inv = invById.get(it.invoice_id);
      if (!inv) continue;
      const key = inv.reverse_charge ? "pdp" : vatBucketKey(it.vat_rate);
      const riadok = bucket(b, key);
      const zn = znamienkoDokladu(inv.type, inv.total);
      riadok.base += zn * Number(it.subtotal || 0);
      riadok.vat += zn * Number(it.vat_amount || 0);
      riadok.docs.add(it.invoice_id);
    }
    for (const r of Object.keys(b)) b[r].count = b[r].docs.size;
    return b;
  }, [invoices, items]);

  const input = useMemo(() => {
    const b = emptyBuckets();
    for (const p of purchases) {
      const base = Number(p.amount_without_vat || 0);
      const vat = Number(p.vat_amount || 0);
      // Prijaté faktúry nemajú sadzbu uloženú, dopočíta sa z pomeru dane
      // k základu. Zaokrúhlenie na centy vie dať napr. 22,97 % namiesto 23 %,
      // preto sa hodnota prilepí k najbližšej platnej sadzbe (do 0,5 p. b.).
      let key = "exempt";
      if (base > 0 && vat > 0) {
        key = vatBucketKey(najblizsiaSadzba((vat / base) * 100, krajina));
      } else if (vat === 0 && base > 0) {
        key = "0";
      }
      const riadok = bucket(b, key);
      riadok.base += base;
      riadok.vat += vat;
      riadok.docs.add(p.id);
    }
    for (const r of Object.keys(b)) b[r].count = b[r].docs.size;
    return b;
    // Krajina prichádza až po načítaní firmy — bez nej v závislostiach by
    // prijaté faktúry ostali priradené k sadzbám tej predchádzajúcej.
  }, [purchases, krajina]);

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

  function exportCsv() {
    const lines: string[] = [];
    lines.push(`${t("DPH prehľad")};${nazovObdobia}`);
    lines.push(`${t("Od")};${period.from};${t("Do")};${period.to}`);
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
    lines.push(t("Číslo;Dátum;Odberateľ;Základ;DPH;Spolu;PDP"));
    for (const i of invoices) {
      const zn = znamienkoDokladu(i.type, i.total);
      lines.push(
        `${bezVzorca(i.invoice_number)};${i.issue_date};${bezVzorca((i.customer_name || "").replace(/;/g, ","))};${(zn * Number(i.subtotal || 0)).toFixed(2)};${(zn * Number(i.vat_total || 0)).toFixed(2)};${(zn * Number(i.total || 0)).toFixed(2)};${i.reverse_charge ? t("áno") : t("nie")}`,
      );
    }
    lines.push("");
    lines.push(t("PRIJATÉ FAKTÚRY"));
    lines.push(t("Číslo;Dátum;Dodávateľ;Základ;DPH;Spolu"));
    for (const p of purchases) {
      lines.push(
        `${bezVzorca(p.invoice_number)};${p.issue_date};${bezVzorca((p.supplier_name || "").replace(/;/g, ","))};${Number(p.amount_without_vat || 0).toFixed(2)};${Number(p.vat_amount || 0).toFixed(2)};${Number(p.amount_total || 0).toFixed(2)}`,
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
<tbody>${invoices.map((i) => `<tr><td>${escHtml(i.invoice_number)}</td><td>${escHtml(datumNaDoklade(i.issue_date))}</td><td>${escHtml(i.customer_name)}${i.reverse_charge ? ` (${t("PDP")})` : ""}${typDokladu(i.type)}</td><td style="text-align:right">${fmt(znamienkoDokladu(i.type) * Number(i.subtotal || 0), i.currency || "EUR")}</td><td style="text-align:right">${fmt(znamienkoDokladu(i.type) * Number(i.vat_total || 0), i.currency || "EUR")}</td><td style="text-align:right">${fmt(znamienkoDokladu(i.type) * Number(i.total || 0), i.currency || "EUR")}</td></tr>`).join("")}</tbody></table>
<h2>${t("Prijaté faktúry ({n})", { n: purchases.length })}</h2>
<table><thead><tr><th>${t("Číslo")}</th><th>${t("Dátum")}</th><th>${t("Dodávateľ")}</th><th style="text-align:right">${t("Základ")}</th><th style="text-align:right">${t("DPH")}</th><th style="text-align:right">${t("Spolu")}</th></tr></thead>
<tbody>${purchases.map((p) => `<tr><td>${escHtml(p.invoice_number)}</td><td>${escHtml(datumNaDoklade(p.issue_date))}</td><td>${escHtml(p.supplier_name)}</td><td style="text-align:right">${fmt(Number(p.amount_without_vat || 0), p.currency || "EUR")}</td><td style="text-align:right">${fmt(Number(p.vat_amount || 0), p.currency || "EUR")}</td><td style="text-align:right">${fmt(Number(p.amount_total || 0), p.currency || "EUR")}</td></tr>`).join("")}</tbody></table>
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
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("Tento prehľad je informatívny.")}{" "}
          <Link to="/uctovnictvo/vykazy" className="underline">
            {t("Výkazy k DPH")}
          </Link>{" "}
          {t(
            "z tých istých dokladov zostavia priznanie, kontrolný výkaz aj súhrnný výkaz a stiahnu ich v XML pre eDane.",
          )}
        </p>
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3 flex gap-2 items-start dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900/40">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
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
          <CardHeader>
            <CardTitle>{t("Obdobie")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-end">
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
          <CardHeader>
            <CardTitle>{t("DPH sumár")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">{t("DPH na výstupe (vystavené faktúry)")}</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Sadzba DPH")}</TableHead>
                    <TableHead className="text-right">{t("Základ dane")}</TableHead>
                    <TableHead className="text-right">{t("Suma DPH")}</TableHead>
                    <TableHead className="text-right">{t("Počet faktúr")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateOrder.map((r) => (
                    <TableRow key={r}>
                      <TableCell>{nazovSadzby(r)}</TableCell>
                      <TableCell className="text-right">{fmt(riadok(output, r).base)}</TableCell>
                      <TableCell className="text-right">{fmt(riadok(output, r).vat)}</TableCell>
                      <TableCell className="text-right">{riadok(output, r).count}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-muted/40">
                    <TableCell>{t("SPOLU")}</TableCell>
                    <TableCell className="text-right">{fmt(totalOutputBase)}</TableCell>
                    <TableCell className="text-right">{fmt(totalOutputVat)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="font-semibold mb-2">{t("DPH na vstupe (prijaté faktúry)")}</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Sadzba DPH")}</TableHead>
                    <TableHead className="text-right">{t("Základ dane")}</TableHead>
                    <TableHead className="text-right">{t("Suma DPH")}</TableHead>
                    <TableHead className="text-right">{t("Počet faktúr")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateOrder.map((r) => (
                    <TableRow key={r}>
                      <TableCell>{nazovSadzby(r)}</TableCell>
                      <TableCell className="text-right">{fmt(riadok(input, r).base)}</TableCell>
                      <TableCell className="text-right">{fmt(riadok(input, r).vat)}</TableCell>
                      <TableCell className="text-right">{riadok(input, r).count}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-muted/40">
                    <TableCell>{t("SPOLU")}</TableCell>
                    <TableCell className="text-right">{fmt(totalInputBase)}</TableCell>
                    <TableCell className="text-right">{fmt(totalInputVat)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="rounded-md border p-4 flex items-center justify-between bg-muted/30">
              <div className="font-semibold">
                {rozdiel >= 0 ? t("Odvod DPH (na úhradu)") : t("Nadmerný odpočet (v prospech)")}
              </div>
              <div
                className={`text-2xl font-bold ${rozdiel >= 0 ? "text-red-600" : "text-green-600"}`}
              >
                {fmt(Math.abs(rozdiel))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Vystavené faktúry ({n})", { n: invoices.length })}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <MobilnyZoznam
              prazdne={t("Žiadne faktúry v období")}
              riadky={invoices.map((i) => ({
                id: i.id,
                cislo: i.invoice_number,
                datum: datumNaDoklade(i.issue_date),
                meno: `${i.customer_name ?? ""}${i.reverse_charge ? ` (${t("PDP")})` : ""}${typDokladu(i.type)}`,
                zaklad: fmt(znamienkoDokladu(i.type) * Number(i.subtotal || 0), i.currency || "EUR"),
                dph: fmt(znamienkoDokladu(i.type) * Number(i.vat_total || 0), i.currency || "EUR"),
                spolu: fmt(znamienkoDokladu(i.type) * Number(i.total || 0), i.currency || "EUR"),
              }))}
            />
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Číslo")}</TableHead>
                  <TableHead>{t("Dátum")}</TableHead>
                  <TableHead>{t("Odberateľ")}</TableHead>
                  <TableHead className="text-right">{t("Základ")}</TableHead>
                  <TableHead className="text-right">{t("DPH")}</TableHead>
                  <TableHead className="text-right">{t("Spolu")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.invoice_number}</TableCell>
                    <TableCell className="whitespace-nowrap">{datumNaDoklade(i.issue_date)}</TableCell>
                    <TableCell>
                      {i.customer_name}
                      {i.reverse_charge ? ` (${t("PDP")})` : ""}
                      {typDokladu(i.type)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(znamienkoDokladu(i.type) * Number(i.subtotal || 0), i.currency || "EUR")}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(
                        znamienkoDokladu(i.type) * Number(i.vat_total || 0),
                        i.currency || "EUR",
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(znamienkoDokladu(i.type) * Number(i.total || 0), i.currency || "EUR")}
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
          <CardHeader>
            <CardTitle>{t("Prijaté faktúry ({n})", { n: purchases.length })}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <MobilnyZoznam
              prazdne={t("Žiadne prijaté faktúry v období")}
              riadky={purchases.map((p) => ({
                id: p.id,
                cislo: p.invoice_number,
                datum: datumNaDoklade(p.issue_date),
                meno: p.supplier_name ?? "",
                zaklad: fmt(Number(p.amount_without_vat || 0), p.currency || "EUR"),
                dph: fmt(Number(p.vat_amount || 0), p.currency || "EUR"),
                spolu: fmt(Number(p.amount_total || 0), p.currency || "EUR"),
              }))}
            />
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Číslo")}</TableHead>
                  <TableHead>{t("Dátum")}</TableHead>
                  <TableHead>{t("Dodávateľ")}</TableHead>
                  <TableHead className="text-right">{t("Základ")}</TableHead>
                  <TableHead className="text-right">{t("DPH")}</TableHead>
                  <TableHead className="text-right">{t("Spolu")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.invoice_number}</TableCell>
                    <TableCell className="whitespace-nowrap">{datumNaDoklade(p.issue_date)}</TableCell>
                    <TableCell>{p.supplier_name}</TableCell>
                    <TableCell className="text-right">
                      {fmt(Number(p.amount_without_vat || 0), p.currency || "EUR")}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(Number(p.vat_amount || 0), p.currency || "EUR")}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(Number(p.amount_total || 0), p.currency || "EUR")}
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
  if (riadky.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground md:hidden">{prazdne}</p>;
  }
  return (
    <ul className="divide-y divide-border md:hidden">
      {riadky.map((r) => (
        <li key={r.id} className="py-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-medium">{r.cislo}</span>
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {r.datum}
            </span>
          </div>
          <div className="mt-0.5 truncate text-muted-foreground">{r.meno}</div>
          <div className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs">
            <span className="whitespace-nowrap">{t("Základ {suma}", { suma: r.zaklad })}</span>
            <span className="whitespace-nowrap">{t("DPH {suma}", { suma: r.dph })}</span>
            <span className="whitespace-nowrap font-semibold">{t("Spolu {suma}", { suma: r.spolu })}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
