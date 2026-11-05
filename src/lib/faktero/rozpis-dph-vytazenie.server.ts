/**
 * Opätovné vyťaženie rozpisu DPH z jedného uloženého súboru — pre opravný
 * skript (`scripts/oprava-rozpisu-dph.ts`). Číta tým istým pokynom ako
 * Nespracované (`precitajDoklad`), takže ide cez meranie `ai_pouzitie`, a
 * výsledok prejde tou istou kontrolou. Nič nezapisuje do databázy.
 */
import type { RiadokDph, VysledokKontroly } from "./rozpis-dph-kontrola";

type Klient = any;

export type VytazenyRozpisDph = {
  /** Surová odpoveď AI (alebo údaje z vloženého XML). */
  ai: Record<string, unknown>;
  rozpis: RiadokDph[];
  bezDph: number;
  dph: number;
  spolu: number;
  reverseCharge: boolean;
  /** Veta o prenesení, ako je na doklade. */
  text?: string;
  /** Odkiaľ rozpis je: tabuľka z dokladu, položky, alebo sumy. */
  zdroj: "doklad" | "polozky" | "sumy" | "ziadny";
  kontrola: VysledokKontroly;
};

export async function vytazRozpisDph(
  sb: Klient,
  args: {
    bucket: string;
    path: string;
    mime?: string | null;
    /** Krajina firmy (sadzby); voľný text ako `companies.country`. */
    krajina?: string | null;
    firmaId?: string | null;
  },
): Promise<VytazenyRozpisDph | null> {
  const { data: subor, error } = await sb.storage.from(args.bucket).download(args.path);
  if (error || !subor) throw new Error(`Súbor ${args.bucket}/${args.path} sa nepodarilo načítať.`);
  const bajty = Buffer.from(await subor.arrayBuffer());
  const mime =
    args.mime ||
    (/\.pdf$/i.test(args.path)
      ? "application/pdf"
      : /\.png$/i.test(args.path)
        ? "image/png"
        : /\.xml$/i.test(args.path)
          ? "application/xml"
          : "image/jpeg");
  const { precitajDoklad } = await import("./mail-prijem.server");
  const ai = await precitajDoklad(bajty.toString("base64"), mime, null, {
    ucel: "oprava-rozpisu-dph",
    firma: args.firmaId ?? null,
  });
  if (!ai) return null;
  const { rozpisZVytazenia } = await import("./rozpis-dph-vytazeny");
  const v = rozpisZVytazenia(ai, { krajina: args.krajina ?? "SK" });
  const n = (x: unknown) => {
    const c = Number(x);
    return Number.isFinite(c) ? Math.abs(c) : 0;
  };
  const bezDph = v.sumy?.bezDph ?? 0;
  const dph = v.sumy?.dph ?? 0;
  const text = typeof ai.reverse_charge_text === "string" ? ai.reverse_charge_text : undefined;
  return {
    ai,
    rozpis: v.rozpis.map((r) => ({ rate: r.sadzba, base: r.zaklad, vat: r.dph })),
    bezDph,
    dph,
    spolu: n(ai.amount_total) || Math.round((bezDph + dph) * 100) / 100,
    reverseCharge: v.prenesenie || ai.reverse_charge === true,
    ...(text ? { text } : {}),
    zdroj: v.zdroj,
    kontrola: v.kontrola,
  };
}
