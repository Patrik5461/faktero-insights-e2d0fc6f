import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sCors } from "@/lib/mobile/cors-appky.server";

/**
 * Odoslanie kontaktného formulára z verejného webu cez Resend.
 *
 * Predtým formulár len otvoril poštového klienta cez `mailto:` — kto ho nemá
 * nastavený (a to je väčšina ľudí v prehliadači), správu neodoslal a my sme sa
 * o dopyte nikdy nedozvedeli.
 *
 * Endpoint je zámerne verejný, preto má strop na IP a pascu na roboty.
 */

const Body = z.object({
  name: z.string().trim().min(2, "Zadajte meno.").max(120),
  email: z.string().trim().email("Zadajte platný e-mail.").max(200),
  message: z.string().trim().min(10, "Napíšte aspoň pár viet.").max(5000),
  /** Pasca na roboty — pole je v stránke skryté, človek ho nevyplní. */
  website: z.string().max(200).optional(),
});

const OKNO_MS = 10 * 60_000;
const MAX_ZA_OKNO = 5;
const historia = new Map<string, number[]>();

function nedavnePokusy(ip: string): number[] {
  const teraz = Date.now();
  return (historia.get(ip) ?? []).filter((t) => teraz - t < OKNO_MS);
}

function prekrocenyLimit(ip: string): boolean {
  return nedavnePokusy(ip).length >= MAX_ZA_OKNO;
}

/**
 * Do stropu sa počíta až skutočný pokus o odoslanie. Keby sa rátalo aj zle
 * vyplnené odoslanie, používateľ, ktorý si dvakrát pomýli e-mail, by sa sám
 * zablokoval na desať minút.
 */
function zapisPokus(ip: string): void {
  const teraz = Date.now();
  historia.set(ip, [...nedavnePokusy(ip), teraz]);
  // Mapa by inak rástla donekonečna — staré IP adresy priebežne vyhadzujeme.
  if (historia.size > 5000) {
    for (const [k, v] of historia) {
      if (v.every((t) => teraz - t >= OKNO_MS)) historia.delete(k);
    }
  }
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Diagnostiku z mobilnej appky posiela ten istý endpoint ako formulár na webe.
 * Appka je ale cudzí pôvod (`capacitor://localhost`), takže bez hlavičiek CORS
 * prehliadač vo WebView požiadavku neodošle a tlačidlo hlási len „Load failed".
 */
function odpoved(telo: unknown, status: number, origin: string | null = null) {
  return sCors(
    new Response(JSON.stringify(telo), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
    origin,
  );
}

export const Route = createFileRoute("/api/public/kontakt")({
  server: {
    handlers: {
      // Predletová požiadavka appky — bez nej sa POST z telefónu ani nepošle.
      OPTIONS: async ({ request }) =>
        sCors(new Response(null, { status: 204 }), request.headers.get("origin")),
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("x-real-ip") ||
          "neznama";
        if (prekrocenyLimit(ip)) {
          return sCors(
            new Response(JSON.stringify({ error: "rate_limited" }), {
              status: 429,
              headers: { "Content-Type": "application/json", "Retry-After": "600" },
            }),
            origin,
          );
        }

        let data;
        try {
          data = Body.parse(await request.json());
        } catch (e: any) {
          const sprava = e?.issues?.[0]?.message ?? "Skontrolujte vyplnené údaje.";
          return odpoved({ error: "invalid_input", message: sprava }, 400, origin);
        }

        // Robot vyplnil skryté pole. Tvárime sa, že je všetko v poriadku —
        // odosielateľ tak nezistí, podľa čoho ho odmietame.
        if (data.website && data.website.trim()) return odpoved({ ok: true }, 200, origin);

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) return odpoved({ error: "email_unavailable" }, 503, origin);

        zapisPokus(ip);

        const prijemca = process.env.CONTACT_TO_EMAIL || "info@faktero.sk";
        const odosielatel = process.env.RESEND_FROM_EMAIL || "faktury@faktero.sk";

        const text = [
          `Meno: ${data.name}`,
          `E-mail: ${data.email}`,
          "",
          data.message,
          "",
          `— odoslané z kontaktného formulára na faktero.sk (IP ${ip})`,
        ].join("\n");

        const html =
          `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111">` +
          `<p><strong>Meno:</strong> ${escapeHtml(data.name)}<br>` +
          `<strong>E-mail:</strong> <a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></p>` +
          `<div style="white-space:pre-wrap;border-left:3px solid #12734f;padding-left:12px">${escapeHtml(data.message)}</div>` +
          `<p style="margin-top:16px;font-size:12px;color:#6b7280">Odoslané z kontaktného formulára na faktero.sk (IP ${escapeHtml(ip)})</p>` +
          `</div>`;

        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              from: `Faktero web <${odosielatel}>`,
              to: [prijemca],
              subject: `Kontaktný formulár — ${data.name}`,
              // Odpovedať sa dá rovno tomu, kto písal.
              reply_to: data.email,
              text,
              html,
            }),
          });
          if (!res.ok) {
            const detail = await res.text();
            console.error("[kontakt] Resend odmietol správu", res.status, detail.slice(0, 300));
            return odpoved({ error: "send_failed" }, 502, origin);
          }
        } catch (e) {
          console.error("[kontakt] odoslanie zlyhalo", e);
          return odpoved({ error: "send_failed" }, 502, origin);
        }

        return odpoved({ ok: true }, 200, origin);
      },
    },
  },
});
