import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  Copy,
  Check,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  Building2,
  Webhook,
  FileText,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listConversationsFn,
  createConversationFn,
  deleteConversationFn,
  getMessagesFn,
  sendChatFn,
  getRecommendationsFn,
} from "@/lib/faktero/ai-assistant.functions";
import { potvrd } from "@/lib/potvrdenie";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { formatujMenu } from "@/lib/faktero/mena";

export const Route = createFileRoute("/_authenticated/ai-asistent")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Faktero AI — Faktero") }] }),
  // Otázka z Pomoc a podpora — predvyplní sa, odošle ju až človek.
  validateSearch: (s: Record<string, unknown>): { otazka?: string } => ({
    otazka: typeof s.otazka === "string" && s.otazka.trim() ? s.otazka.slice(0, 500) : undefined,
  }),
  component: AiAssistantPage,
});

const SUGGESTED = [
  "Ktoré faktúry sú po splatnosti?",
  "Navrhni mi opakované faktúry.",
  "Ktorí zákazníci mi dlhujú najviac?",
  "Skontroluj moje predplatné faktúry.",
  "Ako pripraviť firmu na eFaktúru?",
  "Čo mám poslať účtovníčke?",
];

type Tab = "chat" | "odporucania" | "rizika" | "automatizacie";

function AiAssistantPage() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("chat");
  const [companyId, setCompanyId] = useState<string | null>(null);
  useEffect(() => {
    setCompanyId(getActiveCompanyId());
  }, []);

  return (
    <>
      <PageHeader
        title="Faktero AI"
        description={t("Inteligentný asistent pre faktúry, odberateľov, eFaktúru a administratívu.")}
        action={
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
            {(
              [
                ["chat", "Chat", MessageSquare],
                ["odporucania", "Odporúčania", Sparkles],
                ["rizika", "Riziká", AlertTriangle],
                ["automatizacie", "Automatizácie", RefreshCw],
              ] as const
            ).map(([k, l, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  tab === k
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {t(l)}
              </button>
            ))}
          </div>
        }
      />
      <PageBody>
        {!companyId ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            {t("Vyberte aktívnu firmu, aby som vám mohol pomôcť.")}
          </div>
        ) : tab === "chat" ? (
          <ChatView companyId={companyId} />
        ) : (
          <RecommendationsView companyId={companyId} mode={tab} />
        )}
      </PageBody>
    </>
  );
}

