import { createFileRoute } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { VendorImportPage } from "@/components/faktero/VendorImportPage";
import { zdrojPodlaId } from "@/components/faktero/import-zdroje";

/* Priama adresa na jeden systém. Menu ponúka spoločnú stránku „Účtovné
   importy"; tento odkaz ostáva, aby staršie preklikanie a manuál fungovali. */
const z = zdrojPodlaId("pohoda");

export const Route = createFileRoute("/_authenticated/importy/pohoda")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Import z Pohody — Faktero") }],
  }),
  component: () => (
    <VendorImportPage
      source="pohoda"
      title={z.title}
      description={z.description}
      accept={z.accept!}
      guide={z.guide}
    />
  ),
});
