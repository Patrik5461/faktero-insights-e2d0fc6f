import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Kontrola e-mailu pred registráciou (jednorazová doména, MX). Bez
 * prihlásenia — človek ešte účet nemá. Nepoužíva servisný kľúč.
 */
export const overEmailRegistracieFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ email: z.string().trim().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const { overEmailNaRegistraciu } = await import("./overenie-emailu.server");
    return overEmailNaRegistraciu(data.email);
  });
