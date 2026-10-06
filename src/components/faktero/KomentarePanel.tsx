import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessageSquare, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { nastavenieSchvalovaniaFn } from "@/lib/faktero/schvalovanie.functions";
import type { AgendaSchvalovania } from "@/lib/faktero/schvalovanie";

type Komentar = { id: string; user_id: string; text: string; upozornit: string[]; created_at: string };

/**
 * Komentáre k dokladu — otázka účtovníčke, vysvetlenie výdavku. Označený
 * kolega dostane upozornenie do zvončeka.
 */
export function KomentarePanel({
  companyId,
  agenda,
  id,
}: {
  companyId: string;
  agenda: AgendaSchvalovania;
  id: string;
}) {
  const nacitajLudi = useServerFn(nastavenieSchvalovaniaFn);
  const [ludia, setLudia] = useState<{ id: string; meno: string }[]>([]);
  const [ja, setJa] = useState<string | null>(null);
  const [komentare, setKomentare] = useState<Komentar[]>([]);
  const [text, setText] = useState("");
  const [upozornit, setUpozornit] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const obnov = async () => {
    const { data } = await supabase
      .from("komentare_dokladov" as any)
      .select("id, user_id, text, upozornit, created_at")
      .eq("agenda", agenda)
      .eq("doklad_id", id)
      .order("created_at");
    setKomentare((data ?? []) as any);
  };
  useEffect(() => {
    void obnov();
    nacitajLudi({ data: { company_id: companyId } })
      .then((r) => {
        setLudia(r.ludia);
        setJa(r.ja);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, agenda, id]);

  const meno = (u: string) => ludia.find((l) => l.id === u)?.meno ?? "kolega";

  async function pridaj() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("komentare_dokladov" as any).insert({
        company_id: companyId,
        agenda,
        doklad_id: id,
        text: text.trim(),
        upozornit,
      } as any);
      if (error) throw new Error(error.message);
      setText("");
      setUpozornit([]);
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? "Komentár sa nepodarilo uložiť");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 text-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" /> Komentáre
      </div>
      {komentare.length > 0 && (
        <ul className="mt-3 space-y-2">
          {komentare.map((k) => (
            <li key={k.id} className="rounded-md bg-muted/40 p-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{meno(k.user_id)}</span> ·{" "}
                  {new Date(k.created_at).toLocaleString("sk-SK", { dateStyle: "short", timeStyle: "short" })}
                  {k.upozornit?.length ? ` · pre ${k.upozornit.map(meno).join(", ")}` : ""}
                </span>
                {k.user_id === ja && (
                  <button
                    onClick={async () => {
                      await supabase.from("komentare_dokladov" as any).delete().eq("id", k.id);
                      await obnov();
                    }}
                    className="rounded p-0.5 hover:text-destructive"
                    aria-label="Zmazať komentár"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-1 whitespace-pre-wrap">{k.text}</div>
            </li>
          ))}
        </ul>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Napíšte komentár — napr. otázku pre účtovníčku"
        className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {ludia.filter((l) => l.id !== ja).length > 0 && (
          <span className="text-xs text-muted-foreground">Upozorniť:</span>
        )}
        {ludia
          .filter((l) => l.id !== ja)
          .map((l) => (
            <label key={l.id} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={upozornit.includes(l.id)}
                onChange={(e) =>
                  setUpozornit(e.target.checked ? [...upozornit, l.id] : upozornit.filter((x) => x !== l.id))
                }
              />
              {l.meno}
            </label>
          ))}
        <button
          onClick={pridaj}
          disabled={busy || !text.trim()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Pridať komentár
        </button>
      </div>
    </div>
  );
}
