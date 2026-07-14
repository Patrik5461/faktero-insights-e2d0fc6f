import { createFileRoute } from "@tanstack/react-router";
import { VendorImportPage } from "@/components/faktero/VendorImportPage";

export const Route = createFileRoute("/_authenticated/importy/kros")({
  head: () => ({ meta: [{ title: "Import z KROS — Faktero" }] }),
  component: () => (
    <VendorImportPage
      source="kros"
      title="Import z KROS (Alfa plus / Omega)"
      description="Naimportujte faktúry a odberateľov z XML alebo CSV exportu z KROS."
      accept=".xml,.csv"
      guide={
        <ol className="ml-4 list-decimal space-y-1">
          <li>V KROS Alfa/Omega otvorte <strong>Vydané faktúry</strong>.</li>
          <li>Zvoľte <strong>Export → XML</strong> (odporúčané pre kompletné dáta) alebo <strong>CSV</strong>.</li>
          <li>Nastavte rozsah období a potvrďte.</li>
          <li>Súbor nahrajte nižšie — automaticky rozpoznáme štruktúru.</li>
        </ol>
      }
    />
  ),
});
