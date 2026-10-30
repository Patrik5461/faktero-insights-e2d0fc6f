"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useOtvoreneOkno } from "@/hooks/useOtvoreneOkno";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Sparkles, X, Minus, Send, Loader2, Plus, RotateCcw } from "lucide-react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listConversationsFn,
  createConversationFn,
  getMessagesFn,
  sendChatFn,
} from "@/lib/faktero/ai-assistant.functions";
import { getAiAvailabilityFn } from "@/lib/faktero/ai-availability.functions";
import { useT } from "@/lib/i18n/useT";
import { usePresuvanie } from "@/hooks/usePresuvanie";
import {
  KLUC_OKNO,
  KLUC_TLACIDLO,
  SIROKA_OBRAZOVKA,
  polohaOknaPriTlacidle,
  type Poloha,
} from "@/lib/faktero/ai-okno-poloha";

const SUGGESTED = [
  "Ktoré faktúry sú po splatnosti?",
  "Kto mi dlží najviac?",
  "Navrhni opakované faktúry",
  "Skontroluj eFaktúru pripravenosť",
  "Vysvetli chyby API/webhookov",
  "Čo mám poslať účtovníčke?",
];

/**
 * Vrstva plávajúceho asistenta: nad lepiacou hlavičkou stránky (z-40), ale pod
 * všetkým, čo Radix kreslí do portálu — ponuky (DropdownMenu, Popover, Select),
 * tooltipy aj dialógy majú z-50. Predtým bolo tlačidlo na z-[60] a prekrývalo
 * napríklad rozbalenú ponuku účtu pod avatarom vpravo hore.
 */
const VRSTVA_AI = "z-[45]";

function useSirokaObrazovka(): boolean {
  const [siroka, setSiroka] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(`(min-width: ${SIROKA_OBRAZOVKA}px)`);
    const zmena = () => setSiroka(mql.matches);
    zmena();
    mql.addEventListener("change", zmena);
    return () => mql.removeEventListener("change", zmena);
  }, []);
  return siroka;
}

export function FloatingAIButton() {
  const { t } = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const oknoOtvorene = useOtvoreneOkno();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const siroka = useSirokaObrazovka();
  // Tlačidlo sa dá odtiahnuť z cesty (len na širokej obrazovke).
  const tlacidlo = usePresuvanie({ kluc: KLUC_TLACIDLO, povolene: siroka });
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

  // Na menšej obrazovke sedí tlačidlo presne na tlačidlách v päte okna a klik
  // chytá ono. Kým je okno otvorené, uhne.
  if (oknoOtvorene && !open) return null;
  if (pathname.startsWith("/ai-asistent")) return null;
  if (availability.data && !availability.data.available) return null;

  const pt = tlacidlo.poloha;

  return (
    <>
      {open && (
        <CompactChat
          companyId={companyId}
          onClose={() => setOpen(false)}
          presuvatelne={siroka}
          tlacidloPoloha={pt}
          tlacidloPrvok={tlacidlo.prvok}
          vratitTlacidlo={tlacidlo.vratit}
        />
      )}
      <div
        ref={tlacidlo.nastavPrvok}
        data-plavajuce=""
        className={`fixed ${VRSTVA_AI} ${pt ? "" : "bottom-4 right-4 sm:bottom-6 sm:right-6"}`}
        style={pt ? { left: pt.x, top: pt.y } : undefined}
      >
        <button
          type="button"
          onClick={() => {
            // Pustenie po ťahaní nie je klik.
            if (tlacidlo.boloTahanie()) return;
            setOpen((v) => !v);
          }}
          {...tlacidlo.uchyt}
          data-ai-prepinac=""
          aria-label={t("Faktero AI asistent")}
          title={
            siroka ? t("Faktero AI asistent — potiahnutím ho presuniete") : t("Faktero AI asistent")
          }
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary/80 p-3 text-sm sm:px-4 font-semibold text-primary-foreground shadow-lg shadow-primary/30 ring-1 ring-primary/30 transition-transform hover:scale-105 sm:touch-none"
        >
          {open ? <X className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          <span className="sr-only sm:not-sr-only">{open ? t("Zavrieť") : "AI"}</span>
        </button>
      </div>
    </>
  );
}

function CompactChat({
  companyId,
  onClose,
  presuvatelne,
  tlacidloPoloha,
  tlacidloPrvok,
  vratitTlacidlo,
}: {
  companyId: string | null;
  onClose: () => void;
  presuvatelne: boolean;
  tlacidloPoloha: Poloha | null;
  tlacidloPrvok: RefObject<HTMLElement | null>;
  vratitTlacidlo: () => void;
}) {
  const { t } = useT();
  const okno = usePresuvanie({ kluc: KLUC_OKNO, povolene: presuvatelne, ignorujTlacidla: true });
  // Pôvodné miesto okna, keď je tlačidlo odtiahnuté inam: pri tlačidle, nie vpravo dole.
  const [priTlacidle, setPriTlacidle] = useState<Poloha | null>(null);

  useLayoutEffect(() => {
    if (okno.poloha || !tlacidloPoloha) {
      setPriTlacidle(null);
      return;
    }
    const o = okno.prvok.current?.getBoundingClientRect();
    const b = tlacidloPrvok.current?.getBoundingClientRect();
    if (!o || !b) return;
    setPriTlacidle(
      polohaOknaPriTlacidle(
        { x: b.left, y: b.top, sirka: b.width, vyska: b.height },
        { sirka: o.width, vyska: o.height },
        { sirka: window.innerWidth, vyska: window.innerHeight },
      ),
    );
  }, [okno.poloha, okno.prvok, tlacidloPoloha, tlacidloPrvok]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = okno.prvok.current;
      if (!el) return;
      const target = e.target as Node;
      if (!el.contains(target)) {
        // Don't close when clicking the toggle button itself (parent handles toggle)
        const btn = (target as HTMLElement).closest?.("[data-ai-prepinac]");
        if (!btn) onClose();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose, okno.prvok]);

  const p = okno.poloha ?? priTlacidle;
  const presunute = presuvatelne && (okno.poloha !== null || tlacidloPoloha !== null);

  return (
    <div
      ref={okno.nastavPrvok}
      data-plavajuce=""
      className={`fixed ${VRSTVA_AI} flex w-[calc(100vw-1.5rem)] max-w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 ${
        p ? "" : "bottom-[4.25rem] right-4 sm:bottom-[4.75rem] sm:right-6"
      }`}
      style={{ maxHeight: "min(560px, 70vh)", ...(p ? { left: p.x, top: p.y } : {}) }}
    >
      <Header
        onClose={onClose}
        presuvatelne={presuvatelne}
        uchyt={okno.uchyt}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          okno.vratit();
        }}
        onVratit={
          presunute
            ? () => {
                okno.vratit();
                vratitTlacidlo();
              }
            : undefined
        }
      />
      {companyId ? (
        <ChatBody companyId={companyId} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <Sparkles className="h-8 w-8 text-muted-foreground/60" />
          <p>{t("Vyberte aktívnu firmu, aby ste mohli používať Faktero AI.")}</p>
        </div>
      )}
    </div>
  );
}

