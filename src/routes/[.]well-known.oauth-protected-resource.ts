import { createFileRoute } from "@tanstack/react-router";

/** Metadáta chráneného zdroja (RFC 9728) — kde sa MCP klient prihlási. */
const obsluz = async ({ request }: { request: Request }) => {
  const o = await import("@/lib/faktero/oauth.server");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: o.CORS });
  return o.json(o.metadataZdroja());
};

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: { handlers: { GET: obsluz, OPTIONS: obsluz } },
});
