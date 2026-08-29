/**
 * Vstup do mobilných aplikácií — prihlásenie, zámok a výber firmy.
 *
 * Tri obrazovky, ktoré stoja pred každou appkou postavenou na tomto kóde:
 * Faktero aj samostatná Kniha jázd. Boli v `MobilApp.tsx`; presunuté sú preto,
 * aby si ich druhá appka nemusela ťahať aj s celou fakturáciou — správanie
 * ostáva to isté, len bývajú inde.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Fingerprint, Lock, LogOut, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isBiometricAvailable, loginWithBiometric, overBiometriu } from "@/lib/mobile/biometric";
import { MobilObrazovka, VelkeTlacidlo } from "@/components/faktero/mobil/MobilChrome";
import { Logo } from "@/components/faktero/Logo";
import { JE_KNIHA_JAZD } from "@/lib/mobile/apka";
import { ZnackaJazd } from "./jazdy/ZnackaJazd";
import { usePreklad } from "@/lib/mobile/preklady/hook";

type Firma = { id: string; name: string };

/* ------------------------- Prihlásenie ------------------------- */

export function Prihlasenie({
  onHotovo,
  onRegistracia,
}: {
  onHotovo: () => void;
  onRegistracia: () => void;
}) {
  const { t } = usePreklad();
  const [email, setEmail] = useState("");
  const [heslo, setHeslo] = useState("");
  const [busy, setBusy] = useState(false);
  const [biometria, setBiometria] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBiometria);
  }, []);

  async function prihlas() {
    if (!email.trim() || !heslo) return toast.error(t("app.vyplnteEmailHeslo"));
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: heslo,
      });
      if (error) throw new Error(error.message);
      onHotovo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.prihlasenieZlyhalo"));
    } finally {
      setBusy(false);
    }
  }

  async function odomkni() {
    const r = await loginWithBiometric();
    if (r.ok) onHotovo();
    else toast.error(r.error ?? "Odomknutie zlyhalo.");
  }

  return (
    <div
      className="flex min-h-[100dvh] flex-col justify-center bg-app-pozadie px-6"
      style={{
        paddingTop: "calc(var(--safe-top) + 2rem)",
        paddingBottom: "calc(var(--safe-bottom) + 2rem)",
      }}
    >
      <div className="mx-auto w-full max-w-sm">
        {JE_KNIHA_JAZD ? (
          <ZnackaJazd className="mb-8" />
        ) : (
          <Logo variant="header" className="mb-8 h-9" />
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{t("app.prihlasenie")}</h1>
        <p className="mt-1 text-sm text-app-text-2">{t("app.prihlasteSa")}</p>

        <div className="mt-6 space-y-3">
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            placeholder={t("app.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-app-sm border border-input bg-app-pozadie px-4 py-3 text-base"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder={t("app.heslo")}
            value={heslo}
            onChange={(e) => setHeslo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && prihlas()}
            className="w-full rounded-app-sm border border-input bg-app-pozadie px-4 py-3 text-base"
          />
          <button
            onClick={prihlas}
            disabled={busy}
            className="w-full rounded-app bg-app-zelena px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {busy ? t("app.prihlasujem") : t("app.prihlasitSa")}
          </button>

          {biometria && (
            <button
              onClick={odomkni}
              className="flex w-full items-center justify-center gap-2 rounded-app-sm border border-app-ramik px-4 py-3 text-base"
            >
              <Fingerprint className="h-5 w-5" /> {t("app.odomknutBiometriou")}
            </button>
          )}
        </div>

        <button
          onClick={onRegistracia}
          className="mt-6 w-full py-2 text-center text-sm text-app-text-2"
        >
          {t("app.nemateUcet")}{" "}
          <span className="font-medium text-app-zelena">{t("app.zaregistrujteSa")}</span>
        </button>
        <p className="mt-2 text-center text-xs text-app-text-2">{t("app.zabudnuteHeslo")}</p>
      </div>
    </div>
  );
}

/* ------------------------- Zámok ------------------------- */

export function Zamok({
  onOdomknute,
  onOdhlasit,
}: {
  onOdomknute: () => void;
  onOdhlasit: () => void;
}) {
  const { t } = usePreklad();
  const [busy, setBusy] = useState(false);

  async function odomkni() {
    setBusy(true);
    const r = await overBiometriu();
    setBusy(false);
    if (r.ok) onOdomknute();
    else toast.error(r.error ?? "Odomknutie zlyhalo.");
  }

  /* Pýtame sa hneď — ďalšie ťuknutie navyše nikoho nechráni. */
  useEffect(() => {
    odomkni();
    // eslint-disable-next-line
  }, []);

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-app-pozadie px-8"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="grid h-20 w-20 place-items-center rounded-3xl bg-primary/10 text-app-zelena">
        <Lock className="h-9 w-9" />
      </div>
      <div className="text-center">
        <p className="text-[17px] font-semibold">{t("app.zamknute")}</p>
        <p className="mt-1 text-[14px] text-app-text-2">{t("app.odomknitePokracujte")}</p>
      </div>
      <button
        onClick={odomkni}
        disabled={busy}
        className="w-full max-w-xs rounded-app bg-app-zelena px-4 py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {busy ? t("app.odomykam") : t("app.odomknut")}
      </button>
      <button onClick={onOdhlasit} className="text-[14px] text-app-text-2">
        {t("panel.odhlasit")}
      </button>
    </div>
  );
}

/* ------------------------- Výber firmy ------------------------- */

export function VyberFirmy({
  firmy,
  onVyber,
  onOdhlasit,
  poznamka,
  onDiagnostika,
  onNovaFirma,
  firmaSaNeda,
}: {
  firmy: Firma[];
  onVyber: (f: Firma) => void;
  onOdhlasit: () => void;
  /** Prečo je zoznam prázdny — bez toho by appka tvrdila nepravdu. */
  poznamka?: string | null;
  onDiagnostika?: () => void;
  onNovaFirma?: () => void;
  /** Zoznam sa nenačítal, takže o firmách nevieme nič — zakladať sa nedá. */
  firmaSaNeda?: boolean;
}) {
  const { t } = usePreklad();
  return (
    <MobilObrazovka title={t("app.vyberteFirmu")} subtitle={t("app.doVybranejFirmy")}>
      {firmy.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-app-text-2">{poznamka ?? t("app.bezFirmy")}</p>
          {onNovaFirma && !firmaSaNeda && (
            <VelkeTlacidlo
              icon={Plus}
              variant="primary"
              label={t("vf.vytvoritFirmu")}
              hint={t("app.staciNazov")}
              onClick={onNovaFirma}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {firmy.map((f) => (
            <VelkeTlacidlo key={f.id} icon={Building2} label={f.name} onClick={() => onVyber(f)} />
          ))}
          {onNovaFirma && !firmaSaNeda && (
            <button
              onClick={onNovaFirma}
              className="flex w-full items-center justify-center gap-2 rounded-app border border-dashed border-app-ramik px-4 py-3.5 text-[14px] text-app-text-2"
            >
              <Plus className="h-4 w-4" /> {t("app.pridatDalsiuFirmu")}
            </button>
          )}
        </div>
      )}
      <button
        onClick={onOdhlasit}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-app-sm border border-app-ramik px-4 py-3 text-sm text-app-text-2"
      >
        <LogOut className="h-4 w-4" /> {t("panel.odhlasit")}
      </button>
      {onDiagnostika && (
        // Práve tu sa človek zasekne, keď sa zoznam nenačíta — nech má odkiaľ
        // zistiť prečo, bez pripájania telefónu k počítaču.
        <button
          onClick={onDiagnostika}
          className="mt-2 w-full py-2 text-center text-[13px] text-app-text-2 underline"
        >
          {t("app.diagnostika")}
        </button>
      )}
    </MobilObrazovka>
  );
}