function Header({
  onClose,
  presuvatelne,
  uchyt,
  onDoubleClick,
  onVratit,
}: {
  onClose: () => void;
  presuvatelne: boolean;
  uchyt: ReturnType<typeof usePresuvanie>["uchyt"];
  onDoubleClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onVratit?: () => void;
}) {
  const { t } = useT();
  return (
    <div
      {...(presuvatelne
        ? {
            ...uchyt,
            onDoubleClick,
            role: "group",
            "aria-label": t("Presunúť okno"),
            title: t("Presunúť okno — dvojklikom ho vrátite na pôvodné miesto"),
          }
        : {})}
      className={`flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-3 ${
        presuvatelne ? "cursor-move touch-none select-none" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-sm font-semibold">{t("Faktero AI asistent")}</div>
          <div className="text-[11px] text-muted-foreground">{t("Pomocník pre vašu firmu")}</div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {onVratit && (
          <button
            type="button"
            aria-label={t("Vrátiť na pôvodné miesto")}
            title={t("Vrátiť na pôvodné miesto")}
            onClick={onVratit}
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          aria-label={t("Minimalizovať")}
          onClick={onClose}
          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={t("Zatvoriť")}
          onClick={onClose}
          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ChatBody({ companyId }: { companyId: string }) {
  const { t } = useT();
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
              {t("Ahoj! 👋 Som")} <strong>{t("Faktero AI asistent")}</strong>
              {t(". Pomôžem vám s faktúrami, odberateľmi, eFaktúrou a vašou administratívou.")}
            </div>
            <div className="px-1 pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("Časté otázky")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(t(q))}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:border-primary/50 hover:bg-primary/5"
                >
                  {t(q)}
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
            {(sendMut.error as Error)?.message ?? t("Chyba pri odosielaní")}
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
          title={t("Nová konverzácia")}
          aria-label={t("Nová konverzácia")}
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
          placeholder={t("Napíšte správu pre Faktero AI…")}
          rows={1}
          className="max-h-24 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={sendMut.isPending || !input.trim()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          aria-label={t("Odoslať")}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-center text-[10px] text-muted-foreground">
        {t("Faktero AI · firemné dáta · neposkytuje právne ani daňové poradenstvo")}
      </div>
    </>
  );
}
