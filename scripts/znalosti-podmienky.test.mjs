import { describe, expect, it } from "vitest";
import { vyradPodmienene, vyradZBazy, zapnutePodmienky } from "./znalosti-podmienky.mjs";

const sekcie = [
  { id: "telegram", nadpis: "Cez Telegram", text: "…" },
  { id: "whatsapp", nadpis: "Cez WhatsApp", text: "…" },
];

describe("podmienené sekcie znalostí", () => {
  it("WhatsApp je zapnutý len s tokenom aj ID čísla, alebo výslovne", () => {
    expect(zapnutePodmienky({}).has("whatsapp")).toBe(false);
    expect(zapnutePodmienky({ WHATSAPP_TOKEN: "x" }).has("whatsapp")).toBe(false);
    expect(
      zapnutePodmienky({ WHATSAPP_TOKEN: "x", WHATSAPP_PHONE_NUMBER_ID: "1" }).has("whatsapp"),
    ).toBe(true);
    expect(zapnutePodmienky({ ZNALOSTI_WHATSAPP: "1" }).has("whatsapp")).toBe(true);
    expect(
      zapnutePodmienky({
        WHATSAPP_TOKEN: "x",
        WHATSAPP_PHONE_NUMBER_ID: "1",
        ZNALOSTI_WHATSAPP: "0",
      }).has("whatsapp"),
    ).toBe(false);
  });

  it("pri vypnutom WhatsAppe sekciu vyradí, pri zapnutom nechá", () => {
    expect(vyradPodmienene("/pomoc/podpora", sekcie, new Set()).map((s) => s.id)).toEqual([
      "telegram",
    ]);
    expect(vyradPodmienene("/pomoc/podpora", sekcie, new Set(["whatsapp"]))).toHaveLength(2);
  });

  it("iný manuál so sekciou rovnakého id nechá na pokoji", () => {
    expect(vyradPodmienene("/pomoc/faktury", sekcie, new Set())).toHaveLength(2);
  });

  it("vyrobený JSON bez id vyčistí podľa nadpisu", () => {
    const baza = [
      {
        cesta: "/pomoc/podpora",
        titulok: "Pomoc a podpora",
        sekcie: sekcie.map(({ nadpis, text }) => ({ nadpis, text })),
      },
    ];
    expect(vyradZBazy(baza, new Set())[0].sekcie.map((s) => s.nadpis)).toEqual(["Cez Telegram"]);
  });
});
