import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { metadataServera, metadataZdroja, platnaNavratovaAdresa } from "./oauth.server";

describe("OAuth pre MCP", () => {
  it("návratová adresa: https áno, http len localhost, fragment nie", () => {
    expect(platnaNavratovaAdresa("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(platnaNavratovaAdresa("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(platnaNavratovaAdresa("http://localhost:6274/oauth/callback")).toBe(true);
    expect(platnaNavratovaAdresa("http://zly.example.com/cb")).toBe(false);
    expect(platnaNavratovaAdresa("https://claude.ai/cb#x")).toBe(false);
    expect(platnaNavratovaAdresa("javascript:alert(1)")).toBe(false);
  });
  it("metadáta odkazujú na seba navzájom a vyžadujú PKCE S256", () => {
    const z = metadataZdroja();
    const s = metadataServera();
    expect(z.resource).toMatch(/\/api\/mcp$/);
    expect(z.authorization_servers).toEqual([s.issuer]);
    expect(s.code_challenge_methods_supported).toEqual(["S256"]);
    expect(s.registration_endpoint).toMatch(/\/oauth\/register$/);
  });
});
