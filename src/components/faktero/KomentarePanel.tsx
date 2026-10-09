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
  const [upozornitVybrani, setUpozornit] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const obnov = async () => {
    const { data } = await supabase
      .from("komentare_dokladov")
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
  const holy = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // „@me…“ na konci textu — ponuka kolegov na označenie.
  const zmienka = /(^|\s)@([^\s@]*)$/.exec(text)?.[2] ?? null;
  const ponuka =
    zmienka === null
      ? []
      : ludia.filter((l) => l.id !== ja && holy(l.meno).startsWith(holy(zmienka))).slice(0, 6);
  function oznac(l: { id: string; meno: string }) {
    setText((t) => t.replace(/@([^\s@]*)$/, `@${l.meno} `));
    setUpozornit((u) => (u.includes(l.id) ? u : [...u, l.id]));
  }

  async function pridaj() {
    if (!text.trim()) return;
    setBusy(true);
    // Kto je v texte označený cez @meno, dostane upozornenie aj bez zaškrtnutia.
    const oznaceni = ludia.filter((l) => l.id !== ja && holy(text).includes(holy(`@${l.meno}`))).map((l) => l.id);
    const upozornit = [...new Set([...upozornitVybrani, ...oznaceni])];
    try {
      const { error } = await supabase.from("komentare_dokladov").insert({
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
                      await supabase.from("komentare_dokladov").delete().eq("id", k.id);
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
        placeholder="Napíšte komentár — @meno označí kolegu"
        className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {ponuka.length > 0 && (
        <ul role="listbox" aria-label="Označiť kolegu" className="mt-1 rounded-md border border-border bg-popover p-1 text-xs shadow-sm">
          {ponuka.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => oznac(l)}
                className="w-full rounded px-2 py-1 text-left hover:bg-secondary"
              >
                @{l.meno}
              </button>
            </li>
          ))}
        </ul>
      )}
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
                checked={upozornitVybrani.includes(l.id)}
                onChange={(e) =>
                  setUpozornit(
                    e.target.checked ? [...upozornitVybrani, l.id] : upozornitVybrani.filter((x) => x !== l.id),
                  )
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
