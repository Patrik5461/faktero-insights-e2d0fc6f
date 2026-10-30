import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JazykProvider } from "@/lib/i18n/useT";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => async () => ({}) }));
vi.mock("@/lib/faktero/company-lookup.functions", () => ({
  lookupCompanyByIcoFn: {},
  companyLookupConfiguredFn: {},
}));

const { IcoLookupButton } = await import("./IcoLookupButton");

describe("IcoLookupButton", () => {
  it("tlačidlo sa nezmenšuje a text sa nezalomí ani v češtine", () => {
    const h = renderToStaticMarkup(
      <JazykProvider jazyk="cs">
        <IcoLookupButton ico="" onResult={() => {}} />
      </JazykProvider>,
    );
    // Obal je položka flexu vedľa políčka IČO — bez shrink-0 sa stláčal.
    expect(h).toMatch(/^<div class="[^"]*\bshrink-0\b/);
    expect(h.match(/whitespace-nowrap/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
