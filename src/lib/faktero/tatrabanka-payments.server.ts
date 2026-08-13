import { authBase, basicAuth, tbBase } from "./tatrabanka.server";

/**
 * Tatra banka Premium API — Payments (PIS) 1.4.0
 *
 * Podľa oficiálnej dokumentácie, nie sondovania. Verzia je súčasťou cesty a je
 * INÁ pre každý endpoint — to je najčastejší zdroj omylu:
 *   POST   /v3/payments/sepa-credit-transfers                                  založenie
 *   PUT    /v1/payments/sepa-credit-transfers/{pid}/authorizations/{aid}       odoslanie
 *   GET    /v1/payments/sepa-credit-transfers/{pid}/authorizations/{aid}       stav SCA
 *   GET    /v3/payments/sepa-credit-transfers/{pid}/status                     stav platby
 *   DELETE /v2/payments/sepa-credit-transfers/{pid}                            zrušenie
 *
 * Používame OAuth flow, nie redirect flow. Redirect flow by bol o krok kratší,
 * ale nechal by nás hádať, či platba naozaj odišla. Pri OAuth flowe platbu
 * odosielame my (PUT) a dostaneme priamo ACSP/ACSC. Bez toho PUT-u zostane
 * platba v ACTC a nikdy sa nevykoná — pritom by v appke vyzerala ako podpísaná.
 */

const PRODUCT = "payments/sepa-credit-transfers";
const PIS_SCOPE = "PREMIUM_PIS";

/** Servisný token na založenie platby a čítanie stavov. Platí 24 h. */
export async function getPisServiceToken(): Promise<string> {
  const res = await fetch(`${authBase()}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(),
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: PIS_SCOPE }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`tb_pis_token_failed: ${res.status} ${txt.slice(0, 300)}`);
  return JSON.parse(txt).access_token as string;
}

/**
 * Meno príjemcu pre SEPA. Banka tieto štyri znaky nepovoľuje a predpisuje
 * presnú náhradu — bez nej príkaz odmietne.
 */
export function sanitizeCreditorName(name: string): string {
  return name
    .replace(/~/g, "-")
    .replace(/\^/g, ".")
    .replace(/`/g, "'")
    .replace(/\|/g, "/")
    .trim()
    .slice(0, 70);
}

export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

const IBAN_RE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/;

/**
 * Tvar aj kontrolné číslice (ISO 7064 mod-97). Banka preklep v IBAN-e odmietne
 * s "Invalid IBAN (Creditor IBAN)" — overené v sandboxe. Lepšie ho zachytiť
 * u nás a povedať to zrozumiteľne, než nechať používateľa hádať.
 */
export function isValidIban(iban: string): boolean {
  const v = normalizeIban(iban);
  if (!IBAN_RE.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const value = code >= 65 ? code - 55 : code - 48;
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}

/** Suma musí ísť s bodkou a najviac dvomi desatinnými miestami. */
export function formatAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount");
  return amount.toFixed(2);
}

/**
 * Slovenské symboly nemajú v Berlin Group vlastné polia — banka ich číta
 * z endToEndIdentification v tvare /VS…/SS…/KS…. Limit je 35 znakov, takže
 * pri dlhších symboloch radšej vynecháme tie menej dôležité, než aby banka
 * odmietla celý príkaz.
 */
export function buildEndToEndId(
  vs?: string | null,
  ss?: string | null,
  ks?: string | null,
): string {
  const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "");
  const parts: Array<[string, string]> = [
    ["VS", digits(vs)],
    ["SS", digits(ss)],
    ["KS", digits(ks)],
  ];
  let out = "";
  for (const [prefix, value] of parts) {
    if (!value) continue;
    const next = `${out}/${prefix}${value}`;
    if (next.length > 35) break;
    out = next;
  }
  return out;
}

export type InitiatePaymentInput = {
  creditorIban: string;
  creditorName: string;
  amount: number;
  debtorIban?: string | null;
  remittanceInfo?: string | null;
  endToEndId?: string | null;
  requestedExecutionDate?: string | null;
};

export type InitiatePaymentResult = {
  paymentId: string;
  authorizationId: string;
  transactionStatus: string;
  scaRedirect: string | null;
};

/**
 * Založí platbu. Vráti paymentId + authorizationId; platba je zatiaľ len
 * pripravená (ACTC), z účtu sa nič nestrhne, kým používateľ nepodpíše
 * a my nezavoláme submitPayment().
 *
 * debtorIban je nepovinný — keď ho nepošleme, používateľ si účet vyberie
 * priamo na autorizačnom portáli banky.
 */
