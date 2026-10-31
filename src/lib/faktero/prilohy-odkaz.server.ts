/**
 * Podpísaný odkaz na prílohy dokladu, ktoré sa nezmestili do e-mailu.
 *
 * Mail s faktúrou má strop 20 MB na prílohy (`STROP_PRILOH`). Namiesto toho,
 * aby väčšie prílohy príjemcovi jednoducho chýbali, dostane odkaz na verejnú
 * stránku `/prilohy/<token>`, ktorá ukáže **len tie** prílohy.
 *
 * Token sa nikam neukladá — nesie v sebe druh a id dokladu, id príloh,
 * expiráciu a náhodný kúsok, a celé je to podpísané HMAC kľúčom servera.
 * Uhádnuť ani upraviť sa nedá (iné id = iný podpis) a je viazaný na doklad:
 * server pri otvorení ešte overí, že prílohy k tomu dokladu naozaj patria.
 *
 * Binárny tvar, aby sa odkaz s desiatimi prílohami zmestil do ~280 znakov:
 *   verzia(1) druh(1) exp(4, unix s) nonce(8) doklad(16) n(1) prílohy(n×16) mac(16)
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const PLATNOST_ODKAZU_DNI = 30;
const VERZIA = 1;
const DRUHY = ["invoice", "quote", "sales_order"] as const;
export type DruhOdkazu = (typeof DRUHY)[number];

export type ObsahOdkazu = {
  druh: DruhOdkazu;
  dokladId: string;
  prilohy: string[];
  /** Platí do (unix sekundy). */
  exp: number;
};

function kluc(): string {
  const k =
    process.env.PRILOHY_ODKAZ_KEY ??
    process.env.PAYMENT_SECRETS_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("Chýba kľúč na podpis.");
  return k;
}

function mac(k: string, data: Buffer): Buffer {
  // Vlastná doména podpisu — ten istý kľúč podpisuje aj iné veci.
  return createHmac("sha256", k)
    .update("faktero.prilohy-odkaz.v1")
    .update(data)
    .digest()
    .subarray(0, 16);
}

function uuidNaBajty(u: string): Buffer {
  const hex = u.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error("Neplatné id.");
  return Buffer.from(hex, "hex");
}

function bajtyNaUuid(b: Buffer): string {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function podpisOdkazPriloh(o: ObsahOdkazu, k: string = kluc()): string {
  const druh = DRUHY.indexOf(o.druh);
  if (druh < 0) throw new Error("Neznámy druh dokladu.");
  if (!o.prilohy.length || o.prilohy.length > 255) throw new Error("Zlý počet príloh.");
  const hlava = Buffer.alloc(6);
  hlava.writeUInt8(VERZIA, 0);
  hlava.writeUInt8(druh, 1);
  hlava.writeUInt32BE(o.exp >>> 0, 2);
  const data = Buffer.concat([
    hlava,
    randomBytes(8),
    uuidNaBajty(o.dokladId),
    Buffer.from([o.prilohy.length]),
    ...o.prilohy.map(uuidNaBajty),
  ]);
  return Buffer.concat([data, mac(k, data)]).toString("base64url");
}

/** Obsah platného odkazu, inak null (zlý podpis, iný tvar, vypršaný). */
export function overOdkazPriloh(
  token: string,
  teraz: Date = new Date(),
  k: string = kluc(),
): ObsahOdkazu | null {
  if (typeof token !== "string" || token.length > 600 || !/^[A-Za-z0-9_-]+$/.test(token))
    return null;
  const b = Buffer.from(token, "base64url");
  if (b.length < 6 + 8 + 16 + 1 + 16 + 16) return null;
  const data = b.subarray(0, b.length - 16);
  const podpis = b.subarray(b.length - 16);
  if (!timingSafeEqual(podpis, mac(k, data))) return null;
  if (data.readUInt8(0) !== VERZIA) return null;
  const druh = DRUHY[data.readUInt8(1)];
  if (!druh) return null;
  const exp = data.readUInt32BE(2);
  const n = data.readUInt8(30);
  if (data.length !== 31 + n * 16 || n < 1) return null;
  if (exp * 1000 < teraz.getTime()) return null;
  const prilohy: string[] = [];
  for (let i = 0; i < n; i++) prilohy.push(bajtyNaUuid(data.subarray(31 + i * 16, 47 + i * 16)));
  return { druh, dokladId: bajtyNaUuid(data.subarray(14, 30)), prilohy, exp };
}

/** Celý odkaz pre e-mail. */
export function odkazNaPrilohy(
  druh: DruhOdkazu,
  dokladId: string,
  prilohy: string[],
  teraz: Date = new Date(),
): { url: string; platiDo: Date } {
  const platiDo = new Date(teraz.getTime() + PLATNOST_ODKAZU_DNI * 86_400_000);
  const token = podpisOdkazPriloh({
    druh,
    dokladId,
    prilohy,
    exp: Math.floor(platiDo.getTime() / 1000),
  });
  const zaklad = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
  return { url: `${zaklad}/prilohy/${token}`, platiDo };
}
