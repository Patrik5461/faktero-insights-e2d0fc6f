import { createFileRoute } from "@tanstack/react-router";
import { VendorImportPage } from "@/components/faktero/VendorImportPage";
import { zdrojPodlaId } from "@/components/faktero/import-zdroje";

/* Priama adresa na jeden systém. Menu ponúka spoločnú stránku „Účtovné
   importy"; tento odkaz ostáva, aby staršie preklikanie a manuál fungovali. */
const z = zdrojPodlaId("money-s3");

export const Route = createFileRoute("/_authenticated/importy/money-s3")({
  head: () => ({ meta: [{ title: "Import z Money S3 — Faktero" }] }),
  component: () => (
    <VendorImportPage
      source="money-s3"
      title={z.title}
      description={z.description}
      accept={z.accept!}
      guide={z.guide}
    />
  ),
});
