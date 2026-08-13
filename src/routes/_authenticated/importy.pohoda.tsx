import { createFileRoute } from "@tanstack/react-router";
import { VendorImportPage } from "@/components/faktero/VendorImportPage";

export const Route = createFileRoute("/_authenticated/importy/pohoda")({
  head: () => ({ meta: [{ title: "Import z Pohody — Faktero" }] }),
  component: () => (
    <VendorImportPage
      source="pohoda"
      title="Import z Pohody a mPohody"
      description="Naimportujte faktúry a odberateľov z XML exportu programu POHODA, zo súboru ISDOC alebo z údajov mPohody."
      accept=".xml,.isdoc,.json"
      guide={
        <>
          <p className="mb-2 font-medium">POHODA</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>
              Otvorte agendu <strong>Fakturácia → Vydané faktúry</strong> a označte doklady.
            </li>
            <li>
              V menu zvoľte <strong>Súbor → Dátová komunikácia → XML import/export</strong>.
            </li>
            <li>Vyberte export do súboru a potvrďte.</li>
            <li>
              Súbor <code>.xml</code> nahrajte nižšie. Rovnako zvládneme aj export do{" "}
              <strong>ISDOC</strong>.
            </li>
          </ol>
          <p className="mb-2 mt-4 font-medium">mPohoda</p>
          <p className="text-muted-foreground">
            mPohoda dáta nevydáva ako XML, ale cez svoje rozhranie vo formáte <strong>JSON</strong>.
            Súbor so zoznamom faktúr z rozhrania mPohody nahrajte rovnako nižšie — formát rozpoznáme
            sami.
          </p>
        </>
      }
    />
  ),
});
