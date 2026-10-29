import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, Send, Unlink } from "lucide-react";
import { potvrd } from "@/lib/potvrdenie";
import {
  adminTelegramOdpojFn,
  adminTelegramPrepojFn,
  adminTelegramStavFn,
} from "@/lib/faktero/telegram.functions";

/**
 * Admin → Podpora → Telegram: stav bota a spárovanie chatu podpory.
 * Po spárovaní chodia do Telegramu nové požiadavky, správy zákazníkov a
 * návrhy automatických opráv; na upozornenie sa dá odpovedať cez Reply.
 */
export function TelegramAdminKarta() {
  const stavFn = useServerFn(adminTelegramStavFn);
  const prepojFn = useServerFn(adminTelegramPrepojFn);
  const odpojFn = useServerFn(adminTelegramOdpojFn);
  const [stav, setStav] = useState<Awaited<ReturnType<typeof adminTelegramStavFn>> | null>(null);
  const [kod, setKod] = useState<{ kod: string; platiDo: string; odkaz: string | null } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const nacitaj = useCallback(async () => {
    try {
      setStav(await stavFn());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [stavFn]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  async function prepoj() {
    setBusy(true);
    try {
      setKod(await prepojFn());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function odpoj(chatId: number) {
    if (!(await potvrd("Odpojiť tento chat? Upozornenia doň prestanú chodiť."))) return;
    try {
      await odpojFn({ data: { chat_id: chatId } });
      await nacitaj();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Send className="h-4 w-4 text-sky-600" /> Telegram
        </h2>
        {!stav ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <button
            onClick={prepoj}
            disabled={busy || !stav.nastaveny}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Prepojiť Telegram
          </button>
        )}
      </div>
      {stav && (
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          <p>
            Bot:{" "}
            {stav.nastaveny ? (
              <span className="text-foreground">
                {stav.bot ? `@${stav.bot}` : "nastavený (chýba TELEGRAM_BOT_USERNAME)"}
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">
                nenastavený — chýba TELEGRAM_BOT_TOKEN
              </span>
            )}
            {stav.nastaveny && !stav.webhookTajomstvo && (
              <span className="text-amber-700 dark:text-amber-400">
                {" "}
                · chýba TELEGRAM_WEBHOOK_SECRET, webhook všetko odmietne
              </span>
            )}
            {stav.nastaveny && ` · zákazníckych chatov: ${stav.zakaznikov}`}
          </p>
          {stav.chaty.length === 0 ? (
            <p>Váš účet nemá spárovaný žiadny chat — upozornenia chodia len e-mailom.</p>
          ) : (
            <ul className="space-y-1">
              {stav.chaty.map((c) => (
                <li key={c.chat_id} className="flex flex-wrap items-center gap-2">
                  <span className="text-foreground">
                    Spárovaný chat: {c.meno || (c.username ? `@${c.username}` : c.chat_id)}
                  </span>
                  <span className="text-xs">
                    od {new Date(c.created_at).toLocaleString("sk-SK")}
                  </span>
                  <button
                    onClick={() => odpoj(c.chat_id)}
                    className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                  >
                    <Unlink className="h-3 w-3" /> Odpojiť
                  </button>
                </li>
              ))}
            </ul>
          )}
          {kod && (
            <div className="mt-2 rounded-lg border border-dashed border-border p-3 text-foreground">
              <p>
                Pošlite botovi{" "}
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono">
                  /admin {kod.kod}
                </code>
                <button
                  onClick={() => {
                    void navigator.clipboard?.writeText(`/admin ${kod.kod}`);
                    toast.success("Skopírované.");
                  }}
                  className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
                  aria-label="Kopírovať"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {kod.odkaz && (
                  <>
                    {" "}
                    alebo otvorte{" "}
                    <a
                      href={kod.odkaz}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      odkaz v Telegrame
                    </a>
                  </>
                )}
                .
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Kód je jednorazový a platí do{" "}
                {new Date(kod.platiDo).toLocaleTimeString("sk-SK", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                . Po spárovaní obnovte stránku.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
