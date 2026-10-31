/*
  Príjem chyby z prehliadača alebo z appky (verejný endpoint /api/public/chyby).

  Endpoint je bez prihlásenia — chyba príde aj zo stránky, kde človek ešte nie
  je prihlásený. Preto:
  - malé telo (najviac `MAX_TELO` bajtov) a pevný tvar,
  - limit na IP, na odtlačok a spolu za minútu,
  - šum (rozšírenia, ResizeObserver, zrušené požiadavky) sa zahodí aj tu —
    klientovi sa neverí, že ho odfiltroval,
  - z textu sa odstránia tajomstvá, z adresy query aj fragment.
  Odpoveď je vždy rovnaká (204), aby sa z nej nedalo nič vyčítať.
*/
import { z } from "zod";
import {
  OknoPokusov,
  bezTajomstiev,
  jeStareVydanie,
  jeSumPrehliadaca,
  odtlacokChyby,
  type UrovenChyby,
} from "./spolocne";

export const MAX_TELO = 16 * 1024;

export const TeloChybyZ = z.object({
  zdroj: z.enum(["prehliadac", "appka"]),
  typ: z.enum(["onerror", "unhandledrejection", "hranica", "rucne"]).default("rucne"),
  sprava: z.string().max(4000),
  stack: z.string().max(12000).nullish(),
  subor: z.string().max(500).nullish(),
  trasa: z.string().max(1000).nullish(),
  vydanie: z.string().max(60).nullish(),
});
export type TeloChyby = z.infer<typeof TeloChybyZ>;

export type LimityPrijmu = {
  ip: OknoPokusov;
  odtlacok: OknoPokusov;
  spolu: OknoPokusov;
};

export function noveLimityPrijmu(teraz?: () => number): LimityPrijmu {
  return {
    ip: new OknoPokusov(30, 60_000, teraz),
    odtlacok: new OknoPokusov(20, 60_000, teraz),
    spolu: new OknoPokusov(300, 60_000, teraz),
  };
}

export type VysledokPrijmu =
  | { ok: true; uroven: UrovenChyby; telo: TeloChyby }
  | { ok: false; dovod: "tvar" | "sum" | "limit" };

/** Rozhodne, či a ako chybu z klienta zapísať. Nič nezapisuje. */
export function posudChybuZKlienta(
  vstup: unknown,
  k: { ip: string | null; limity: LimityPrijmu },
): VysledokPrijmu {
  const p = TeloChybyZ.safeParse(vstup);
  if (!p.success) return { ok: false, dovod: "tvar" };
  const telo = p.data;
  if (jeSumPrehliadaca({ sprava: telo.sprava, stack: telo.stack, subor: telo.subor }))
    return { ok: false, dovod: "sum" };
  // Skúšobná chyba z E2E testov ide ako varovanie — bez upozornenia do Telegramu.
  const uroven: UrovenChyby = jeStareVydanie(telo.sprava)
    ? "stare_vydanie"
    : telo.sprava.startsWith("[E2E]")
      ? "varovanie"
      : "chyba";
  const odtlacok = odtlacokChyby({
    zdroj: telo.zdroj,
    uroven,
    sprava: bezTajomstiev(telo.sprava),
    stack: telo.stack,
  });
  if (k.ip && !k.limity.ip.skus(k.ip)) return { ok: false, dovod: "limit" };
  if (!k.limity.odtlacok.skus(odtlacok)) return { ok: false, dovod: "limit" };
  if (!k.limity.spolu.skus("vsetci")) return { ok: false, dovod: "limit" };
  return { ok: true, uroven, telo };
}

/** Prečíta najviac `max` bajtov tela; dlhšie telo → `null`. */
export async function citajTelo(request: Request, max = MAX_TELO): Promise<string | null> {
  const dlzka = Number(request.headers.get("content-length") ?? "0");
  if (dlzka > max) return null;
  if (!request.body) return "";
  const citac = request.body.getReader();
  const kusy: Uint8Array[] = [];
  let spolu = 0;
  for (;;) {
    const { done, value } = await citac.read();
    if (done) break;
    spolu += value.byteLength;
    if (spolu > max) {
      await citac.cancel().catch(() => {});
      return null;
    }
    kusy.push(value);
  }
  const buf = new Uint8Array(spolu);
  let i = 0;
  for (const k of kusy) {
    buf.set(k, i);
    i += k.byteLength;
  }
  return new TextDecoder().decode(buf);
}
