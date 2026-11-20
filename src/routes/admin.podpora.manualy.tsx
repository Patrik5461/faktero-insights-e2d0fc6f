import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, X } from "lucide-react";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ManualPodporyObsah } from "@/components/faktero/ManualPodporyObsah";
import { adminManualyPodporyFn } from "@/lib/faktero/manualy-podpory.functions";
import { hladajVManualoch, type ManualPodpory } from "@/lib/faktero/manualy-podpory";

/*
  Admin → Podpora → Manuály podpory. Interné manuály pre ľudí, ktorí dvíhajú
  telefón (`docs/podpora/*.md`). Prístup stráži layout `/admin` (platform
  admin + aal2) a obsah vydá len serverová funkcia s tou istou kontrolou —
  verejne dosiahnuteľné nie sú (žiadne `public/`, sitemap ani znalosti AI).
*/

type Hladanie = { m?: string; q?: string };

export const Route = createFileRoute("/admin/podpora/manualy")({
  validateSearch: (s: Record<string, unknown>): Hladanie => ({
    m: typeof s.m === "string" && /^[\w-]{1,80}$/.test(s.m) ? s.m : undefined,
    q: typeof s.q === "string" && s.q.trim() ? s.q.slice(0, 100) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Admin · Manuály podpory — Faktero" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ManualyPodporyPage,
});

function ManualyPodporyPage() {
  const nacitajFn = useServerFn(adminManualyPodporyFn);
  const { m, q } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/podpora/manualy" });
  const [manualy, setManualy] = useState<ManualPodpory[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [dotaz, setDotaz] = useState(q ?? "");

  useEffect(() => {
    let zruseny = false;
    nacitajFn()
      .then((d) => !zruseny && setManualy(d.manualy))
      .catch((e) => !zruseny && setChyba(e?.message ?? "Chyba"));
    return () => {
      zruseny = true;
    };
  }, [nacitajFn]);

  // Dotaz ide do adresy s oneskorením — odkaz na výsledky sa dá poslať kolegovi.
  useEffect(() => {
    const t = setTimeout(() => {
      const novy = dotaz.trim() || undefined;
      if (novy !== q) navigate({ search: (p: Hladanie) => ({ ...p, q: novy }), replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [dotaz, q, navigate]);

  useEffect(() => {
    setDotaz(q ?? "");
  }, [q]);

  const slugy = useMemo(() => new Set((manualy ?? []).map((x) => x.slug)), [manualy]);
  const aktivny = manualy?.find((x) => x.slug === m) ?? manualy?.[0] ?? null;
  const vysledky = useMemo(
    () => (manualy && q ? hladajVManualoch(manualy, q, 200) : []),
    [manualy, q],
  );
  const pocetVManuali = useMemo(() => {
    const p = new Map<string, number>();
    for (const v of vysledky) p.set(v.slug, (p.get(v.slug) ?? 0) + 1);
    return p;
  }, [vysledky]);

  // Po načítaní obsahu (prichádza neskôr než adresa) doskoč na kotvu z adresy.
  useEffect(() => {
    if (!aktivny || q) return;
    const kotva = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (kotva) document.getElementById(kotva)?.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0 });
  }, [aktivny, q]);

  return (
    <>
      <div className="print:hidden">
        <AdminPageHeader
          title="Manuály podpory"
          description="Interné návody pre podporu na telefóne — čo zákazníkovi povedať, kde to overiť a kedy eskalovať."
          action={
            <Link
              to="/admin/podpora"
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Požiadavky podpory
            </Link>
          }
        />
      </div>
      <AdminPageBody>
        {chyba ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {chyba}
          </p>
        ) : !manualy ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Načítavam manuály…
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] print:block">
            <aside className="space-y-3 print:hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
              <label className="relative block">
                <span className="sr-only">Hľadať v manuáloch</span>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={dotaz}
                  onChange={(e) => setDotaz(e.target.value)}
                  placeholder="Hľadať v manuáloch…"
                  className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {dotaz && (
                  <button
                    type="button"
                    onClick={() => setDotaz("")}
                    aria-label="Zrušiť hľadanie"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
              <nav aria-label="Zoznam manuálov">
                <ul className="space-y-0.5">
                  {manualy.map((x) => {
                    const vybrany = !q && x.slug === aktivny?.slug;
                    const pocet = pocetVManuali.get(x.slug);
                    return (
                      <li key={x.slug}>
                        <Link
                          to="/admin/podpora/manualy"
                          search={{ m: x.slug }}
                          aria-current={vybrany ? "page" : undefined}
                          className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${
                            vybrany
                              ? "bg-secondary font-medium text-foreground"
                              : q && !pocet
                                ? "text-muted-foreground/60 hover:bg-secondary/60"
                                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                          }`}
                        >
                          <span className="w-5 shrink-0 tabular-nums text-xs leading-5 text-muted-foreground">
                            {x.cislo}
                          </span>
                          <span className="min-w-0 flex-1">{x.nazov}</span>
                          {pocet ? (
                            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-xs tabular-nums leading-5 text-primary">
                              {pocet}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </aside>

            <main className="min-w-0">
              {q ? (
                <VysledkyHladania dotaz={q} vysledky={vysledky} />
              ) : aktivny ? (
                <ManualPodporyObsah manual={aktivny} slugy={slugy} />
              ) : (
                <p className="text-sm text-muted-foreground">Žiadne manuály.</p>
              )}
            </main>
          </div>
        )}
      </AdminPageBody>
    </>
  );
}

function VysledkyHladania({
  dotaz,
  vysledky,
}: {
  dotaz: string;
  vysledky: ReturnType<typeof hladajVManualoch>;
}) {
  if (!vysledky.length)
    return (
      <p className="text-sm text-muted-foreground">
        Pre „{dotaz}“ sa v manuáloch nič nenašlo. Skúste iné alebo kratšie slovo.
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {vysledky.length >= 200 ? "Viac ako 200" : vysledky.length} výsledkov pre „{dotaz}“
      </p>
      <ul className="space-y-2">
        {vysledky.map((v) => (
          <li key={`${v.slug}#${v.kotva}`}>
            <Link
              to="/admin/podpora/manualy"
              search={{ m: v.slug }}
              hash={v.kotva || undefined}
              className="block rounded-lg border border-border bg-card p-3 hover:border-primary/40 hover:bg-secondary/40"
            >
              <div className="text-xs text-muted-foreground">{v.nazovManualu}</div>
              <div className="font-medium">{v.nadpis}</div>
              <div className="mt-1 text-sm text-muted-foreground">{v.ukazka}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
