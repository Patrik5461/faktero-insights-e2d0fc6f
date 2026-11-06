import { createFileRoute, redirect } from "@tanstack/react-router";
import { presmerovanieZauctovania } from "@/lib/faktero/stare-adresy-uctovnictva";

/** Stará adresa — obsah je na Automatickom účtovaní (záložka kontrola), parametre idú so sebou. */
export const Route = createFileRoute("/_authenticated/uctovnictvo/na-kontrolu")({
  beforeLoad: ({ search }) => {
    throw redirect({
      ...presmerovanieZauctovania("kontrola", search as Record<string, unknown>),
      replace: true,
    } as never);
  },
});
