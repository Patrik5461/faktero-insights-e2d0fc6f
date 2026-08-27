import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "@/components/faktero/Logo";

/**
 * Bočná navigácia.
 *
 * Nahrádza druhý riadok v hlavičke, kde kategórie žili v rozbaľovacích
 * ponukách. Tie mali dve chyby: človek nikdy nevidel viac než jednu kategóriu
 * naraz, takže si celú štruktúru musel pamätať, a otvorená ponuka prekrývala
 * obsah, kvôli ktorému na stránke bol.
 *
 * Tu je otvorená sekcia **rozbalená na mieste** a ostatné ostávajú viditeľné.
 * Sekcia s otvorenou stránkou sa rozbalí sama — inak by človek po načítaní
 * nevidel, kde stojí.
 *
 * Zbalenie na ikony si pamätá prehliadač; kto pracuje na úzkom monitore, nemá
 * dôvod nastavovať to znova pri každom otvorení.
 */

export type PolozkaPanela = {
  to: string;
  search?: Record<string, string>;
  label: string;
};

export type SekciaPanela = {
  key: string;
  label: string;
  icon: any;
  /** Kam vedie samotná sekcia, keď nemá podpoložky. */
  cesta: string;
  polozky: PolozkaPanela[];
};

const KLUC = "faktero.bocny-panel-zbaleny";

export function jeZbaleny(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KLUC) === "1";
  } catch {
    return false;
  }
}

export function ulozZbalenie(v: boolean): void {
  try {
    localStorage.setItem(KLUC, v ? "1" : "0");
  } catch {
    /* zakázané úložisko nie je dôvod, aby panel prestal fungovať */
  }
}

/**
 * Zoznam sekcií — to isté na počítači aj v mobilnej zásuvke.
 *
 * Zdieľané zámerne: keby mala zásuvka vlastné vykreslenie, jedna z nich by pri
 * ďalšej zmene navigácie zaostala a na telefóne by chýbala položka, o ktorej
 * by nikto nevedel.
 */
export function SekcieNavigacie({
  sekcie,
  aktivnaSekcia,
  aktivnaPolozka,
  zbaleny = false,
  otvorene,
  onPrepni,
  onPrejdi,
}: {
  sekcie: SekciaPanela[];
  aktivnaSekcia: string | null;
  aktivnaPolozka: string | null;
  zbaleny?: boolean;
  otvorene: Set<string>;
  onPrepni: (kluc: string) => void;
  /** Zavretie zásuvky po prechode. Na počítači sa nepoužíva. */
  onPrejdi?: () => void;
}) {
  return (
    <ul className="space-y-0.5">
      {sekcie.map((s) => {
        const aktivna = aktivnaSekcia === s.key;
        const rozbalena = !zbaleny && otvorene.has(s.key);
        const Ikona = s.icon;

        if (s.polozky.length === 0) {
          return (
            <li key={s.key}>
              <Link
                to={s.cesta as any}
                onClick={onPrejdi}
                title={zbaleny ? s.label : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] ${
                  zbaleny ? "justify-center" : ""
                } ${
                  aktivna
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <Ikona className="h-4 w-4 shrink-0" />
                {!zbaleny && <span className="truncate">{s.label}</span>}
              </Link>
            </li>
          );
        }

        return (
          <li key={s.key}>
            <button
              onClick={() => onPrepni(s.key)}
              aria-expanded={rozbalena}
              title={zbaleny ? s.label : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] ${
                zbaleny ? "justify-center" : ""
              } ${
                aktivna
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground/80 hover:bg-secondary"
              }`}
            >
              <Ikona className="h-4 w-4 shrink-0" />
              {!zbaleny && (
                <>
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${
                      rozbalena ? "rotate-180" : ""
                    }`}
                  />
                </>
              )}
            </button>

            {rozbalena && (
              /* Odsadenie nesie zvislá linka — bez nej sa podpoložky opticky
                 miešajú s hlavnými sekciami. */
              <ul className="ml-[19px] mt-0.5 space-y-0.5 border-l border-border pl-2">
                {s.polozky.map((p) => {
                  const je = aktivnaPolozka === p.to + p.label;
                  return (
                    <li key={p.to + p.label}>
                      <Link
                        to={p.to as any}
                        search={p.search as any}
                        onClick={onPrejdi}
                        className={`block truncate rounded-md px-2 py-1.5 text-[13px] ${
                          je
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        {p.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Rozbaľovanie sekcií — spoločný stav pre panel aj zásuvku.
 *
 * Sekcia s otvorenou stránkou sa rozbalí sama; pridáva sa, nenahrádza — kto si
 * rozbalil dve, o druhú prechodom na inú stránku neprišiel.
 */
export function useRozbalene(aktivnaSekcia: string | null) {
  const [otvorene, setOtvorene] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!aktivnaSekcia) return;
    setOtvorene((s) => (s.has(aktivnaSekcia) ? s : new Set([...s, aktivnaSekcia])));
  }, [aktivnaSekcia]);
  function prepni(kluc: string) {
    setOtvorene((s) => {
      const n = new Set(s);
      if (n.has(kluc)) n.delete(kluc);
      else n.add(kluc);
      return n;
    });
  }
  return { otvorene, prepni, setOtvorene };
}

export function BocnyPanel({
  sekcie,
  aktivnaSekcia,
  aktivnaPolozka,
  domov,
  zbaleny,
  onZbal,
  pata,
}: {
  sekcie: SekciaPanela[];
  /** `key` sekcie, v ktorej leží otvorená stránka. */
  aktivnaSekcia: string | null;
  /** Kľúč otvorenej podpoložky (`to + label`) — rozlíši tie s parametrami. */
  aktivnaPolozka: string | null;
  domov: string;
  zbaleny: boolean;
  onZbal: (v: boolean) => void;
  /** Prepínač produktu a čokoľvek, čo patrí na dno panela. */
  pata?: React.ReactNode;
}) {
  const { otvorene, prepni: prepniOtvorene, setOtvorene } = useRozbalene(aktivnaSekcia);

  function prepni(kluc: string) {
    // V zbalenom stave nie je kam rozbaliť — panel sa najprv roztiahne.
    if (zbaleny) {
      onZbal(false);
      setOtvorene((s) => new Set([...s, kluc]));
      return;
    }
    prepniOtvorene(kluc);
  }

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card lg:flex ${
        zbaleny ? "w-16" : "w-[220px]"
      }`}
    >
      <div
        className={`flex h-14 shrink-0 items-center gap-2 border-b border-border ${
          zbaleny ? "justify-center px-2" : "px-3"
        }`}
      >
        <Link to={domov as any} aria-label="Faktero" className="flex min-w-0 items-center">
          {zbaleny ? <Logo variant="icon" className="h-7 w-7" /> : <Logo className="h-7" />}
        </Link>
        {!zbaleny && (
          <button
            onClick={() => onZbal(true)}
            aria-label="Zbaliť panel"
            title="Zbaliť panel"
            className="ml-auto grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <SekcieNavigacie
          sekcie={sekcie}
          aktivnaSekcia={aktivnaSekcia}
          aktivnaPolozka={aktivnaPolozka}
          zbaleny={zbaleny}
          otvorene={otvorene}
          onPrepni={prepni}
        />
      </nav>

      <div className="shrink-0 border-t border-border p-2">
        {pata}
        {zbaleny && (
          <button
            onClick={() => onZbal(false)}
            aria-label="Rozbaliť panel"
            title="Rozbaliť panel"
            className="mt-1 grid h-8 w-full place-items-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
