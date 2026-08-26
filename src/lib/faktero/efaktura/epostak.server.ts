/**
 * ePošták Enterprise API client (Faktero).
 *
 * Implements the four core endpoints required for SK eFaktúra 2027:
 *   - POST /api/v1/auth/token              (JWT, 15 min, cached in memory)
 *   - POST /api/v1/documents/send          (Bearer + X-Firm-Id + Idempotency-Key)
 *   - GET  /api/v1/documents/{id}/status
 *   - GET  /api/v1/inbound/documents
 *   - GET  /api/v1/peppol/participants/resolve
 *
 * Server-only: never import from the client bundle.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  registerEfakturaProvider,
  type EfakturaProvider,
  type DeliveryRequest,
  type DeliveryResult,
  type LookupResult,
} from "./peppol-provider.server";
import { peppolId, schemaZId } from "./peppol-id";

// ─── Config ──────────────────────────────────────────────────────────────────

function getConfig() {
  const env = (process.env.EPOSTAK_ENV ?? "sandbox").toLowerCase();
  const baseUrl = env === "production" ? "https://epostak.sk" : "https://dev.epostak.sk";
  const clientId = process.env.EPOSTAK_CLIENT_ID;
  const clientSecret = process.env.EPOSTAK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "ePošták nie je nakonfigurovaný — chýba EPOSTAK_CLIENT_ID alebo EPOSTAK_CLIENT_SECRET.",
    );
  }
  return { baseUrl, clientId, clientSecret, env };
}

// ─── Token cache ─────────────────────────────────────────────────────────────

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;
let tokenPromise: Promise<string> | null = null;

/**
 * Get a valid JWT. Cached in-memory; refreshes ~60 s before expiry.
 */
export async function getEPostakToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;
  if (tokenPromise) return tokenPromise;

  const { baseUrl, clientId, clientSecret } = getConfig();

  tokenPromise = (async () => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`ePošták auth zlyhal (${res.status}): ${body.slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        access_token?: string;
        token?: string;
        expires_in?: number;
      };
      const token = json.access_token ?? json.token;
      if (!token) throw new Error("ePošták auth: chýbajúci access_token v odpovedi.");
      const ttlSeconds = json.expires_in ?? 15 * 60;
      tokenCache = { token, expiresAt: Date.now() + ttlSeconds * 1000 };
      return token;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

/** Force-invalidate cached token (e.g. after 401). */
export function resetEPostakToken(): void {
  tokenCache = null;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

type FetchOpts = {
  method?: string;
  firmId?: string;
  idempotencyKey?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

/**
 * Stiahne UBL ako čistý text.
 *
 * `epostakFetch` odpoveď rozoberá ako JSON, čo by na XML spadlo — a odkaz na
 * UBL chodí ako celá adresa, nie ako cesta.
 */
async function epostakFetchText(url: string, firmId: string): Promise<string> {
  const jwt = await getEPostakToken();
  const r = await fetch(url, {
    headers: { authorization: `Bearer ${jwt}`, "X-Firm-Id": firmId },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`UBL sa nepodarilo stiahnuť (${r.status}).`);
  return await r.text();
}

async function epostakFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { baseUrl } = getConfig();
  const url = new URL(`${baseUrl}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const doRequest = async (token: string) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (opts.firmId) headers["X-Firm-Id"] = opts.firmId;
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    return fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  };

  let token = await getEPostakToken();
  let res = await doRequest(token);
  if (res.status === 401) {
    resetEPostakToken();
    token = await getEPostakToken();
    res = await doRequest(token);
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === "object" && (parsed as any).message) ||
      (typeof parsed === "string" ? parsed : "") ||
      `HTTP ${res.status}`;
    const err = new Error(`ePošták ${path} zlyhal: ${msg}`) as Error & {
      status?: number;
      response?: unknown;
    };
    err.status = res.status;
    err.response = parsed;
    throw err;
  }

  return parsed as T;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type SendEfakturaResult = {
  documentId: string;
  status: string;
  providerResponse: unknown;
};

