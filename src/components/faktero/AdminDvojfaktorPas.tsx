import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_2FA_POVINNE_OD, dniDoPovinnosti } from "@/lib/faktero/admin-dvojfaktor";
import { useT } from "@/lib/i18n/useT";

/**
 * Výrazné upozornenie v /admin pre administrátora bez dvojfaktorového
 * overenia — od ADMIN_2FA_POVINNE_OD ho /admin bez aal2 nepustí.
 */
export function AdminDvojfaktorPas() {
  const { t } = useT();
  const [bez2fa, setBez2fa] = useState(false);
  useEffect(() => {
    let zive = true;
    void supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data }) => {
        if (zive) setBez2fa(!!data && data.currentLevel !== "aal2");
      })
      .catch(() => {});
    return () => {
      zive = false;
    };
  }, []);
  if (!bez2fa) return null;
  const dni = dniDoPovinnosti();
  const datum = new Date(ADMIN_2FA_POVINNE_OD).toLocaleDateString("sk-SK");
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-950 sm:px-6 lg:px-8 dark:text-amber-100"
    >
      <ShieldAlert className="h-5 w-5 shrink-0" />
      <p className="min-w-0 flex-1">
        <strong>{t("Zapnite si dvojfaktorové overenie.")}</strong>{" "}
        {t("Od {datum} bude administrácia prístupná len s kódom z overovacej appky", { datum })}
        {dni > 0 ? ` (${t("zostáva {dni} d.", { dni })})` : ""}.
      </p>
      <Link
        to="/nastavenia/zabezpecenie"
        search={{ admin: 1 }}
        className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
      >
        {t("Zapnúť 2FA")}
      </Link>
    </div>
  );
}
