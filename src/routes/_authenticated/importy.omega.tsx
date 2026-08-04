import { createFileRoute } from "@tanstack/react-router";
import { VendorImportPage } from "@/components/faktero/VendorImportPage";

export const Route = createFileRoute("/_authenticated/importy/omega")({
  head: () => ({ meta: [{ title: "Import z Omega — Faktero" }] }),
  component: () => (
    <VendorImportPage
      source="omega"
      title="Import z Omega (KROS)"
      description="Naimportujte faktúry a odberateľov z CSV alebo XML exportu z KROS Omega."
      accept=".csv,.xml"
      guide={
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            V Omega otvorte <strong>Evidencia → Vydané faktúry</strong> (alebo Kniha odoslaných FA).
          </li>
          <li>
            Zvoľte <strong>Súbor → Export → CSV</strong> (odporúčané) alebo <strong>XML</strong>.
          </li>
          <li>
            Nastavte kódovanie na <strong>Windows-1250</strong> alebo <strong>UTF-8</strong> — obe
            zvládneme.
          </li>
          <li>Súbor nahrajte nižšie.</li>
        </ol>
      }
    />
  ),
});
