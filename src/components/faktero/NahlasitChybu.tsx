import { useEffect, useRef, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import { Bug, Camera, FileText, Lightbulb, Paperclip, X } from "lucide-react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useT } from "@/lib/i18n/useT";
import { velkost } from "@/lib/faktero/faktura-prilohy";
import {
  ACCEPT_PODPORY,
  MAX_PRILOH_NARAZ,
  jeNahladovyObrazok,
  menoVlozenejSnimky,
  roztriedPrilohy,
  typPrilohyPodpory,
  type ChybaPrilohy,
} from "@/lib/faktero/podpora-prilohy";

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

/** Súbor na base64 (bez predpony `data:`), ako ho chce serverová funkcia. */
function naBase64(subor: File): Promise<string> {
  return new Promise((splnit, zamietnut) => {
    const citacka = new FileReader();
    citacka.onerror = () => zamietnut(new Error("Súbor sa nepodarilo prečítať."));
    citacka.onload = () => splnit(String(citacka.result).split(",")[1] ?? "");
    citacka.readAsDataURL(subor);
  });
}

type Priloha = { id: string; subor: File; mime: string; nahlad: string | null };

/**
 * Okno na nahlásenie chyby a návrhu na zlepšenie.
 *
 * Otvára sa z ponuky pod avatarom, takže je poruke z každej stránky. Adresu
 * stránky a prehliadač si berie samo — to sú prvé dve otázky, ktoré by sme sa
 * aj tak museli pýtať, a človek, ktorý našiel chybu, ich nemá dôvod poznať.
 *
 * To isté okno používa web (ponuka pod avatarom) aj appka (bočný panel).
 *
 * Priložiť sa dá snímka obrazovky alebo fotka (aj fotoaparátom na mobile,
 * vložením cez Ctrl+V či pretiahnutím do okna) a PDF. Prílohy sa nahrajú až
 * po založení požiadavky — patria k nej a server overí, že je volajúceho.
 *
 * Kreslené je ručne, nie cez `Dialog`: v appke aj na webe stačí jednoduché
 * okno a takto sa dá zavrieť Escapom aj kliknutím vedľa
 * (rovnaký prístup ako pri ostatných vlastných oknách).
 */
export function NahlasitChybu({ otvorene, onZavri }: { otvorene: boolean; onZavri: () => void }) {
  const { t } = useT();
  const [druh, setDruh] = useState<"chyba" | "napad">("chyba");
  const [text, setText] = useState("");
  const [posielam, setPosielam] = useState(false);
  const poleRef = useRef<HTMLTextAreaElement | null>(null);
  /*
    Cez most, nie priamo: v zabalenej appke beží stránka na `capacitor://localhost`
    a serverová funkcia volaná relatívnou adresou by mierila do prázdna.
  */
  const posli = useOperacia("spatna-vazba");
  const nahrajPrilohu = useOperacia("podpora-priloha-nahraj");
  const klavesnica = useKlavesnica(otvorene);
  const [prilohy, setPrilohy] = useState<Priloha[]>([]);
  const [tahanie, setTahanie] = useState(false);
  const suborRef = useRef<HTMLInputElement | null>(null);
  const fotakRef = useRef<HTMLInputElement | null>(null);
  // Náhľady sú `blob:` adresy — po zatvorení komponentu ich treba uvoľniť.
  const prilohyRef = useRef<Priloha[]>([]);
  prilohyRef.current = prilohy;
  useEffect(
    () => () => {
      for (const p of prilohyRef.current) if (p.nahlad) URL.revokeObjectURL(p.nahlad);
    },
    [],
  );

  useEffect(() => {
    if (!otvorene) return;
    const naEscape = (e: KeyboardEvent) => e.key === "Escape" && onZavri();
    window.addEventListener("keydown", naEscape);
    // Kurzor rovno v poli — človek prišiel písať, nie klikať.
    const casovac = setTimeout(() => poleRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", naEscape);
      clearTimeout(casovac);
    };
  }, [otvorene, onZavri]);

  if (!otvorene) return null;

  function popisChyby(ch: ChybaPrilohy): string {
    switch (ch.kod) {
      case "vela":
        return t("Priložiť sa dá najviac {n} súborov.", { n: ch.max });
      case "prazdny":
        return t("{nazov}: súbor je prázdny.", { nazov: ch.nazov });
      case "velky":
        return t("{nazov}: súbor je väčší než 10 MB.", { nazov: ch.nazov });
      case "typ":
        return t("{nazov}: priložiť sa dá obrázok (JPG, PNG, WEBP, HEIC) alebo PDF.", {
          nazov: ch.nazov,
        });
    }
  }

  function pridajSubory(nove: File[]) {
    if (!nove.length) return;
    const { prijate, chyby } = roztriedPrilohy(nove, prilohy.length);
    for (const ch of chyby) toast.error(popisChyby(ch));
    if (!prijate.length) return;
    setPrilohy((zoznam) => [
      ...zoznam,
      ...prijate.map((subor) => {
        // Typ z prípony, keď ho prehliadač nepošle (HEIC býva prázdny).
        const mime = typPrilohyPodpory(subor.type, subor.name) ?? subor.type;
        return {
          id: crypto.randomUUID(),
          subor,
          mime,
          nahlad: jeNahladovyObrazok(mime) ? URL.createObjectURL(subor) : null,
        };
      }),
    ]);
  }

  function odober(id: string) {
    setPrilohy((zoznam) => {
      const p = zoznam.find((x) => x.id === id);
      if (p?.nahlad) URL.revokeObjectURL(p.nahlad);
      return zoznam.filter((x) => x.id !== id);
    });
  }

  /** Snímka obrazovky zo schránky (PrtScn / Cmd+Shift+4 a Ctrl+V). */
  function naVlozenie(e: React.ClipboardEvent) {
    const obrazky = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!obrazky.length) return;
    e.preventDefault();
    pridajSubory(
      obrazky.map((f) =>
        // Zo schránky prichádza všetko ako „image.png" — dá sa im rozlíšiteľné meno.
        f.name && f.name !== "image.png"
          ? f
          : new File([f], menoVlozenejSnimky(f.type), { type: f.type }),
      ),
    );
  }

  async function odosli() {
    const sprava = text.trim();
    if (sprava.length < 5) {
      toast.error(t("Napíšte aspoň vetu, nech vieme, čo hľadať."));
      return;
    }
    setPosielam(true);
    try {
      const r: any = await posli({
        data: {
          kind: druh,
          message: sprava,
          pocet_priloh: prilohy.length || undefined,
          url: typeof window !== "undefined" ? window.location.href.slice(0, 300) : undefined,
          user_agent:
            typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : undefined,
          company_id: getActiveCompanyId() ?? undefined,
        },
      });
      /*
        Hlásenie je požiadavka v help desku. Na webe vedie odkaz na jej vlákno;
        appka obrazovku požiadaviek nemá, tam stačí číslo — odpoveď príde e-mailom.
      */
      const naWebe = typeof window !== "undefined" && !window.location.pathname.startsWith("/app");

      /*
        Prílohy po jednej — každá je samostatné volanie (do 10 MB), takže sa
        nezrazia s limitom dĺžky požiadavky. Keď niektorá neprejde, požiadavka
        už aj tak existuje; povie sa len, koľko súborov chýba.
      */
      let nenahrate = 0;
      if (prilohy.length) {
        if (r?.poziadavkaId) {
          for (const p of prilohy) {
            try {
              await nahrajPrilohu({
                data: {
                  poziadavkaId: r.poziadavkaId,
                  name: p.subor.name.slice(0, 200),
                  mime: p.mime,
                  base64: await naBase64(p.subor),
                },
              });
            } catch (e) {
              nenahrate++;
              console.error("[nahlasenie] príloha sa nenahrala:", e);
            }
          }
        } else nenahrate = prilohy.length;
      }
      if (r?.cislo) {
        toast.success(
          naWebe
            ? t(
                "Požiadavka P-{cislo} je založená, ďakujeme. Odpoveď príde e-mailom a uvidíte ju v Pomoc a podpora.",
                {
                  cislo: r.cislo,
                },
              )
            : t("Požiadavka P-{cislo} je založená, ďakujeme. Odpoveď príde e-mailom.", {
                cislo: r.cislo,
              }),
          naWebe && r.poziadavkaId
            ? {
                action: {
                  label: t("Zobraziť"),
                  onClick: () => window.location.assign(`/podpora/${r.poziadavkaId}`),
                },
              }
            : undefined,
        );
      } else {
        toast.success(
          druh === "chyba" ? t("Chyba nahlásená, ďakujeme.") : t("Návrh odoslaný, ďakujeme."),
        );
      }
      if (nenahrate) {
        toast.error(
          t(
            "Prílohy sa nepodarilo nahrať ({n}). Pošlite ich prosím odpoveďou na potvrdzovací e-mail.",
            { n: nenahrate },
          ),
        );
      }
      setText("");
      for (const p of prilohy) if (p.nahlad) URL.revokeObjectURL(p.nahlad);
      setPrilohy([]);
      onZavri();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Odoslať sa to nepodarilo."));
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
        aria-label={t("Nahlásiť chybu alebo návrh")}
        onClick={(e) => e.stopPropagation()}
        onPaste={naVlozenie}
        // Pretiahnutý súbor (snímka z plochy) sa priloží rovnako ako vybraný.
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          e.preventDefault();
          setTahanie(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTahanie(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files?.length) return;
          e.preventDefault();
          setTahanie(false);
          pridajSubory(Array.from(e.dataTransfer.files));
        }}
        /*
          Na nízkej obrazovke (alebo s otvorenou klávesnicou) sa obsah nezmestí
          — bez rolovania sa k tlačidlu nedá dostať vôbec.
        */
        className={`max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border bg-card p-5 shadow-lg ${
          tahanie ? "border-primary ring-2 ring-primary/40" : "border-border"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{t("Nahlásiť chybu alebo návrh")}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("Píšeme si k tomu stránku, na ktorej ste, aj prehliadač — nemusíte ich hľadať.")}
            </p>
          </div>
          <button
            onClick={onZavri}
            aria-label={t("Zavrieť")}
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
                <Icon className="h-4 w-4" /> {t(v.label)}
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
              ? t(
                  "Čo ste robili a čo sa stalo? Napríklad: pri ukladaní faktúry sa tlačidlo točí a nič sa neuloží.",
                )
              : t("Čo by vám pomohlo? Napríklad: pri faktúrach filter na konkrétneho odberateľa.")
          }
          className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-sm"
        />

        {/* Prílohy: súbor, fotoaparát (len na dotykových zariadeniach), Ctrl+V alebo pretiahnutie. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => suborRef.current?.click()}
            disabled={posielam || prilohy.length >= MAX_PRILOH_NARAZ}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-secondary disabled:opacity-50"
          >
            <Paperclip className="h-3.5 w-3.5" /> {t("Priložiť snímku alebo súbor")}
          </button>
          <button
            type="button"
            onClick={() => fotakRef.current?.click()}
            disabled={posielam || prilohy.length >= MAX_PRILOH_NARAZ}
            className="hidden items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-secondary disabled:opacity-50 pointer-coarse:inline-flex"
          >
            <Camera className="h-3.5 w-3.5" /> {t("Odfotiť")}
          </button>
          <span className="text-[12px] text-muted-foreground pointer-coarse:hidden">
            {t("Snímku obrazovky vložíte aj cez Ctrl+V.")}
          </span>
          <input
            ref={suborRef}
            type="file"
            multiple
            accept={ACCEPT_PODPORY}
            className="hidden"
            aria-label={t("Priložiť snímku alebo súbor")}
            onChange={(e) => {
              pridajSubory(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <input
            ref={fotakRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label={t("Odfotiť")}
            onChange={(e) => {
              pridajSubory(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
        {prilohy.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label={t("Prílohy")}>
            {prilohy.map((p) => (
              <li
                key={p.id}
                className="relative flex w-24 flex-col overflow-hidden rounded-lg border border-border bg-background"
              >
                {p.nahlad ? (
                  <img src={p.nahlad} alt={p.subor.name} className="h-16 w-full object-cover" />
                ) : (
                  <div className="grid h-16 w-full place-items-center bg-muted text-muted-foreground">
                    <FileText className="h-5 w-5" />
                  </div>
                )}
                <span className="truncate px-1.5 pt-1 text-[11px]" title={p.subor.name}>
                  {p.subor.name}
                </span>
                <span className="px-1.5 pb-1 text-[10px] text-muted-foreground">
                  {velkost(p.subor.size)}
                </span>
                <button
                  type="button"
                  onClick={() => odober(p.id)}
                  disabled={posielam}
                  aria-label={t("Odobrať {nazov}", { nazov: p.subor.name })}
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[12px] text-muted-foreground">
            {t("Odpovedáme na e-mail vášho účtu.")}
          </span>
          <button
            onClick={odosli}
            disabled={posielam}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {posielam
              ? prilohy.length
                ? t("Odosielam s prílohami…")
                : t("Odosielam…")
              : t("Odoslať")}
          </button>
        </div>
      </div>
    </div>
  );
}
