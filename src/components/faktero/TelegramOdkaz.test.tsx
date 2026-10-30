import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/faktero/telegram.functions", () => ({
  telegramPodporaFn: vi.fn(),
  telegramPrepojZakaznikaFn: vi.fn(),
}));

import { TelegramOdkaz, TelegramTlacidlo } from "./TelegramOdkaz";
import { TELEGRAM_PODPORA_KLUC, type TelegramPodpora } from "@/hooks/useTelegramPodpora";
import { JazykProvider } from "@/lib/i18n/useT";

/** Odpoveď servera sa vloží rovno do vyrovnávacej pamäte — tak ju zdieľajú všetky komponenty. */
function html(info: TelegramPodpora | null, prvok: React.ReactNode) {
  const qc = new QueryClient();
  qc.setQueryData(TELEGRAM_PODPORA_KLUC, info);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <JazykProvider jazyk="sk">{prvok}</JazykProvider>
    </QueryClientProvider>,
  );
}

describe("TelegramTlacidlo", () => {
  it("ukáže výrazné tlačidlo na bota, keď je nastavený", () => {
    const h = html({ bot: "FakteroPodporaBot", prepojeny: false }, <TelegramTlacidlo />);
    expect(h).toContain('href="https://t.me/FakteroPodporaBot"');
    expect(h).toContain("Napíšte nám na Telegram");
    expect(h).toContain("Odpovieme priamo v Telegrame");
    expect(h).toContain("Prepojiť s mojím účtom");
  });

  it("prepojenému účtu už prepojenie neponúka", () => {
    const h = html({ bot: "FakteroPodporaBot", prepojeny: true }, <TelegramTlacidlo />);
    expect(h).not.toContain("Prepojiť s mojím účtom");
    expect(h).toContain("Telegram je prepojený s vaším účtom.");
  });

  it.each([
    ["bot nie je nastavený", { bot: null, prepojeny: false }],
    ["server neodpovedal", null],
  ] as const)("neukáže nič, keď %s", (_, info) => {
    expect(html(info, <TelegramTlacidlo />)).toBe("");
    expect(html(info, <TelegramOdkaz />)).toBe("");
  });
});

describe("TelegramOdkaz", () => {
  it("ostáva ako malý odkaz v päte, keď je bot nastavený", () => {
    const h = html({ bot: "FakteroPodporaBot", prepojeny: false }, <TelegramOdkaz />);
    expect(h).toContain('href="https://t.me/FakteroPodporaBot"');
  });
});
