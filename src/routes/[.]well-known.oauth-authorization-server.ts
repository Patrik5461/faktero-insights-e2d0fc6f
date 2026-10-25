import { createFileRoute } from "@tanstack/react-router";

/** Metadáta autorizačného servera (RFC 8414). */
const obsluz = async ({ request }: { request: Request }) => {
  const o = await import("@/lib/faktero/oauth.server");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: o.CORS });
  return o.json(o.metadataServera());
};

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: { handlers: { GET: obsluz, OPTIONS: obsluz } },
});
