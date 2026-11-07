import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "@/components/faktero/Logo";
import { useT } from "@/lib/i18n/useT";

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
  /** Počet, ktorý čaká na vybavenie (napr. nespracované doklady). */
  pocet?: number;
  /** Podsekcia (nadpis nad skupinou položiek) — pozri `NavChild.skupina`. */
  skupina?: string;
};

/**
 * Položky rozdelené na podsekcie v poradí, v akom idú. Podsekcia s jedinou
 * položkou rovnakého mena (Účtovníctvo → Pokladňa) nadpis nedostane — bol by
 * to ten istý text dvakrát pod sebou.
 */
export function podsekciePoloziek<P extends { label: string; skupina?: string }>(
  polozky: P[],
): { nadpis: string | null; polozky: P[] }[] {
  const out: { kluc: string | undefined; nadpis: string | null; polozky: P[] }[] = [];
  for (const p of polozky) {
    const posledna = out[out.length - 1];
    if (posledna && posledna.kluc === p.skupina) posledna.polozky.push(p);
    else out.push({ kluc: p.skupina, nadpis: p.skupina ?? null, polozky: [p] });
  }
  return out.map(({ nadpis, polozky: pp }) => ({
    nadpis: nadpis && !(pp.length === 1 && pp[0]!.label === nadpis) ? nadpis : null,
    polozky: pp,
  }));
}

