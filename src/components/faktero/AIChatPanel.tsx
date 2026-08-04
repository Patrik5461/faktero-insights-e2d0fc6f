"use client";

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Sparkles, Send, Plus, Trash2, Copy, Check, Loader2, X } from "lucide-react";
import {
  listConversationsFn,
  createConversationFn,
  deleteConversationFn,
  getMessagesFn,
  sendChatFn,
} from "@/lib/faktero/ai-assistant.functions";

const SUGGESTED_PROMPTS = [
  "Ktoré faktúry sú po splatnosti?",
  "Kto mi dlží najviac?",
  "Navrhni opakované faktúry",
  "Skontroluj eFaktúru pripravenosť",
  "Vysvetli chyby API/webhookov",
];

export function AIChatPanel({ companyId, onClose }: { companyId: string; onClose?: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversationsFn);
  const createFn = useServerFn(createConversationFn);
  const deleteFn = useServerFn(deleteConversationFn);
  const messagesFn = useServerFn(getMessagesFn);
  const sendFn = useServerFn(sendChatFn);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");

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
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  const newConv = useMutation({
    mutationFn: () => createFn({ data: { companyId } }),
    onSuccess: (c: any) => {
      setActiveId(c.id);
      qc.invalidateQueries({ queryKey: ["ai-conv", companyId] });
    },
  });

  const delConv = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      setActiveId(null);
      qc.invalidateQueries({ queryKey: ["ai-conv", companyId] });
    },
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data, sendMut.isPending]);

  function send(content: string) {
    const v = content.trim();
    if (!v || sendMut.isPending) return;
    sendMut.mutate(v);
  }

  const msgs = messages.data ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/70">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Faktero AI asistent</h3>
            <p className="text-xs text-muted-foreground">Inteligentný pomocník pre vašu firmu</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => newConv.mutate()}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-secondary"
          >
            <Plus className="h-3.5 w-3.5" /> Nová
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Conversation list - hidden on small screens inside panel */}
        <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-card/40 lg:flex">
          <div className="p-2">
            {(conversations.data ?? []).map((c: any) => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs ${
                  activeId === c.id ? "bg-primary/10 text-primary" : "hover:bg-secondary"
                }`}
              >
                <button onClick={() => setActiveId(c.id)} className="flex-1 truncate text-left">
                  {c.title}
                </button>
                <button
                  onClick={() => {
                    if (confirm("Vymazať konverzáciu?")) delConv.mutate(c.id);
                  }}
                  className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {(conversations.data ?? []).length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">Žiadne konverzácie.</div>
            )}
          </div>
        </aside>

        {/* Messages */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            {msgs.length === 0 && !sendMut.isPending ? (
              <EmptyState onPick={send} />
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-4">
                {msgs.map((m: any) => (
                  <MessageBubble key={m.id} role={m.role} content={m.content} />
                ))}
                {sendMut.isPending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" /> Faktero AI premýšľa…
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-border bg-background/60 p-3"
          >
            <div className="mx-auto flex max-w-2xl items-end gap-2">
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
                autoFocus
                className="min-h-[44px] max-h-32 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="submit"
                disabled={!input.trim() || sendMut.isPending}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center py-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
        <Sparkles className="h-6 w-6 text-primary-foreground" />
      </div>
      <h2 className="mt-3 text-base font-semibold">Vitajte vo Faktero AI</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Asistent pre faktúry, odberateľov a administratívu vašej firmy.
      </p>
      <div className="mt-4 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTED_PROMPTS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-left text-xs hover:border-primary/40 hover:bg-primary/5"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary to-primary/70">
          <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
      )}
      <div
        className={`group max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-ul:my-1.5 prose-headings:mt-2 prose-headings:mb-1">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
        {!isUser && (
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" /> Skopírované
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Kopírovať
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
