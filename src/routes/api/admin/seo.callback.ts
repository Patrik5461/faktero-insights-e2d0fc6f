import { createFileRoute } from "@tanstack/react-router";

/**
 * OAuth callback for Google Search Console + Google Analytics 4.
 * Google redirects here after user consents. Anonymous endpoint — CSRF
 * protected via signed `state` parameter (see google-seo.server.ts).
 */
export const Route = createFileRoute("/api/admin/seo/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");

        if (err) return html(`<h1>Chyba OAuth</h1><p>${escapeHtml(err)}</p>`, 400);
        if (!code || !state) return html("<h1>Chýba code alebo state</h1>", 400);

        try {
          const { verifyState, exchangeCodeForToken, saveConnection } = await import(
            "@/lib/faktero/google-seo.server"
          );
          const { type } = verifyState(state);
          const token = await exchangeCodeForToken(code);
          await saveConnection({ type, token });

          return html(
            `<!doctype html><html><head><meta charset="utf-8"><title>Pripojené</title>
             <style>body{font:15px system-ui;padding:2rem;text-align:center;background:#f8fafc}
             .c{max-width:32rem;margin:4rem auto;padding:2rem;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
             h1{color:#10b981;margin:0 0 .5rem}p{color:#475569}a{color:#3b82f6}</style></head>
             <body><div class="c"><h1>✓ Pripojené</h1>
             <p>Google ${type === "gsc" ? "Search Console" : "Analytics 4"} bolo úspešne prepojené s Faktero.</p>
             <p><a href="/admin/seo">Späť na SEO admin</a></p>
             <script>setTimeout(()=>{window.location.href="/admin/seo"},1500)</script>
             </div></body></html>`,
          );
        } catch (e: any) {
          console.error("[google-seo/callback]", e);
          return html(
            `<h1>Chyba pri pripájaní</h1><pre>${escapeHtml(e?.message ?? String(e))}</pre>
             <p><a href="/admin/seo">Späť</a></p>`,
            500,
          );
        }
      },
    },
  },
});

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}
