import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { ZELENA_HORE } from "@/lib/mobile/brand";

/**
 * Zelený pás pod hodinami — jedna vrstva pre celú appku.
 *
 * Kreslí ho stránka, nie plugin StatusBar: appka beží s `overlaysWebView: true`,
 * takže WebView siaha až pod hodiny a farbu tam určuje toto.
 *
 * Prečo jeden spoločný prvok a nie pás v každej hlavičke: bočný panel leží nad
 * obrazovkou (z-50) a jeho stmavenie cez ňu (z-40). Keby si pás kreslila každá
 * obrazovka sama, pri otvorenom paneli by bol horný pruh na šírku panela zelený
 * a vedľa neho stmavený. Tento pás je nad oboma (z-60), takže je vždy celý a
 * vždy rovnaký — nezávisle od toho, čo je pod ním.
 *
 * `pointer-events-none`, aby neprekrýval dotyky v hlavičkách pod sebou.
 */
export function PasHore() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60]"
      style={{ height: "var(--safe-top)", backgroundColor: ZELENA_HORE }}
    />
  );
}

/**
 * Rám mobilnej aplikácie.
 *
 * Appka beží v natívnom obale, ktorý ukazuje živý web — nemá teda vlastný
 * skelet a musí si ho vyrobiť stránka. Preto tu je aj odsadenie pre výrez a
 * spodnú lištu telefónu (`env(safe-area-inset-*)`): bez neho by hlavička
 * liezla pod hodiny a spodné tlačidlo pod indikátor domovskej obrazovky.
 */

/**
 * Potiahnutie od ľavého okraja = späť.
 *
 * Na iPhone to ľudia robia automaticky a čakajú, že to funguje. Vo WebView
 * natívne gesto nefunguje: obrazovky appky nie sú položky histórie
 * prehliadača, ale kroky jedného stavu. Preto sa sleduje prst.
 *
 * Gesto sa chytá len pri okraji — inak by braním prsta cez obsah nešlo
 * vodorovne rolovať v tabuľkách a zoznamoch.
 */
const OKRAJ = 28;
const PRAH = 70;

function useSwipeSpat(onSpat?: () => void) {
  const [posun, setPosun] = useState(0);
  const [pusta, setPusta] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const smer = useRef<"?" | "vodorovne" | "zvisle">("?");

  useEffect(() => {
    if (!onSpat) return;

    const dole = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || t.clientX > OKRAJ) return;
      start.current = { x: t.clientX, y: t.clientY };
      smer.current = "?";
      setPusta(false);
    };

    const pohyb = (e: TouchEvent) => {
      const s = start.current;
      const t = e.touches[0];
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;

      // Kým nie je jasné, či človek ťahá do strany alebo roluje, nerobíme nič.
      if (smer.current === "?") {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        smer.current = Math.abs(dx) > Math.abs(dy) ? "vodorovne" : "zvisle";
      }
      if (smer.current !== "vodorovne") return;

      // Za pravý okraj sa ťahať nedá a doľava nemá gesto zmysel.
      setPosun(Math.max(0, Math.min(dx, window.innerWidth)));
    };

    const hore = () => {
      const dost = posun > PRAH;
      start.current = null;
      smer.current = "?";
      setPusta(true);
      if (dost) {
        // Obrazovka domôže dobehnúť z obrazovky von, až potom sa prepne.
        setPosun(window.innerWidth);
        window.setTimeout(onSpat, 180);
      } else {
        setPosun(0);
      }
    };

    window.addEventListener("touchstart", dole, { passive: true });
    window.addEventListener("touchmove", pohyb, { passive: true });
    window.addEventListener("touchend", hore, { passive: true });
    window.addEventListener("touchcancel", hore, { passive: true });
    return () => {
      window.removeEventListener("touchstart", dole);
      window.removeEventListener("touchmove", pohyb);
      window.removeEventListener("touchend", hore);
      window.removeEventListener("touchcancel", hore);
    };
  }, [onSpat, posun]);

  return { posun, pusta };
}

/**
 * Horná lišta appky — jedna pre všetky obrazovky.
 *
 * Dovtedy si ju kreslila každá obrazovka sama: domov mala zelenú s hamburgerom,
 * podstránky bielu so šípkou, panel tretiu variantu. Líšili sa výškou, farbou
 * aj typografiou, takže pri prechode medzi obrazovkami titulok poskočil — a
 * `env(safe-area-inset-top)` bolo rozpísané v ôsmich súboroch, čo znamená, že
 * pri deviatej obrazovke sa naň raz zabudne a text vlezie pod hodiny.
 *
 * Zelený pás pre výrez je súčasťou tohto komponentu. Obsah lišty má **pevnú
 * výšku** nezávisle od toho, či je podnadpis — inak by sa lišta pri prepnutí
 * z domovskej obrazovky na podstránku natiahla.
 */
const VYSKA_LISTY = 52;

