"use client";

import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Sparkles, X, Minus, Send, Loader2, Plus } from "lucide-react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listConversationsFn,
  createConversationFn,
  getMessagesFn,
  sendChatFn,
} from "@/lib/faktero/ai-assistant.functions";
import { getAiAvailabilityFn } from "@/lib/faktero/ai-availability.functions";

const SUGGESTED = [
  "Ktoré faktúry sú po splatnosti?",
  "Kto mi dlží najviac?",
  "Navrhni opakované faktúry",
  "Skontroluj eFaktúru pripravenosť",
  "Vysvetli chyby API/webhookov",
  "Čo mám poslať účtovníčke?",
];

export function FloatingAIButton() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const availabilityFn = useServerFn(getAiAvailabilityFn);
  const availability = useQuery({
    queryKey: ["ai-availability"],
    queryFn: () => availabilityFn(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    setCompanyId(getActiveCompanyId());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/ai-asistent")) return null;
  if (availability.data && !availability.data.available) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && <CompactChat companyId={companyId} onClose={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Faktero AI asistent"
        title="Faktero AI asistent"
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary/80 px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 ring-1 ring-primary/30 transition-transform hover:scale-105"
      >
        {open ? <X className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        <span>{open ? "Zavrieť" : "AI"}</span>
      </button>
    </div>
  );
}

function CompactChat({ companyId, onClose }: { companyId: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      const target = e.target as Node;
      if (!ref.current.contains(target)) {
        // Don't close when clicking the toggle button itself (parent handles toggle)
        const btn = (target as HTMLElement).closest?.("[aria-label='Faktero AI asistent']");
        if (!btn) onClose();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="flex w-[calc(100vw-1.5rem)] max-w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10"
      style={{ maxHeight: "min(560px, 70vh)" }}
    >
      <Header onClose={onClose} />
      {companyId ? (
        <ChatBody companyId={companyId} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <Sparkles className="h-8 w-8 text-muted-foreground/60" />
          <p>Vyberte aktívnu firmu, aby ste mohli používať Faktero AI.</p>
        </div>
      )}
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Faktero AI asistent</div>
          <div className="text-[11px] text-muted-foreground">Pomocník pre vašu firmu</div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Minimalizovať"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Zatvoriť"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ChatBody({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversationsFn);
  const createFn = useServerFn(createConversationFn);
  const messagesFn = useServerFn(getMessagesFn);
  const sendFn = useServerFn(sendChatFn);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversations = useQuery({
    queryKey: ["ai-conv", companyId],
    queryFn: () => listFn({ data: { companyId } }),
  });

  useEffect(() => {
    if (!activeId && conversations.data && conversations.data.length > 0) {
      setActiveId(conversations.data[0].id);
    }
  }, [conversations.data, activeId]);

  const messages = useQuery({
    queryKey: ["ai-msgs", activeId],
    queryFn: () =>
      activeId ? messagesFn({ data: { conversationId: activeId } }) : Promise.resolve([]),
    enabled: !!activeId,
  });

  const sendMut = useMutation({
    mutationFn: async (content: string) => {
      let convId = activeId;
      if (!convId) {
        const conv = await createFn({ data: { companyId, title: content.slice(0, 60) } });
        convId = conv.id;
        setActiveId(convId);
      }
      return sendFn({ data: { conversationId: convId!, companyId, content } });
    },
    onMutate: () => setInput(""),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-msgs", activeId] });
      qc.invalidateQueries({ queryKey: ["ai-conv", companyId] });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data, sendMut.isPending]);

  function send(text: string) {
    const v = text.trim();
    if (!v || sendMut.isPending) return;
    sendMut.mutate(v);
  }

  function newChat() {
    setActiveId(null);
  }

  const msgs = (messages.data ?? []) as Array<{ id: string; role: string; content: string }>;

  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {msgs.length === 0 && !sendMut.isPending && (
          <div className="space-y-2">
            <div className="rounded-2xl bg-muted px-3 py-2 text-sm leading-relaxed text-foreground">
              Ahoj! 👋 Som <strong>Faktero AI asistent</strong>. Pomôžem vám s faktúrami,
              odberateľmi, eFaktúrou a vašou administratívou.
            </div>
            <div className="px-1 pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Časté otázky
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:border-primary/50 hover:bg-primary/5"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1 [&_ul]:my-1 [&_a]:text-primary">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}

        {sendMut.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}

        {sendMut.isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {(sendMut.error as Error)?.message ?? "Chyba pri odosielaní"}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-border bg-background p-2"
      >
        <button
          type="button"
          onClick={newChat}
          title="Nová konverzácia"
          aria-label="Nová konverzácia"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Napíšte správu pre Faktero AI…"
          rows={1}
          className="max-h-24 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={sendMut.isPending || !input.trim()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          aria-label="Odoslať"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-center text-[10px] text-muted-foreground">
        Faktero AI · firemné dáta · neposkytuje právne ani daňové poradenstvo
      </div>
    </>
  );
}
