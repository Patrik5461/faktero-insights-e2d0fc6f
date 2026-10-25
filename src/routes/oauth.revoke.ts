import { createFileRoute } from "@tanstack/react-router";

/** Zrušenie tokenu (RFC 7009). */
const obsluz = async ({ request }: { request: Request }) => {
  const o = await import("@/lib/faktero/oauth.server");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: o.CORS });
  await o.zrusToken(await o.teloFormulara(request)).catch(() => {});
  return new Response(null, { status: 200, headers: o.CORS });
};

export const Route = createFileRoute("/oauth/revoke")({
  server: { handlers: { POST: obsluz, OPTIONS: obsluz } },
});
