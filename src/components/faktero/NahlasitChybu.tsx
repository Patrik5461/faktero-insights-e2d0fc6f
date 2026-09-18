import { useEffect, useRef, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import { Bug, Lightbulb, X } from "lucide-react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

/**
 * O koľko klávesnica prekrýva okno.
 *
 * Čistá časť výpočtu — dá sa overiť bez prehliadača a práve tu sa dá pomýliť:
 * `offsetTop` je to, o koľko je viditeľná časť posunutá nadol, keď stránku
 * vytlačí klávesnica. Bez neho vyjde prekrytie menšie, než je.
 *
 * Malé rozdiely (lišty prehliadača) sa ignorujú — odsúvať okno o pár bodov by
 * len poskakovalo.
 */
export function prekrytieKlavesnicou(okno: number, viditelne: number, posun: number): number {
  const prekryv = okno - viditelne - posun;
  return prekryv > 80 ? Math.round(prekryv) : 0;
}

/**
 * Koľko miesta zdola zaberá klávesnica.
 *
 * V zabalenej appke sa stránka pri otvorení klávesnice **nezmenší** — `inset-0`
 * teda ostane cez celú obrazovku a spodok okna aj s tlačidlom skončí pod
 * klávesnicou. `visualViewport` je jediné miesto, ktoré o nej vie.
 */
function useKlavesnica(aktivne: boolean): number {
  const [vyska, setVyska] = useState(0);
  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!aktivne || !vv) return;
    const prepocitaj = () =>
      setVyska(prekrytieKlavesnicou(window.innerHeight, vv.height, vv.offsetTop));
    prepocitaj();
    vv.addEventListener("resize", prepocitaj);
    vv.addEventListener("scroll", prepocitaj);
    return () => {
      vv.removeEventListener("resize", prepocitaj);
      vv.removeEventListener("scroll", prepocitaj);
      setVyska(0);
    };
  }, [aktivne]);
  return vyska;
}

/**
 * Okno na nahlásenie chyby a návrhu na zlepšenie.
 *
 * Otvára sa z ponuky pod avatarom, takže je poruke z každej stránky. Adresu
 * stránky a prehliadač si berie samo — to sú prvé dve otázky, ktoré by sme sa
 * aj tak museli pýtať, a človek, ktorý našiel chybu, ich nemá dôvod poznať.
 *
 * To isté okno používa web (ponuka pod avatarom) aj appka (bočný panel).
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
  /*
    Cez most, nie priamo: v zabalenej appke beží stránka na `capacitor://localhost`
    a serverová funkcia volaná relatívnou adresou by mierila do prázdna.
  */
  const posli = useOperacia("spatna-vazba");
  const klavesnica = useKlavesnica(otvorene);

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
      /*
        Okno sedí pri spodnom okraji, takže ho klávesnica prekryje celé — aj
        pole, aj tlačidlo Odoslať. Odsunie sa presne o jej výšku; keď nie je,
        drží sa nad domovským prúžkom iPhonu.
      */
      style={{
        paddingBottom: klavesnica ? klavesnica + 16 : "calc(env(safe-area-inset-bottom) + 1rem)",
      }}
      onClick={onZavri}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nahlásiť chybu alebo návrh"
        onClick={(e) => e.stopPropagation()}
        /*
          Na nízkej obrazovke (alebo s otvorenou klávesnicou) sa obsah nezmestí
          — bez rolovania sa k tlačidlu nedá dostať vôbec.
        */
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-5 shadow-lg"
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
