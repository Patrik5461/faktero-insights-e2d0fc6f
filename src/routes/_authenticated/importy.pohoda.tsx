import { createFileRoute } from "@tanstack/react-router";
import { VendorImportPage } from "@/components/faktero/VendorImportPage";
import { zdrojPodlaId } from "@/components/faktero/import-zdroje";

/* Priama adresa na jeden systém. Menu ponúka spoločnú stránku „Účtovné
   importy"; tento odkaz ostáva, aby staršie preklikanie a manuál fungovali. */
const z = zdrojPodlaId("pohoda");

export const Route = createFileRoute("/_authenticated/importy/pohoda")({
  head: () => ({ meta: [{ title: "Import z Pohody — Faktero" }] }),
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
