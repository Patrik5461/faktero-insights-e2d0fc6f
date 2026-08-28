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
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import {
  disableBiometric,
  enableBiometric,
  isBiometricAvailable,
  isBiometricEnabled,
} from "@/lib/mobile/biometric";
import { VERZIA_APKY } from "@/lib/mobile/brand";
import { mojaPeciatka } from "@/lib/mobile/verzia";
import { AppHeader } from "@/components/faktero/mobil/MobilChrome";
import { NahlasitChybu } from "@/components/faktero/NahlasitChybu";

import { usePreklad } from "@/lib/mobile/preklady/hook";
import { JAZYKY } from "@/lib/mobile/jazyk";
import {
  VYCHODZI_APKA,
  nacitajMotiv,
  ulozMotiv,
  type Motiv,
} from "@/lib/faktero/motiv";
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
  /* Nepovinné: appka Kniha jázd panel používa tiež, ale fakturáciu v sebe nemá. */
  onDoklady?: () => void;
  onFaktury?: () => void;
  /** Cenové ponuky. Nie sú v spodnej lište — tá má päť agend a je plná. */
  onPonuky?: () => void;
  onUcet: () => void;
  onOdhlasit: () => void;
}) {
  const { t, jazyk, nastavJazyk } = usePreklad();
  /* Okno na nahlásenie chyby — otvára sa z tohto panela. */
  const [nahlasenie, setNahlasenie] = useState(false);
  /* Voľba sa číta až v efekte — na serveri `localStorage` neexistuje. */
  const [motiv, setMotiv] = useState<Motiv>(VYCHODZI_APKA);
  useEffect(() => setMotiv(nacitajMotiv(VYCHODZI_APKA)), []);
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
        toast.success(t("panel.rychleVypnute"));
      } else {
        const r = await enableBiometric();
        if (!r.ok) throw new Error(r.error ?? t("panel.nepodariloZapnut"));
        setBiometriaZapnuta(true);
        toast.success(t("panel.rychleZapnute"));
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
        aria-label={t("panel.nadpis")}
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
        className="fixed inset-y-0 left-0 z-50 flex w-[84%] max-w-sm flex-col bg-app-karta shadow-2xl"
        style={{
          transform: otvoreny ? `translateX(${posun}px)` : `translateX(-100%)`,
          transition: pusta ? "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)" : undefined,
        }}
      >
        <AppHeader
          title={email ?? "—"}
          subtitle={t("panel.prihlasenyAko")}
          right={
            <button
              onClick={onZavri}
              aria-label={t("panel.zavriet")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-app-ramik"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          }
          pod={
            <div className="px-4 pb-3 pt-1">
              <div className="flex items-center gap-2 rounded-app-sm border border-app-ramik bg-app-karta px-3 py-2.5">
                <Building2 className="h-4 w-4 shrink-0 text-app-text-2" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-app-text">
                  {firma?.name ?? t("panel.bezFirmy")}
                </span>
              </div>
            </div>
          }
        />

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <Skupina nazov={t("panel.firma")} />
          {viacFiriem && (
            <Polozka
              icon={Building2}
              label={t("panel.zmenitFirmu")}
              onClick={() => {
                onZavri();
                onZmenitFirmu();
              }}
            />
          )}
          {onFaktury && (
            <Polozka
              icon={FileText}
              label={t("panel.vystaveneFaktury")}
              onClick={() => {
                onZavri();
                onFaktury();
              }}
            />
          )}
          {onPonuky && (
            <Polozka
              icon={FileSignature}
              label={t("panel.cenovePonuky")}
              onClick={() => {
                onZavri();
                onPonuky();
              }}
            />
          )}
          {onDoklady && (
            <Polozka
              icon={Receipt}
              label={t("panel.prijateDoklady")}
              onClick={() => {
                onZavri();
                onDoklady();
              }}
            />
          )}

          <Skupina nazov={t("panel.nastavenia")} />
          {biometriaMozna ? (
            <button
              onClick={prepniBiometriu}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-app-sm px-3 py-3 text-left active:bg-secondary disabled:opacity-60"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-app-sm bg-app-zelena-jemna text-app-zelena">
                <Fingerprint className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{t("panel.biometria")}</span>
                <span className="block text-[13px] text-app-text-2">
                  {biometriaZapnuta ? t("panel.biometriaZapnuta") : t("panel.biometriaVypnuta")}
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
            <p className="px-3 py-2 text-[13px] text-app-text-2">
              {t("panel.biometriaNedostupna")}
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
              label={t("panel.prehladAgend")}
              hint={t("panel.vsetkoNaJednej")}
              /* Zatvoriť treba rovnako ako pri ostatných položkách. Bez toho
                 ostal panel otvorený nad obrazovkou, na ktorú človek práve
                 ťukol — a vyzeralo to, že sa nestalo nič. */
              onClick={() => {
                onZavri();
                onPrehlad();
              }}
            />
          )}

          <Skupina nazov={t("panel.pomoc")} />
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
            label={t("panel.nastavenieAplikacie")}
            hint={t("panel.ucetPamat")}
            onClick={onUcet}
          />
          <Polozka
            icon={BookOpen}
            label={t("panel.navody")}
            hint={t("panel.otvoriVPrehliadaci")}
            onClick={() => otvorNaWebe("/pomoc")}
          />
          <Polozka
            icon={Receipt}
            label={t("panel.blocky")}
            hint={t("panel.ekasaPopis")}
            onClick={() => otvorNaWebe("/pomoc/pokladna")}
          />
          {/* Nahlásiť sa dá aj z telefónu — chyba sa nájde najčastejšie tam. */}
          <Polozka
            icon={Bug}
            label={t("panel.nahlasitChybu")}
            hint={t("panel.napisteNam")}
            onClick={() => setNahlasenie(true)}
          />
          <Polozka
            icon={Globe}
            label={t("panel.otvoritNaWebe")}
            hint={t("panel.zvysokAplikacie")}
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
            label={t("panel.pravne")}
            hint={t("panel.pravnePopis")}
            onClick={() => otvorNaWebe("/pravne")}
          />
        </nav>

        {/*
          Vzhľad. Tri možnosti, nie prepínač áno/nie: „podľa systému" musí byť
          voľba, inak sa človeku s nočným režimom appka prepne bez opýtania.
          Predvolený je svetlý — appka je tak navrhnutá.
        */}
        <div className="border-t border-app-ramik px-3 py-2">
          <span className="mb-1 block text-[12px] text-app-text-2">{t("ph.vzhlad")}</span>
          <div role="group" aria-label={t("ph.vzhlad")} className="flex gap-1">
            {(
              [
                ["svetly", "ph.svetly", Sun],
                ["tmavy", "ph.tmavy", Moon],
                ["system", "ph.podlaSystemu", Monitor],
              ] as const
            ).map(([kod, kluc, Ikona]) => {
              const je = motiv === kod;
              return (
                <button
                  key={kod}
                  type="button"
                  aria-pressed={je}
                  onClick={() => {
                    setMotiv(kod);
                    ulozMotiv(kod);
                  }}
                  className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-app-sm border text-[12px] transition ${
                    je
                      ? "border-app-zelena bg-app-zelena-jemna font-medium text-app-zelena"
                      : "border-app-ramik text-app-text-2"
                  }`}
                >
                  <Ikona className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t(kluc)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/*
          Jazyk appky. Hlásenia zo servera ostávajú zatiaľ slovenské — vznikajú
          v spoločnom kóde s webom. Je to vedomý dlh, nie prehliadnutie.
        */}
        <div className="border-t border-app-ramik px-3 py-2">
          <label className="block">
            <span className="mb-1 block text-[12px] text-app-text-2">{t("panel.jazyk")}</span>
            <select
              value={jazyk}
              onChange={(e) => nastavJazyk(e.target.value as (typeof JAZYKY)[number]["kod"])}
              className="min-h-[44px] w-full rounded-app-sm border border-input bg-app-pozadie px-3 text-[15px]"
            >
              {JAZYKY.map((j) => (
                <option key={j.kod} value={j.kod}>
                  {j.nazov}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/*
          Pätička je zámerne nízka. Odhlásenie je vec, ktorú človek spraví raz
          za čas — nepotrebuje rovnako veľký riadok ako agendy, do ktorých
          chodí denne, a spolu s verziou zaberalo celé dno panela.
        */}
        <div
          className="flex items-center justify-between gap-2 border-t border-app-ramik px-3 py-1"
          style={{ paddingBottom: "calc(var(--safe-bottom) + 0.25rem)" }}
        >
          <button
            onClick={onOdhlasit}
            /* Nízke, ale nie neťukateľné: 44 px je najmenší cieľ, ktorý sa dá
               na telefóne trafiť spoľahlivo. Výšku nesie tlačidlo, nie okraje
               pätičky — inak by sa priestor vrátil. */
            className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-app-chyba active:bg-app-chyba-jemna"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-[13px] font-medium">{t("panel.odhlasit")}</span>
          </button>

          {/* Pečiatka balíčka je jediné, čím sa dva buildy rozoznajú — číslo
              verzie sa medzi nimi nemení. Bez nej sa človek nemá ako spýtať
              „mám už tú opravu?" inak než hľadaním v Diagnostike. Na jednom
              riadku vedľa odhlásenia, nie pod ním. */}
          <p className="truncate text-right text-[11px] leading-4 text-app-text-2">
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
    <p className="px-3 pb-1 pt-4 text-[12px] font-semibold uppercase tracking-wide text-app-text-2">
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
      className="flex w-full items-center gap-3 rounded-app-sm px-3 py-3 text-left active:bg-secondary"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-app-sm bg-app-zelena-jemna text-app-zelena">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-app-text-2">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-app-text-2" />
    </button>
  );
}
