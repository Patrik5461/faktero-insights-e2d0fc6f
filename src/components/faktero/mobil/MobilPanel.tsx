import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  BookOpen,
  ChevronRight,
  FileText,
  Fingerprint,
  Globe,
  LogOut,
  Receipt,
  ShieldCheck,
  UserX,
  X,
  Stethoscope,
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
  onDoklady,
  onFaktury,
  onUcet,
  onOdhlasit,
}: {
  otvoreny: boolean;
  onZavri: () => void;
  email: string | null;
  firma: Firma | null;
  viacFiriem: boolean;
  onZmenitFirmu: () => void;
  onDoklady: () => void;
  onFaktury: () => void;
  onUcet: () => void;
  onOdhlasit: () => void;
}) {
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

          <Skupina nazov="Pomoc" />
          {/*
            Diagnostika sa dovtedy dala otvoriť len cez položku „Zrušenie účtu",
            lebo obidve vedú na tú istú obrazovku. Keď sa niečo pokazí, nikto ju
            tam hľadať nebude — a práve vtedy je potrebná.
          */}
          <Polozka
            icon={Stethoscope}
            label="Účet a diagnostika"
            hint="Čo appka v telefóne vidí — pamäť, pripojenie, verzia"
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
          <Polozka
            icon={Globe}
            label="Otvoriť Faktero na webe"
            hint="Faktúry, sklad a zvyšok aplikácie"
            onClick={() => otvorNaWebe("/dashboard")}
          />

          {/* App Store vyžaduje, aby sa účet dal zrušiť z appky, nie len mailom na podporu. */}
          <Polozka
            icon={UserX}
            label="Zrušenie účtu"
            hint="S 14-dňovým odkladom, dá sa odvolať"
            onClick={onUcet}
          />

          {/* App Store vyžaduje, aby sa k podmienkam a k ochrane údajov dalo dostať priamo z appky. */}
          <Skupina nazov="Právne" />
          <Polozka
            icon={ShieldCheck}
            label="Ochrana osobných údajov"
            onClick={() => otvorNaWebe("/pravne/gdpr")}
          />
          <Polozka
            icon={FileText}
            label="Obchodné podmienky"
            onClick={() => otvorNaWebe("/pravne/obchodne-podmienky")}
          />
        </nav>

        <div
          className="border-t border-border/70 px-3 py-3"
          style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
        >
          <button
            onClick={onOdhlasit}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-destructive active:bg-destructive/10"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive/10">
              <LogOut className="h-[18px] w-[18px]" />
            </span>
            <span className="text-[15px] font-medium">Odhlásiť sa</span>
          </button>

          {/* Pečiatka balíčka je jediné, čím sa dva buildy rozoznajú — číslo
              verzie sa medzi nimi nemení. Bez nej sa človek nemá ako spýtať
              „mám už tú opravu?" inak než hľadaním v Diagnostike. */}
          <p className="pt-2 text-center text-[12px] leading-5 text-muted-foreground">
            Faktero v{VERZIA_APKY}
            {mojaPeciatka() ? (
              <>
                <br />
                <span className="text-[11px]">balíček {mojaPeciatka()}</span>
              </>
            ) : null}
          </p>
        </div>
      </aside>
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
