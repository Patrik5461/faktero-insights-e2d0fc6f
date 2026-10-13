/*
  Po importe faktúr z iného systému: číslovanie pokračuje tam, kde v ňom
  firma skončila.

  Pre každý druh dokladu (faktúra, zálohová, dobropis…) sa z naimportovaných
  čísel rozpozná šablóna a posledné poradie (`rozpoznajRad`). Keď firma ešte
  žiadny doklad toho druhu vo Fakteri nevystavila, predvolený rad sa nastaví
  sám. Inak sa len ponúkne — vlastné číslovanie sa bez opýtania nemení.
*/
import {
  NAZVY_DRUHOV,
  druhPodlaTypuFaktury,
  rozpoznajRad,
  ukazkaCisla,
  type DruhRadu,
} from "./ciselne-rady";
import { vsetkyRiadky } from "./strankovanie";

export type RadZImportu = {
  druh: DruhRadu;
  nazov: string;
  format: string;
  /** Najvyššie naimportované číslo — z neho sa pri ručnom potvrdení pokračuje. */
  cislo: string;
  datum: string;
  dalsie: string;
  startFrom: number;
  nastavene: boolean;
};

export async function rozpoznajRadyPoImporte(
  db: any,
  companyId: string,
  /** false = len zistiť, nič nemeniť (tlačidlo v Číselných radoch). */
  nastavovat = true,
): Promise<RadZImportu[]> {
  const faktury = await vsetkyRiadky<any>((od, po) =>
    db
      .from("invoices")
      .select("id, type, invoice_number, issue_date, imported_at, status")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("id")
      .range(od, po),
  );
  const podlaDruhu = new Map<DruhRadu, { importovane: any[]; vlastnych: number }>();
  for (const f of faktury) {
    const druh = druhPodlaTypuFaktury(f.type);
    const s = podlaDruhu.get(druh) ?? { importovane: [], vlastnych: 0 };
    if (f.imported_at) s.importovane.push(f);
    else if (f.status !== "draft") s.vlastnych += 1;
    podlaDruhu.set(druh, s);
  }

  const vysledok: RadZImportu[] = [];
  for (const [druh, s] of podlaDruhu) {
    if (!s.importovane.length) continue;
    const r = rozpoznajRad(
      s.importovane.map((f) => ({ cislo: f.invoice_number, datum: f.issue_date })),
    );
    if (!r) continue;
    const datum =
      s.importovane.find((f) => f.invoice_number?.trim() === r.cislo)?.issue_date ?? null;
    let nastavene = false;
    if (nastavovat && s.vlastnych === 0) {
      const { data: rad } = await db
        .from("number_series")
        .select("id, format, start_from")
        .eq("company_id", companyId)
        .eq("kind", druh)
        .eq("is_default", true)
        .maybeSingle();
      const zmena = {
        format: r.format,
        start_from: r.startFrom,
        updated_at: new Date().toISOString(),
      };
      const { error } = rad
        ? await db.from("number_series").update(zmena).eq("id", rad.id).eq("company_id", companyId)
        : await db.from("number_series").insert({
            company_id: companyId,
            kind: druh,
            name: NAZVY_DRUHOV[druh],
            is_default: true,
            ...zmena,
          });
      nastavene = !error;
      if (error) console.warn("[import] číselný rad:", druh, error.message);
    }
    vysledok.push({
      druh,
      nazov: NAZVY_DRUHOV[druh],
      format: r.format,
      cislo: r.cislo,
      datum: String(datum ?? "").slice(0, 10),
      dalsie: ukazkaCisla(r.format, r.startFrom),
      startFrom: r.startFrom,
      nastavene,
    });
  }
  return vysledok;
}
