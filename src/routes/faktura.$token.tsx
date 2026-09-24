import { createFileRoute, notFound } from "@tanstack/react-router";
import { textPrepoctu } from "@/lib/faktero/kurzy";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { formatujMenu } from "@/lib/faktero/mena";

/**
 * Faktúra otvorená z QR kódu na doklade.
 *
 * Odberateľ ju vidí bez prihlásenia — doklad aj tak drží v ruke. Token je
 * náhodných 32 znakov a sprístupňuje výhradne ten jeden doklad; nič iné z
 * firmy sa cez neho dostať nedá.
 */

const Vstup = z.object({ token: z.string().min(16).max(128) });

const nacitajFakturu = createServerFn({ method: "POST" })
  .validator((i) => Vstup.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: f } = await supabaseAdmin
      .from("invoices")
      .select(
        "id, company_id, invoice_number, type, status, issue_date, delivery_date, due_date, currency, subtotal, vat_total, total, exchange_rate, exchange_rate_date, vat_total_eur, variable_symbol, customer_name, customer_street, customer_city, customer_zip, customer_ico, customer_dic, customer_ic_dph, notes, reverse_charge, osobitna_uprava, deleted_at, payment_iban, payment_swift",
      )
      .eq("public_token", data.token)
      .maybeSingle();
    // Zmazaný doklad sa nesmie dať otvoriť ani starým odkazom.
    if (!f || (f as any).deleted_at) throw notFound();

    const [{ data: polozky }, { data: firma }] = await Promise.all([
      supabaseAdmin
        .from("invoice_items")
        .select("name, description, quantity, unit, unit_price, vat_rate, total")
        .eq("invoice_id", (f as any).id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("companies")
        .select(
          "name, street, city, zip, country, ico, dic, ic_dph, vat_payer, vat_scheme, iban, email, phone",
        )
        .eq("id", (f as any).company_id)
        .maybeSingle(),
    ]);

    // `id` ani `company_id` sa von neposielajú — návštevník ich nepotrebuje.
    const {
      id: _id,
      company_id: _c,
      deleted_at: _d,
      payment_iban: _pi,
      payment_swift: _ps,
      ...doklad
    } = f as any;
    // Účet, ktorý si faktúra zapamätala, má prednosť pred účtom firmy.
    const { sUctomFaktury } = await import("@/lib/faktero/platobny-ucet");
    // Prečo na doklade nie je daň — rovnaká veta ako v PDF. Doklad s vyčíslenou
    // daňou ju nedostane ani vtedy, keď je firma dnes vedená ako neplatiteľ.
    const { rezimFirmy } = await import("@/lib/faktero/dph-rezim");
    const textDph = Number((f as any).vat_total ?? 0) > 0 ? null : rezimFirmy(firma).textNaDoklad;
    const { vetyNaDoklad } = await import("@/lib/faktero/faktura-nalezitosti");
    return {
      doklad,
      vetyUprav: vetyNaDoklad({
        danZPrijatejPlatby: (firma as any)?.dan_z_prijatej_platby,
        osobitnaUprava: (f as any).osobitna_uprava,
      }),
      polozky: polozky ?? [],
      firma: firma ? sUctomFaktury(firma, f as any) : null,
      textDph,
    };
  });

