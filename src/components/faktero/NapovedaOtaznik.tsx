import { useEffect, useRef, useState, type ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CircleHelp } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

/*
  Vysvetlivka „?“ — ikona pri nadpise alebo popise poľa, text v bubline.

  - myš: bublina sa ukáže pri prejdení nad ikonou a zmizne po odchode
    (s krátkym oneskorením, aby sa dalo prejsť do bubliny a označiť text),
  - dotyk / klik: ťuknutie bublinu pripne, druhé ťuknutie alebo ťuknutie
    mimo ju zavrie,
  - klávesnica: ikona je v poradí Tab, Enter/medzerník ju otvorí, Esc zavrie.

  Spúšťač je `<span role="button">`, nie `<button>` — dá sa vložiť aj do
  `<label>` poľa bez toho, aby prebral jeho prepojenie so vstupom (button je
  „labelable“, prvý taký potomok by sa stal ovládacím prvkom labelu). Klik na
  ikonu preto ruší predvolenú akciu, aby label neotvoril kalendár dátumu.
*/
export function NapovedaOtaznik({
  children,
  popis,
  velkost = "normalna",
  className = "",
}: {
  /** Obsah bubliny — text alebo odseky. */
  children: ReactNode;
  /** Prístupný názov ikony, napr. „Vysvetlivka: Dátum prijatia“. */
  popis?: string;
  /** „mala“ do popisu poľa (13–14 px), „normalna“ k nadpisu stránky. */
  velkost?: "mala" | "normalna";
  className?: string;
}) {
  const { t } = useT();
  const [otvorene, setOtvorene] = useState(false);
  const [pripnute, setPripnute] = useState(false);
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spustac = useRef<HTMLSpanElement>(null);

  useEffect(() => () => zrusCasovac(), []);

  function zrusCasovac() {
    if (casovac.current) clearTimeout(casovac.current);
    casovac.current = null;
  }
  function otvorNaChvilu() {
    zrusCasovac();
    setOtvorene(true);
  }
  function zavriNeskor() {
    if (pripnute) return;
    zrusCasovac();
    casovac.current = setTimeout(() => setOtvorene(false), 150);
  }
  function prepni() {
    zrusCasovac();
    if (otvorene && pripnute) {
      setOtvorene(false);
      setPripnute(false);
    } else {
      setOtvorene(true);
      setPripnute(true);
    }
  }
  function zavri() {
    zrusCasovac();
    setOtvorene(false);
    setPripnute(false);
  }

  const ikona = velkost === "mala" ? "h-3 w-3" : "h-4 w-4";
  const nazov = popis ?? t("Vysvetlivka");

  return (
    <PopoverPrimitive.Root open={otvorene} onOpenChange={(o) => (o ? setOtvorene(true) : zavri())}>
      <PopoverPrimitive.Anchor asChild>
        <span
          ref={spustac}
          role="button"
          tabIndex={0}
          aria-label={nazov}
          aria-expanded={otvorene}
          data-napoveda-otaznik
          className={`pointer-events-auto inline-flex shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground outline-none transition hover:text-primary focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring ${className}`}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") otvorNaChvilu();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") zavriNeskor();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            prepni();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              prepni();
            }
          }}
        >
          <CircleHelp className={ikona} aria-hidden="true" />
        </span>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          role="tooltip"
          data-napoveda-bublina
          // Bublina nepreberá fokus — kto prišiel klávesnicou, ostáva na ikone.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // Klik na samotnú ikonu rieši `prepni`, inak by sa bublina zavrela a hneď otvorila.
            if (spustac.current?.contains(e.target as Node)) e.preventDefault();
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") zrusCasovac();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") zavriNeskor();
          }}
          className="z-50 max-w-[min(24rem,calc(100vw-1.5rem))] rounded-md border border-border bg-popover px-3 py-2 text-sm font-normal leading-relaxed text-popover-foreground shadow-md outline-none"
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
