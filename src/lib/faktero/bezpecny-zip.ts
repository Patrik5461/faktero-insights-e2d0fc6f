/*
  Rozbalenie ZIP-u, ktorý nahral používateľ, so stropom.

  `unzipSync` z fflate aj `JSZip.loadAsync` rozbalia všetko naraz do pamäte.
  ZIP bomba (pár MB, po rozbalení gigabajty) by tak na serveri zhodila celý
  proces Faktera pre všetkých používateľov. Tu sa rozbaľuje po kúskoch a
  spočítava sa skutočne rozbalený objem — údajom o veľkosti v hlavičke archívu
  sa neverí, ten si útočník napíše, aký chce.
*/
import { Unzip, UnzipInflate } from "fflate";

export type LimityZipu = {
  /** Najviac bajtov po rozbalení spolu (aj cez vnorené archívy, keď sa zdieľa `rozpocet`). */
  maxBajtov?: number;
  /** Najviac súborov v archíve. */
  maxSuborov?: number;
};

/** Zostávajúci objem — vnorené ZIP-y ho čerpajú spoločne. */
export type RozpocetZipu = { bajtov: number; suborov: number };

export const PREDVOLENY_MAX_BAJTOV = 300 * 1024 * 1024;
export const PREDVOLENY_MAX_SUBOROV = 5000;

export class PrilisVelkyZip extends Error {
  constructor(sprava: string) {
    super(sprava);
    this.name = "PrilisVelkyZip";
  }
}

export function novyRozpocet(l: LimityZipu = {}): RozpocetZipu {
  return {
    bajtov: l.maxBajtov ?? PREDVOLENY_MAX_BAJTOV,
    suborov: l.maxSuborov ?? PREDVOLENY_MAX_SUBOROV,
  };
}

/** Začína obsah hlavičkou ZIP (PK\x03\x04 alebo prázdny archív PK\x05\x06)? */
export function jeZip(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5);
}

/** Po koľkých bajtoch sa archív podáva fflate — deflate rozbalí z 16 kB najviac ~16 MB. */
const KUS = 16 * 1024;

/**
 * Rozbalí ZIP do mapy `cesta → obsah`. Priečinky vynechá. Keď archív prekročí
 * strop, hodí `PrilisVelkyZip` skôr, než sa celý dostane do pamäte.
 */
export function rozbalZip(
  bajty: Uint8Array,
  rozpocet: RozpocetZipu = novyRozpocet(),
  { lenSpocitaj = false }: { lenSpocitaj?: boolean } = {},
): Record<string, Uint8Array> {
  const vysledok: Record<string, Uint8Array> = {};
  let chyba: Error | null = null;
  const zastav = (e: Error) => {
    if (!chyba) chyba = e;
  };

  const uz = new Unzip((subor) => {
    if (chyba || subor.name.endsWith("/")) return;
    if (--rozpocet.suborov < 0) {
      zastav(new PrilisVelkyZip("Archív obsahuje priveľa súborov."));
      return;
    }
    const kusy: Uint8Array[] = [];
    subor.ondata = (err, data, posledny) => {
      if (chyba) return;
      if (err) {
        zastav(err);
        return;
      }
      rozpocet.bajtov -= data.length;
      if (rozpocet.bajtov < 0) {
        zastav(new PrilisVelkyZip("Archív je po rozbalení príliš veľký."));
        try {
          subor.terminate();
        } catch {
          /* už skončil */
        }
        return;
      }
      if (!lenSpocitaj) kusy.push(data);
      if (posledny && !lenSpocitaj) {
        const spolu = kusy.reduce((a, k) => a + k.length, 0);
        const out = new Uint8Array(spolu);
        let o = 0;
        for (const k of kusy) {
          out.set(k, o);
          o += k.length;
        }
        vysledok[subor.name] = out;
      }
    };
    subor.start();
  });
  uz.register(UnzipInflate);

  for (let i = 0; i < bajty.length; i += KUS) {
    uz.push(bajty.subarray(i, Math.min(i + KUS, bajty.length)), i + KUS >= bajty.length);
    if (chyba) throw chyba;
  }
  if (!bajty.length) uz.push(new Uint8Array(0), true);
  if (chyba) throw chyba;
  return vysledok;
}

/**
 * Kontrola pred knižnicou, ktorá si ZIP rozbaľuje sama (SheetJS pri .xlsx/.ods):
 * archív sa prejde so stropom a obsah sa zahodí. Súbor, ktorý nie je ZIP
 * (starý .xls, CSV), prejde bez kontroly.
 */
export function overZip(bajty: Uint8Array, limity: LimityZipu = {}): void {
  if (!jeZip(bajty)) return;
  rozbalZip(bajty, novyRozpocet(limity), { lenSpocitaj: true });
}
