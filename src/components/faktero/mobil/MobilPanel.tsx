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
  X,
} from "lucide-react";
import {
  disableBiometric,
  enableBiometric,
  isBiometricAvailable,
  isBiometricEnabled,
} from "@/lib/mobile/biometric";

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
        <div
          className="px-5 pb-5 text-primary-foreground"
          style={{
            backgroundImage: "linear-gradient(180deg, #007e46 0%, #007e46 55%, #0a8f52 100%)",
            paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)",
          }}
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[13px] text-primary-foreground/80">Prihlásený ako</p>
              <p className="mt-0.5 truncate text-[15px] font-semibold">{email ?? "—"}</p>
            </div>
            <button
              onClick={onZavri}
              aria-label="Zavrieť"
              className="-mr-1 rounded-full bg-white/15 p-2 active:bg-white/25"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2.5">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
              {firma?.name ?? "Bez firmy"}
            </span>
          </div>
        </div>

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
                  {biometriaZapnuta ? "Zapnuté" : "Vypnuté"}
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
        </nav>

        <div
          className="border-t border-border/70 px-3 py-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
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

          <p className="pt-2 text-center text-[12px] text-muted-foreground">Faktero V1</p>
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
