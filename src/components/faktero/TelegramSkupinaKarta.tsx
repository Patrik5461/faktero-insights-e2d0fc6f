import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, Users } from "lucide-react";
import { potvrd } from "@/lib/potvrdenie";
import {
  adminTelegramSkupinaAktivnaFn,
  adminTelegramSkupinaKodFn,
  adminTelegramSkupinyFn,
} from "@/lib/faktero/telegram-skupina.functions";

/**
 * Admin → Podpora → Telegram skupina: bot v skupine účtovníkov len ticho
 * ukladá správy (žiadne požiadavky, žiadne odpovede). Skupinu spáruje admin
 * príkazom `/skupina <kód>` priamo v nej.
 */
export function TelegramSkupinaKarta() {
  const nacitajFn = useServerFn(adminTelegramSkupinyFn);
  const kodFn = useServerFn(adminTelegramSkupinaKodFn);
  const aktivnaFn = useServerFn(adminTelegramSkupinaAktivnaFn);
  const [data, setData] = useState<Awaited<ReturnType<typeof adminTelegramSkupinyFn>> | null>(null);
  const [kod, setKod] = useState<{ kod: string; platiDo: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const nacitaj = useCallback(async () => {
    try {
      setData(await nacitajFn());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [nacitajFn]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  async function vyrobKod() {
    setBusy(true);
    try {
      setKod(await kodFn());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function prepni(chatId: number, aktivna: boolean) {
    if (
      !aktivna &&
      !(await potvrd("Vypnúť skupinu? Nové správy z nej sa prestanú ukladať (uložené ostanú)."))
    )
      return;
    try {
      await aktivnaFn({ data: { chat_id: chatId, aktivna } });
      await nacitaj();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-sky-600" /> Telegram skupina
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {(data?.skupiny.length ?? 0) > 0 && (
            <Link
              to="/admin/podpora/telegram-skupina"
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary"
            >
              Správy zo skupiny
            </Link>
          )}
          <button
            onClick={vyrobKod}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Kód pre skupinu
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-2 text-sm text-muted-foreground">
        <p>
          Bot v skupine účtovníkov len ukladá správy na prečítanie — nezakladá požiadavky a do
          skupiny nepíše. Ukladá sa len zo skupiny, ktorú tu spárujete.
        </p>
        <ol className="list-decimal space-y-0.5 pl-5">
          <li>
            V @BotFather → /mybots → bot → Bot Settings → <b>Group Privacy → Turn off</b> (inak bot
            v skupine vidí len príkazy). Druhá možnosť: urobiť bota v skupine administrátorom.
          </li>
          <li>Pridajte bota do skupiny (po zmene Group Privacy ho odoberte a pridajte znova).</li>
          <li>
            Váš súkromný chat s botom musí byť spárovaný (karta Telegram vyššie) — podľa neho bot
            pozná, že príkaz píše admin.
          </li>
          <li>
            Kliknite na „Kód pre skupinu“ a do skupiny napíšte <code>/skupina KÓD</code>.
          </li>
        </ol>
        {!data ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : data.skupiny.length === 0 ? (
          <p>Zatiaľ nie je spárovaná žiadna skupina.</p>
        ) : (
          <ul className="space-y-1">
            {data.skupiny.map((s) => (
              <li key={s.chat_id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 break-words text-foreground">
                  {s.nazov || `Skupina ${s.chat_id}`}
                </span>
                <span
                  className={`text-xs ${s.aktivna ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}
                >
                  {s.aktivna ? "ukladá sa" : "vypnutá"}
                </span>
                <span className="text-xs">
                  posledná správa:{" "}
                  {s.posledna_sprava ? new Date(s.posledna_sprava).toLocaleString("sk-SK") : "—"}
                </span>
                {s.nevybavenych > 0 && (
                  <span className="text-xs text-foreground">nevybavených: {s.nevybavenych}</span>
                )}
                <button
                  onClick={() => prepni(s.chat_id, !s.aktivna)}
                  className="text-xs text-primary hover:underline"
                >
                  {s.aktivna ? "Vypnúť" : "Zapnúť"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {kod && (
          <div className="rounded-lg border border-dashed border-border p-3 text-foreground">
            <p>
              Napíšte do skupiny{" "}
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono">
                /skupina {kod.kod}
              </code>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(`/skupina ${kod.kod}`);
                  toast.success("Skopírované.");
                }}
                className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
                aria-label="Kopírovať"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Kód je jednorazový, platí len pre váš účet do{" "}
              {new Date(kod.platiDo).toLocaleTimeString("sk-SK", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Bot potvrdí spárovanie v skupine; ak kód neplatí, napíše vám súkromne. Potom obnovte
              stránku.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
