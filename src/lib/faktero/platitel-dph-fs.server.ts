/**
 * Zoznamy Finančnej správy SR pre DPH — stiahnutie, rozbalenie a index.
 *
 * Súbory sú verejné a bez kľúča (report.financnasprava.sk/<zoznam>.zip),
 * aktualizujú sa raz denne okolo 2:00. ds_dphs má ~14 MB v ZIP a ~127 MB XML,
 * preto sa XML číta prúdom a v pamäti ostane len kompaktný TSV index
 * (IČO, IČ DPH, druh registrácie, dátumy, názov) — okolo 20 MB.
 *
 * Index sa ukladá aj na disk, aby ho reštart servera nemusel sťahovať znova;
 * nový súbor sa stiahne, len keď ho FS zmenila (ETag). Výpadok FS nezhodí
 * overenie, ak je k dispozícii index z predošlého dňa — výsledok potom nesie
 * starší `zoznamK`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Unzip, UnzipInflate } from "fflate";
import {
  datumZoznamu,
  dphsNaRiadok,
  najdiVIndexe,
  polozkyXml,
  riadokNaDphs,
  riadokNaZrusenie,
  zaznamDphs,
  zaznamZrusenia,
  zruseniaNaRiadok,
  type ZaznamDphs,
  type ZaznamZrusenia,
} from "./platitel-dph";

export type ZoznamFs = "ds_dphs" | "ds_dphz" | "ds_dphv";
const ZOZNAMY: ZoznamFs[] = ["ds_dphs", "ds_dphz", "ds_dphv"];
const ADRESA = (z: ZoznamFs) => `https://report.financnasprava.sk/${z}.zip`;
/** Po tomto čase sa server opýta FS, či nemá novší súbor. */
const OBNOVA_MS = 6 * 60 * 60 * 1000;
const CAKANIE_MS = 60_000;

type Index = { text: string; datum: string | null; etag: string | null; nacitane: number };

const pamat = new Map<ZoznamFs, Index>();
const rozbehnute = new Map<ZoznamFs, Promise<Index>>();

function priecinok() {
  return process.env.FAKTERO_CACHE_DIR || join(tmpdir(), "faktero-fs-dph");
}

/** Rozbalí ZIP prúdom a z XML vyberie riadky indexu. */
export function indexZoZipu(
  zip: Uint8Array,
  zoznam: ZoznamFs,
): { text: string; datum: string | null } {
  const riadky: string[] = [];
  let datum: string | null = null;
  let zvysok = "";
  let hlavicka = true;
  const dekoder = new TextDecoder("utf-8");
  const spracuj = (kus: string) => {
    const buf = zvysok + kus;
    if (hlavicka) {
      datum = datumZoznamu(buf.slice(0, 2000));
      hlavicka = false;
    }
    const { polozky, zvysok: z } = polozkyXml(buf);
    zvysok = z;
    for (const p of polozky) {
      if (zoznam === "ds_dphs") {
        const r = zaznamDphs(p);
        if (r) riadky.push(dphsNaRiadok(r));
      } else {
        const r = zaznamZrusenia(p);
        if (r) riadky.push(zruseniaNaRiadok(r));
      }
    }
  };
  let chyba: Error | null = null;
  const uz = new Unzip((subor) => {
    if (!subor.name.toLowerCase().endsWith(".xml")) return;
    subor.ondata = (err, data, posledny) => {
      if (err) {
        chyba = err;
        return;
      }
      spracuj(dekoder.decode(data, { stream: !posledny }));
    };
    subor.start();
  });
  uz.register(UnzipInflate);
  uz.push(zip, true);
  if (chyba) throw chyba;
  if (!riadky.length) throw new Error(`Zoznam ${zoznam} je prázdny alebo nečitateľný.`);
  return { text: `\n${riadky.join("\n")}\n`, datum };
}

