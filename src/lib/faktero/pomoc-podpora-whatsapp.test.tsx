/**
 * Manuál „Pomoc a podpora“ nesmie hovoriť o WhatsAppe (tlačidlá, číslo),
 * kým integrácia nie je zapnutá — na webe ani v appke vtedy nič také nie je.
 */
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const stav = vi.hoisted(() => ({ cislo: null as string | null }));
vi.mock("@/hooks/useWhatsAppPodpora", () => ({ useWhatsAppVerejne: () => stav.cislo }));
vi.mock("@tanstack/react-router", async (povodny) => {
  const m = await povodny<typeof import("@tanstack/react-router")>();
  return {
    ...m,
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});
vi.mock("@/components/faktero/MarketingShell", () => ({
  MarketingShell: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const { JazykProvider } = await import("@/lib/i18n/useT");
const { Route } = await import("@/routes/pomoc.podpora");

async function vykresli() {
  const opt = Route.options as unknown as {
    component: { preload?: () => Promise<void> } & (() => ReactNode);
  };
  await opt.component.preload?.();
  const Page = opt.component;
  return renderToString(
    <JazykProvider jazyk="sk">
      <Page />
    </JazykProvider>,
  );
}

describe("manuál podpory a WhatsApp", () => {
  it("vypnutý WhatsApp sa v manuáli neukáže", async () => {
    stav.cislo = null;
    const html = await vykresli();
    expect(html).toContain("Cez Telegram");
    expect(html).not.toContain("WhatsApp");
    expect(html).not.toContain("902 101 967");
  });

  it("zapnutý WhatsApp má v manuáli vlastnú časť", async () => {
    stav.cislo = "421902101967";
    const html = await vykresli();
    expect(html).toContain("Cez WhatsApp");
  });
});
