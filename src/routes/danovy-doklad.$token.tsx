import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ token: z.string().min(16).max(128) });

const TOBIFY = {
  name: "Tobify s. r. o.",
  ico: "56607016",
  dic: "2122358579",
  ic_dph: "SK2122358579",
  street: "Športová 707/43",
  city: "Zavar",
  zip: "919 26",
  country: "Slovenská republika",
  email: "info@faktero.sk",
  web: "https://www.faktero.sk",
  registration:
    "Zapísaná v Obchodnom registri Okresného súdu Trnava, oddiel: Sro. Dátum vzniku 31. 10. 2024.",
};

const getPlatformInvoice = createServerFn({ method: "POST" })
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("platform_invoices")
      .select(
        "invoice_number, plan_name, plan_slug, issue_date, taxable_date, due_date, currency, vat_rate, subtotal_cents, vat_cents, total_cents, provider, provider_payment_id, buyer_snapshot, created_at",
      )
      .eq("public_token", data.token)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw notFound();
    return row as any;
  });

export const Route = createFileRoute("/danovy-doklad/$token")({
  ssr: true,
  loader: ({ params }) => {
    // Token mimo povolenej dĺžky vyhodí zod priamo v inputValidator, čo skončí
    // ako 500. Z pohľadu návštevníka je nezmyselný token to isté ako neexistujúci
    // doklad — nech teda dostane stránku „Doklad nenájdený", nie chybu servera.
    if (!Input.safeParse({ token: params.token }).success) throw notFound();
    return getPlatformInvoice({ data: { token: params.token } });
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Daňový doklad ${loaderData?.invoice_number ?? ""} — Faktero` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  errorComponent: () => (
    <div style={{ padding: 40, fontFamily: "Inter, Arial, sans-serif" }}>
      <h1>Chyba pri načítaní dokladu</h1>
      <p>Skúste prosím znova, alebo nás kontaktujte na info@faktero.sk.</p>
    </div>
  ),
  notFoundComponent: () => (
    <div style={{ padding: 40, fontFamily: "Inter, Arial, sans-serif" }}>
      <h1>Doklad nenájdený</h1>
      <p>Odkaz na daňový doklad je neplatný alebo bol zmenený.</p>
    </div>
  ),
  component: PlatformInvoicePage,
});

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function PlatformInvoicePage() {
  const inv = Route.useLoaderData();
  const b = (inv.buyer_snapshot ?? {}) as any;
  return (
    <div style={{ background: "#f6f7f9", minHeight: "100vh", padding: "24px 12px" }}>
      <style>{`@media print { body { background: #fff } .no-print { display: none !important } .sheet { box-shadow:none !important; margin:0 !important; max-width:none !important } }`}</style>
      <div
        className="no-print"
        style={{
          maxWidth: 800,
          margin: "0 auto 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "Inter,Arial,sans-serif",
        }}
      >
        <a href="/" style={{ color: "#666", textDecoration: "none" }}>
          ← Faktero
        </a>
        <button
          onClick={() => window.print()}
          style={{
            background: "#16a34a",
            color: "#fff",
            border: 0,
            padding: "8px 14px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Vytlačiť / Uložiť ako PDF
        </button>
      </div>
      <div
        className="sheet"
        style={{
          maxWidth: 800,
          margin: "0 auto",
          background: "#fff",
          padding: 40,
          boxShadow: "0 2px 6px rgba(0,0,0,.08)",
          fontFamily: "Inter, Arial, sans-serif",
          color: "#111",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 24,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Faktúra — daňový doklad</div>
            <div style={{ color: "#555", marginTop: 4 }}>
              č. <b>{inv.invoice_number}</b>
            </div>
          </div>
          <div style={{ textAlign: "right", color: "#555" }}>
            <div>
              Dátum vystavenia: <b>{inv.issue_date}</b>
            </div>
            <div>
              Dátum dodania: <b>{inv.taxable_date}</b>
            </div>
            <div>
              Dátum splatnosti: <b>{inv.due_date}</b>
            </div>
            <div style={{ marginTop: 6, color: "#16a34a", fontWeight: 600 }}>UHRADENÁ</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          <div>
            <div
              style={{
                color: "#777",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 6,
              }}
            >
              Dodávateľ
            </div>
            <div style={{ fontWeight: 600 }}>{TOBIFY.name}</div>
            <div>{TOBIFY.street}</div>
            <div>
              {TOBIFY.zip} {TOBIFY.city}
            </div>
            <div>{TOBIFY.country}</div>
            <div style={{ marginTop: 6 }}>
              IČO: <b>{TOBIFY.ico}</b>
            </div>
            <div>
              DIČ: <b>{TOBIFY.dic}</b>
            </div>
            <div>
              IČ DPH: <b>{TOBIFY.ic_dph}</b>
            </div>
            <div style={{ marginTop: 6 }}>{TOBIFY.email}</div>
            <div style={{ color: "#666", fontSize: 12, marginTop: 6 }}>{TOBIFY.registration}</div>
          </div>
          <div>
            <div
              style={{
                color: "#777",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 6,
              }}
            >
              Odberateľ
            </div>
            <div style={{ fontWeight: 600 }}>{b.name ?? "—"}</div>
            {b.street && <div>{b.street}</div>}
            {(b.zip || b.city) && (
              <div>
                {b.zip} {b.city}
              </div>
            )}
            {b.country && <div>{b.country}</div>}
            {b.ico && (
              <div style={{ marginTop: 6 }}>
                IČO: <b>{b.ico}</b>
              </div>
            )}
            {b.dic && (
              <div>
                DIČ: <b>{b.dic}</b>
              </div>
            )}
            {b.ic_dph && (
              <div>
                IČ DPH: <b>{b.ic_dph}</b>
              </div>
            )}
            {b.email && <div style={{ marginTop: 6 }}>{b.email}</div>}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <thead>
            <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>Položka</th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb", textAlign: "right" }}>
                Základ
              </th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb", textAlign: "right" }}>
                DPH {Number(inv.vat_rate).toFixed(0)}%
              </th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb", textAlign: "right" }}>
                Spolu
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                Predplatné Faktero — <b>{inv.plan_name}</b> (mesačné)
              </td>
              <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                {money(inv.subtotal_cents, inv.currency)}
              </td>
              <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                {money(inv.vat_cents, inv.currency)}
              </td>
              <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                {money(inv.total_cents, inv.currency)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>
                Celkom na úhradu
              </td>
              <td style={{ padding: 10, textAlign: "right", fontSize: 18, fontWeight: 700 }}>
                {money(inv.total_cents, inv.currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div style={{ color: "#555", fontSize: 13 }}>
          <div>
            Spôsob úhrady: <b>online platobná karta cez GoPay</b>
            {inv.provider_payment_id ? <> (ref. {inv.provider_payment_id})</> : null}
          </div>
          <div style={{ marginTop: 6 }}>
            Doklad je vystavený elektronicky a je platný bez podpisu a pečiatky.
          </div>
          <div style={{ marginTop: 6 }}>
            Dodávateľ je platiteľom DPH. Uplatnená sadzba DPH 23 % podľa zákona č. 222/2004 Z. z. v
            znení účinnom od 1. 1. 2025.
          </div>
        </div>
      </div>
    </div>
  );
}