async function zDisku(zoznam: ZoznamFs): Promise<Index | null> {
  try {
    const s = await readFile(join(priecinok(), `${zoznam}.tsv`), "utf8");
    const nl = s.indexOf("\n");
    const [etag, datum, nacitane] = s.slice(0, nl).replace(/^#/, "").split("\t");
    return {
      text: s.slice(nl),
      etag: etag || null,
      datum: datum || null,
      nacitane: Number(nacitane) || 0,
    };
  } catch {
    return null;
  }
}

async function naDisk(zoznam: ZoznamFs, idx: Index) {
  try {
    await mkdir(priecinok(), { recursive: true });
    await writeFile(
      join(priecinok(), `${zoznam}.tsv`),
      `#${idx.etag ?? ""}\t${idx.datum ?? ""}\t${idx.nacitane}${idx.text}`,
      "utf8",
    );
  } catch (e) {
    console.warn("[platitel-dph] index sa nepodarilo uložiť:", String((e as Error)?.message ?? e));
  }
}

async function nacitaj(zoznam: ZoznamFs, vynutit: boolean): Promise<Index> {
  const vPamati = pamat.get(zoznam) ?? (await zDisku(zoznam));
  if (vPamati && !pamat.has(zoznam)) pamat.set(zoznam, vPamati);
  if (vPamati && !vynutit && Date.now() - vPamati.nacitane < OBNOVA_MS) return vPamati;

  try {
    const r = await fetch(ADRESA(zoznam), {
      headers: vPamati?.etag ? { "if-none-match": vPamati.etag } : {},
      signal: AbortSignal.timeout(CAKANIE_MS),
    });
    if (r.status === 304 && vPamati) {
      const obnovene = { ...vPamati, nacitane: Date.now() };
      pamat.set(zoznam, obnovene);
      void naDisk(zoznam, obnovene);
      return obnovene;
    }
    if (!r.ok) throw new Error(`FS vrátila ${r.status} pre ${zoznam}.`);
    const { text, datum } = indexZoZipu(new Uint8Array(await r.arrayBuffer()), zoznam);
    const idx: Index = { text, datum, etag: r.headers.get("etag"), nacitane: Date.now() };
    pamat.set(zoznam, idx);
    await naDisk(zoznam, idx);
    return idx;
  } catch (e) {
    // Starší index je lepší než žiadny — zoznam sa mení po dňoch.
    if (vPamati) {
      console.warn(
        `[platitel-dph] ${zoznam} sa nepodarilo obnoviť, ostáva zoznam k ${vPamati.datum}:`,
        String((e as Error)?.message ?? e),
      );
      return vPamati;
    }
    throw e;
  }
}

/** Index zoznamu; súbežné volania zdieľajú jedno stiahnutie. */
export function indexZoznamu(zoznam: ZoznamFs, vynutit = false): Promise<Index> {
  const bezi = rozbehnute.get(zoznam);
  if (bezi) return bezi;
  const p = nacitaj(zoznam, vynutit).finally(() => rozbehnute.delete(zoznam));
  rozbehnute.set(zoznam, p);
  return p;
}

export type NajdeneFs = {
  dphs: ZaznamDphs[];
  dphz: ZaznamZrusenia[];
  dphv: ZaznamZrusenia[];
  zoznamK: string | null;
};

/** Záznamy firmy vo všetkých troch zoznamoch. Vyhodí chybu, len keď nie je žiadny index. */
export async function hladajVZoznamochFs(
  ico: string | null,
  icDph: string | null,
): Promise<NajdeneFs> {
  const [dphs, dphz, dphv] = await Promise.all(ZOZNAMY.map((z) => indexZoznamu(z)));
  return {
    dphs: najdiVIndexe(dphs.text, ico, icDph).map(riadokNaDphs),
    dphz: najdiVIndexe(dphz.text, ico, icDph).map(riadokNaZrusenie),
    dphv: najdiVIndexe(dphv.text, ico, icDph).map(riadokNaZrusenie),
    zoznamK: dphs.datum,
  };
}

/** Len na testy — zabudne indexy v pamäti. */
export function zabudniIndexyFs() {
  pamat.clear();
}
