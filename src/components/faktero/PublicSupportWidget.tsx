import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MessageCircle, X, Send, Loader2, Minus, Mail } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTED = [
  "Koľko stojí Faktero?",
  "Máte bezplatnú skúšobnú verziu?",
  "Podporujete API?",
  "Čo je eFaktúra?",
  "Dá sa prejsť zo SuperFaktúry?",
  "Aký plán potrebujem?",
  "Ako funguje predplatné?",
];

const GREETING: Msg = {
  role: "assistant",
  content:
    "Ahoj! 👋 Som **Faktero AI podpora**. Rád zodpoviem vaše otázky o Fakteri — cenách, skúšobnej verzii, API, eFaktúre 2027 alebo importe zo SuperFaktúry.",
};

export function PublicSupportWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [escalate, setEscalate] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  async function send(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: value }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setEscalate(false);
    try {
      const res = await fetch("/api/public/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsgs((m) => [
          ...m,
          {
            role: "assistant",
            content: data?.message ?? "Napíšte nám na podporu a ozveme sa vám.",
          },
        ]);
        setEscalate(true);
      } else {
        setMsgs((m) => [...m, { role: "assistant", content: data.content }]);
        if (typeof data.content === "string" && /neviem zodpoved/i.test(data.content)) {
          setEscalate(true);
        }
      }
    } catch {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: "Napíšte nám na podporu a ozveme sa vám." },
      ]);
      setEscalate(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && (
        <div
          className="flex w-[calc(100vw-2rem)] max-w-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10"
          style={{ maxHeight: "min(520px, 70vh)" }}
        >
          {/* header */}
          <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">Faktero AI podpora</div>
                <div className="text-[11px] text-muted-foreground">Zvyčajne odpovedá ihneď</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Minimalizovať"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Zatvoriť"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_a]:text-primary">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}

            {msgs.length <= 1 && !busy && (
              <div className="space-y-1.5 pt-1">
                <div className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
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

            {escalate && !busy && (
              <div className="rounded-lg border border-border bg-muted/50 p-2.5 text-xs">
                <div className="mb-1.5 text-muted-foreground">
                  Napíšte nám na podporu a ozveme sa vám.
                </div>
                <a
                  href="mailto:podpora@faktero.sk"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  <Mail className="h-3.5 w-3.5" /> podpora@faktero.sk
                </a>
              </div>
            )}
          </div>

          {/* input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 border-t border-border bg-background p-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Napíšte otázku…"
              rows={1}
              className="max-h-24 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              aria-label="Odoslať"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-center text-[10px] text-muted-foreground">
            Faktero AI · neposkytuje právne ani daňové poradenstvo
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Opýtajte sa Faktero AI"
        title="Opýtajte sa Faktero AI"
        className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105"
      >
        {open ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
        <span>{open ? "Zavrieť" : "Pomoc"}</span>
      </button>
    </div>
  );
}
