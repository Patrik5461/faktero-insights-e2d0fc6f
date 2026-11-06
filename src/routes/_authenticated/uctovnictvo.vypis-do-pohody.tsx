import { createFileRoute, redirect } from "@tanstack/react-router";
import { presmerovanieKonvertora } from "@/lib/faktero/stare-adresy-uctovnictva";

/**
 * Stará adresa Bankového výpisu do Pohody — teraz záložka stránky Konvertory;
 * `?zdroj=brana` vedie na záložku Platobná brána → Pohoda.
 */
export const Route = createFileRoute("/_authenticated/uctovnictvo/vypis-do-pohody")({
  beforeLoad: ({ search }) => {
    throw redirect({
      ...presmerovanieKonvertora("vypis", search as Record<string, unknown>),
      replace: true,
    } as never);
  },
});
