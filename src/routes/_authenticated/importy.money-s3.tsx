import { createFileRoute } from "@tanstack/react-router";
import { VendorImportPage } from "@/components/faktero/VendorImportPage";

export const Route = createFileRoute("/_authenticated/importy/money-s3")({
  head: () => ({ meta: [{ title: "Import z Money S3 — Faktero" }] }),
  component: () => (
    <VendorImportPage
      source="money-s3"
      title="Import z Money S3"
      description="Naimportujte faktúry a odberateľov z XML exportu Money S3 (Seyfor)."
      accept=".xml"
      guide={
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            V Money S3 otvorte agendu <strong>Faktúry vydané</strong>.
          </li>
          <li>
            Spustite <strong>XML prenosy → Export</strong> a vyberte typ dokladu{" "}
            <em>Faktúry vydané</em>.
          </li>
          <li>
            Zvoľte obdobie a potvrďte export do súboru <code>.xml</code> (dátový balík{" "}
            <code>MoneyData</code>).
          </li>
          <li>
            Súbor nahrajte nižšie. Rovnako sa dajú naimportovať aj <em>Faktúry prijaté</em>.
          </li>
        </ol>
      }
    />
  ),
});