/**
 * Send an invoice as eFaktúra via ePošták.
 * Persists progress to `efaktura_documents` + `efaktura_deliveries`.
 */
export async function sendEfaktura(
  invoiceId: string,
  firmEpostakId: string,
): Promise<SendEfakturaResult> {
  // 1) Load invoice + items + company
  const { data: invoice, error: invErr } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr) throw invErr;
  if (!invoice) throw new Error("Faktúra nenájdená.");

  const [{ data: items, error: itemsErr }, { data: company, error: compErr }, { data: profile }] =
    await Promise.all([
      supabaseAdmin
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("position", { ascending: true }),
      supabaseAdmin.from("companies").select("*").eq("id", invoice.company_id).maybeSingle(),
      supabaseAdmin
        .from("efaktura_profiles")
        .select("*")
        .eq("company_id", invoice.company_id)
        .maybeSingle(),
    ]);
  if (itemsErr) throw itemsErr;
  if (compErr) throw compErr;
  if (!company) throw new Error("Firma nenájdená.");

  /*
    Adresovanie príjemcu. Predtým sa skladalo `9944:<IČ DPH>` — overené proti
    ePoštákovi to nenájde nikoho (`not_registered`), zatiaľ čo `0245:<DIČ>` je
    `sendable`. Chybné adresovanie by sa pritom prejavilo až tým, že faktúra
    nikam nedorazí, tak je výpočet na jednom mieste a otestovaný.
  */
  const receiverPeppolId = peppolId({
    zadane: (invoice as any).customer_peppol_id,
    dic: (invoice as any).customer_dic,
    icDph: (invoice as any).customer_ic_dph,
  });
  if (!receiverPeppolId) {
    throw new Error("Odberateľ nemá DIČ ani IČ DPH — bez nich sa eFaktúra nemá kam poslať.");
  }

  // 2) Send to ePošták
  /*
    Povinné polia podľa EN 16931, overené proti sandboxu ePoštáka — bez nich
    vráti 422 a faktúra neodíde:

      receiverName    BT-44, pravidlo BR-06
      buyerReference  BT-10 (alebo objednávka BT-13), PEPPOL-EN16931-R003

    Ako referenciu berieme číslo objednávky odberateľa, keď ho na faktúre má;
    inak variabilný symbol a nakoniec číslo faktúry. Prázdna byť nesmie.
  */
  const buyerReference =
    (invoice as any).order_number || (invoice as any).variable_symbol || invoice.invoice_number;

  const body = {
    receiverPeppolId,
    receiverName: (invoice as any).customer_name ?? undefined,
    buyerReference,
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    currency: invoice.currency ?? "EUR",
    iban: (company as any).iban ?? undefined,
    items: (items ?? []).map((it: any) => ({
      description: it.name + (it.description ? ` — ${it.description}` : ""),
      quantity: Number(it.quantity),
      unitPrice: Number(it.unit_price),
      vatRate: Number(it.vat_rate),
    })),
  };

  const response = await epostakFetch<{
    id?: string;
    documentId?: string;
    status?: string;
    transport_status?: string;
  }>("/api/v1/documents/send", {
    method: "POST",
    firmId: firmEpostakId,
    idempotencyKey: invoice.invoice_number,
    body,
  });

  const providerMessageId = response.documentId ?? response.id ?? null;
  const transportStatus = response.transport_status ?? response.status ?? "pending";

  // 3) Persist
  const { data: doc, error: docErr } = await supabaseAdmin
    .from("efaktura_documents")
    .upsert(
      {
        company_id: invoice.company_id,
        invoice_id: invoiceId,
        profile_id: profile?.id ?? null,
        document_number: invoice.invoice_number,
        issue_date: invoice.issue_date,
        currency: invoice.currency ?? "EUR",
        total: invoice.total,
        status: "generated",
        format: "peppol_bis_3" as any,
        schema_version: "1.0",
        generated_at: new Date().toISOString(),
      } as any,
      { onConflict: "invoice_id" },
    )
    .select()
    .single();
  if (docErr) throw docErr;

  await supabaseAdmin.from("efaktura_deliveries").insert({
    company_id: invoice.company_id,
    document_id: doc.id,
    channel: "peppol" as any,
    provider: "epostak",
    provider_message_id: providerMessageId,
    recipient_participant_id: receiverPeppolId,
    recipient_scheme: schemaZId(receiverPeppolId),
    status: mapTransportStatus(transportStatus),
    sent_at: new Date().toISOString(),
    raw_response: response as any,
    attempt_count: 1,
  } as any);

  return {
    documentId: providerMessageId ?? doc.id,
    status: transportStatus,
    providerResponse: response,
  };
}

