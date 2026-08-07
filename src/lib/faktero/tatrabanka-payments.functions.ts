import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Platby prijatých faktúr cez TB Premium API.
 *
 * Redirect URI je zámerne ten istý ako pri súhlasoch (AIS). TB prijme len
 * adresy zaregistrované v developer portáli, takže druhá by znamenala ďalší
 * úkon v banke. Rozlišujeme podľa `state`, ktorý si určujeme sami —
 * platby posielajú "pay_<id>".
 */
export const PAYMENT_STATE_PREFIX = "pay_";

async function assertAdmin(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
  // Platba hýbe peniazmi — na rozdiel od čítania ju bežný člen spustiť nemôže.
  if (!["owner", "admin"].includes(data.role)) throw new Error("Forbidden");
  return data.role as string;
}

const PayInput = z.object({
  company_id: z.string().uuid(),
  invoice_id: z.string().uuid(),
  /** Účet, z ktorého sa platí. Keď chýba, vyberie si ho používateľ v banke. */
  debtor_account_id: z.string().uuid().optional(),
});

/**
 * Založí platbu v banke a vráti adresu, kam používateľa presmerovať na podpis.
 * Z účtu sa v tomto kroku nič nestrhne — platba je len pripravená (ACTC)
 * a vykoná sa až po podpise a odoslaní v callbacku.
 */
export const payPurchaseInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PayInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.company_id);

    const { isTatraConfigured, createPkcePair, getRedirectUri } =
      await import("./tatrabanka.server");
    if (!isTatraConfigured()) throw new Error("not_configured");
    const { initiatePayment, buildEndToEndId, buildPaymentAuthorizeUrl, isValidIban } =
      await import("./tatrabanka-payments.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inv } = await supabaseAdmin
      .from("purchase_invoices")
      .select(
        "id, company_id, supplier_name, supplier_iban, invoice_number, amount_total, currency, status, variable_symbol, constant_symbol, specific_symbol, deleted_at",
      )
      .eq("id", data.invoice_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!inv || inv.deleted_at) throw new Error("invoice_not_found");
    if (inv.status === "paid") throw new Error("invoice_already_paid");
    if (!inv.supplier_iban) throw new Error("missing_supplier_iban");
    if (!isValidIban(inv.supplier_iban)) throw new Error("invalid_supplier_iban");
    // TB Premium API robí cez sepa-credit-transfers len eurové platby.
    if ((inv.currency ?? "EUR") !== "EUR") throw new Error("unsupported_currency");
    const amount = Number(inv.amount_total);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount");

    // Rozpracovanú platbu tej istej faktúry nezakladáme druhýkrát — inak by
    // dvojklik na tlačidlo vyrobil dva príkazy na tú istú sumu.
    const { data: existing } = await supabaseAdmin
      .from("bank_payments")
      .select("id, status")
      .eq("purchase_invoice_id", inv.id)
      .in("status", ["pending_authorization", "authorized", "submitted"])
      .limit(1);
    if (existing && existing.length > 0) throw new Error("payment_already_in_progress");

    let debtorIban: string | null = null;
    let connectionId: string | null = null;
    if (data.debtor_account_id) {
      const { data: acc } = await supabaseAdmin
        .from("bank_accounts")
        .select("id, iban, bank_connection_id")
        .eq("id", data.debtor_account_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (!acc) throw new Error("account_not_found");
      debtorIban = acc.iban;
      connectionId = acc.bank_connection_id;
    }

    const endToEndId = buildEndToEndId(
      inv.variable_symbol,
      inv.specific_symbol,
      inv.constant_symbol,
    );
    const remittance = `Faktura ${inv.invoice_number}`;

    const init = await initiatePayment({
      creditorIban: inv.supplier_iban,
      creditorName: inv.supplier_name,
      amount,
      debtorIban,
      remittanceInfo: remittance,
      endToEndId: endToEndId || null,
    });

    const { verifier, challenge } = createPkcePair();
    const { data: row, error } = await supabaseAdmin
      .from("bank_payments")
      .insert({
        company_id: data.company_id,
        purchase_invoice_id: inv.id,
        bank_connection_id: connectionId,
        debtor_iban: debtorIban,
        creditor_iban: inv.supplier_iban,
        creditor_name: inv.supplier_name,
        amount,
        currency: "EUR",
        remittance_info: remittance,
        end_to_end_id: endToEndId || null,
        payment_id: init.paymentId,
        authorization_id: init.authorizationId,
        transaction_status: init.transactionStatus,
        sca_status: "received",
        status: "pending_authorization",
        created_by: context.userId,
        metadata: { pkce_code_verifier: verifier, sca_redirect: init.scaRedirect },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return {
      payment_row_id: row.id,
      authorize_url: buildPaymentAuthorizeUrl({
        authorizationId: init.authorizationId,
        state: `${PAYMENT_STATE_PREFIX}${row.id}`,
        redirectUri: getRedirectUri(),
        codeChallenge: challenge,
      }),
    };
  });

const ListInput = z.object({
  company_id: z.string().uuid(),
  invoice_id: z.string().uuid().optional(),
});

export const listPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("company_users")
      .select("role")
      .eq("company_id", data.company_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("bank_payments")
      .select(
        "id, purchase_invoice_id, creditor_iban, creditor_name, debtor_iban, amount, currency, status, transaction_status, sca_status, error_message, created_at",
      )
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.invoice_id) q = q.eq("purchase_invoice_id", data.invoice_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const RefreshInput = z.object({
  company_id: z.string().uuid(),
  payment_row_id: z.string().uuid(),
});

/**
 * Dotiahne aktuálny stav z banky. Platba sa nemusí vykonať okamžite —
 * ACSP znamená "spracováva sa" a dopredná platba čaká v PDNG.
 */
export const refreshPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RefreshInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("bank_payments")
      .select("id, payment_id, authorization_id, purchase_invoice_id, status")
      .eq("id", data.payment_row_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!row || !row.payment_id) throw new Error("not_found");

    const { getPaymentStatus, getScaStatus } = await import("./tatrabanka-payments.server");
    const status = await getPaymentStatus(row.payment_id);
    let scaStatus: string | null = null;
    if (row.authorization_id) {
      try {
        scaStatus = (await getScaStatus(row.payment_id, row.authorization_id)).scaStatus;
      } catch {
        // Stav autorizácie je len doplnková informácia — keď ho banka
        // po dokončení už nevydá, stav platby stále poznáme.
      }
    }

    const done = ["ACSC", "ACCC"].includes(status.transactionStatus);
    const rejected = status.transactionStatus === "RJCT";
    await supabaseAdmin
      .from("bank_payments")
      .update({
        transaction_status: status.transactionStatus,
        sca_status: scaStatus,
        status: done ? "submitted" : rejected ? "rejected" : row.status,
        error_message: rejected
          ? (status.additionalInformation ?? status.reasonCode ?? "Banka platbu zamietla")
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    // Faktúru označíme za zaplatenú až keď banka potvrdí zúčtovanie.
    if (done && row.purchase_invoice_id) {
      await supabaseAdmin
        .from("purchase_invoices")
        .update({ status: "paid", payment_date: new Date().toISOString().slice(0, 10) })
        .eq("id", row.purchase_invoice_id);
    }

    return { transaction_status: status.transactionStatus, sca_status: scaStatus };
  });
