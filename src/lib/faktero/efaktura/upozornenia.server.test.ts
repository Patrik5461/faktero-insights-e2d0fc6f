import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vlozene: any[] = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async (r: any) => (vlozene.push(r), { error: null }) }) },
}));

const { upozorniNoveZiadosti, upozorniVysledokRegistracie, zapisOdmietnutie } =
  await import("./upozornenia.server");

let maily: any[] = [];
beforeEach(() => {
  maily = [];
  vlozene.length = 0;
  process.env.RESEND_API_KEY = "test";
  vi.stubGlobal("fetch", async (_u: string, o: any) => {
    maily.push(JSON.parse(o.body));
    return new Response("{}", { status: 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("upozornenia eFaktúry", () => {
  it("nová žiadosť ide na peppol@faktero.sk s názvom a DIČ", async () => {
    await upozorniNoveZiadosti([{ nazov: "Firma s.r.o.", dic: "2020123456", email: "a@b.sk" }]);
    expect(maily[0].to).toEqual(["peppol@faktero.sk"]);
    expect(maily[0].subject).toContain("Firma s.r.o.");
    expect(maily[0].text).toContain("DIČ 2020123456");
  });

  it("výsledok registrácie s dôvodom chyby", async () => {
    await upozorniVysledokRegistracie({
      nazov: "Firma s.r.o.",
      dic: "2020123456",
      stav: "chyba",
      chyba: "403 INSUFFICIENT_SCOPE",
      pokusov: 1,
      maFirmu: false,
    });
    expect(maily[0].text).toContain("403 INSUFFICIENT_SCOPE");
    await upozorniVysledokRegistracie({
      nazov: null,
      dic: "2020123456",
      stav: "prijata",
      maFirmu: false,
    });
    expect(maily).toHaveLength(1);
  });

  it("odmietnutie zapíše každý pokus bez tokenu, e-mail raz za 15 minút", async () => {
    const firmy = [
      { nazov: "X", dic: "2020123456", email: null, telefon: null, token: "tajne" } as any,
    ];
    await zapisOdmietnutie("zly_podpis", { firmy, ip: "1.2.3.4" });
    await zapisOdmietnutie("zly_podpis", { firmy, ip: "1.2.3.4" });
    expect(vlozene).toHaveLength(2);
    expect(JSON.stringify(vlozene)).not.toContain("tajne");
    expect(vlozene[0]).toMatchObject({ dovod: "zly_podpis", overene: false });
    expect(maily).toHaveLength(1);
    expect(maily[0].text).toContain("neoverené");
  });
});
