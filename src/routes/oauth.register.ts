import { createFileRoute } from "@tanstack/react-router";

/** Dynamická registrácia MCP klienta (RFC 7591). */
const obsluz = async ({ request }: { request: Request }) => {
  const o = await import("@/lib/faktero/oauth.server");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: o.CORS });
  try {
    return o.json(await o.zaregistrujKlienta(await request.json().catch(() => ({}))), 201);
  } catch (e) {
    return o.chybaOdpoved(e);
  }
};

export const Route = createFileRoute("/oauth/register")({
  server: { handlers: { POST: obsluz, OPTIONS: obsluz } },
});
