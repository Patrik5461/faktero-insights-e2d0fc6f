/*
  Prepínač firiem v hlavičke a v mobilnom menu.

  Účtovná kancelária má vo Fakteri aj stovku firiem. Rozbaľovacie menu s
  abecedným zoznamom sa pri takom počte nedalo používať — hľadanie síce bolo,
  ale šípky z poľa nešli do zoznamu a Enter nerobil nič. Tu je zoznam ako
  „combobox“: píše sa do poľa, šípky posúvajú výber, Enter prepne, Esc zavrie.
  Naposledy použité firmy sú hore, zvyšok abecedne. Esc zatvára okno aj
  mobilné menu cez Radix — nie je to tu.
*/
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, List, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HLADANIE_OD } from "@/lib/faktero/hladanie-firiem";
import { citajPosledneFirmy, zoradFirmy } from "@/lib/faktero/poradie-firiem";
import { popisRoly } from "@/lib/faktero/rola-popis";
import { useT } from "@/lib/i18n/useT";

export type FirmaVPrepinaci = {
  id: string;
  name: string;
  ico?: string | null;
  role: string;
};

const FARBY_AVATARA = [
  "from-emerald-500 to-teal-600",
  "from-emerald-600 to-green-700",
  "from-teal-500 to-emerald-700",
  "from-amber-500 to-orange-600",
  "from-lime-500 to-emerald-600",
  "from-emerald-400 to-cyan-600",
];

/** Stála farba začiatočného písmena podľa názvu firmy. */
export function farbaAvatara(nazov?: string) {
  const s = nazov ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return FARBY_AVATARA[Math.abs(h) % FARBY_AVATARA.length];
}

export function AvatarFirmy({
  nazov,
  className = "h-6 w-6 text-[11px]",
}: {
  nazov?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-md bg-gradient-to-br ${farbaAvatara(nazov)} font-semibold text-white ${className}`}
    >
      {(nazov?.[0] ?? "F").toUpperCase()}
    </span>
  );
}

/**
 * Pole na hľadanie a zoznam firiem s ovládaním z klávesnice. Spoločné pre
 * vyskakovacie okno v hlavičke aj mobilné menu, aby sa nerozišli.
 */
export function ZoznamFiriem({
  companies,
  activeId,
  onVyber,
  autoFocus = false,
  vyskaZoznamu = "max-h-[min(60vh,420px)]",
}: {
  companies: FirmaVPrepinaci[];
  activeId: string | null;
  onVyber: (id: string) => void;
  autoFocus?: boolean;
  vyskaZoznamu?: string;
}) {
  const { t } = useT();
  const [dotaz, setDotaz] = useState("");
  const [index, setIndex] = useState(0);
  const [posledne] = useState(citajPosledneFirmy);
  const zoznamRef = useRef<HTMLDivElement>(null);
  const poleRef = useRef<HTMLInputElement>(null);
  const idZoznamu = useId();
  const sHladanim = companies.length >= HLADANIE_OD;

  const {
    posledne: hore,
    ostatne,
    vsetky,
  } = useMemo(
    () => zoradFirmy(companies, dotaz, activeId, posledne),
    [companies, dotaz, activeId, posledne],
  );

  // Nový dotaz — výber späť na prvú nájdenú firmu.
  useEffect(() => setIndex(0), [dotaz]);

  useEffect(() => {
    if (!autoFocus) return;
    (sHladanim ? poleRef.current : zoznamRef.current)?.focus();
  }, [autoFocus, sHladanim]);

  // Vybraná položka musí ostať na očiach aj pri listovaní šípkami.
  useEffect(() => {
    const el = zoznamRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function naKlavesu(e: KeyboardEvent) {
    const n = vsetky.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (n) setIndex((i) => (i + 1) % n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (n) setIndex((i) => (i - 1 + n) % n);
    } else if (e.key === "Home" && !sHladanim) {
      e.preventDefault();
      setIndex(0);
    } else if (e.key === "End" && !sHladanim) {
      e.preventDefault();
      setIndex(Math.max(0, n - 1));
    } else if (e.key === "PageDown") {
      e.preventDefault();
      if (n) setIndex((i) => Math.min(n - 1, i + 8));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 8));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const f = vsetky[index];
      if (f) onVyber(f.id);
    }
  }

  const idPolozky = (i: number) => `${idZoznamu}-${i}`;

  const polozka = (f: FirmaVPrepinaci, i: number) => {
    const vybrana = i === index;
    const aktivna = f.id === activeId;
    return (
      <div
        key={f.id}
        id={idPolozky(i)}
        role="option"
        aria-selected={vybrana}
        data-index={i}
        onMouseMove={() => i !== index && setIndex(i)}
        // mousedown, aby pole neprišlo o fokus skôr, než sa klik spracuje
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onVyber(f.id)}
        className={`flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${
          vybrana ? "bg-secondary" : ""
        }`}
      >
        <AvatarFirmy nazov={f.name} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${aktivna ? "font-semibold" : "font-medium"}`}>
            {f.name}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {f.ico ? t("IČO {ico}", { ico: f.ico }) : t("Bez IČO")} · {t(popisRoly(f.role))}
          </span>
        </span>
        {aktivna && <Check className="h-4 w-4 shrink-0 text-primary" aria-label={t("Aktívna")} />}
      </div>
    );
  };

  const nadpis = (text: string) => (
    <div
      role="presentation"
      className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
    >
      {text}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col">
      {sHladanim && (
        <div className="relative px-2 pb-1.5 pt-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 mt-[1px] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={poleRef}
            value={dotaz}
            onChange={(e) => setDotaz(e.target.value)}
            onKeyDown={naKlavesu}
            role="combobox"
            aria-expanded="true"
            aria-controls={idZoznamu}
            aria-activedescendant={vsetky.length ? idPolozky(index) : undefined}
            aria-autocomplete="list"
            placeholder={t("Hľadať firmu alebo IČO…")}
            aria-label={t("Hľadať firmu")}
            className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}
      <div
        ref={zoznamRef}
        id={idZoznamu}
        role="listbox"
        aria-label={t("Firmy")}
        tabIndex={sHladanim ? -1 : 0}
        onKeyDown={sHladanim ? undefined : naKlavesu}
        aria-activedescendant={!sHladanim && vsetky.length ? idPolozky(index) : undefined}
        className={`${vyskaZoznamu} overflow-y-auto overscroll-contain px-1 pb-1 outline-none`}
      >
        {vsetky.length === 0 && (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">
            {t("Nič sa nenašlo.")}
          </p>
        )}
        {hore.length > 0 && nadpis(t("Naposledy použité"))}
        {hore.map((f, i) => polozka(f, i))}
        {hore.length > 0 && ostatne.length > 0 && nadpis(t("Ďalšie firmy"))}
        {ostatne.map((f, i) => polozka(f, hore.length + i))}
      </div>
    </div>
  );
}

