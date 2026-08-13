import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook Resendu pre prijatú poštu na `doklady.faktero.sk`.
 *
 * Resend čaká odpoveď rýchlo, kým čítanie dokladu cez AI trvá desiatky sekúnd.
 * Preto sa podpis overí, mail sa prevezme a odpoveď odíde hneď — spracovanie beží
 * ďalej na pozadí a jeho výsledok vidno v denníku `inbox_messages`.
 */
async function prijmi(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[mail-prijem] RESEND_WEBHOOK_SECRET nie je nastavený, mail zahadzujem");
    return new Response("not configured", { status: 503 });
  }

  const telo = await request.text().catch(() => "");
  const { overPodpisWebhooku, spracujPrijatyMail } = await import(
    "@/lib/faktero/mail-prijem.server"
  );

  const podpisSedi = overPodpisWebhooku({
    telo,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    secret,
  });
  if (!podpisSedi) {
    console.warn("[mail-prijem] odmietnuté – nesedí podpis webhooku");
    return new Response("unauthorized", { status: 401 });
  }

  let udalost: any = null;
  try {
    udalost = JSON.parse(telo);
  } catch {
    return new Response("bad body", { status: 400 });
  }

  if (udalost?.type !== "email.received") {
    // Iné udalosti (doručenky odoslaných mailov) sem nepatria, ale nie sú chyba.
    return new Response("ok", { status: 200 });
  }

  const d = udalost.data ?? {};
  if (!d.email_id) return new Response("bad body", { status: 400 });

  void spracujPrijatyMail({
    email_id: d.email_id,
    from: d.from ?? null,
    subject: d.subject ?? null,
    to: d.to ?? null,
    received_for: d.received_for ?? null,
  }).catch((e) => console.error("[mail-prijem] neodchytené zlyhanie:", e?.message ?? e));

  return new Response("ok", { status: 200 });
}

export const Route = createFileRoute("/api/public/mail/prijem")({
  server: {
    handlers: {
      POST: ({ request }) => prijmi(request),
      GET: () => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
      PUT: ({ request }) => prijmi(request),
      PATCH: ({ request }) => prijmi(request),
      DELETE: ({ request }) => prijmi(request),
    },
  },
});
