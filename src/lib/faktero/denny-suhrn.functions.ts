import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/*
  Odhlásenie z denného súhrnu z odkazu v e-maile — bez prihlásenia. Jedinou
  ochranou je podpísaný token (id používateľa + HMAC), takže sa ním dá vypnúť
  len súhrn toho, komu e-mail prišiel, a nič iné.
*/

const Token = z.object({ token: z.string().min(10).max(200) });

export const odhlasDennySuhrnFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => Token.parse(d))
  .handler(async ({ data }) => {
    const { odhlasZoSuhrnu } = await import("./denny-suhrn.server");
    const ok = await odhlasZoSuhrnu(data.token);
    if (!ok) throw new Error("Odkaz na odhlásenie je neplatný.");
    return { ok: true };
  });
