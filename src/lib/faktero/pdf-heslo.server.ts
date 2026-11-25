/**
 * Zaheslované PDF (Patrik 25. 11.): faktúry od operátorov, bánk a poisťovní
 * chodia často s heslom (IČO, zákaznícke číslo). Faktero ich bez hesla
 * neotvorí — náhľad ani čítanie AI. Tu sa PDF rozpozná a odhesluje nástrojom
 * qpdf (Apache 2.0); text v PDF ostane, nie je to len fotka strán.
 *
 * qpdf je na serveri v ~/opt/qpdf (statický balík z GitHubu, bez sudo).
 * Heslo ide do qpdf súborom s právami 600, nie v príkazovom riadku — tam by
 * ho videl každý cez `ps`.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const QPDF = process.env.QPDF_BIN || "/home/patrik/opt/qpdf/bin/qpdf";

export { CHYBA_ZAHESLOVANE } from "./pdf-heslo";

export type StavPdf = "bez_hesla" | "heslo" | "len_obmedzenia" | "nezname";

function spusti(args: string[]): Promise<{ kod: number; chyba: string }> {
  return new Promise((resolve) => {
    execFile(QPDF, args, { timeout: 30_000, maxBuffer: 1024 * 1024 }, (err, _out, stderr) => {
      const kod = err ? (typeof (err as any).code === "number" ? (err as any).code : -1) : 0;
      resolve({ kod, chyba: String(stderr ?? "") });
    });
  });
}

async function sDocasnymPriecinkom<T>(f: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "faktero-pdf-"));
  try {
    return await f(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export function jePdf(mime: string | null | undefined, nazov?: string | null, bajty?: Uint8Array): boolean {
  if (String(mime ?? "").toLowerCase().includes("pdf")) return true;
  if (/\.pdf$/i.test(String(nazov ?? ""))) return true;
  return !!bajty && bajty.length > 4 && Buffer.from(bajty.subarray(0, 5)).toString("latin1") === "%PDF-";
}

/**
 * Stav PDF: `heslo` = bez hesla sa nedá otvoriť; `len_obmedzenia` = otvorí sa,
 * ale má zakázanú tlač/kopírovanie (to odstránime bez pýtania); `nezname` =
 * qpdf chýba alebo súbor nie je PDF — správame sa, akoby heslo nemal.
 */
export async function stavPdf(bajty: Uint8Array): Promise<StavPdf> {
  return sDocasnymPriecinkom(async (dir) => {
    const vstup = join(dir, "vstup.pdf");
    await writeFile(vstup, bajty);
    // qpdf --requires-password: 0 = treba heslo, 2 = nie je šifrované, 3 = šifrované bez hesla na otvorenie.
    const { kod } = await spusti(["--requires-password", vstup]);
    if (kod === 0) return "heslo";
    if (kod === 3) return "len_obmedzenia";
    if (kod === 2) return "bez_hesla";
    return "nezname";
  });
}

/**
 * Odheslované PDF, alebo `null`, keď heslo nesedí. Bez hesla (`null`) odstráni
 * len obmedzenia — pri PDF, ktoré sa otvorí aj bez hesla.
 */
export async function odheslujPdf(bajty: Uint8Array, heslo: string | null): Promise<Buffer | null> {
  return sDocasnymPriecinkom(async (dir) => {
    const vstup = join(dir, "vstup.pdf");
    const vystup = join(dir, "vystup.pdf");
    const subHesla = join(dir, "heslo");
    await writeFile(vstup, bajty);
    await writeFile(subHesla, heslo ?? "", { mode: 0o600 });
    const { kod, chyba } = await spusti([`--password-file=${subHesla}`, "--decrypt", vstup, vystup]);
    // 3 = hotovo s varovaniami (poškodený, ale opravený súbor) — výsledok je použiteľný.
    if (kod === 0 || kod === 3) return Buffer.from(await readFile(vystup));
    if (/invalid password/i.test(chyba)) return null;
    throw new Error(`PDF sa nepodarilo odheslovať: ${chyba.trim().slice(0, 200) || `qpdf ${kod}`}`);
  });
}

export type HesloFirmy = { id: string; nazov: string; odosielatel: string | null; heslo: string };

/** Uložené heslá firmy (rozšifrované), najprv tie, ktoré sedia na odosielateľa. */
export async function heslaFirmy(admin: any, companyId: string, odosielatel?: string | null): Promise<HesloFirmy[]> {
  const { data } = await admin
    .from("pdf_hesla")
    .select("id, nazov, odosielatel, heslo_sifrovane")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (!data?.length) return [];
  const { decryptSecret } = await import("./payment-crypto.server");
  const od = String(odosielatel ?? "").toLowerCase();
  const sedi = (h: { odosielatel: string | null }) => {
    const v = String(h.odosielatel ?? "").toLowerCase().replace(/^@/, "");
    return !!v && !!od && (od === v || od.endsWith(`@${v}`) || od.endsWith(`.${v}`));
  };
  const out: HesloFirmy[] = [];
  for (const h of data as any[]) {
    try {
      out.push({ id: h.id, nazov: h.nazov, odosielatel: h.odosielatel, heslo: decryptSecret(h.heslo_sifrovane) });
    } catch {
      /* poškodený záznam neblokuje ostatné heslá */
    }
  }
  return out.sort((a, b) => Number(sedi(b)) - Number(sedi(a)));
}

/**
 * PDF pripravené na čítanie: bez hesla nezmenené; s obmedzeniami odstránené;
 * so heslom odomknuté uloženým heslom firmy (`odomknute`), inak `zaheslovane`.
 */
export async function pripravPdf(
  admin: any,
  companyId: string | null,
  bajty: Buffer,
  opts: { odosielatel?: string | null; heslo?: string | null } = {},
): Promise<{ bajty: Buffer; zaheslovane: boolean; odomknute: boolean; zmenene: boolean }> {
  const stav = await stavPdf(bajty).catch(() => "nezname" as StavPdf);
  if (stav === "bez_hesla" || stav === "nezname") return { bajty, zaheslovane: false, odomknute: false, zmenene: false };
  if (stav === "len_obmedzenia") {
    const cisty = await odheslujPdf(bajty, null).catch(() => null);
    return { bajty: cisty ?? bajty, zaheslovane: false, odomknute: false, zmenene: !!cisty };
  }
  const kandidati = [
    ...(opts.heslo ? [opts.heslo] : []),
    ...(companyId ? (await heslaFirmy(admin, companyId, opts.odosielatel)).map((h) => h.heslo) : []),
  ];
  for (const heslo of kandidati) {
    const out = await odheslujPdf(bajty, heslo).catch(() => null);
    if (out) return { bajty: out, zaheslovane: false, odomknute: true, zmenene: true };
  }
  return { bajty, zaheslovane: true, odomknute: false, zmenene: false };
}
