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

export async function runLowStockAlerts() {
  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("id, name, email, created_by");
  const results: any[] = [];
  for (const c of companies ?? []) {
    const [{ data: items }, { data: levels }, { data: resv }] = await Promise.all([
      supabaseAdmin
        .from("stock_items")
        .select("id, sku, min_stock, unit, product_id, archived_at")
        .eq("company_id", c.id)
        .eq("track_stock", true)
        .is("archived_at", null),
      supabaseAdmin.from("stock_levels").select("stock_item_id, quantity").eq("company_id", c.id),
      (supabaseAdmin as any)
        .from("stock_reservations")
        .select("stock_item_id, quantity")
        .eq("company_id", c.id)
        .eq("status", "active"),
    ]);
    const totals = new Map<string, number>();
    (levels ?? []).forEach((l: any) =>
      totals.set(l.stock_item_id, (totals.get(l.stock_item_id) ?? 0) + Number(l.quantity)),
    );
    const reservedMap = new Map<string, number>();
    (resv ?? []).forEach((r: any) =>
      reservedMap.set(
        r.stock_item_id,
        (reservedMap.get(r.stock_item_id) ?? 0) + Number(r.quantity),
      ),
    );
    const availableOf = (id: string) => (totals.get(id) ?? 0) - (reservedMap.get(id) ?? 0);
    const low = (items ?? []).filter(
      (i: any) => Number(i.min_stock ?? 0) > 0 && availableOf(i.id) <= Number(i.min_stock),
    );
    if (low.length === 0) {
      results.push({ company_id: c.id, skipped: true });
      continue;
    }
    const prodIds = Array.from(new Set(low.map((i: any) => i.product_id).filter(Boolean)));
    const nameMap = new Map<string, string>();
    if (prodIds.length) {
      const { data: prods } = await supabaseAdmin
        .from("products")
        .select("id, name")
        .in("id", prodIds);
      (prods ?? []).forEach((p: any) => nameMap.set(p.id, p.name));
    }
    let recipient = c.email as string | null;
    if (!recipient && c.created_by) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", c.created_by)
        .maybeSingle();
      recipient = prof?.email ?? null;
    }
    if (!recipient) {
      results.push({ company_id: c.id, skipped: true, reason: "no_recipient" });
      continue;
    }

    const rowsHtml = low
      .map((i: any) => {
        const name = i.product_id ? (nameMap.get(i.product_id) ?? i.sku ?? "—") : (i.sku ?? "—");
        const cur = totals.get(i.id) ?? 0;
        const av = availableOf(i.id);
        return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.sku ?? "")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${cur.toFixed(2)} ${escapeHtml(i.unit ?? "")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:#b45309"><strong>${av.toFixed(2)}</strong></td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${Number(i.min_stock).toFixed(2)}</td></tr>`;
      })
      .join("");
    const rowsTxt = low
      .map((i: any) => {
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
      results.push({ company_id: c.id, ok: true, sent: low.length, recipient });
    } catch (e: any) {
      results.push({ company_id: c.id, ok: false, error: e?.message });
    }
  }
  return { checked: companies?.length ?? 0, results };
}