export function AppHeader({
  title,
  subtitle,
  onBack,
  left,
  right,
  pod,
  variant = "sub",
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Prvok vľavo namiesto šípky späť — domovská obrazovka má hamburger. */
  left?: ReactNode;
  right?: ReactNode;
  /** Obsah pod lištou v tom istom zelenom bloku (výber firmy na domove). */
  pod?: ReactNode;
  variant?: "root" | "sub";
}) {
  return (
    <header
      className={`sticky top-0 text-white ${variant === "root" ? "z-20" : "z-10"}`}
      style={{ backgroundColor: ZELENA_HORE, paddingTop: "var(--safe-top)" }}
    >
      <div className="flex items-center gap-1 px-2" style={{ minHeight: VYSKA_LISTY }}>
        {left ??
          (onBack ? (
            <button
              onClick={onBack}
              aria-label="Späť"
              // 44 px je najmenší cieľ, ktorý sa dá palcom trafiť na prvý raz.
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white active:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null)}
        <div className="min-w-0 flex-1 px-2">
          <h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight">
            {title}
          </h1>
          {/*
            Riadok podnadpisu je tu **vždy**, aj keď je prázdny. Bez neho sa
            titulok na obrazovke bez podnadpisu vycentruje inde a pri prepnutí
            medzi obrazovkami poskočí o osem bodov — presne ten skok, ktorý je
            na prepínaní vidieť.
          */}
          <p
            className="truncate text-[13px] leading-tight"
            // Nie `text-white/80`: na zelenej má len 3,9:1. Pri 0,92 je to
            // 4,6:1, teda nad hranicou pre bežne veľký text.
            style={{ color: "rgba(255,255,255,0.92)" }}
          >
            {subtitle ?? "\u00A0"}
          </p>
        </div>
        {right}
      </div>
      {pod}
    </header>
  );
}

export function MobilObrazovka({
  title,
  subtitle,
  onBack,
  children,
  footer,
  akcia,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  akcia?: ReactNode;
}) {
  const { posun, pusta } = useSwipeSpat(onBack);
  const patka = useRef<HTMLElement>(null);
  const [vyskaPatky, setVyskaPatky] = useState(0);

  /*
    Lepivá pätka je `position: sticky`, takže si vo flexe nerezervuje miesto a
    prekryje koniec obsahu — na „Novej jazde" rezala sekciu „Typ jazdy" a na
    ostatných obrazovkách poslednú položku. Výška sa preto zmeria a pripočíta
    k odsadeniu obsahu. `ResizeObserver` kvôli tomu, že tlačidlo v pätke mení
    počas jazdy text, a tým aj výšku.
  */
  useEffect(() => {
    const el = patka.current;
    if (!el) {
      setVyskaPatky(0);
      return;
    }
    const zmer = () => setVyskaPatky(el.offsetHeight);
    zmer();
    const sledovac = new ResizeObserver(zmer);
    sledovac.observe(el);
    return () => sledovac.disconnect();
  }, [footer]);

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-background"
      style={{
        transform: posun ? `translateX(${posun}px)` : undefined,
        transition: pusta ? "transform 180ms cubic-bezier(0.32, 0.72, 0, 1)" : undefined,
        boxShadow: posun ? "-12px 0 32px rgba(0,0,0,0.18)" : undefined,
      }}
    >
      <AppHeader title={title} subtitle={subtitle} onBack={onBack} right={akcia} />

      {/* Odsadenie dole kvôli spodnej lište a lepivej pätke — bez neho ostane
          koniec obsahu schovaný za nimi. Mimo záložiek je premenná prázdna. */}
      <main
        className="flex-1 px-4 pt-4"
        style={{ paddingBottom: `calc(1rem + ${vyskaPatky}px + var(--spodna-lista, 0px))` }}
      >
        {children}
      </main>

      {footer && (
        <footer
          ref={patka}
          className="sticky border-t border-border/70 bg-card/95 px-4 pt-2 backdrop-blur"
          /*
            Nad spodnou lištou, nie pod ňou — inak ju hlavné tlačidlo prekryje.
            Keď lišta je, `--spodna-lista` už bezpečnú zónu obsahuje a pätka si
            ju nesmie prirátať druhýkrát; obal jej preto `--patka-spodok`
            vynuluje. Bez lišty ostáva pôvodná hodnota.
          */
          style={{
            bottom: "var(--spodna-lista, 0px)",
            paddingBottom: "calc(var(--patka-spodok, var(--safe-bottom)) + 0.5rem)",
          }}
        >
          {footer}
        </footer>
      )}
    </div>
  );
}

/** Veľké tlačidlo — palcom sa musí trafiť na prvý raz. */
export function VelkeTlacidlo({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
  variant = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={variant === "primary" ? { backgroundImage: "var(--brand-gradient)" } : undefined}
      className={`flex w-full items-center gap-3.5 rounded-2xl p-4 text-left transition active:scale-[0.985] disabled:opacity-50 ${
        variant === "primary"
          ? "text-primary-foreground shadow-[var(--shadow-glow)]"
          : "border border-border/70 bg-card shadow-[var(--shadow-card)] active:bg-secondary"
      }`}
    >
      <span
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
          variant === "primary" ? "bg-white/20" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-[22px] w-[22px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-tight">{label}</span>
        {hint && (
          <span
            className={`mt-0.5 block text-[13px] leading-snug ${
              variant === "primary" ? "text-primary-foreground/85" : "text-muted-foreground"
            }`}
          >
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

export function Pracujem({ text }: { text: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        {text}
      </div>
    </div>
  );
}

/** Spodné hlavné tlačidlo — jedno na obrazovku, nedá sa prehliadnuť. */
export function HlavneTlacidlo({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={disabled ? undefined : { backgroundImage: "var(--brand-gradient)" }}
      className={`w-full rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition active:scale-[0.99] ${
        disabled
          ? "bg-secondary text-muted-foreground"
          : "text-primary-foreground shadow-[var(--shadow-glow)]"
      }`}
    >
      {children}
    </button>
  );
}
