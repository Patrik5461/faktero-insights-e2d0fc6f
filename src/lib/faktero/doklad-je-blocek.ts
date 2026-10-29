import { identifikatoryZQr, isEkasaQr } from "./ekasa";
import { jeEetQr } from "./eet-cz";

/**
 * Je doklad v Bločkoch naozaj bloček?
 *
 * Do Dokladov chodí všetko — pokladničný doklad z eKasy aj naskenovaná
 * faktúra od dodávateľa. Faktúru treba vedieť presunúť medzi prijaté faktúry,
 * bloček nie: ponuka „Presunúť medzi prijaté faktúry“ pri bločku z benzínky
 * len mätie a presun by z pokladničného dokladu urobil faktúru so
 * splatnosťou, ktorú nikto nikdy neuhradí.
 *
 * Bloček sa pozná podľa toho, čo o ňom dáta hovoria naisto:
 * - QR z eKasy (UID `O-…`, OKP s kódom pokladnice, odkaz Finančnej správy)
 *   alebo český QR `EET*…`,
 * - UID z eKasy v čísle dokladu (import ho dáva aj tam),
 * - doklad založený z QR kódu (`source: "qr"`),
 * - druh, ktorý AI alebo človek určil ako bloček.
 *
 * Platobný QR na faktúre (PAY by square, SPD) bločkom nerobí. Fotka či PDF
 * bez týchto znakov môže byť faktúrou — tam ponuka ostáva.
 */

export type DokladNaRozpoznanie = {
  source?: string | null;
  qr_raw?: string | null;
  document_number?: string | null;
  ai_raw?: unknown;
};

export type DovodBlocku = "ekasa" | "eet" | "qr" | "druh";

/** Unikátny identifikátor dokladu z eKasy (`O-` a 32 šestnástkových znakov). */
const UID_EKASA = /^O-[0-9A-F]{32}$/i;

/** PAY by square je base32hex — len veľké písmená A–V a číslice. */
const PAY_BY_SQUARE = /^[0-9A-V]{40,}$/;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Nesie QR kód pokladničný doklad z eKasy? Platobný QR faktúry nie. */
function qrZEkasy(qr: string): boolean {
  if (/^SPD\*/i.test(qr) || PAY_BY_SQUARE.test(qr)) return false;
  return identifikatoryZQr(qr) !== null || isEkasaQr(qr);
}

/** Druh z AI (`document_type` / `document_subtype`) alebo z formulára (`druh`). */
function druhJeBlocek(ai: unknown): boolean {
  if (!ai || typeof ai !== "object") return false;
  const a = ai as Record<string, unknown>;
  return [a.document_type, a.document_subtype, a.druh].some(
    (v) => text(v).toLowerCase() === "blocek",
  );
}

/** Prečo je doklad bločkom — `null`, keď ním nie je (aspoň podľa dát). */
export function dovodBlocku(d: DokladNaRozpoznanie | null | undefined): DovodBlocku | null {
  if (!d) return null;
  const qr = text(d.qr_raw);
  if (qr && jeEetQr(qr)) return "eet";
  if (qr && qrZEkasy(qr)) return "ekasa";
  if (UID_EKASA.test(text(d.document_number))) return "ekasa";
  if (text(d.source) === "qr") return "qr";
  if (druhJeBlocek(d.ai_raw)) return "druh";
  return null;
}

/** Skutočný bloček — pokladničný doklad, nie faktúra. */
export function jeSkutocnyBlocek(d: DokladNaRozpoznanie | null | undefined): boolean {
  return dovodBlocku(d) !== null;
}

/** Smie sa doklad ponúknuť na presun medzi prijaté faktúry? */
export function daSaPresunutMedziPrijate(d: DokladNaRozpoznanie | null | undefined): boolean {
  return Boolean(d) && !jeSkutocnyBlocek(d);
}

/** Chyba pre server, keď presun bločku niekto skúsi obísť. */
export const CHYBA_PRESUNU_BLOCKU =
  "Toto je bloček z registračnej pokladnice, nie faktúra — medzi prijaté faktúry sa presunúť nedá.";
