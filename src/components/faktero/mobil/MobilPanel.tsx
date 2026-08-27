import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  BookOpen,
  ChevronRight,
  FileText,
  Fingerprint,
  Globe,
  LayoutGrid,
  LogOut,
  Receipt,
  ShieldCheck,
  X,
  Stethoscope,
  Bug,
  FileSignature,
} from "lucide-react";
import {
  disableBiometric,
  enableBiometric,
  isBiometricAvailable,
  isBiometricEnabled,
} from "@/lib/mobile/biometric";
import { VERZIA_APKY, ZELENA_DOLE, ZELENA_HORE } from "@/lib/mobile/brand";
import { mojaPeciatka } from "@/lib/mobile/verzia";
import { AppHeader } from "@/components/faktero/mobil/MobilChrome";
import { NahlasitChybu } from "@/components/faktero/NahlasitChybu";

/**
 * Vysúvací panel s nastaveniami.
 *
 * Odhlásenie ani nastavenia nemajú čo zaberať miesto v hornej lište — používajú
 * sa raz za čas, kým skenovanie je každodenné. Panel sa otvorí ťuknutím alebo
 * potiahnutím od ľavého okraja.
 */

type Firma = { id: string; name: string };

export function MobilPanel({
  otvoreny,
  onZavri,
  email,
  firma,
  viacFiriem,
  onZmenitFirmu,
  onPrehlad,
  onDoklady,
  onFaktury,
  onPonuky,
  onUcet,
  onOdhlasit,
}: {
  otvoreny: boolean;
  onZavri: () => void;
  email: string | null;
  firma: Firma | null;
  viacFiriem: boolean;
  onZmenitFirmu: () => void;
  /** Pôvodná domovská obrazovka. V skener-first režime sa na ňu chodí odtiaľto. */
  onPrehlad?: () => void;
  onDoklady: () => void;
  onFaktury: () => void;
  /** Cenové ponuky. Nie sú v spodnej lište — tá má päť agend a je plná. */
  onPonuky?: () => void;
  onUcet: () => void;
  onOdhlasit: () => void;
}) {
  /* Okno na nahlásenie chyby — otvára sa z tohto panela. */
  const [nahlasenie, setNahlasenie] = useState(false);
  const [biometriaMozna, setBiometriaMozna] = useState(false);
  const [biometriaZapnuta, setBiometriaZapnuta] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!otvoreny) return;
    isBiometricAvailable().then(setBiometriaMozna);
    isBiometricEnabled().then(setBiometriaZapnuta);
  }, [otvoreny]);

  /* Zatvorenie potiahnutím doľava — panel sa otvára gestom, nech sa ním aj zatvára. */
  const start = useRef<number | null>(null);
  const [posun, setPosun] = useState(0);
  const [pusta, setPusta] = useState(true);

  useEffect(() => {
    if (!otvoreny) {
      setPosun(0);
      setPusta(true);
    }
  }, [otvoreny]);

  async function prepniBiometriu() {
    setBusy(true);
    try {
      if (biometriaZapnuta) {
        await disableBiometric();
        setBiometriaZapnuta(false);
        toast.success("Rýchle prihlásenie vypnuté");
      } else {
        const r = await enableBiometric();
        if (!r.ok) throw new Error(r.error ?? "Nepodarilo sa zapnúť");
        setBiometriaZapnuta(true);
        toast.success("Rýchle prihlásenie zapnuté");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Zmena zlyhala");
    } finally {
      setBusy(false);
    }
  }

  /** Návody sú na webe — otvárajú sa mimo appky, nech sa v nich človek nestratí. */
  function otvorNaWebe(cesta: string) {
    window.open(`https://www.faktero.sk${cesta}`, "_blank", "noopener");
  }

  return (
    <>
      <div
        onClick={onZavri}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          otvoreny ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-label="Panel nastavení"
        onTouchStart={(e) => {
          start.current = e.touches[0]?.clientX ?? null;
          setPusta(false);
        }}
        onTouchMove={(e) => {
          if (start.current == null) return;
          const dx = (e.touches[0]?.clientX ?? 0) - start.current;
          if (dx < 0) setPosun(dx);
        }}
        onTouchEnd={() => {
          start.current = null;
          setPusta(true);
          if (posun < -60) onZavri();
          else setPosun(0);
        }}
        className="fixed inset-y-0 left-0 z-50 flex w-[84%] max-w-sm flex-col bg-card shadow-2xl"
        style={{
          transform: otvoreny ? `translateX(${posun}px)` : `translateX(-100%)`,
          transition: pusta ? "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)" : undefined,
        }}
      >
        <AppHeader
          title={email ?? "—"}
          subtitle="Prihlásený ako"
          right={
            <button
              onClick={onZavri}
              aria-label="Zavrieť"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-white/20"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          }
          pod={
            /*
              Presvetlenie smerom dole je až pod lištou — rovnako ako na domove.
              Keby prechod začínal hore, v oblasti výrezu by bol o odtieň
              svetlejší pruh než spoločný pás nad ním a predel by bolo vidieť.
            */
            <div
              className="px-4 pb-5 pt-1"
              style={{
                backgroundImage: `linear-gradient(180deg, ${ZELENA_HORE} 0%, ${ZELENA_HORE} 30%, ${ZELENA_DOLE} 100%)`,
              }}
            >
              <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2.5 text-white">
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                  {firma?.name ?? "Bez firmy"}
                </span>
              </div>
            </div>
          }
        />

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <Skupina nazov="Firma" />
          {viacFiriem && (
            <Polozka
              icon={Building2}
              label="Zmeniť firmu"
              onClick={() => {
                onZavri();
                onZmenitFirmu();
              }}
            />
          )}
          <Polozka
            icon={FileText}
            label="Vystavené faktúry"
            onClick={() => {
              onZavri();
              onFaktury();
            }}
          />
          {onPonuky && (
            <Polozka
              icon={FileSignature}
              label="Cenové ponuky"
              onClick={() => {
                onZavri();
                onPonuky();
              }}
            />
          )}
          <Polozka
            icon={Receipt}
            label="Prijaté doklady"
            onClick={() => {
              onZavri();
              onDoklady();
            }}
          />

          <Skupina nazov="Nastavenia" />
          {biometriaMozna ? (
            <button
              onClick={prepniBiometriu}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-secondary disabled:opacity-60"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Fingerprint className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">Prihlásenie biometriou</span>
                <span className="block text-[13px] text-muted-foreground">
                  {biometriaZapnuta ? "Pýta sa pri spustení appky" : "Vypnuté"}
                </span>
              </span>
              {/* Prepínač: stav musí byť vidieť na prvý pohľad, nie až po ťuknutí. */}
              <span
                className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                  biometriaZapnuta ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    biometriaZapnuta ? "translate-x-5" : ""
                  }`}
                />
              </span>
            </button>
          ) : (
            <p className="px-3 py-2 text-[13px] text-muted-foreground">
              Biometria na tomto zariadení nie je dostupná.
            </p>
          )}

          {/*
            Prehľad agend, ktorý bol pred skener-first režimom úvodnou
            obrazovkou. Ostáva dostupný — sú v ňom veci, ktoré sa do piatich
            záložiek nezmestili, a nikto neprišiel o cestu, na ktorú bol zvyknutý.
          */}
          {onPrehlad && (
            <Polozka
              icon={LayoutGrid}
              label="Prehľad agend"
              hint="Všetko, čo appka vie, na jednej obrazovke"
              /* Zatvoriť treba rovnako ako pri ostatných položkách. Bez toho
                 ostal panel otvorený nad obrazovkou, na ktorú človek práve
                 ťukol — a vyzeralo to, že sa nestalo nič. */
              onClick={() => {
                onZavri();
                onPrehlad();
              }}
            />
          )}

          <Skupina nazov="Pomoc" />
          {/*
            Jedna položka, nie dve. „Účet a diagnostika" a „Zrušenie účtu" viedli
            na tú istú obrazovku, takže panel ponúkal tú istú vec dvakrát — a
            diagnostiku, ktorá je potrebná práve keď sa niečo pokazí, nikto pod
            zrušením účtu hľadať nebude. Zrušenie účtu musí ostať dostupné
            z appky kvôli pravidlám App Store; je na tej obrazovke a spomína ho
            aj popis, aby sa dalo nájsť.
          */}
          <Polozka
            icon={Stethoscope}
            label="Nastavenie aplikácie"
            hint="Účet a jeho zrušenie, pamäť, pripojenie, verzia"
            onClick={onUcet}
          />
          <Polozka
            icon={BookOpen}
            label="Návody k Fakteru"
            hint="Otvorí sa v prehliadači"
            onClick={() => otvorNaWebe("/pomoc")}
          />
          <Polozka
            icon={Receipt}
            label="Bločky a pokladňa"
            hint="Ako sa čítajú doklady z eKasy"
            onClick={() => otvorNaWebe("/pomoc/pokladna")}
          />
          {/* Nahlásiť sa dá aj z telefónu — chyba sa nájde najčastejšie tam. */}
          <Polozka
            icon={Bug}
            label="Nahlásiť chybu alebo návrh"
            hint="Napíšte nám, čo nefunguje alebo čo by pomohlo"
            onClick={() => setNahlasenie(true)}
          />
          <Polozka
            icon={Globe}
            label="Otvoriť Faktero na webe"
            hint="Faktúry, sklad a zvyšok aplikácie"
            onClick={() => otvorNaWebe("/dashboard")}
          />

          {/*
            Jeden odkaz namiesto dvoch. App Store vyžaduje, aby sa k podmienkam
            a k ochrane údajov dalo dostať priamo z appky — prehľad na webe ich
            má všetky, vrátane tých, ktoré sa sem nezmestili (reklamačný
            poriadok, cookies, opakované platby).
          */}
          <Polozka
            icon={ShieldCheck}
            label="Právne dokumenty"
            hint="Podmienky, ochrana údajov a ostatné — otvorí sa v prehliadači"
            onClick={() => otvorNaWebe("/pravne")}
          />
        </nav>

        {/*
          Pätička je zámerne nízka. Odhlásenie je vec, ktorú človek spraví raz
          za čas — nepotrebuje rovnako veľký riadok ako agendy, do ktorých
          chodí denne, a spolu s verziou zaberalo celé dno panela.
        */}
        <div
          className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2"
          style={{ paddingBottom: "calc(var(--safe-bottom) + 0.5rem)" }}
        >
          <button
            onClick={onOdhlasit}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-destructive active:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-[13px] font-medium">Odhlásiť sa</span>
          </button>

          {/* Pečiatka balíčka je jediné, čím sa dva buildy rozoznajú — číslo
              verzie sa medzi nimi nemení. Bez nej sa človek nemá ako spýtať
              „mám už tú opravu?" inak než hľadaním v Diagnostike. Na jednom
              riadku vedľa odhlásenia, nie pod ním. */}
          <p className="truncate text-right text-[11px] leading-4 text-muted-foreground">
            v{VERZIA_APKY}
            {mojaPeciatka() ? <span className="ml-1">· {mojaPeciatka()}</span> : null}
          </p>
        </div>
      </aside>

      <NahlasitChybu otvorene={nahlasenie} onZavri={() => setNahlasenie(false)} />
    </>
  );
}

function Skupina({ nazov }: { nazov: string }) {
  return (
    <p className="px-3 pb-1 pt-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
      {nazov}
    </p>
  );
}

function Polozka({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-secondary"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
