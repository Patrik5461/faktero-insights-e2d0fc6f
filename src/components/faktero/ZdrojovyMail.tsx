import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, X } from "lucide-react";
import { zdrojovyMailFn, type ZdrojovyMail } from "@/lib/faktero/zdrojovy-mail.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";

type Druh = "nespracovany" | "prijata" | "doklad" | "ostatny";

/**
 * „Zobraziť zdrojový e-mail" — ukáže sa len pri doklade, ktorý prišiel mailom
 * (`inboxMessageId`). Text sa načíta až po kliknutí.
 */
export function ZdrojovyMailTlacidlo({
  druh,
  id,
  inboxMessageId,
  ikona,
}: {
  druh: Druh;
  id: string;
  inboxMessageId?: string | null;
  /** Len ikona obálky (do zoznamu). */
  ikona?: boolean;
}) {
  const nacitaj = useServerFn(zdrojovyMailFn);
  const [otvorene, setOtvorene] = useState(false);
  const [mail, setMail] = useState<ZdrojovyMail | null | undefined>(undefined);
  if (!inboxMessageId) return null;

  async function otvor(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOtvorene(true);
    if (mail === undefined) {
      try {
        setMail(await nacitaj({ data: { druh, id } }));
      } catch {
        setMail(null);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={otvor}
        title="Zobraziť zdrojový e-mail"
        aria-label="Zobraziť zdrojový e-mail"
        className={
          ikona
            ? "inline-flex rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            : "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
        }
      >
        <Mail className="h-4 w-4" />
        {ikona ? null : "Zdrojový e-mail"}
      </button>
      {otvorene && <OknoMailu mail={mail} onClose={() => setOtvorene(false)} />}
    </>
  );
}

function OknoMailu({
  mail,
  onClose,
}: {
  mail: ZdrojovyMail | null | undefined;
  onClose: () => void;
}) {
  useZatvorNaEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Zdrojový e-mail"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col rounded-xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">Zdrojový e-mail</h3>
            {mail ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                <dt className="text-muted-foreground">Od</dt>
                <dd className="min-w-0 break-words">{mail.od ?? "—"}</dd>
                {mail.komu ? (
                  <>
                    <dt className="text-muted-foreground">Komu</dt>
                    <dd className="min-w-0 break-words">{mail.komu}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Predmet</dt>
                <dd className="min-w-0 break-words">{mail.predmet ?? "—"}</dd>
                <dt className="text-muted-foreground">Prijaté</dt>
                <dd>
                  {mail.prijate
                    ? new Date(mail.prijate).toLocaleString("sk-SK", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </dd>
              </dl>
            ) : null}
          </div>
          <button onClick={onClose} aria-label="Zavrieť" className="rounded p-1 hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          {mail === undefined ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
            </div>
          ) : mail === null ? (
            <p className="text-sm text-muted-foreground">Mail sa nenašiel.</p>
          ) : mail.text ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm">{mail.text}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Mail neobsahoval žiadny text — len prílohy. (Pri dokladoch, ktoré prišli pred 9. 10.
              2026, sa text mailu ešte neukladal.)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
