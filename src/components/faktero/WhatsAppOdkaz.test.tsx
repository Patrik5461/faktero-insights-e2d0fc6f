import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/faktero/whatsapp.functions", () => ({
  whatsappPodporaFn: vi.fn(),
  whatsappPrepojZakaznikaFn: vi.fn(),
  kanalyPodporyFn: vi.fn(),
}));

import { WhatsAppOdkaz, WhatsAppTlacidlo, WhatsAppVerejnyOdkaz } from "./WhatsAppOdkaz";
import {
  KANALY_PODPORY_KLUC,
  WHATSAPP_PODPORA_KLUC,
  type WhatsAppPodpora,
} from "@/hooks/useWhatsAppPodpora";
import { JazykProvider } from "@/lib/i18n/useT";

function html(info: WhatsAppPodpora | null, prvok: React.ReactNode, verejne: string | null = null) {
  const qc = new QueryClient();
  qc.setQueryData(WHATSAPP_PODPORA_KLUC, info);
  qc.setQueryData(KANALY_PODPORY_KLUC, { whatsapp: verejne });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <JazykProvider jazyk="sk">{prvok}</JazykProvider>
    </QueryClientProvider>,
  );
}

describe("WhatsAppTlacidlo", () => {
  it("ukáže tlačidlo na wa.me s predvyplneným textom, keď je WhatsApp zapnutý", () => {
    const h = html({ cislo: "+421902101967", prepojeny: false }, <WhatsAppTlacidlo />);
    expect(h).toContain("https://wa.me/421902101967?text=");
    expect(h).toContain("Napíšte nám na WhatsApp");
    expect(h).toContain("+421 902 101 967");
    expect(h).toContain("Prepojiť s mojím účtom");
  });

  it("prepojenému účtu už prepojenie neponúka", () => {
    const h = html({ cislo: "+421902101967", prepojeny: true }, <WhatsAppTlacidlo />);
    expect(h).not.toContain("Prepojiť s mojím účtom");
  });

  it.each([
    ["integrácia je vypnutá", { cislo: null, prepojeny: false }],
    ["server neodpovedal", null],
  ] as const)("neukáže nič, keď %s", (_, info) => {
    expect(html(info, <WhatsAppTlacidlo />)).toBe("");
    expect(html(info, <WhatsAppOdkaz />)).toBe("");
  });
});

describe("WhatsAppVerejnyOdkaz", () => {
  it("na webe len keď je zapnutý", () => {
    expect(html(null, <WhatsAppVerejnyOdkaz />, null)).toBe("");
    expect(html(null, <WhatsAppVerejnyOdkaz />, "+421902101967")).toContain(
      "WhatsApp +421 902 101 967",
    );
  });
});
