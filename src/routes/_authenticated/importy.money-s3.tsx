import { createFileRoute } from "@tanstack/react-router";
import { VendorImportPage } from "@/components/faktero/VendorImportPage";

export const Route = createFileRoute("/_authenticated/importy/money-s3")({
  head: () => ({ meta: [{ title: "Import z Money S3 — Faktero" }] }),
  component: () => (
    <VendorImportPage
      source="money-s3"
      title="Import z Money S3"
      description="Naimportujte faktúry, odberateľov a produkty z XML exportu Stormware Money S3."
      accept=".xml"
      guide={
        <ol className="ml-4 list-decimal space-y-1">
          <li>V Money S3 otvorte agendu <strong>Fakturácia → Vydané faktúry</strong>.</li>
          <li>V menu vyberte <strong>Súbor → Exportovať dáta → XML (MoneyData)</strong>.</li>
          <li>Zvoľte obdobie a potvrďte export do súboru <code>.xml</code>.</li>
          <li>Súbor nahrajte nižšie. Podporujeme aj <em>Prijaté faktúry</em>.</li>
        </ol>
      }
    />
  ),
});
