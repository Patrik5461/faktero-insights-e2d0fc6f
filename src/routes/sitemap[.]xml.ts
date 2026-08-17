import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://www.faktero.sk";

const EXCLUDED_PREFIXES = ["/admin", "/api", "/_authenticated"];
const EXCLUDED_EXACT = ["/diagnostika", "/pravne/tesla-podmienky", "/_global"];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );

        const { data } = await supabase.from("seo_pages" as any).select("path,priority,updated_at");
        const rows = (data ?? []) as Array<{
          path: string;
          priority: number | null;
          updated_at: string;
        }>;

        /*
         * Stránky funkcií, eFakturácie, pre účtovníkov a pre vývojárov sa
         * berú priamo z obsahu, nie ručným zoznamom. Detailné stránky sú
         * presne tie, ktoré majú šancu niečo vyhľadať — ručný zoznam by za
         * obsahom vždy zaostával, čo sa už raz stalo.
         */
        const { HUBS } = await import("@/lib/faktero/marketing-content");
        const { POSTS } = await import("@/lib/faktero/blog-content");
        const zBlogu = [
          { path: "/blog", priority: 0.6 },
          ...POSTS.map((p) => ({ path: `/blog/${p.slug}`, priority: 0.5 })),
        ];
        const zObsahu = Object.values(HUBS).flatMap((h) => [
          { path: `/${h.hubSlug}`, priority: 0.7 },
          ...h.items.map((i) => ({ path: `/${h.hubSlug}/${i.slug}`, priority: 0.6 })),
        ]);

        // Ensure default set present
        const defaults = [
          { path: "/", priority: 1.0 },
          { path: "/cennik", priority: 0.9 },
          { path: "/kontakt", priority: 0.7 },
          { path: "/funkcie", priority: 0.7 },
          { path: "/objednavka", priority: 0.7 },
          { path: "/predplatne", priority: 0.6 },
          { path: "/pravne/gdpr", priority: 0.4 },
          { path: "/pravne/obchodne-podmienky", priority: 0.4 },
          { path: "/pravne/reklamacny-poriadok", priority: 0.4 },
          { path: "/pravne/opakovane-platby", priority: 0.4 },
          { path: "/pravne/cookies", priority: 0.4 },
          // Manuály. Sú to verejné stránky s návodmi — bez zápisu tu by ich
          // vyhľadávače našli len náhodou cez odkazy z centra pomoci.
          { path: "/pomoc", priority: 0.7 },
          { path: "/pomoc/faktury", priority: 0.6 },
          { path: "/pomoc/ponuky", priority: 0.6 },
          { path: "/pomoc/objednavky", priority: 0.6 },
          { path: "/pomoc/opakovane", priority: 0.6 },
          { path: "/pomoc/prijate-faktury", priority: 0.6 },
          { path: "/pomoc/odberatelia", priority: 0.6 },
          { path: "/pomoc/efaktura", priority: 0.6 },
          { path: "/pomoc/sklad", priority: 0.6 },
          { path: "/pomoc/ceny", priority: 0.6 },
          { path: "/pomoc/objednavky-dodavatel", priority: 0.6 },
          { path: "/pomoc/zakazky", priority: 0.6 },
          { path: "/pomoc/pokladna", priority: 0.6 },
          { path: "/pomoc/doklady", priority: 0.6 },
          { path: "/pomoc/dph", priority: 0.6 },
          { path: "/pomoc/uzavierka", priority: 0.6 },
          { path: "/pomoc/banka", priority: 0.6 },
          { path: "/pomoc/financovanie", priority: 0.6 },
          { path: "/pomoc/exporty", priority: 0.6 },
          { path: "/pomoc/pohoda", priority: 0.6 },
          { path: "/pomoc/jazdy", priority: 0.6 },
          { path: "/pomoc/role", priority: 0.6 },
          { path: "/pomoc/online-platby/gopay", priority: 0.5 },
          { path: "/pomoc/api", priority: 0.6 },
          { path: "/pomoc/predplatne", priority: 0.6 },
        ];

        const map = new Map<string, { priority: number; lastmod?: string }>();
        for (const d of [...defaults, ...zObsahu, ...zBlogu])
          map.set(d.path, { priority: d.priority });
        for (const r of rows) {
          if (EXCLUDED_EXACT.includes(r.path)) continue;
          if (EXCLUDED_PREFIXES.some((p) => r.path.startsWith(p))) continue;
          if (!r.path.startsWith("/")) continue;
          map.set(r.path, {
            priority: r.priority ?? 0.7,
            lastmod: r.updated_at,
          });
        }

        const urls = Array.from(map.entries())
          .filter(
            ([p]) =>
              !EXCLUDED_EXACT.includes(p) && !EXCLUDED_PREFIXES.some((pref) => p.startsWith(pref)),
          )
          .map(([path, meta]) => {
            const parts = [
              `    <loc>${BASE_URL}${path}</loc>`,
              meta.lastmod ? `    <lastmod>${meta.lastmod.slice(0, 10)}</lastmod>` : null,
              `    <priority>${meta.priority.toFixed(1)}</priority>`,
            ].filter(Boolean);
            return `  <url>\n${parts.join("\n")}\n  </url>`;
          });

        const xml =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          urls.join("\n") +
          `\n</urlset>`;

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
