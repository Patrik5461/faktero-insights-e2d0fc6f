import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  buildAuthorizeUrl,
  createPkcePair,
  exchangeCodeForToken,
  fetchAccounts,
  fetchTransactions,
  isTatraConfigured,
  suggestMatch,
} from "./tatrabanka.server";

const CID = "test-client";
const SEC = "test-secret";
const REDIRECT = "https://app.example.com/api/public/tatrabanka/callback";

type MockResp = { status: number; body: string; headers?: Record<string, string> };

function mockFetch(impl: (url: string, init?: RequestInit) => MockResp) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const r = impl(url, init);
    return new Response(r.body, {
      status: r.status,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
  });
}

describe("tatrabanka.server", () => {
  beforeEach(() => {
    process.env.TB_CLIENT_ID = CID;
    process.env.TB_CLIENT_SECRET = SEC;
    // Force canonical redirect_uri to match REDIRECT so both authorize + token
    // exchange use identical value (TB rejects any mismatch with 400).
    process.env.APP_PUBLIC_URL = "https://app.example.com";
    delete process.env.TB_REDIRECT_URI;
    delete process.env.TB_REDIRECT_URI;
    delete process.env.TB_SCOPE;
  });
  afterEach(() => vi.restoreAllMocks());

  describe("config + authorize URL", () => {
    it("isTatraConfigured reflects env presence", () => {
      expect(isTatraConfigured()).toBe(true);
      delete process.env.TB_CLIENT_ID;
      expect(isTatraConfigured()).toBe(false);
    });

    it("buildAuthorizeUrl includes required OAuth params", () => {
      const url = buildAuthorizeUrl({
        state: "conn-1",
        redirectUri: REDIRECT,
        consentId: "CONS-1",
        codeChallenge: "CH-1",
      });
      const u = new URL(url);
      expect(u.searchParams.get("response_type")).toBe("code");
      expect(u.searchParams.get("client_id")).toBe(CID);
      expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
      // TB odmietne holé PREMIUM_AIS aj chýbajúce PKCE
      expect(u.searchParams.get("scope")).toBe("PREMIUM_AIS:CONS-1");
      expect(u.searchParams.get("code_challenge")).toBe("CH-1");
      expect(u.searchParams.get("code_challenge_method")).toBe("S256");
      expect(u.searchParams.get("state")).toBe("conn-1");
    });

    it("authorize URL ide na Premium base, nie na PSD2 gateway", () => {
      const url = buildAuthorizeUrl({
        state: "s",
        redirectUri: REDIRECT,
        consentId: "c",
        codeChallenge: "ch",
      });
      expect(url).toContain("https://api.tatrabanka.sk/premium/sandbox/auth/oauth/v2/authorize");
    });

    it("createPkcePair vyrobi S256 dvojicu", () => {
      const { verifier, challenge } = createPkcePair();
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const expected = createHash("sha256").update(verifier).digest("base64url");
      expect(challenge).toBe(expected);
    });
  });

  describe("exchangeCodeForToken (OAuth callback)", () => {
    it("success: returns tokens and sends Basic auth + form body", async () => {
      let capturedUrl = "";
      let capturedInit: any = null;
      mockFetch((url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return {
          status: 200,
          body: JSON.stringify({
            access_token: "AT",
            refresh_token: "RT",
            expires_in: 3600,
            token_type: "Bearer",
            consent_id: "C1",
          }),
        };
      });

      const tok = await exchangeCodeForToken("abc", REDIRECT, "VERIFIER-1");
      expect(tok.access_token).toBe("AT");
      expect(tok.refresh_token).toBe("RT");
      expect(tok.consent_id).toBe("C1");
      expect(capturedUrl).toContain("/oauth/v2/token");
      expect(capturedInit.method).toBe("POST");
      const expectedBasic = "Basic " + Buffer.from(`${CID}:${SEC}`).toString("base64");
      expect(capturedInit.headers.Authorization).toBe(expectedBasic);
      const body = (capturedInit.body as URLSearchParams).toString();
      expect(body).toContain("grant_type=authorization_code");
      expect(body).toContain("code=abc");
      expect(body).toContain(`redirect_uri=${encodeURIComponent(REDIRECT)}`);
      expect(body).toContain("code_verifier=VERIFIER-1");
    });

    it("400 invalid_grant: throws with status + body", async () => {
      mockFetch(() => ({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) }));
      await expect(exchangeCodeForToken("bad", REDIRECT)).rejects.toThrow(
        /token_exchange_failed: 400.*invalid_grant/,
      );
    });

    it("401 invalid_client: throws", async () => {
      mockFetch(() => ({ status: 401, body: "Unauthorized" }));
      await expect(exchangeCodeForToken("x", REDIRECT)).rejects.toThrow(
        /token_exchange_failed: 401/,
      );
    });

    it("500 server error: throws", async () => {
      mockFetch(() => ({ status: 500, body: "boom" }));
      await expect(exchangeCodeForToken("x", REDIRECT)).rejects.toThrow(
        /token_exchange_failed: 500/,
      );
    });

    it("nonsense response (200 + non-JSON): throws JSON parse error", async () => {
      mockFetch(() => ({ status: 200, body: "<html>not json</html>" }));
      await expect(exchangeCodeForToken("x", REDIRECT)).rejects.toThrow();
    });
  });

  describe("fetchAccounts (bank sync)", () => {
    it("success: maps accounts + closing balance and sends Bearer + X-Request-ID", async () => {
      let capturedInit: any = null;
      let capturedUrl = "";
      mockFetch((url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return {
          status: 200,
          body: JSON.stringify({
            accounts: [
              {
                resourceId: "acc-1",
                iban: "SK1234",
                name: "Bežný",
                currency: "EUR",
                balances: [
                  {
                    balanceType: "closingBooked",
                    balanceAmount: { amount: "123.45", currency: "EUR" },
                  },
                ],
              },
            ],
          }),
        };
      });
      const list = await fetchAccounts("AT", "C1");
      expect(capturedUrl).toContain("/premium/sandbox/v3/accounts");
      expect(capturedInit.headers.Authorization).toBe("Bearer AT");
      expect(capturedInit.headers["X-Request-ID"]).toMatch(/^[0-9a-f-]{36}$/);
      expect(capturedInit.headers["Consent-ID"]).toBeUndefined();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        external_account_id: "acc-1",
        iban: "SK1234",
        account_name: "Bežný",
        currency: "EUR",
        balance: 123.45,
      });
    });

    it("400/401/500: throws tb_api_error with status", async () => {
      for (const status of [400, 401, 500]) {
        mockFetch(() => ({ status, body: `err-${status}` }));
        await expect(fetchAccounts("AT")).rejects.toThrow(new RegExp(`tb_api_error: ${status}`));
        vi.restoreAllMocks();
      }
    });

    it("nonsense response: throws JSON parse error", async () => {
      mockFetch(() => ({ status: 200, body: "not-json" }));
      await expect(fetchAccounts("AT")).rejects.toThrow();
    });

    it("Accounts v3: berie iban a menu z accountReference", async () => {
      mockFetch(() => ({
        status: 200,
        body: JSON.stringify({
          accounts: [
            {
              accountId: "ACC-9",
              accountReference: { iban: "SK9999", currency: "EUR" },
              displayName: "Firemný účet",
              balances: [
                { balanceType: "closingBooked", balanceAmount: { amount: "10.50", currency: "EUR" } },
              ],
            },
          ],
        }),
      }));
      const list = await fetchAccounts("AT");
      expect(list[0]).toMatchObject({
        external_account_id: "ACC-9",
        iban: "SK9999",
        account_name: "Firemný účet",
        currency: "EUR",
        balance: 10.5,
      });
    });

    it("empty accounts list: returns []", async () => {
      mockFetch(() => ({ status: 200, body: JSON.stringify({ accounts: [] }) }));
      const list = await fetchAccounts("AT");
      expect(list).toEqual([]);
    });
  });

  describe("fetchTransactions (bank sync)", () => {
    it("success: maps booked transactions and extracts VS", async () => {
      let capturedUrl = "";
      mockFetch((url) => {
        capturedUrl = url;
        return {
          status: 200,
          body: JSON.stringify({
            transactions: {
              booked: [
                {
                  transactionId: "T1",
                  bookingDate: "2026-06-01",
                  transactionAmount: { amount: "100.00", currency: "EUR" },
                  creditorName: "ACME",
                  remittanceInformationUnstructured: "Platba VS: 12345",
                },
              ],
            },
          }),
        };
      });
      const txs = await fetchTransactions("AT", "acc-1", "C1", 30);
      expect(capturedUrl).toMatch(
        /\/v5\/accounts\/acc-1\/transactions\?dateFrom=\d{4}-\d{2}-\d{2}&dateTo=\d{4}-\d{2}-\d{2}&page=1&pageSize=200/,
      );
      expect(txs).toHaveLength(1);
      expect(txs[0]).toMatchObject({
        transaction_reference: "T1",
        booking_date: "2026-06-01",
        amount: 100,
        currency: "EUR",
        counterparty: "ACME",
        variable_symbol: "12345",
      });
    });

    it("400/401/500: throws tb_api_error", async () => {
      for (const status of [400, 401, 500]) {
        mockFetch(() => ({ status, body: `e${status}` }));
        await expect(fetchTransactions("AT", "acc-1")).rejects.toThrow(
          new RegExp(`tb_api_error: ${status}`),
        );
        vi.restoreAllMocks();
      }
    });

    it("nonsense response: throws", async () => {
      mockFetch(() => ({ status: 200, body: "<<garbage>>" }));
      await expect(fetchTransactions("AT", "acc-1")).rejects.toThrow();
    });

    it("missing transactions field: returns []", async () => {
      mockFetch(() => ({ status: 200, body: JSON.stringify({ foo: "bar" }) }));
      const txs = await fetchTransactions("AT", "acc-1");
      expect(txs).toEqual([]);
    });
  });

  describe("suggestMatch (invoice matching rules)", () => {
    const invoices = [
      { id: "i-vs", invoice_number: "2026001", total: 50, variable_symbol: "999" },
      { id: "i-num", invoice_number: "2026042", total: 77, variable_symbol: null },
      { id: "i-amt", invoice_number: "2026099", total: 123.45, variable_symbol: null },
    ];

    it("matches by variable symbol first", () => {
      expect(suggestMatch({ amount: 1, variable_symbol: "999", description: null }, invoices)).toBe(
        "i-vs",
      );
    });
    it("matches by invoice number in description", () => {
      expect(
        suggestMatch(
          { amount: 1, variable_symbol: null, description: "Faktúra 2026042" },
          invoices,
        ),
      ).toBe("i-num");
    });
    it("matches by amount as last resort", () => {
      expect(
        suggestMatch({ amount: 123.45, variable_symbol: null, description: null }, invoices),
      ).toBe("i-amt");
    });
    it("returns null when nothing matches", () => {
      expect(
        suggestMatch({ amount: 0.01, variable_symbol: "nope", description: "x" }, invoices),
      ).toBeNull();
    });
  });
});