export const Route = createFileRoute("/faktura/$token")({
  ssr: true,
  loader: ({ params }) => {
    // Nezmyselný token je z pohľadu návštevníka to isté ako neexistujúci
    // doklad — nech dostane stránku „nenájdené", nie chybu servera.
    if (!Vstup.safeParse({ token: params.token }).success) throw notFound();
    return nacitajFakturu({ data: { token: params.token } });
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Faktúra ${loaderData?.doklad?.invoice_number ?? ""} — Faktero` },
      // Doklad nepatrí do vyhľadávačov, aj keď je odkaz verejný.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  notFoundComponent: () => (
    <Obal>
      <h1 className="text-xl font-semibold">Faktúra sa nenašla</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Odkaz je neplatný alebo bol doklad zrušený.
      </p>
    </Obal>
  ),
  errorComponent: () => (
    <Obal>
      <h1 className="text-xl font-semibold">Faktúru sa nepodarilo načítať</h1>
      <p className="mt-2 text-sm text-muted-foreground">Skúste to, prosím, znova.</p>
    </Obal>
  ),
  component: VerejnaFaktura,
});

function Obal({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </div>
  );
}

function Riadok({ k, v }: { k: string; v: React.ReactNode }) {
  if (!v) return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

function VerejnaFaktura() {
  const { doklad, polozky, firma, textDph, vetyUprav } = Route.useLoaderData();
  const mena = doklad.currency ?? "EUR";
  const suma = (n: unknown) => formatujMenu(n, mena);
  const nazov =
    doklad.type === "credit_note"
      ? "Dobropis"
      : doklad.type === "proforma"
        ? "Zálohová faktúra"
        : "Faktúra";

  return (
    <Obal>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{nazov}</div>
          <h1 className="text-2xl font-semibold">{doklad.invoice_number}</h1>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Na úhradu</div>
          <div className="text-2xl font-semibold tabular-nums">{suma(doklad.total)}</div>
          {doklad.status === "paid" && (
            <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Uhradené
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Dodávateľ</div>
          <div className="mt-1 text-sm font-medium">{firma?.name}</div>
          <div className="text-sm text-muted-foreground">
            {[firma?.street, [firma?.zip, firma?.city].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(", ")}
          </div>
          {firma?.ico && <div className="mt-1 text-xs text-muted-foreground">IČO {firma.ico}</div>}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Odberateľ</div>
          <div className="mt-1 text-sm font-medium">{doklad.customer_name}</div>
          <div className="text-sm text-muted-foreground">
            {[
              doklad.customer_street,
              [doklad.customer_zip, doklad.customer_city].filter(Boolean).join(" "),
            ]
              .filter(Boolean)
              .join(", ")}
          </div>
          {doklad.customer_ico && (
            <div className="mt-1 text-xs text-muted-foreground">IČO {doklad.customer_ico}</div>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2">Položka</th>
              <th className="py-2 text-right">Množstvo</th>
              <th className="py-2 text-right">Cena</th>
              <th className="py-2 text-right">DPH</th>
              <th className="py-2 text-right">Celkom</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {polozky.map((p: any, i: number) => (
              <tr key={i}>
                <td className="py-2">
                  {p.name}
                  {p.description && (
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {Number(p.quantity)} {p.unit}
                </td>
                <td className="py-2 text-right tabular-nums">{suma(p.unit_price)}</td>
                <td className="py-2 text-right tabular-nums">{Number(p.vat_rate)} %</td>
                <td className="py-2 text-right font-medium tabular-nums">{suma(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 sm:ml-auto sm:w-72">
        <Riadok k="Základ" v={suma(doklad.subtotal)} />
        <Riadok
          k={doklad.reverse_charge ? "DPH (PDP)" : "DPH"}
          v={suma(doklad.reverse_charge ? 0 : doklad.vat_total)}
        />
        <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
          <span>Spolu</span>
          <span className="tabular-nums">{suma(doklad.total)}</span>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
        <Riadok k="Dátum vystavenia" v={doklad.issue_date} />
        <Riadok k="Dátum dodania" v={doklad.delivery_date} />
        <Riadok k="Splatnosť" v={doklad.due_date} />
        <Riadok k="Variabilný symbol" v={doklad.variable_symbol} />
        <Riadok k="IBAN" v={firma?.iban} />
      </div>

      {doklad.currency !== "EUR" && doklad.exchange_rate && doklad.vat_total_eur != null && (
        <p className="mt-4 text-sm text-muted-foreground">
          {textPrepoctu(
            String(doklad.currency),
            Number(doklad.exchange_rate),
            String(doklad.exchange_rate_date ?? doklad.delivery_date ?? doklad.issue_date),
            Number(doklad.vat_total_eur),
          )}
        </p>
      )}

      {vetyUprav.map((v: string) => (
        <p key={v} className="mt-4 text-sm font-medium">
          {v}
        </p>
      ))}

      {textDph && <p className="mt-4 text-sm font-medium">{textDph}</p>}

      {doklad.notes && <p className="mt-4 text-sm text-muted-foreground">{doklad.notes}</p>}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Vystavené cez <span className="font-medium">Faktero</span>
      </p>
    </Obal>
  );
}
