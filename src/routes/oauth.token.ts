import { createFileRoute } from "@tanstack/react-router";

/** Token endpoint — výmena kódu a obnovenie tokenu. */
const obsluz = async ({ request }: { request: Request }) => {
  const o = await import("@/lib/faktero/oauth.server");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: o.CORS });
  try {
    return o.json(await o.vymenToken(await o.teloFormulara(request)));
  } catch (e) {
    return o.chybaOdpoved(e);
  }
};

export const Route = createFileRoute("/oauth/token")({
  server: { handlers: { POST: obsluz, OPTIONS: obsluz } },
});