function ChatView({ companyId }: { companyId: string }) {
  const { t } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listConversationsFn);
  const createFn = useServerFn(createConversationFn);
  const deleteFn = useServerFn(deleteConversationFn);
  const messagesFn = useServerFn(getMessagesFn);
  const sendFn = useServerFn(sendChatFn);

  const [activeId, setActiveId] = useState<string | null>(null);
  const { otazka } = Route.useSearch();
  const [input, setInput] = useState(otazka ?? "");

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
    onError: (e: any) => toast.error(e.message ?? t("Chyba")),
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

  const zoznamKonverzacii = (
    <>
      {(conversations.data ?? []).map((c: any) => (
        <div
          key={c.id}
          className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
            activeId === c.id ? "bg-primary/10 text-primary" : "hover:bg-secondary"
          }`}
        >
          <button onClick={() => setActiveId(c.id)} className="min-w-0 flex-1 truncate text-left">
            {c.title}
          </button>
          <button
            onClick={async () => {
              if (await potvrd(t("Vymazať konverzáciu?"))) delConv.mutate(c.id);
            }}
            aria-label={t("Vymazať konverzáciu")}
            className="text-muted-foreground transition hover:text-destructive lg:opacity-0 lg:group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {(conversations.data ?? []).length === 0 && (
        <div className="px-2 py-4 text-xs text-muted-foreground">{t("Žiadne konverzácie.")}</div>
      )}
    </>
  );
  const aktivnaKonverzacia = (conversations.data ?? []).find((c: any) => c.id === activeId);

  return (
    <div className="grid h-[calc(100vh-220px)] min-h-[520px] grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      {/* Sidebar */}
      <aside className="hidden flex-col overflow-hidden rounded-xl border border-border bg-card lg:flex">
        <div className="border-b border-border p-3">
          <button
            onClick={() => newConv.mutate()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t("Nová konverzácia")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">{zoznamKonverzacii}</div>
      </aside>

      {/* Chat */}
      <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        {/* Na mobile je bočný zoznam skrytý — konverzácie sú v rozbaľovacom paneli nad chatom. */}
        <details className="group/konv border-b border-border lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {aktivnaKonverzacia?.title ?? t("Konverzácie")}
            </span>
            <span className="text-xs text-muted-foreground group-open/konv:hidden">{t("Zobraziť")}</span>
            <span className="hidden text-xs text-muted-foreground group-open/konv:inline">
              {t("Skryť")}
            </span>
          </summary>
          <div className="border-t border-border p-2">
            <button
              onClick={() => newConv.mutate()}
              className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Nová konverzácia")}
            </button>
            <div className="max-h-56 overflow-y-auto">{zoznamKonverzacii}</div>
          </div>
        </details>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6">
          {msgs.length === 0 && !sendMut.isPending ? (
            <EmptyState onPick={send} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {msgs.map((m: any) => (
                <MessageBubble key={m.id} role={m.role} content={m.content} />
              ))}
              {sendMut.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> {t("Faktero AI premýšľa…")}
                </div>
              )}
            </div>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-border bg-background/60 p-3"
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2">
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
              autoFocus
              className="min-h-[44px] max-h-40 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="submit"
              disabled={!input.trim() || sendMut.isPending}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  const { t } = useT();
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg">
        <Sparkles className="h-7 w-7 text-primary-foreground" />
      </div>
      <h2 className="mt-4 text-xl font-semibold">{t("Vitajte vo Faktero AI")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Asistent pre faktúry, odberateľov a administratívu vašej firmy.")}
      </p>
      <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => onPick(t(s))}
            className="rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm hover:border-primary/40 hover:bg-primary/5"
          >
            {t(s)}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: string; content: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/70">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
      <div
        className={`group max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-headings:mt-3 prose-headings:mb-1">
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
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" /> {t("Skopírované")}
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> {t("Kopírovať")}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function RecommendationsView({ companyId, mode }: { companyId: string; mode: Tab }) {
  const { t } = useT();
  const mena = useMenaFirmy();
  const recFn = useServerFn(getRecommendationsFn);
  const { data, isLoading } = useQuery({
    queryKey: ["ai-rec", companyId],
    queryFn: () => recFn({ data: { companyId } }),
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
      </div>
    );
  if (!data) return null;

  const cards =
    mode === "rizika"
      ? [
          {
            icon: AlertTriangle,
            color: "text-amber-600",
            title: "Faktúry po splatnosti",
            value: data.overdueCount,
            hint: t("{suma} nezaplatených", { suma: formatujMenu(data.unpaidTotal, mena.kod) }),
            to: "/faktury",
            search: { poSplatnosti: true as const },
          },
          {
            icon: Webhook,
            color: "text-rose-600",
            title: "Neúspešné webhooky",
            value: data.failedWebhooks,
            hint: t("Posledných 30 dní"),
            to: "/webhooky-logy",
          },
          {
            icon: Building2,
            color: "text-orange-600",
            title: "Chýbajúce firemné údaje",
            value: data.missingCompanyFields.length,
            hint: data.missingCompanyFields.map((f) => t(f)).join(", ") || t("Všetko vyplnené"),
            to: "/firma",
          },
        ]
      : mode === "automatizacie"
        ? [
            {
              icon: RefreshCw,
              color: "text-primary",
              title: "Nadchádzajúce opakované faktúry",
              value: data.recurringDueSoon.length,
              hint: t("V najbližších 14 dňoch"),
              to: "/opakovane",
            },
            {
              icon: TrendingUp,
              color: "text-emerald-600",
              title: "Top dlžníci",
              value: data.topDebtors.length,
              hint: data.topDebtors[0]?.name ?? t("Žiadni dlžníci"),
              to: "/odberatelia",
            },
          ]
        : [
            {
              icon: AlertTriangle,
              color: "text-amber-600",
              title: "Faktúry po splatnosti",
              value: data.overdueCount,
              hint: t("{suma} nezaplatených", { suma: formatujMenu(data.unpaidTotal, mena.kod) }),
              to: "/faktury",
              search: { poSplatnosti: true as const },
            },
            {
              icon: RefreshCw,
              color: "text-primary",
              title: "Návrh opakovaných faktúr",
              value: data.recurringDueSoon.length,
              hint: t("Nadchádzajúce spustenia"),
              to: "/opakovane",
            },
            {
              icon: Building2,
              color: "text-orange-600",
              title: "Chýbajúce firemné údaje",
              value: data.missingCompanyFields.length,
              hint: data.missingCompanyFields.map((f) => t(f)).join(", ") || t("Všetko vyplnené"),
              to: "/firma",
            },
            {
              icon: Webhook,
              color: "text-rose-600",
              title: "Neúspešné webhooky",
              value: data.failedWebhooks,
              hint: t("Posledných 30 dní"),
              to: "/webhooky-logy",
            },
            {
              icon: FileText,
              color: "text-sky-600",
              title: "Neodoslané faktúry",
              value: data.unsentInvoices,
              hint: t("Koncepty: {n}", { n: data.draftInvoices }),
              to: "/faktury",
              search: { status: "issued" as const },
            },
            {
              icon: TrendingUp,
              color: "text-emerald-600",
              title: "Top dlžníci",
              value: data.topDebtors.length,
              hint: data.topDebtors[0]?.name ?? "—",
              to: "/odberatelia",
            },
          ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/*
        Karty vedú cez `Link` a filter ide v `search`. Kým to bolo `<a href>`
        s parametrom v adrese, prekreslila sa celá appka — a `validateSearch`
        na druhej strane parameter aj tak zahodila, takže sa otvoril
        nefiltrovaný zoznam a karta klamala.
      */}
      {cards.map((c) => (
        <Link
          key={c.title}
          to={c.to}
          search={("search" in c ? c.search : {}) as never}
          className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <c.icon className={`h-5 w-5 ${c.color}`} />
            <span className="text-2xl font-bold tracking-tight">{c.value}</span>
          </div>
          <div className="mt-3 text-sm font-semibold">{t(c.title)}</div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.hint}</div>
        </Link>
      ))}
    </div>
  );
}
