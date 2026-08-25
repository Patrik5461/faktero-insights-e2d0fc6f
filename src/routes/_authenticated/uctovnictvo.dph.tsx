import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import {
  najblizsiaSadzba,
  vatBucketKey,
  vatBucketLabel,
  vatBucketOrder,
} from "@/lib/faktero/vat-rates";

export const Route = createFileRoute("/_authenticated/uctovnictvo/dph")({
  head: () => ({
    meta: [
      { title: "DPH prehľad — Faktero" },
      {
        name: "description",
        content: "Informatívny prehľad DPH na výstupe a vstupe za zvolené obdobie.",
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
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [mode, setMode] = useState<Mode>("month");
  const [periodIdx, setPeriodIdx] = useState(now.getMonth());
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);

  const period = useMemo(() => periodBounds(year, mode, periodIdx), [year, mode, periodIdx]);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    try {
      const [{ data: invs }, { data: purch }] = await Promise.all([
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
          .order("issue_date", { ascending: true }),
        supabase
          .from("purchase_invoices")
          .select(
            "id, invoice_number, issue_date, supplier_name, amount_without_vat, vat_amount, amount_total, currency",
          )
          .eq("company_id", cid)
          .gte("issue_date", period.from)
          .lte("issue_date", period.to)
          .is("deleted_at", null)
          .order("issue_date", { ascending: true }),
      ]);
      const invIds = (invs ?? []).map((i) => i.id);
      let itms: any[] = [];
      if (invIds.length) {
        const { data: iData } = await supabase
          .from("invoice_items")
          .select("invoice_id, subtotal, vat_amount, vat_rate")
          .in("invoice_id", invIds);
        itms = iData ?? [];
      }
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
      const zn = znamienkoDokladu(inv.type);
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
        key = vatBucketKey(najblizsiaSadzba((vat / base) * 100));
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
  }, [purchases]);

  // Spoločné poradie riadkov pre obe tabuľky, nech sa dajú porovnávať vedľa seba.
  const rateOrder = useMemo(
    () => vatBucketOrder([...Object.keys(output), ...Object.keys(input)]),
    [output, input],
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
    lines.push(`DPH prehľad;${period.label}`);
    lines.push(`Od;${period.from};Do;${period.to}`);
    lines.push("");
    lines.push("DPH NA VÝSTUPE (vystavené faktúry)");
    lines.push("Sadzba;Základ dane;DPH;Počet faktúr");
    for (const r of rateOrder) {
      const v = riadok(output, r);
      lines.push(`${vatBucketLabel(r)};${v.base.toFixed(2)};${v.vat.toFixed(2)};${v.count}`);
    }
    lines.push(`SPOLU;${totalOutputBase.toFixed(2)};${totalOutputVat.toFixed(2)};`);
    lines.push("");
    lines.push("DPH NA VSTUPE (prijaté faktúry)");
    lines.push("Sadzba;Základ dane;DPH;Počet faktúr");
    for (const r of rateOrder) {
      const v = riadok(input, r);
      lines.push(`${vatBucketLabel(r)};${v.base.toFixed(2)};${v.vat.toFixed(2)};${v.count}`);
    }
    lines.push(`SPOLU;${totalInputBase.toFixed(2)};${totalInputVat.toFixed(2)};`);
    lines.push("");
    lines.push(`Rozdiel (odvod/nadmerný odpočet);${rozdiel.toFixed(2)}`);
    lines.push("");
    lines.push("VYSTAVENÉ FAKTÚRY");
    lines.push("Číslo;Dátum;Odberateľ;Základ;DPH;Spolu;PDP");
    for (const i of invoices) {
      const zn = znamienkoDokladu(i.type);
      lines.push(
        `${i.invoice_number};${i.issue_date};${(i.customer_name || "").replace(/;/g, ",")};${(zn * Number(i.subtotal || 0)).toFixed(2)};${(zn * Number(i.vat_total || 0)).toFixed(2)};${(zn * Number(i.total || 0)).toFixed(2)};${i.reverse_charge ? "áno" : "nie"}`,
      );
    }
    lines.push("");
    lines.push("PRIJATÉ FAKTÚRY");
    lines.push("Číslo;Dátum;Dodávateľ;Základ;DPH;Spolu");
    for (const p of purchases) {
      lines.push(
        `${p.invoice_number};${p.issue_date};${(p.supplier_name || "").replace(/;/g, ",")};${Number(p.amount_without_vat || 0).toFixed(2)};${Number(p.vat_amount || 0).toFixed(2)};${Number(p.amount_total || 0).toFixed(2)}`,
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
      toast.error("Prehliadač zablokoval nové okno. Povoľte ho a skúste znova.");
      return;
    }
    const row = (label: string, b: Bucket) =>
      `<tr><td>${label}</td><td style="text-align:right">${fmt(b.base)}</td><td style="text-align:right">${fmt(b.vat)}</td><td style="text-align:right">${b.count}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>DPH prehľad ${period.label}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 6px}table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}th{background:#f5f5f5}.tot td{font-weight:bold;background:#fafafa}.note{background:#fef3c7;border:1px solid #f59e0b;padding:10px;border-radius:6px;font-size:12px;margin:12px 0}</style></head><body>
<h1>DPH prehľad — ${period.label}</h1>
<div>Obdobie: ${period.from} — ${period.to}</div>
<div class="note"><b>Upozornenie:</b> Toto je informatívny prehľad. Pre podanie DPH priznania použite certifikovaný účtovný softvér alebo kontaktujte účtovníka.</div>
<h2>DPH na výstupe (vystavené faktúry)</h2>
<table><thead><tr><th>Sadzba DPH</th><th style="text-align:right">Základ dane</th><th style="text-align:right">Suma DPH</th><th style="text-align:right">Počet faktúr</th></tr></thead>
<tbody>${rateOrder.map((r) => row(vatBucketLabel(r), riadok(output, r))).join("")}
<tr class="tot"><td>SPOLU</td><td style="text-align:right">${fmt(totalOutputBase)}</td><td style="text-align:right">${fmt(totalOutputVat)}</td><td></td></tr></tbody></table>
<h2>DPH na vstupe (prijaté faktúry)</h2>
<table><thead><tr><th>Sadzba DPH</th><th style="text-align:right">Základ dane</th><th style="text-align:right">Suma DPH</th><th style="text-align:right">Počet faktúr</th></tr></thead>
<tbody>${rateOrder.map((r) => row(vatBucketLabel(r), riadok(input, r))).join("")}
<tr class="tot"><td>SPOLU</td><td style="text-align:right">${fmt(totalInputBase)}</td><td style="text-align:right">${fmt(totalInputVat)}</td><td></td></tr></tbody></table>
<h2>Rozdiel (odvod / nadmerný odpočet)</h2>
<table><tr class="tot"><td>${rozdiel >= 0 ? "Odvod DPH" : "Nadmerný odpočet"}</td><td style="text-align:right">${fmt(Math.abs(rozdiel))}</td></tr></table>
<h2>Vystavené faktúry (${invoices.length})</h2>
<table><thead><tr><th>Číslo</th><th>Dátum</th><th>Odberateľ</th><th style="text-align:right">Základ</th><th style="text-align:right">DPH</th><th style="text-align:right">Spolu</th></tr></thead>
<tbody>${invoices.map((i) => `<tr><td>${i.invoice_number}</td><td>${i.issue_date}</td><td>${i.customer_name || ""}${i.reverse_charge ? " (PDP)" : ""}${i.type === "credit_note" ? " (dobropis)" : ""}</td><td style="text-align:right">${fmt(znamienkoDokladu(i.type) * Number(i.subtotal || 0), i.currency || "EUR")}</td><td style="text-align:right">${fmt(znamienkoDokladu(i.type) * Number(i.vat_total || 0), i.currency || "EUR")}</td><td style="text-align:right">${fmt(znamienkoDokladu(i.type) * Number(i.total || 0), i.currency || "EUR")}</td></tr>`).join("")}</tbody></table>
<h2>Prijaté faktúry (${purchases.length})</h2>
<table><thead><tr><th>Číslo</th><th>Dátum</th><th>Dodávateľ</th><th style="text-align:right">Základ</th><th style="text-align:right">DPH</th><th style="text-align:right">Spolu</th></tr></thead>
<tbody>${purchases.map((p) => `<tr><td>${p.invoice_number}</td><td>${p.issue_date}</td><td>${p.supplier_name || ""}</td><td style="text-align:right">${fmt(Number(p.amount_without_vat || 0), p.currency || "EUR")}</td><td style="text-align:right">${fmt(Number(p.vat_amount || 0), p.currency || "EUR")}</td><td style="text-align:right">${fmt(Number(p.amount_total || 0), p.currency || "EUR")}</td></tr>`).join("")}</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return (
    <>
      <PageHeader title="DPH prehľad" description="Informatívny prehľad DPH na výstupe a vstupe" />
      <PageBody>
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3 flex gap-2 items-start dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900/40">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="text-sm">
            <b>Upozornenie:</b> Toto je informatívny prehľad. Pre podanie DPH priznania použite
            certifikovaný účtovný softvér alebo kontaktujte účtovníka.
          </div>
        </div>

        {/* Po podaní priznania sa oplatí obdobie zamknúť — inak neskoršia
            oprava staršej faktúry ticho zmení číslo, ktoré je už odovzdané. */}
        <div className="text-sm text-muted-foreground">
          Máte priznanie podané?{" "}
          <Link to="/uctovnictvo/uzavierka" className="text-primary hover:underline">
            Uzamknite obdobie
          </Link>
          , aby sa doklady v ňom už nedali zmeniť.
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Obdobie</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-end">
            <div className="w-40">
              <label className="text-xs text-muted-foreground">Typ obdobia</label>
              <Select
                value={mode}
                onValueChange={(v) => {
                  setMode(v as Mode);
                  setPeriodIdx(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mesiac</SelectItem>
                  <SelectItem value="quarter">Kvartál</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="text-xs text-muted-foreground">
                {mode === "month" ? "Mesiac" : "Kvartál"}
              </label>
              <Select value={String(periodIdx)} onValueChange={(v) => setPeriodIdx(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mode === "month"
                    ? MONTHS.map((m, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {m}
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
              <label className="text-xs text-muted-foreground">Rok</label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger>
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
              {period.from} — {period.to}
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
            <CardTitle>DPH sumár</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">DPH na výstupe (vystavené faktúry)</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sadzba DPH</TableHead>
                    <TableHead className="text-right">Základ dane</TableHead>
                    <TableHead className="text-right">Suma DPH</TableHead>
                    <TableHead className="text-right">Počet faktúr</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateOrder.map((r) => (
                    <TableRow key={r}>
                      <TableCell>{vatBucketLabel(r)}</TableCell>
                      <TableCell className="text-right">{fmt(riadok(output, r).base)}</TableCell>
                      <TableCell className="text-right">{fmt(riadok(output, r).vat)}</TableCell>
                      <TableCell className="text-right">{riadok(output, r).count}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-muted/40">
                    <TableCell>SPOLU</TableCell>
                    <TableCell className="text-right">{fmt(totalOutputBase)}</TableCell>
                    <TableCell className="text-right">{fmt(totalOutputVat)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="font-semibold mb-2">DPH na vstupe (prijaté faktúry)</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sadzba DPH</TableHead>
                    <TableHead className="text-right">Základ dane</TableHead>
                    <TableHead className="text-right">Suma DPH</TableHead>
                    <TableHead className="text-right">Počet faktúr</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateOrder.map((r) => (
                    <TableRow key={r}>
                      <TableCell>{vatBucketLabel(r)}</TableCell>
                      <TableCell className="text-right">{fmt(riadok(input, r).base)}</TableCell>
                      <TableCell className="text-right">{fmt(riadok(input, r).vat)}</TableCell>
                      <TableCell className="text-right">{riadok(input, r).count}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-muted/40">
                    <TableCell>SPOLU</TableCell>
                    <TableCell className="text-right">{fmt(totalInputBase)}</TableCell>
                    <TableCell className="text-right">{fmt(totalInputVat)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="rounded-md border p-4 flex items-center justify-between bg-muted/30">
              <div className="font-semibold">
                {rozdiel >= 0 ? "Odvod DPH (na úhradu)" : "Nadmerný odpočet (v prospech)"}
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
            <CardTitle>Vystavené faktúry ({invoices.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Číslo</TableHead>
                  <TableHead>Dátum</TableHead>
                  <TableHead>Odberateľ</TableHead>
                  <TableHead className="text-right">Základ</TableHead>
                  <TableHead className="text-right">DPH</TableHead>
                  <TableHead className="text-right">Spolu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.invoice_number}</TableCell>
                    <TableCell>{i.issue_date}</TableCell>
                    <TableCell>
                      {i.customer_name}
                      {i.reverse_charge ? " (PDP)" : ""}
                      {i.type === "credit_note" ? " (dobropis)" : ""}
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
                      Žiadne faktúry v období
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prijaté faktúry ({purchases.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Číslo</TableHead>
                  <TableHead>Dátum</TableHead>
                  <TableHead>Dodávateľ</TableHead>
                  <TableHead className="text-right">Základ</TableHead>
                  <TableHead className="text-right">DPH</TableHead>
                  <TableHead className="text-right">Spolu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.invoice_number}</TableCell>
                    <TableCell>{p.issue_date}</TableCell>
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
                      Žiadne prijaté faktúry v období
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