export type EfakturaStatusResult = {
  documentId: string;
  transport_status: string;
  raw: unknown;
};

export async function getEfakturaStatus(
  documentId: string,
  firmEpostakId: string,
): Promise<EfakturaStatusResult> {
  const res = await epostakFetch<{ status?: string; transport_status?: string }>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/status`,
    { firmId: firmEpostakId },
  );
  const transportStatus = res.transport_status ?? res.status ?? "unknown";

  // Update latest delivery row if we know about it
  await supabaseAdmin
    .from("efaktura_deliveries")
    .update({
      status: mapTransportStatus(transportStatus),
      delivered_at:
        transportStatus === "delivered" || transportStatus === "accepted"
          ? new Date().toISOString()
          : null,
      raw_response: res as any,
    } as any)
    .eq("provider_message_id", documentId);

  return { documentId, transport_status: transportStatus, raw: res };
}

export type InboundDocument = {
  id: string;
  senderPeppolId?: string;
  receivedAt?: string;
  invoiceNumber?: string;
  xml?: string;
  [k: string]: unknown;
};

export async function pollInbound(
  firmEpostakId: string,
  cursor?: string,
): Promise<{ documents: InboundDocument[]; nextCursor: string | null }> {
  const res = await epostakFetch<{
    documents?: InboundDocument[];
    items?: InboundDocument[];
    nextCursor?: string | null;
    next_cursor?: string | null;
  }>("/api/v1/inbound/documents", {
    firmId: firmEpostakId,
    query: { cursor },
  });
  return {
    documents: res.documents ?? res.items ?? [],
    nextCursor: res.nextCursor ?? res.next_cursor ?? null,
  };
}

export type ParticipantLookup = {
  exists: boolean;
  peppolId: string;
  supportedDocuments?: string[];
  raw: unknown;
};

const SANDBOX_PARTICIPANTS = new Set([
  "0245:5843291067", // Tobify sandbox 2
  "0245:4286179504", // Tobify sandbox 1
]);

export async function lookupParticipant(peppolId: string): Promise<ParticipantLookup> {
  const [scheme, identifier] = peppolId.includes(":") ? peppolId.split(":", 2) : ["0245", peppolId];
  const full = `${scheme}:${identifier}`;
  const { env } = getConfig();

  // 1) Try company/lookup/{ico} — works for SK companies regardless of SMP presence.
  try {
    const res = await epostakFetch<any>(`/api/v1/company/lookup/${encodeURIComponent(identifier)}`);
    return {
      exists: true,
      peppolId: full,
      supportedDocuments: res?.supportedDocuments ?? res?.documentTypes,
      raw: res,
    };
  } catch (e: any) {
    // Fall through to SMP lookup / sandbox stub.
    if (e?.status && ![400, 404].includes(e.status)) throw e;
  }

  // 2) Sandbox stub: sandbox SMP is not publicly resolvable. Simulate success
  //    for the documented sandbox firms so transport tests can proceed.
  if (env !== "production" && SANDBOX_PARTICIPANTS.has(full)) {
    return {
      exists: true,
      peppolId: full,
      supportedDocuments: ["peppol_bis_3"],
      raw: {
        simulated: true,
        note: "Sandbox Peppol lookup simulated — real SMP lookup runs in production.",
      },
    };
  }

  // 3) Last resort: real SMP path lookup (works in production).
  try {
    const res = await epostakFetch<any>(
      `/api/v1/peppol/participants/${encodeURIComponent(scheme)}/${encodeURIComponent(identifier)}`,
    );
    return {
      exists: true,
      peppolId: full,
      supportedDocuments: res?.supportedDocuments ?? res?.documentTypes,
      raw: res,
    };
  } catch (e: any) {
    if (e?.status === 404 || e?.status === 400)
      return { exists: false, peppolId: full, raw: e.response };
    throw e;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapTransportStatus(
  s: string,
): "pending" | "sent" | "accepted" | "delivered" | "failed" | "rejected" {
  const v = s.toLowerCase();
  if (["delivered", "received"].includes(v)) return "delivered";
  if (["accepted", "ok"].includes(v)) return "accepted";
  if (["sent", "in_transit", "processing"].includes(v)) return "sent";
  if (["failed", "error"].includes(v)) return "failed";
  if (["rejected", "denied"].includes(v)) return "rejected";
  return "pending";
}

// ─── Provider registration ───────────────────────────────────────────────────

export const ePostakProvider: EfakturaProvider = {
  key: "epostak",
  supportedChannels: ["peppol"],
  supportedFormats: ["peppol_bis_3", "ubl_2_1"],
  async lookupParticipant(participantId, scheme) {
    const full = participantId.includes(":") ? participantId : `${scheme}:${participantId}`;
    const r = await lookupParticipant(full);
    if (!r.exists) return null;
    return {
      participantId,
      scheme,
      supportedFormats: ["peppol_bis_3"],
      certificateValid: true,
    } satisfies LookupResult;
  },
  async sendDocument(req: DeliveryRequest): Promise<DeliveryResult> {
    const firmId = req.metadata?.firmEpostakId;
    if (!firmId) {
      return {
        status: "failed",
        errorCode: "missing_firm_id",
        errorMessage: "Chýba firmEpostakId v metadata.",
      };
    }
    const invoiceId = req.metadata?.invoiceId ?? req.documentId;
    try {
      const r = await sendEfaktura(invoiceId, firmId);
      return {
        status: mapTransportStatus(r.status),
        providerMessageId: r.documentId,
        acceptedAt: new Date().toISOString(),
        raw: r.providerResponse,
      };
    } catch (e: any) {
      return {
        status: "failed",
        errorCode: e?.status ? String(e.status) : "send_error",
        errorMessage: e?.message ?? "Odoslanie zlyhalo.",
        raw: e?.response,
      };
    }
  },
};

registerEfakturaProvider(ePostakProvider);

/** Firma tak, ako ju vedie ePošták. */
export type EPostakFirma = {
  id: string;
  name: string;
  ico: string | null;
  peppolId: string | null;
  peppolStatus: string | null;
};

/**
 * Firmy zaregistrované pod naším integrátorským kľúčom.
 *
 * Bez tohto zoznamu sa nedá odoslať nič — ich API chce `X-Firm-Id` pri každom
 * volaní viazanom na firmu a to id nemal kto zistiť.
 */
export async function nacitajEPostakFirmy(): Promise<EPostakFirma[]> {
  const odpoved = await epostakFetch<{ firms?: EPostakFirma[] }>("/api/v1/firms", {
    method: "GET",
  });
  return odpoved.firms ?? [];
}

/**
 * Overí, či sa príjemcovi dá doručiť.
 *
 * ePošták vracia `nextAction`: `sendable` znamená, že je v Peppole a prijme
 * doklad. Čokoľvek iné je dôvod neodosielať — faktúra by odišla do prázdna.
 */
export async function overPrijemcuUEPostaka(
  id: string,
  firmEpostakId: string,
): Promise<{ id: string; dostupny: boolean; dovod?: string; stav?: string }> {
  try {
    const r = await epostakFetch<{ nextAction?: string; participant?: { peppolId?: string } }>(
      `/api/v1/peppol/participants/resolve?peppolId=${encodeURIComponent(id)}`,
      { method: "GET", firmId: firmEpostakId },
    );
    const stav = r.nextAction ?? "unknown";
    return stav === "sendable"
      ? { id, dostupny: true, stav }
      : { id, dostupny: false, stav, dovod: "Odberateľ nie je zaregistrovaný v Peppole." };
  } catch (e: any) {
    return { id, dostupny: false, dovod: e?.message ?? "Overenie zlyhalo." };
  }
}

/** Nájde firmu podľa IČO. Porovnáva sa bez medzier — inak sa „12 345 678" nikdy netrafí. */
export function najdiFirmuPodlaIco(
  firmy: EPostakFirma[],
  ico: string | null | undefined,
): EPostakFirma | null {
  const hladane = (ico ?? "").replace(/\s/g, "");
  if (!hladane) return null;
  return firmy.find((f) => (f.ico ?? "").replace(/\s/g, "") === hladane) ?? null;
}

/* ─── Prijímanie ─────────────────────────────────────────────────────────── */

type PrijatyDokument = {
  id: string;
  received_at?: string;
  peppol_message_id?: string;
  sender?: { peppol_id?: string; name?: string };
  ubl_url?: string;
  metadata?: { invoice_number?: string };
};

/**
 * Stiahne eFaktúry doručené firme a uloží ich.
 *
 * Ich API vracia zoznam s metadátami a odkazom na UBL; samotné XML sa doťahuje
 * zvlášť. Parsovanie a zápis rieši `ingestIncoming` — tu ide len o prenos.
 *
 * Doklad, ktorý už uložený je, sa preskočí. Poznáva sa podľa
 * `peppol_message_id`: ich `id` je id doručenia, ale to isté podanie môže
 * doraziť znova a v prijatých faktúrach by potom bola tá istá faktúra dvakrát.
 */
export async function stiahniPrijate(
  companyId: string,
  firmEpostakId: string,
): Promise<{ novych: number; preskocenych: number; problemy: string[] }> {
  const odpoved = await epostakFetch<{ documents?: PrijatyDokument[] }>(
    "/api/v1/inbound/documents",
    { method: "GET", firmId: firmEpostakId },
  );
  const dokumenty = odpoved.documents ?? [];
  if (!dokumenty.length) return { novych: 0, preskocenych: 0, problemy: [] };

  const znacky = dokumenty.map((d) => d.peppol_message_id ?? d.id).filter(Boolean) as string[];
  const { data: uzMame } = await supabaseAdmin
    .from("efaktura_received_documents")
    .select("parsed_data")
    .eq("company_id", companyId)
    .limit(2000);
  const znameZnacky = new Set(
    ((uzMame ?? []) as any[])
      .map((r) => r?.parsed_data?.providerMessageId)
      .filter(Boolean) as string[],
  );

  const { ingestIncoming } = await import("./inbound.server");
  let novych = 0;
  let preskocenych = 0;
  const problemy: string[] = [];

  for (const d of dokumenty) {
    const znacka = d.peppol_message_id ?? d.id;
    if (znacka && znameZnacky.has(znacka)) {
      preskocenych += 1;
      continue;
    }
    if (!d.ubl_url) {
      problemy.push(`${d.metadata?.invoice_number ?? d.id}: chýba odkaz na UBL`);
      continue;
    }
    try {
      const xml = await epostakFetchText(d.ubl_url, firmEpostakId);
      await ingestIncoming(
        {
          companyId,
          channel: "peppol",
          xml,
          providerMessageId: znacka,
          sender: {
            participantId: d.sender?.peppol_id,
            scheme: d.sender?.peppol_id?.split(":")[0],
          },
          receivedAt: d.received_at,
        },
        async (row) => {
          const { data, error } = await supabaseAdmin
            .from("efaktura_received_documents")
            .insert({
              ...row,
              // Značka podania sa ukladá k rozobratým údajom — vlastný stĺpec
              // na ňu tabuľka nemá a bez nej by sa doklad natiahol znova.
              parsed_data: { ...row.parsed_data, providerMessageId: znacka } as any,
            } as any)
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          return { id: data.id };
        },
      );
      novych += 1;
    } catch (e: any) {
      problemy.push(`${d.metadata?.invoice_number ?? d.id}: ${e?.message ?? "nepodarilo sa"}`);
    }
  }
  return { novych, preskocenych, problemy };
}
