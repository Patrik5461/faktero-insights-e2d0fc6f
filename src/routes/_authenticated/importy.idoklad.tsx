import { createFileRoute } from "@tanstack/react-router";
import { VendorImportPage } from "@/components/faktero/VendorImportPage";

export const Route = createFileRoute("/_authenticated/importy/idoklad")({
  head: () => ({ meta: [{ title: "Import z iDoklad — Faktero" }] }),
  component: () => (
    <VendorImportPage
      source="idoklad"
      title="Import z iDoklad"
      description="Naimportujte faktúry a odberateľov z CSV exportu z iDoklad."
      accept=".csv"
      guide={
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            Prihláste sa do iDoklad a otvorte <strong>Faktúry → Vydané faktúry</strong>.
          </li>
          <li>
            Kliknite na <strong>Export → CSV</strong> a zvoľte obdobie.
          </li>
          <li>
            Stiahnutý súbor <code>.csv</code> nahrajte nižšie.
          </li>
          <li>
            Alternatívne môžete exportovať aj odberateľov cez <strong>Kontakty → Export</strong>.
          </li>
        </ol>
      }
    />
  ),
});
