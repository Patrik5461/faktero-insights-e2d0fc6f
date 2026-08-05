import { runInBatches, selectAll, selectByIds } from "./batch.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function escapeHtml(s: string) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function sendMail(opts: { to: string; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY nie je nakonfigurovaný.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${(await res.text()).slice(0, 500)}`);
  return res.json().catch(() => ({}));
}

/** Koľko e-mailov naraz. Resend má rate limit. */
const ALERT_SEND_CONCURRENCY = 5;

type CompanyRow = {
  id: string;
  name: string;
  email: string | null;
  created_by: string | null;
};
type StockItemRow = {
  id: string;
  company_id: string;
  sku: string | null;
  min_stock: number | null;
  unit: string | null;
  product_id: string | null;
};
type QuantityRow = { stock_item_id: string; quantity: number | string };
type ProductRow = { id: string; name: string };
type ProfileRow = { id: string; email: string | null };

export async function runLowStockAlerts() {
  const companies = await selectAll<CompanyRow>((from, to) =>
    supabaseAdmin.from("companies").select("id, name, email, created_by").range(from, to),
  );
  const results: any[] = [];

  // Pôvodne sa pre KAŽDÚ firmu púšťali 4 dotazy v sekvenčnej slučke — pri
  // stovkách firiem stovky round-tripov v jednom cron requeste, aj keď väčšina
  // firiem sklad vôbec nesleduje. Teraz sa všetko načíta hromadne dopredu
  // a per-firmu už zostane len výpočet a e-mail.
  const allItems = await selectAll<StockItemRow>((from, to) =>
    supabaseAdmin
      .from("stock_items")
      .select("id, company_id, sku, min_stock, unit, product_id")
      .eq("track_stock", true)
      .is("archived_at", null)
      .gt("min_stock", 0)
      .range(from, to),
  );

  const itemsByCompany = new Map<string, StockItemRow[]>();
  for (const it of allItems) {
    const list = itemsByCompany.get(it.company_id) ?? [];
    list.push(it);
    itemsByCompany.set(it.company_id, list);
  }

  const itemIds = allItems.map((i) => i.id);
  const [levels, resv] = await Promise.all([
    selectByIds<QuantityRow>(itemIds, (part, from, to) =>
      supabaseAdmin
        .from("stock_levels")
        .select("stock_item_id, quantity")
        .in("stock_item_id", part)
        .range(from, to),
    ),
    selectByIds<QuantityRow>(itemIds, (part, from, to) =>
      supabaseAdmin
        .from("stock_reservations")
        .select("stock_item_id, quantity")
        .eq("status", "active")
        .in("stock_item_id", part)
        .range(from, to),
    ),
  ]);

  const totals = new Map<string, number>();
  for (const l of levels) {
    totals.set(l.stock_item_id, (totals.get(l.stock_item_id) ?? 0) + Number(l.quantity));
  }
  const reservedMap = new Map<string, number>();
  for (const r of resv) {
    reservedMap.set(r.stock_item_id, (reservedMap.get(r.stock_item_id) ?? 0) + Number(r.quantity));
  }
  const availableOf = (id: string) => (totals.get(id) ?? 0) - (reservedMap.get(id) ?? 0);

  // Firmy, ktoré reálne majú čo hlásiť.
  const lowByCompany = new Map<string, StockItemRow[]>();
  for (const c of companies) {
    const low = (itemsByCompany.get(c.id) ?? []).filter(
      (i) => availableOf(i.id) <= Number(i.min_stock),
    );
    if (low.length > 0) lowByCompany.set(c.id, low);
    else results.push({ company_id: c.id, skipped: true });
  }

  const alerting = companies.filter((c) => lowByCompany.has(c.id));

  // Názvy produktov a náhradní príjemcovia — opäť hromadne, nie na firmu.
  const prodIds = Array.from(
    new Set(alerting.flatMap((c) => (lowByCompany.get(c.id) ?? []).map((i) => i.product_id))),
  ).filter(Boolean) as string[];
  const nameMap = new Map<string, string>();
  for (const p of await selectByIds<ProductRow>(prodIds, (part, from, to) =>
    supabaseAdmin.from("products").select("id, name").in("id", part).range(from, to),
  )) {
    nameMap.set(p.id, p.name);
  }

  const fallbackIds = alerting
    .filter((c) => !c.email && c.created_by)
    .map((c) => c.created_by as string);
  const profileEmail = new Map<string, string | null>();
  for (const p of await selectByIds<ProfileRow>(
    Array.from(new Set(fallbackIds)),
    (part, from, to) =>
      supabaseAdmin.from("profiles").select("id, email").in("id", part).range(from, to),
  )) {
    profileEmail.set(p.id, p.email ?? null);
  }

  const sendResults = await runInBatches(alerting, ALERT_SEND_CONCURRENCY, async (c) => {
    const low = lowByCompany.get(c.id) ?? [];
    const recipient = c.email ?? (c.created_by ? (profileEmail.get(c.created_by) ?? null) : null);
    if (!recipient) {
      return { company_id: c.id, skipped: true, reason: "no_recipient" };
    }

    const rowsHtml = low
      .map((i) => {
        const name = i.product_id ? (nameMap.get(i.product_id) ?? i.sku ?? "—") : (i.sku ?? "—");
        const cur = totals.get(i.id) ?? 0;
        const av = availableOf(i.id);
        return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.sku ?? "")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${cur.toFixed(2)} ${escapeHtml(i.unit ?? "")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:#b45309"><strong>${av.toFixed(2)}</strong></td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${Number(i.min_stock).toFixed(2)}</td></tr>`;
      })
      .join("");
    const rowsTxt = low
      .map((i) => {
        const name = i.product_id ? (nameMap.get(i.product_id) ?? i.sku ?? "—") : (i.sku ?? "—");
        return `- ${name} (${i.sku ?? "-"}): k dispozícii ${availableOf(i.id).toFixed(2)} / min ${Number(i.min_stock).toFixed(2)}`;
      })
      .join("\n");

    const html = `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto"><h2 style="color:#b45309">⚠️ Skladové položky pod minimom</h2><p>Firma <strong>${escapeHtml(c.name)}</strong> má ${low.length} položiek s dostupnosťou pod minimom (po odpočítaní rezervácií).</p><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f8fafc"><th style="padding:8px;text-align:left">Produkt</th><th style="padding:8px;text-align:left">SKU</th><th style="padding:8px;text-align:right">Na sklade</th><th style="padding:8px;text-align:right">K dispozícii</th><th style="padding:8px;text-align:right">Minimum</th></tr></thead><tbody>${rowsHtml}</tbody></table><p style="margin-top:16px"><a href="${process.env.APP_PUBLIC_URL || "https://www.faktero.sk"}/sklad/minimum" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Zobraziť v Faktere</a></p></div>`;
    const text = `Skladové položky pod minimom (${c.name}):\n\n${rowsTxt}\n\nOtvorte: ${process.env.APP_PUBLIC_URL || "https://www.faktero.sk"}/sklad/minimum`;
    try {
      await sendMail({
        to: recipient,
        subject: `⚠️ ${low.length} položiek pod minimom — ${c.name}`,
        html,
        text,
      });
      return { company_id: c.id, ok: true, sent: low.length, recipient };
    } catch (e: any) {
      return { company_id: c.id, ok: false, error: e?.message };
    }
  });
  results.push(...sendResults);

  return { checked: companies.length, results };
}
