import { describe, expect, it, vi } from "vitest";

/*
  Podpis PDF faktúry: keď súbor práve nahráva súbežné generovanie (bočný náhľad +
  „Stiahnuť PDF“), prvý pokus hlási „Object not found“ — druhý po chvíli prejde.
*/
const pokusy: string[] = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => {
          pokusy.push(path);
          return pokusy.length === 1
            ? { data: null, error: { message: "Object not found" } }
            : { data: { signedUrl: `https://x/${path}?token=1` }, error: null };
        },
      }),
    },
  },
}));

describe("signInvoicePdf", () => {
  it("po „Object not found“ skúsi podpísať ešte raz", async () => {
    vi.useFakeTimers();
    const { signInvoicePdf } = await import("./invoice-pdf.server");
    const p = signInvoicePdf("firma/fa.pdf", "FA1.pdf");
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toBe("https://x/firma/fa.pdf?token=1");
    expect(pokusy).toHaveLength(2);
    vi.useRealTimers();
  });
});
