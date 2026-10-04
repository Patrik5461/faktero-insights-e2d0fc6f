import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Lock, Send } from "lucide-react";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { PodporaStav } from "@/components/faktero/PodporaStav";
import {
  adminOdpovedzFn,
  adminPoziadavkaFn,
  adminStavFn,
} from "@/lib/faktero/podpora-admin.functions";
import {
  STAVY_PODPORA,
  cisloPoziadavky,
  nazovKategorie,
  type StavPoziadavky,
} from "@/lib/faktero/podpora";

export const Route = createFileRoute("/admin/podpora/$id")({
  head: () => ({ meta: [{ title: "Admin · Požiadavka — Faktero" }] }),
  component: AdminPoziadavka,
});

function AdminPoziadavka() {
  const { id } = Route.useParams();
  const detailFn = useServerFn(adminPoziadavkaFn);
  const odpovedzFn = useServerFn(adminOdpovedzFn);
  const stavFn = useServerFn(adminStavFn);
  const [d, setD] = useState<Awaited<ReturnType<typeof adminPoziadavkaFn>> | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [interna, setInterna] = useState(false);
  const [busy, setBusy] = useState(false);

  const nacitaj = useCallback(async () => {
    try {
      setD(await detailFn({ data: { id } }));
    } catch (e: any) {
      setChyba(e?.message ?? "Chyba");
    }
  }, [detailFn, id]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  async function posli() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await odpovedzFn({ data: { id, text: text.trim(), interna } });
      toast.success(interna ? "Interná poznámka uložená." : "Odpoveď odoslaná zákazníkovi.");
      setText("");
      setInterna(false);
      await nacitaj();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function zmenStav(stav: StavPoziadavky) {
    try {
      await stavFn({ data: { id, stav } });
      await nacitaj();
      toast.success(`Stav: ${STAVY_PODPORA[stav]}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (chyba) {
    return (
      <AdminPageBody>
        <p className="text-sm text-destructive">{chyba}</p>
        <Link
          to="/admin/podpora"
          className="mt-3 inline-block text-sm text-primary hover:underline"
        >
          Späť na požiadavky
        </Link>
      </AdminPageBody>
    );
  }
  if (!d) {
    return (
      <AdminPageBody>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
        </div>
      </AdminPageBody>
    );
  }
  const p = d.poziadavka;

  return (
    <>
      <AdminPageHeader
        title={`${cisloPoziadavky(p.cislo)} · ${p.predmet}`}
        description={`${nazovKategorie(p.kategoria)} · založená ${new Date(p.created_at).toLocaleString("sk-SK")}`}
        action={
          <Link
            to="/admin/podpora"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Požiadavky
          </Link>
        }
      />
      <AdminPageBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-3">
            {d.spravy.map((s: any) => (
              <div
                key={s.id}
                className={`rounded-xl border p-4 ${
                  s.interna
                    ? "border-amber-400/50 bg-amber-50 dark:bg-amber-950/30"
                    : s.od_podpory
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-card"
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {s.interna && <Lock className="mr-1 inline h-3 w-3" />}
                    {s.od_podpory
                      ? `Podpora${s.autor ? ` · ${s.autor}` : ""}`
                      : (s.autor ?? p.meno ?? p.email)}
                    {s.interna && " · interná poznámka"}
                  </span>
                  <span>{new Date(s.created_at).toLocaleString("sk-SK")}</span>
                </div>
                <div className="whitespace-pre-wrap text-sm">{s.text}</div>
              </div>
            ))}

            <div className="rounded-xl border border-border bg-card p-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                aria-label="Odpoveď zákazníkovi"
                placeholder={
                  interna
                    ? "Poznámka pre podporu — zákazník ju neuvidí"
                    : "Odpoveď zákazníkovi — príde mu aj e-mailom"
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={interna}
                    onChange={(e) => setInterna(e.target.checked)}
                  />
                  Interná poznámka
                </label>
                <button
                  onClick={() => void posli()}
                  disabled={busy || !text.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {interna ? "Uložiť poznámku" : "Odoslať odpoveď"}
                </button>
              </div>
            </div>
          </div>

          <aside className="space-y-4 text-sm">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Stav</div>
              <div className="mt-1">
                <PodporaStav stav={p.stav} nazov={STAVY_PODPORA[p.stav as StavPoziadavky]} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(Object.keys(STAVY_PODPORA) as StavPoziadavky[])
                  .filter((s) => s !== p.stav)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => void zmenStav(s)}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                    >
                      {STAVY_PODPORA[s]}
                    </button>
                  ))}
              </div>
            </div>
            <div className="space-y-1 rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Zákazník</div>
              <div className="font-medium">{p.meno || p.email}</div>
              <a href={`mailto:${p.email}`} className="block truncate text-primary hover:underline">
                {p.email}
              </a>
              {p.user_id ? (
                <Link
                  to="/admin/users/$id"
                  params={{ id: p.user_id }}
                  className="block text-primary hover:underline"
                >
                  Účet v administrácii
                </Link>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Bez účtu — odpoveď príde len e-mailom.
                </div>
              )}
              {d.firma && (
                <Link
                  to="/admin/companies/$id"
                  params={{ id: d.firma.id }}
                  className="block text-primary hover:underline"
                >
                  {d.firma.name}
                  {d.firma.ico ? ` · IČO ${d.firma.ico}` : ""}
                </Link>
              )}
            </div>
            {(p.url || p.user_agent) && (
              <div className="space-y-1 break-all rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
                {p.url && <div>Stránka: {p.url}</div>}
                {p.user_agent && <div>Prehliadač: {p.user_agent}</div>}
                <div>Zdroj: {p.zdroj}</div>
              </div>
            )}
          </aside>
        </div>
      </AdminPageBody>
    </>
  );
}
