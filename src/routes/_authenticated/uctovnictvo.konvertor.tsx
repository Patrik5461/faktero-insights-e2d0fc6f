import { createFileRoute, redirect } from "@tanstack/react-router";
import { presmerovanieKonvertora } from "@/lib/faktero/stare-adresy-uctovnictva";

/** Stará adresa Konvertora Excel → Pohoda — teraz záložka stránky Konvertory. */
export const Route = createFileRoute("/_authenticated/uctovnictvo/konvertor")({
  beforeLoad: ({ search }) => {
    throw redirect({
      ...presmerovanieKonvertora("konvertor", search as Record<string, unknown>),
      replace: true,
    } as never);
  },
});
