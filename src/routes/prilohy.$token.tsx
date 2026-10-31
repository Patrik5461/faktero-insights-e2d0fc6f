import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Paperclip } from "lucide-react";
import { vynutSvetlyMotiv } from "@/lib/faktero/motiv";
import { prilohyPodlaOdkazuFn } from "@/lib/faktero/prilohy-odkaz.functions";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

/**
 * Prílohy dokladu, ktoré sa nezmestili do e-mailu — verejná stránka bez
 * prihlásenia. Odkaz je podpísaný, platí 30 dní a ukáže len prílohy, ktoré
 * menuje (`prilohy-odkaz.server.ts`).
 */
export const Route = createFileRoute("/prilohy/$token")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk ?? "sk", "Prílohy dokladu — Faktero") },
      { name: "robots", content: "noindex,nofollow" },
      // Token nesmie odísť v hlavičke Referer na úložisko ani inam.
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PrilohyPage,
});

type Data = Awaited<ReturnType<typeof prilohyPodlaOdkazuFn>>;

function velkost(b: number): string {
  if (b >= 1024 * 1024)
    return `${(b / 1024 / 1024).toLocaleString("sk-SK", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(b / 1024))} kB`;
}

const NAZVY = { invoice: "Faktúra", quote: "Cenová ponuka", sales_order: "Objednávka" } as const;

function PrilohyPage() {
  const { t } = useT();
  const { token } = Route.useParams();
  const nacitaj = useServerFn(prilohyPodlaOdkazuFn);
  const [data, setData] = useState<Data | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  useEffect(() => vynutSvetlyMotiv(), []);
  useEffect(() => {
    nacitaj({ data: { token } })
      .then(setData)
      .catch((e: any) => setChyba(e?.message ?? "Odkaz nie je platný alebo už vypršal."));
  }, [nacitaj, token]);

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {chyba && !data ? (
          <p className="text-sm text-destructive" role="alert">
            {t(chyba)}
          </p>
        ) : !data ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
          </p>
        ) : (
          <>
            <h1 className="text-xl font-semibold">
              {t("Prílohy")}: {t(NAZVY[data.druh])} {data.cislo}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.firma}
              {data.firma ? " · " : ""}
              {t("odkaz platí do {datum}", {
                datum: new Date(data.platiDo).toLocaleDateString("sk-SK"),
              })}
            </p>
            {data.prilohy.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">
                {t("Prílohy už pri doklade nie sú — odosielateľ ich medzitým odstránil.")}
              </p>
            ) : (
              <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
                {data.prilohy.map((p) => (
                  <li key={p.url!} className="flex flex-wrap items-center gap-3 p-3">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 break-all text-sm">{p.nazov}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {velkost(p.velkost)}
                    </span>
                    <a
                      href={p.url!}
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      <Download className="h-4 w-4" /> {t("Stiahnuť")}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
