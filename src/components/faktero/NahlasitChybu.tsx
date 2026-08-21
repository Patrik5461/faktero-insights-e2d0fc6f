import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bug, Lightbulb, X } from "lucide-react";
import { posliSpatnuVazbu } from "@/lib/faktero/spatna-vazba.functions";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

/**
 * Okno na nahlásenie chyby a návrhu na zlepšenie.
 *
 * Otvára sa z ponuky pod avatarom, takže je poruke z každej stránky. Adresu
 * stránky a prehliadač si berie samo — to sú prvé dve otázky, ktoré by sme sa
 * aj tak museli pýtať, a človek, ktorý našiel chybu, ich nemá dôvod poznať.
 *
 * Kreslené je ručne, nie cez `Dialog`: v appke aj na webe stačí jednoduché
 * okno a takto sa dá zavrieť Escapom aj kliknutím vedľa
 * (rovnaký prístup ako pri ostatných vlastných oknách).
 */
export function NahlasitChybu({ otvorene, onZavri }: { otvorene: boolean; onZavri: () => void }) {
  const [druh, setDruh] = useState<"chyba" | "napad">("chyba");
  const [text, setText] = useState("");
  const [posielam, setPosielam] = useState(false);
  const poleRef = useRef<HTMLTextAreaElement | null>(null);
  const posli = useServerFn(posliSpatnuVazbu);

  useEffect(() => {
    if (!otvorene) return;
    const naEscape = (e: KeyboardEvent) => e.key === "Escape" && onZavri();
    window.addEventListener("keydown", naEscape);
    // Kurzor rovno v poli — človek prišiel písať, nie klikať.
    const t = setTimeout(() => poleRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", naEscape);
      clearTimeout(t);
    };
  }, [otvorene, onZavri]);

  if (!otvorene) return null;

  async function odosli() {
    const sprava = text.trim();
    if (sprava.length < 5) {
      toast.error("Napíšte aspoň vetu, nech vieme, čo hľadať.");
      return;
    }
    setPosielam(true);
    try {
      await posli({
        data: {
          kind: druh,
          message: sprava,
          url: typeof window !== "undefined" ? window.location.href.slice(0, 300) : undefined,
          user_agent:
            typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : undefined,
          company_id: getActiveCompanyId() ?? undefined,
        },
      });
      toast.success(druh === "chyba" ? "Chyba nahlásená, ďakujeme." : "Návrh odoslaný, ďakujeme.");
      setText("");
      onZavri();
    } catch (e: any) {
      toast.error(e?.message ?? "Odoslať sa to nepodarilo.");
    } finally {
      setPosielam(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-end bg-black/40 p-4 sm:place-items-center"
      onClick={onZavri}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nahlásiť chybu alebo návrh"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Nahlásiť chybu alebo návrh</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Píšeme si k tomu stránku, na ktorej ste, aj prehliadač — nemusíte ich hľadať.
            </p>
          </div>
          <button
            onClick={onZavri}
            aria-label="Zavrieť"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(
            [
              { kod: "chyba", label: "Niečo nefunguje", icon: Bug },
              { kod: "napad", label: "Návrh na zlepšenie", icon: Lightbulb },
            ] as const
          ).map((v) => {
            const Icon = v.icon;
            const vybrane = druh === v.kod;
            return (
              <button
                key={v.kod}
                type="button"
                onClick={() => setDruh(v.kod)}
                aria-pressed={vybrane}
                className={`flex select-none items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  vybrane
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border hover:bg-secondary"
                }`}
              >
                <Icon className="h-4 w-4" /> {v.label}
              </button>
            );
          })}
        </div>

        <textarea
          ref={poleRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={4000}
          placeholder={
            druh === "chyba"
              ? "Čo ste robili a čo sa stalo? Napríklad: pri ukladaní faktúry sa tlačidlo točí a nič sa neuloží."
              : "Čo by vám pomohlo? Napríklad: pri faktúrach filter na konkrétneho odberateľa."
          }
          className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-sm"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[12px] text-muted-foreground">
            Odpovedáme na e-mail vášho účtu.
          </span>
          <button
            onClick={odosli}
            disabled={posielam}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {posielam ? "Odosielam…" : "Odoslať"}
          </button>
        </div>
      </div>
    </div>
  );
}
