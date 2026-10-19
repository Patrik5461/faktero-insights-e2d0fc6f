import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Verejná „Faktúra zadarmo“ — bez prihlásenia. Captcha, limity a čistenie
 * vstupu sú v `faktura-zadarmo.server.ts`; tu sú len vstupné body.
 */

function hlavicky(): Headers {
  try {
    return getRequest().headers;
  } catch {
    return new Headers();
  }
}

/* Vstup sa tu len zhruba ohraničí (veľkosť), presný tvar overí server modul. */
const vstupPdf = z.object({
  faktura: z.unknown(),
  logo: z.unknown().optional(),
  token: z.string().max(4096).nullish(),
});

export const generujFakturuZadarmoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => vstupPdf.parse(d))
  .handler(async ({ data }) => {
    const { generujFakturuZadarmo } = await import("./faktura-zadarmo.server");
    const { ipKlienta } = await import("./registracia.server");
    return generujFakturuZadarmo(data, { ip: ipKlienta(hlavicky()) });
  });

const vstupHladania = z.object({
  ico: z.string().max(20),
  krajina: z.enum(["SK", "CZ"]),
});

export const vyhladajFirmuZadarmoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => vstupHladania.parse(d))
  .handler(async ({ data }) => {
    const { vyhladajFirmuZadarmo } = await import("./faktura-zadarmo.server");
    const { ipKlienta } = await import("./registracia.server");
    return vyhladajFirmuZadarmo(data, { ip: ipKlienta(hlavicky()) });
  });
