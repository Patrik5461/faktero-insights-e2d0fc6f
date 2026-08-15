import type { BlocekVysledok } from "@/lib/faktero/blocek.functions";
import { dokladNaZaznam, nahrajPrilohu } from "@/lib/faktero/mobil-doklad";
import { fronta, zapisChybu, zmazZFronty, type CakajuciDoklad } from "./doklady-fronta";
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

  const priloha = d.obrazok ? await nahrajPrilohu(d.company_id, d.obrazok) : null;
  await uloz({ data: dokladNaZaznam(d.company_id, vysledok, d.uhrada, priloha) });
  await zmazZFronty(d.id);
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