export async function initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
  const creditorIban = normalizeIban(input.creditorIban);
  if (!isValidIban(creditorIban)) throw new Error("invalid_creditor_iban");
  const creditorName = sanitizeCreditorName(input.creditorName);
  if (!creditorName) throw new Error("missing_creditor_name");

  const body: Record<string, unknown> = {
    instructedAmount: { currency: "EUR", amount: formatAmount(input.amount) },
    creditorAccount: { iban: creditorIban },
    creditorName,
  };
  if (input.debtorIban) {
    const debtor = normalizeIban(input.debtorIban);
    if (!isValidIban(debtor)) throw new Error("invalid_debtor_iban");
    body.debtorAccount = { iban: debtor };
  }
  if (input.remittanceInfo) {
    body.remittanceInformationUnstructured = input.remittanceInfo.slice(0, 140);
  }
  if (input.endToEndId) body.endToEndIdentification = input.endToEndId.slice(0, 35);
  if (input.requestedExecutionDate) body.requestedExecutionDate = input.requestedExecutionDate;

  const token = await getPisServiceToken();
  const requestId = crypto.randomUUID();
  const res = await fetch(`${tbBase()}/v3/${PRODUCT}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Request-ID": requestId,
    },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) {
    console.error(
      `[tb-pis] initiate ${res.status} (X-Request-ID=${requestId}): ${txt.slice(0, 400)}`,
    );
    throw new Error(`tb_payment_init_failed: ${res.status} ${txt.slice(0, 400)}`);
  }
  const json = JSON.parse(txt);
  if (!json.paymentId || !json.authorizationId) {
    throw new Error(`tb_payment_init_incomplete: ${txt.slice(0, 300)}`);
  }
  return {
    paymentId: json.paymentId,
    authorizationId: json.authorizationId,
    transactionStatus: json.transactionStatus ?? "ACTC",
    scaRedirect: json._links?.scaRedirect?.href ?? null,
  };
}

/**
 * Autorizačná URL pre podpis platby. Scope nesie authorizationId, NIE paymentId
 * — to je jeden z detailov, ktorý sa nedá uhádnuť.
 */
export function buildPaymentAuthorizeUrl(opts: {
  authorizationId: string;
  state: string;
  redirectUri: string;
  codeChallenge: string;
  cancel?: boolean;
}): string {
  const scope = opts.cancel ? "PREMIUM_PIS_CANC" : PIS_SCOPE;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.TB_CLIENT_ID!,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: `${scope}:${opts.authorizationId}`,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${authBase()}/authorize?${params.toString()}`;
}

/**
 * Výmena kódu za token na odoslanie platby. Pozor: tu ide scope holý
 * (PREMIUM_PIS), zatiaľ čo v authorize niesol authorizationId.
 * Kód platí 5 minút.
 */
export async function exchangePaymentCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  cancel = false,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    scope: cancel ? "PREMIUM_PIS_CANC" : PIS_SCOPE,
  });
  const res = await fetch(`${authBase()}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(),
      Accept: "application/json",
    },
    body,
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`tb_pis_code_exchange_failed: ${res.status} ${txt.slice(0, 300)}`);
  return JSON.parse(txt).access_token as string;
}

export type SubmitResult = { transactionStatus: string; statusDateTime?: string };

/**
 * Odošle podpísanú platbu do banky. Bez tohto kroku platba visí v ACTC
 * a nikdy sa nevykoná. Token musí byť ten z exchangePaymentCode(), nie servisný.
 */
export async function submitPayment(
  paymentId: string,
  authorizationId: string,
  userAccessToken: string,
): Promise<SubmitResult> {
  const requestId = crypto.randomUUID();
  const url = `${tbBase()}/v1/${PRODUCT}/${encodeURIComponent(paymentId)}/authorizations/${encodeURIComponent(authorizationId)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      Accept: "application/json",
      "X-Request-ID": requestId,
    },
  });
  const txt = await res.text();
  if (!res.ok) {
    console.error(
      `[tb-pis] submit ${res.status} (X-Request-ID=${requestId}): ${txt.slice(0, 400)}`,
    );
    throw new Error(`tb_payment_submit_failed: ${res.status} ${txt.slice(0, 400)}`);
  }
  return JSON.parse(txt);
}

/** Stav platby. Pre JSON produkty vracia banka JSON. */
export async function getPaymentStatus(paymentId: string): Promise<{
  transactionStatus: string;
  statusDateTime?: string;
  reasonCode?: string;
  additionalInformation?: string;
}> {
  const token = await getPisServiceToken();
  const res = await fetch(`${tbBase()}/v3/${PRODUCT}/${encodeURIComponent(paymentId)}/status`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-Request-ID": crypto.randomUUID(),
    },
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`tb_payment_status_failed: ${res.status} ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

/** Stav autorizácie: received → unconfirmed → finalised. */
export async function getScaStatus(
  paymentId: string,
  authorizationId: string,
): Promise<{ scaStatus: string }> {
  const token = await getPisServiceToken();
  const url = `${tbBase()}/v1/${PRODUCT}/${encodeURIComponent(paymentId)}/authorizations/${encodeURIComponent(authorizationId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-Request-ID": crypto.randomUUID(),
    },
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`tb_sca_status_failed: ${res.status} ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

/** Ľudský popis stavu — do UI, nech používateľ nevidí štvorpísmenkové kódy. */
export function describeStatus(transactionStatus?: string | null): string {
  switch (transactionStatus) {
    case "ACTC":
      return "Pripravená na podpis";
    case "ACSP":
      return "Banka spracováva";
    case "ACSC":
    case "ACCC":
      return "Zaplatená";
    case "PDNG":
      return "Čaká na dátum splatnosti";
    case "RJCT":
      return "Zamietnutá bankou";
    case "CANC":
      return "Zrušená";
    default:
      return transactionStatus ?? "—";
  }
}
