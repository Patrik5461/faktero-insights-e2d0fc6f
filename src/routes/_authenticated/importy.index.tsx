import { createFileRoute, redirect } from "@tanstack/react-router";
import { presmerovanieImportov } from "@/lib/faktero/stare-adresy-uctovnictva";

/** Stará História importov — je teraz záložkou na `/importy/novy?tab=historia`. */
export const Route = createFileRoute("/_authenticated/importy/")({
  beforeLoad: ({ search }) => {
    throw redirect({
      ...presmerovanieImportov(search as Record<string, unknown>),
      replace: true,
    } as never);
  },
});
