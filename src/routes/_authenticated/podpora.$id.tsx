import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import {
  odpovedzNaPoziadavkuFn,
  oznacPrecitaneFn,
  uzavriPoziadavkuFn,
} from "@/lib/faktero/podpora.functions";
import { cisloPoziadavky, nazovKategorie } from "@/lib/faktero/podpora";
import { PodporaStav } from "@/components/faktero/PodporaStav";

export const Route = createFileRoute("/_authenticated/podpora/$id")({
  head: () => ({ meta: [{ title: "Požiadavka — Faktero" }] }),
  component: DetailPoziadavky,
});

type Sprava = {
  id: string;
  od_podpory: boolean;
  text: string;
  created_at: string;
  cez_email: boolean;
};

function DetailPoziadavky() {
  const { id } = Route.useParams();
  const odpovedz = useServerFn(odpovedzNaPoziadavkuFn);
  const uzavri = useServerFn(uzavriPoziadavkuFn);
  const precitane = useServerFn(oznacPrecitaneFn);
  const [p, setP] = useState<any | null | undefined>(undefined);
  const [spravy, setSpravy] = useState<Sprava[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const nacitaj = useCallback(async () => {
    const [{ data: poz }, { data: sp }] = await Promise.all([
      supabase
        .from("podpora_poziadavky" as any)
        .select("id, cislo, predmet, stav, kategoria, created_at") // token adresy klient čítať nesmie
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("podpora_spravy" as any)
        .select("id, od_podpory, text, created_at, cez_email")
        .eq("poziadavka_id", id)
        .order("created_at"),
    ]);
    setP(poz ?? null);
    setSpravy((sp ?? []) as unknown as Sprava[]);
  }, [id]);

  useEffect(() => {
    void nacitaj().then(() => precitane({ data: { id } }).catch(() => {}));
  }, [nacitaj, precitane, id]);

  async function posli() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await odpovedz({ data: { id, text: text.trim() } });
      setText("");
      await nacitaj();
      toast.success("Odoslané. Podpora dostane upozornenie.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function vyriesene() {
    setBusy(true);
    try {
      await uzavri({ data: { id } });
      await nacitaj();
      toast.success("Označené ako vyriešené. Keď napíšete znova, požiadavka sa otvorí.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Neexistujúca alebo cudzia požiadavka nesmie visieť na „Načítavam".
  if (p === null) {
    return (
      <PageBody>
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center">
          <p className="font-medium">Požiadavka sa nenašla.</p>
          <Link to="/podpora" className="mt-4 inline-block text-sm text-primary hover:underline">
            Späť na Pomoc a podpora
          </Link>
        </div>
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader
        title={p ? `${cisloPoziadavky(p.cislo)} · ${p.predmet}` : "Požiadavka"}
        help="/pomoc/podpora"
        action={
          <Link
            to="/podpora"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        {p === undefined ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <PodporaStav stav={p.stav} />
              <span>{nazovKategorie(p.kategoria)}</span>
              <span>Založená {new Date(p.created_at).toLocaleString("sk-SK")}</span>
            </div>

            <ol className="space-y-3">
              {spravy.map((s) => (
                <li
                  key={s.id}
                  className={`rounded-2xl border p-4 ${
                    s.od_podpory ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {s.od_podpory ? "Podpora Faktera" : "Vy"}
                      {s.cez_email && <span className="font-normal text-muted-foreground"> · e-mailom</span>}
                    </span>
                    <span>{new Date(s.created_at).toLocaleString("sk-SK")}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{s.text}</div>
                </li>
              ))}
            </ol>

            <div className="rounded-2xl border border-border bg-card p-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={10000}
                aria-label="Odpoveď"
                placeholder={
                  p.stav === "vyriesena"
                    ? "Napíšte, ak to vyriešené nie je — požiadavka sa znova otvorí."
                    : "Doplniť alebo odpovedať…"
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="mt-3 flex flex-wrap justify-between gap-2">
                {p.stav !== "vyriesena" ? (
                  <button
                    onClick={() => void vyriesene()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Už je to vyriešené
                  </button>
                ) : (
                  <span />
                )}
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
                  Odoslať
                </button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
