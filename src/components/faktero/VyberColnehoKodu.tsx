import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatColnyKod, upravColnyKod } from "@/lib/faktero/colny-kod";

/*
  Výber colného kódu z číselníka kombinovanej nomenklatúry (CN 2026, ~9 800
  kódov). Hľadá sa podľa začiatku čísla („8517“) alebo slov v popise
  („smartfón“, „tyče železo“). Kód sa dá aj priamo napísať — číselník je
  pomôcka, nie zámok.
*/

type Navrh = { kod: string; popis: string };

export function VyberColnehoKodu({
  value,
  onChange,
  disabled,
  className,
  placeholder = "číslo alebo názov tovaru",
  ariaLabel = "Colný kód (KN)",
  autoFocus,
}: {
  value: string | null | undefined;
  onChange: (kod: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(formatColnyKod(value) || String(value ?? ""));
  const [navrhy, setNavrhy] = useState<Navrh[]>([]);
  const [otvorene, setOtvorene] = useState(false);
  const [popis, setPopis] = useState<string | null>(null);
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);
  const koren = useRef<HTMLDivElement | null>(null);
  const pole = useRef<HTMLInputElement | null>(null);
  /*
    Zoznam je `fixed` podľa polohy poľa — položky faktúry sú v posúvateľnej
    tabuľke (overflow), ktorá by absolútne umiestnený zoznam orezala.
  */
  const [poloha, setPoloha] = useState<{ top: number; left: number } | null>(null);
  const otvor = () => {
    const r = pole.current?.getBoundingClientRect();
    if (r)
      setPoloha({
        top: r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - 520)),
      });
    setOtvorene(true);
  };

  // Hodnota zvonka (napr. z cenníka) — text a popis vybraného kódu.
  useEffect(() => {
    const kod = upravColnyKod(value);
    setText(kod ? formatColnyKod(kod) : String(value ?? ""));
    if (!kod || kod.length !== 8) {
      setPopis(null);
      return;
    }
    let zrusene = false;
    supabase
      .from("colne_kody" as any)
      .select("popis_sk")
      .eq("kod", kod)
      .maybeSingle()
      .then(({ data }) => !zrusene && setPopis((data as any)?.popis_sk ?? null));
    return () => {
      zrusene = true;
    };
  }, [value]);

  useEffect(() => {
    const zavri = (e: MouseEvent) => {
      if (koren.current && e.target instanceof Node && !koren.current.contains(e.target))
        setOtvorene(false);
    };
    // Posun stránky zoznam zavrie (stratil by polohu), posun v samotnom zozname nie.
    const priPosune = (e: Event) => {
      // Pri posune okna je cieľom `window`, ktoré nie je uzol.
      if (e.target instanceof Node && koren.current?.contains(e.target)) return;
      setOtvorene(false);
    };
    document.addEventListener("mousedown", zavri);
    window.addEventListener("scroll", priPosune, true);
    window.addEventListener("resize", priPosune);
    return () => {
      document.removeEventListener("mousedown", zavri);
      window.removeEventListener("scroll", priPosune, true);
      window.removeEventListener("resize", priPosune);
    };
  }, []);

  function pis(v: string) {
    setText(v);
    // Holé číslo sa ukladá hneď (aj keď ho číselník nepozná); text len hľadá.
    const kod = upravColnyKod(v);
    if (kod || !v.trim()) onChange(kod ?? "");
    if (casovac.current) clearTimeout(casovac.current);
    const q = v.trim();
    if (q.length < 2) {
      setNavrhy([]);
      return;
    }
    casovac.current = setTimeout(async () => {
      const { data } = await supabase.rpc("hladaj_colne_kody" as any, { q, jazyk: "sk" });
      setNavrhy(((data as any[]) ?? []).slice(0, 30));
      otvor();
    }, 250);
  }

  function vyber(n: Navrh) {
    setText(formatColnyKod(n.kod));
    setPopis(n.popis);
    setOtvorene(false);
    onChange(n.kod);
  }

  return (
    <div ref={koren} className="relative">
      <input
        ref={pole}
        aria-label={ariaLabel}
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => pis(e.target.value)}
        onFocus={() => navrhy.length && otvor()}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOtvorene(false);
          if (e.key === "Enter" && otvorene && navrhy[0]) {
            e.preventDefault();
            vyber(navrhy[0]);
          }
        }}
        placeholder={placeholder}
        title={popis ?? "Kód kombinovanej nomenklatúry — 8 číslic (prvých 6 je HS kód)"}
        className={className}
        autoComplete="off"
      />
      {otvorene && navrhy.length > 0 && (
        <ul
          role="listbox"
          style={poloha ? { position: "fixed", top: poloha.top, left: poloha.left } : undefined}
          className="z-50 max-h-72 w-[min(32rem,90vw)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-xs shadow-lg"
        >
          {navrhy.map((n) => (
            <li key={n.kod}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => vyber(n)}
                className="flex w-full gap-2 rounded px-2 py-1.5 text-left hover:bg-secondary"
              >
                <span className="shrink-0 font-mono tabular-nums text-foreground">
                  {formatColnyKod(n.kod)}
                </span>
                <span className="text-muted-foreground">{n.popis}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {otvorene && text.trim().length >= 2 && navrhy.length === 0 && (
        <div
          style={poloha ? { position: "fixed", top: poloha.top, left: poloha.left } : undefined}
          className="z-50 w-64 rounded-md border border-border bg-popover p-2 text-xs text-muted-foreground shadow-lg"
        >
          Nič sa nenašlo — skúste iné slovo alebo začiatok čísla.
        </div>
      )}
      {popis && (
        <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{popis}</div>
      )}
    </div>
  );
}
