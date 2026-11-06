import { createFileRoute } from "@tanstack/react-router";
import { NastaveniaPokladne } from "@/components/faktero/uctovnictvo/NastaveniaPokladne";
import { preloz } from "@/lib/i18n/jazyk";

/** Jediné miesto správy pokladní — pohyby sú na /pokladna. */
export const Route = createFileRoute("/_authenticated/uctovnictvo/pokladne")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Pokladne — Faktero") }],
  }),
  component: NastaveniaPokladne,
});
