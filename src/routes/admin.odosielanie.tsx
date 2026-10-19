import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PlayCircle } from "lucide-react";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { adminNastavOdosielanie, listOdosielanieAdmin } from "@/lib/faktero/admin.functions";
import { useT } from "@/lib/i18n/useT";

/*
  Strážca odosielania e-mailov (ochrana-odosielania.server.ts): firmy, ktorým
  sa odosielanie pozastavilo, a zastavené pokusy. Výstrahy = maily, ktoré
  odišli, ale niesli cudziu značku (staršia firma) — na prezretie.
*/
export const Route = createFileRoute("/admin/odosielanie")({
  head: () => ({ meta: [{ title: "Admin · Odosielanie e-mailov — Faktero" }] }),
  component: AdminOdosielaniePage,
});

type Data = Awaited<ReturnType<typeof listOdosielanieAdmin>>;

function kedy(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("sk-SK");
  } catch {
    return "—";
  }
}

function AdminOdosielaniePage() {
  const { t } = useT();
  const nacitajFn = useServerFn(listOdosielanieAdmin);
  const nastavFn = useServerFn(adminNastavOdosielanie);
  const [vystrahy, setVystrahy] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let zruseny = false;
    setChyba(null);
    nacitajFn({ data: { lenVystrahy: vystrahy } })
      .then((d) => !zruseny && setData(d))
      .catch((e) => !zruseny && setChyba(e?.message ?? "Chyba"));
    return () => {
      zruseny = true;
    };
  }, [nacitajFn, vystrahy, nonce]);

  async function obnov(id: string) {
    try {
      await nastavFn({ data: { id, akcia: "obnovit" } });
      toast.success(t("Pozastavenie zrušené"));
      setNonce((n) => n + 1);
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }

  return (
    <>
      <AdminPageHeader
        title={t("Odosielanie e-mailov")}
        description={t(
          "Firmy s pozastaveným odosielaním a pokusy, ktoré zastavil strážca (stropy adresátov, podozrivý obsah).",
        )}
      />
      <AdminPageBody>
        {chyba && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {chyba}
          </div>
        )}
        {!data && !chyba && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
          </div>
        )}
        {data && (
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("Pozastavené firmy")} ({data.pozastavene.length})
              </h2>
              {data.pozastavene.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {t("Žiadna firma nemá pozastavené odosielanie.")}
                </div>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.pozastavene.map((f: any) => (
                    <li
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <Link
                          to="/admin/companies/$id"
                          params={{ id: f.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {f.name ?? "—"}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {t("IČO")} {f.ico ?? "—"} · {kedy(f.odosielanie_pozastavene_at)}
                          {f.odosielanie_pozastavene_dovod
                            ? ` · ${f.odosielanie_pozastavene_dovod}`
                            : ""}
                        </div>
                      </div>
                      {data.smieMenit && (
                        <button
                          onClick={() => obnov(f.id)}
                          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                        >
                          <PlayCircle className="h-4 w-4" /> {t("Zrušiť pozastavenie")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {vystrahy ? t("Výstrahy (odoslané)") : t("Zastavené pokusy")} (
                  {data.pokusy.length})
                </h2>
                <div className="flex gap-1 rounded-md border border-border p-0.5 text-sm">
                  <button
                    onClick={() => setVystrahy(false)}
                    className={`rounded px-2 py-1 ${!vystrahy ? "bg-muted font-medium" : ""}`}
                  >
                    {t("Zastavené")}
                  </button>
                  <button
                    onClick={() => setVystrahy(true)}
                    className={`rounded px-2 py-1 ${vystrahy ? "bg-muted font-medium" : ""}`}
                  >
                    {t("Výstrahy")}
                  </button>
                </div>
              </div>
              {data.pokusy.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t("Zatiaľ nič.")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3">{t("Kedy")}</th>
                        <th className="py-2 pr-3">{t("Firma")}</th>
                        <th className="py-2 pr-3">{t("Dôvod")}</th>
                        <th className="py-2 pr-3">{t("Adresátov")}</th>
                        <th className="py-2">{t("Predmet a detail")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.pokusy.map((p: any) => (
                        <tr key={p.id} className="align-top">
                          <td className="whitespace-nowrap py-2 pr-3">{kedy(p.created_at)}</td>
                          <td className="py-2 pr-3">
                            <Link
                              to="/admin/companies/$id"
                              params={{ id: p.company_id }}
                              className="text-primary hover:underline"
                            >
                              {p.firma ?? "—"}
                            </Link>
                            <div className="text-xs text-muted-foreground">{p.ico ?? ""}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                              {p.dovod}
                            </span>
                            <div className="mt-1 text-xs text-muted-foreground">{p.druh ?? ""}</div>
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{p.adresati_pocet}</td>
                          <td className="min-w-0 py-2">
                            <div className="break-words font-medium">{p.predmet || "—"}</div>
                            <div className="break-words text-xs text-muted-foreground">
                              {p.detail}
                            </div>
                            {p.ukazka && (
                              <details className="mt-1 text-xs">
                                <summary className="cursor-pointer text-muted-foreground">
                                  {t("Ukážka")}
                                </summary>
                                <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted p-2">
                                  {p.ukazka}
                                </pre>
                              </details>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {data.overene.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("Overené firmy")} ({data.overene.length})
                </h2>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {data.overene.map((f: any) => (
                    <li key={f.id}>
                      <Link
                        to="/admin/companies/$id"
                        params={{ id: f.id }}
                        className="rounded-full border border-border px-2 py-0.5 hover:bg-muted"
                      >
                        {f.name ?? "—"}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </AdminPageBody>
    </>
  );
}