/** Tlačidlo s menom aktívnej firmy v hlavičke a vyskakovací zoznam. */
export function PrepinacFiriem({
  active,
  companies,
  activeId,
  onChangeCompany,
  onAddCompany,
}: {
  active: FirmaVPrepinaci;
  companies: FirmaVPrepinaci[];
  activeId: string | null;
  onChangeCompany: (id: string) => void;
  onAddCompany: () => void;
}) {
  const { t } = useT();
  const [otvorene, setOtvorene] = useState(false);

  return (
    <Popover open={otvorene} onOpenChange={setOtvorene}>
      <PopoverTrigger
        aria-label={t("Prepnúť firmu, teraz {nazov}", { nazov: active.name })}
        className="hidden min-w-0 items-center gap-1.5 rounded-full border-[0.5px] border-border bg-background py-1 pl-1 pr-2 text-[12px] text-foreground hover:bg-secondary/60 md:inline-flex"
      >
        <AvatarFirmy nazov={active.name} className="h-[17px] w-[17px] rounded-full text-[9px]" />
        <span className="max-w-[160px] truncate font-medium">{active.name}</span>
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={t("Firmy")}
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        // Fokus dostane pole na hľadanie (ZoznamFiriem), nie prvý prvok okna.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {otvorene && (
          <ZoznamFiriem
            companies={companies}
            activeId={activeId}
            autoFocus
            onVyber={(id) => {
              setOtvorene(false);
              if (id !== activeId) onChangeCompany(id);
            }}
          />
        )}
        <div className="flex flex-col border-t border-border p-1">
          {companies.length > 1 && (
            <Link
              to="/firmy"
              onClick={() => setOtvorene(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
            >
              <List className="h-3.5 w-3.5 text-muted-foreground" />
              {t("Všetky firmy ({pocet})", { pocet: companies.length })}
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setOtvorene(false);
              onAddCompany();
            }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" /> {t("Pridať firmu")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
