import type { BlocekVysledok } from "@/lib/faktero/blocek.functions";
import { dokladNaZaznam, nahrajPrilohu } from "@/lib/faktero/mobil-doklad";
import { ZDROJ_APKY } from "@/lib/faktero/blocek-z-appky";
import {
  fronta,
  zapisChybu,
  zapisPrilohu,
  zmazZFronty,
  type CakajuciDoklad,
} from "./doklady-fronta";
import { isOnline } from "./offline-queue";

/**
 * Dokončenie odloženého dokladu: prečítať → nahrať prílohu → uložiť.
 *
 * Je to ten istý postup ako pri online skenovaní, len rozdelený na dva časy.
 * Serverové funkcie sem chodia ako parametre — modul tak ostáva použiteľný aj
 * mimo komponentu a nemá vlastnú väzbu na router.
 */

export type NacitajFn = (vstup: {
  data: { qr?: string; image_data_url?: string };
}) => Promise<BlocekVysledok>;

export type UlozFn = (vstup: { data: unknown }) => Promise<unknown>;

/** Prázdny výsledok pre doklad, ktorý sa bez signálu nedal prečítať. */
export function nedostupnyDoklad(qr?: string | null): BlocekVysledok {
  return {
    zdroj: "nic",
    overeny: false,
    poznamka: "Bez signálu — údaje sa doplnia po pripojení.",
    qr_raw: qr ?? undefined,
    items: [],
  } as BlocekVysledok;
}

async function odosliJeden(d: CakajuciDoklad, nacitaj: NacitajFn, uloz: UlozFn): Promise<void> {
  /*
   * Čítanie sa opakuje aj vtedy, keď vo fronte nejaký výsledok je: offline
   * vznikol prázdny záznam so samotným QR kódom a až teraz sa dá zavolať
   * Finančná správa. Keď čítanie zlyhá, doklad sa aj tak uloží — fotka a QR
   * sú v ňom a dopísať sumu je menej práce než skenovať znova.
   */
  let vysledok: BlocekVysledok | null =
    d.vysledok && d.vysledok.zdroj !== "nic" ? d.vysledok : null;
  if (!vysledok) {
    try {
      vysledok = await nacitaj({
        data: {
          qr: d.qr_raw ?? undefined,
          image_data_url: d.qr_raw ? undefined : (d.obrazok ?? undefined),
        },
      });
    } catch {
      vysledok = d.vysledok ?? nedostupnyDoklad(d.qr_raw);
    }
  }

  /*
   * Fotka je pri bločku z appky povinná. Keď sa ju nepodarí nahrať, doklad
   * ostáva vo fronte a skúsi sa znova — predtým sa uložil bez nej a v
   * Bločkoch by bol doklad, ku ktorému účtovník nemá čo založiť.
   */
  const priloha = d.priloha ?? (d.obrazok ? await nahrajPrilohu(d.company_id, d.obrazok) : null);
  if (priloha && !d.priloha) await zapisPrilohu(d.id, priloha).catch(() => {});
  if (d.obrazok && !priloha)
    throw new Error("Fotku dokladu sa nepodarilo nahrať — skúsim to znova.");
  await uloz({ data: zaznamZFronty(d, vysledok, priloha) });
  await zmazZFronty(d.id);
}

const JE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Záznam pre `vydavok-uloz` z dokladu vo fronte.
 *
 * Značka appky (`zdroj: "apka"`) ide s každým dokladom, ktorý vznikol s
 * povinnou fotkou, alebo fotku má — server ho potom uloží rovno do Bločkov a
 * bez súboru ho odmietne. Starý záznam bez fotky sa pošle bez nej, po starom.
 */
export function zaznamZFronty(
  d: CakajuciDoklad,
  vysledok: BlocekVysledok,
  priloha: { path: string; mime: string; size: number } | null,
) {
  const zaznam = {
    ...dokladNaZaznam(d.company_id, vysledok, d.uhrada, priloha, d.kategoria, d.predvolby),
    /*
      Id z fronty je zároveň id dokladu: keď sa uloženie podarí, ale odpoveď
      sa stratí, doklad ostáva vo fronte a ďalší pokus by inak zapísal druhý
      výdavok (QR kód, ktorý to inak stráži, bloček z fotky nemá). Server pri
      známom id vráti už uložený doklad.
    */
    ...(JE_UUID.test(d.id) ? { id: d.id } : {}),
  };
  return d.fotkaPovinna || d.obrazok
    ? { ...zaznam, zdroj: ZDROJ_APKY, ...(vysledok.zalohova ? { zalohova: true } : {}) }
    : zaznam;
}

/**
 * Pošle všetko, čo čaká. Vracia počty, nie chyby — volajúci ukáže hlásenie.
 * Bez signálu sa ani nepokúša, aby fronta nezbierala falošné chyby.
 */
/**
 * Beží už odosielanie?
 *
 * Frontu vyprázdňuje obrazovka Prijaté doklady aj listener po obnovení signálu.
 * Keby sa stretli, obidva by prečítali ten istý doklad skôr, než ho ten druhý
 * stihne zmazať — a z jedného bločku by vznikli dva výdavky.
 */
let prebieha: Promise<{ odoslane: number; zostalo: number }> | null = null;

export function odosliCakajuce(
  companyId: string,
  nacitaj: NacitajFn,
  uloz: UlozFn,
): Promise<{ odoslane: number; zostalo: number }> {
  prebieha ??= odosliCakajuceRaz(companyId, nacitaj, uloz).finally(() => {
    prebieha = null;
  });
  return prebieha;
}

async function odosliCakajuceRaz(
  companyId: string,
  nacitaj: NacitajFn,
  uloz: UlozFn,
): Promise<{ odoslane: number; zostalo: number }> {
  const cakajuce = await fronta(companyId);
  if (cakajuce.length === 0) return { odoslane: 0, zostalo: 0 };
  if (!(await isOnline())) return { odoslane: 0, zostalo: cakajuce.length };

  let odoslane = 0;
  for (const d of cakajuce) {
    try {
      await odosliJeden(d, nacitaj, uloz);
      odoslane++;
    } catch (e: any) {
      await zapisChybu(d.id, e?.message ?? "Odoslanie zlyhalo").catch(() => {});
    }
  }
  return { odoslane, zostalo: cakajuce.length - odoslane };
}