export type SekciaPanela = {
  key: string;
  label: string;
  icon: any;
  /** Kam vedie samotná sekcia, keď nemá podpoložky. */
  cesta: string;
  polozky: PolozkaPanela[];
  /** Počet pri samotnej sekcii bez podpoložiek (Moje úlohy). */
  pocet?: number;
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
  pas = false,
}: {
  sekcie: SekciaPanela[];
  aktivnaSekcia: string | null;
  aktivnaPolozka: string | null;
  zbaleny?: boolean;
  /**
   * Pás ikon (kompaktné rozloženie): ikona sekcie rovno otvorí jej prvú stránku,
   * podstránky sú vo vodorovnej lište nad obsahom.
   */
  pas?: boolean;
  otvorene: Set<string>;
  onPrepni: (kluc: string) => void;
  /** Zavretie zásuvky po prechode. Na počítači sa nepoužíva. */
  onPrejdi?: () => void;
}) {
  const { t } = useT();
  return (
    <ul className="space-y-0.5">
      {sekcie.map((s) => {
        const aktivna = aktivnaSekcia === s.key;
        const rozbalena = !zbaleny && otvorene.has(s.key);
        const Ikona = s.icon;

        if (pas) {
          const prva = s.polozky[0];
          return (
            <li key={s.key}>
              <Link
                to={(prva?.to ?? s.cesta) as any}
                search={prva?.search as any}
                onClick={onPrejdi}
                title={t(s.label)}
                aria-label={t(s.label)}
                className={`relative mx-auto grid h-11 w-11 place-items-center rounded-xl ${
                  aktivna
                    ? "bg-primary/12 text-primary-hover"
                    : "text-foreground/70 hover:bg-secondary"
                }`}
              >
                <Ikona className="h-5 w-5" />
                {s.pocet ? (
                  <span
                    data-w-pocet
                    className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums"
                    aria-label={t("{n} čaká", { n: s.pocet })}
                  >
                    {s.pocet > 99 ? "99+" : s.pocet}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        }

        if (s.polozky.length === 0) {
          return (
            <li key={s.key}>
              <Link
                to={s.cesta as any}
                onClick={onPrejdi}
                title={zbaleny ? t(s.label) : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] ${
                  zbaleny ? "justify-center" : ""
                } ${
                  aktivna
                    ? "bg-primary/10 font-medium text-primary-hover"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <Ikona className="h-4 w-4 shrink-0" />
                {!zbaleny && <span className="min-w-0 flex-1 truncate">{t(s.label)}</span>}
                {!zbaleny && s.pocet ? (
                  <span
                    data-w-pocet
                    className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold leading-4 text-primary-foreground tabular-nums"
                    aria-label={t("{n} čaká", { n: s.pocet })}
                  >
                    {s.pocet > 99 ? "99+" : s.pocet}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        }

        return (
          <li key={s.key}>
            <button
              onClick={() => onPrepni(s.key)}
              aria-expanded={rozbalena}
              title={zbaleny ? t(s.label) : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] ${
                zbaleny ? "justify-center" : ""
              } ${
                aktivna && rozbalena
                  ? "font-semibold text-foreground hover:bg-secondary [&>svg:first-child]:text-primary"
                  : aktivna
                    ? "bg-primary/10 font-medium text-primary-hover"
                    : "text-foreground/80 hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span className="relative shrink-0">
                <Ikona className="h-4 w-4" />
                {/* Zbalený panel: počet ako bodka s číslom na ikone (eFaktúry na zaevidovanie). */}
                {zbaleny && s.pocet ? (
                  <span
                    data-w-pocet
                    className="absolute -right-2.5 -top-2 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums"
                    aria-label={t("{n} čaká", { n: s.pocet })}
                  >
                    {s.pocet > 99 ? "99+" : s.pocet}
                  </span>
                ) : null}
              </span>
              {!zbaleny && (
                <>
                  <span className="min-w-0 flex-1 truncate">{t(s.label)}</span>
                  {/* Počet sekcie (napr. nezaevidované eFaktúry) — len kým je zbalená;
                      rozbalená ho ukazuje pri svojej položke. */}
                  {!rozbalena && s.pocet ? (
                    <span
                      data-w-pocet
                      className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold leading-4 text-primary-foreground tabular-nums"
                      aria-label={t("{n} čaká", { n: s.pocet })}
                    >
                      {s.pocet > 99 ? "99+" : s.pocet}
                    </span>
                  ) : null}
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
                 miešajú s hlavnými sekciami. Podsekcie (Účtovníctvo) majú
                 nadpis malým písmom a medzeru nad sebou. */
              <ul className="ml-[19px] mt-0.5 space-y-0.5 border-l border-border pl-2">
                {podsekciePoloziek(s.polozky).map((g, gi) => {
                  const maPodsekcie = s.polozky.some((p) => p.skupina);
                  const polozky = g.polozky.map((p) => {
                    const je = aktivnaPolozka === p.to + p.label;
                    return (
                      <li key={p.to + p.label}>
                        <Link
                          to={p.to as any}
                          search={p.search as any}
                          onClick={onPrejdi}
                          aria-current={je ? "page" : undefined}
                          data-w-polozka-menu
                          data-w-aktivna={je ? "" : undefined}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] ${
                            je
                              ? "bg-primary/10 font-semibold text-primary-hover"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`}
                        >
                          <span className="min-w-0 flex-1 leading-snug" title={t(p.label)}>
                            {t(p.label)}
                          </span>
                          {p.pocet ? (
                            <span
                              data-w-pocet
                              className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold leading-4 text-primary-foreground tabular-nums"
                              aria-label={t("{n} čaká", { n: p.pocet })}
                            >
                              {p.pocet > 99 ? "99+" : p.pocet}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  });
                  if (!maPodsekcie) return polozky;
                  return (
                    <li key={`podsekcia-${gi}`} className={gi > 0 ? "pt-2" : undefined}>
                      {g.nadpis && (
                        <div
                          data-w-podsekcia-menu
                          className="px-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {t(g.nadpis)}
                        </div>
                      )}
                      <ul
                        aria-label={g.nadpis ? t(g.nadpis) : undefined}
                        className="space-y-0.5"
                      >
                        {polozky}
                      </ul>
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
  zbaleny: zbalenyVstup,
  onZbal,
  pata,
  pas = false,
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
  /** Kompaktné rozloženie — vždy úzky pás ikon bez rozbaľovania. */
  pas?: boolean;
}) {
  const { t } = useT();
  const zbaleny = pas || zbalenyVstup;
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
      aria-label={t("Hlavné menu")}
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card lg:flex ${
        pas ? "w-[72px]" : zbaleny ? "w-16" : "w-[220px]"
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
        {!zbaleny && !pas && (
          <button
            onClick={() => onZbal(true)}
            aria-label={t("Zbaliť panel")}
            title={t("Zbaliť panel")}
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
          pas={pas}
        />
      </nav>

      <div className="shrink-0 border-t border-border p-2">
        {pata}
        {zbaleny && !pas && (
          <button
            onClick={() => onZbal(false)}
            aria-label={t("Rozbaliť panel")}
            title={t("Rozbaliť panel")}
            className="mt-1 grid h-8 w-full place-items-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
