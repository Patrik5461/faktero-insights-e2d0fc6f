/*
  Bloček → doklad o úhrade prijatej faktúry alebo Iný doklad — serverová časť.

  Všetko ide klientom prihláseného (RLS oblastí „doklady“ a „ostatne“);
  práva, zámok a aktívnu firmu stráži `blocek-uhrada.functions.ts`. Pôvodný
  bloček ide do koša rovnako ako pri mazaní (`blocekDoKosa`), takže zmizne
  z DPH aj nákladov a dá sa obnoviť. Priloženie a úhrada sú tie isté ako pri
  doklade o úhrade v Nespracovaných (`prilozUhraduKFakture`).
*/
import { blocekDoKosa } from "./doklad-kos.server";
import {
  jeBlocekUhradou,
  ostatnyZBlocku,
  popisBlocku,
  POZNAMKA_UHRADY_Z_BLOCKU,
  rozhodnutieBlocku,
  udajeUhradyBlocku,
  zamokBlocku,
  type RiadokBlocku,
} from "./blocek-uhrada";
import { PREDPONA_INEJ_SUMY, zhodyPrijatych, type Dovod, type UdajeUhrady, type ZhodaPrijatej } from "./nespracovane-uhrada";
import { prijateKUhradam, prilozUhraduKFakture, type Preskoceny, type VysledokUhrady } from "./nespracovane-uhrada.server";
import { bezpecneMeno } from "./ostatne-doklady";
import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";

type Klient = any;
const KOS_BLOCKOV = "expense-receipts";
const KOS_OSTATNYCH = "other-docs";

/** Dátum uzávierky firmy (`companies.locked_until`). */
export async function zamknuteDoFirmy(supabase: Klient, companyId: string): Promise<string | null> {
  const { data } = await supabase.from("companies").select("locked_until").eq("id", companyId).maybeSingle();
  return (data?.locked_until as string | null | undefined) ?? null;
}

/** Bloček podľa id (RLS: cudzí sa neprečíta). */
export async function nacitajBlocek(supabase: Klient, id: string): Promise<Record<string, any>> {
  const { data, error } = await supabase.from("expense_documents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Bloček sa nenašiel — možno ho už niekto presunul alebo zmazal.");
  return data;
}

/** Zamknutý bloček (odovzdaný, zamknutý, uzavreté obdobie) — vyhodí s dôvodom. */
export function overZamok(r: RiadokBlocku, zamknuteDo: string | null): void {
  const z = zamokBlocku(r, zamknuteDo);
  if (z) throw new Error(z.text);
}

export type NavrhBlocku = {
  jeUhrada: boolean;
  uhrada: UdajeUhrady;
  zhody: ZhodaPrijatej[];
  zamok: Dovod | null;
};

/** Pre detail bločku: vyzerá ako úhrada?, údaje úhrady, zhody prijatých faktúr, zámok. */
export async function navrhBlocku(supabase: Klient, r: RiadokBlocku & { company_id: string }): Promise<NavrhBlocku> {
  const uhrada = udajeUhradyBlocku(r);
  const [kandidati, zamknuteDo] = await Promise.all([
    prijateKUhradam(supabase, r.company_id, [uhrada]),
    zamknuteDoFirmy(supabase, r.company_id),
  ]);
  return {
    jeUhrada: jeBlocekUhradou(r),
    uhrada,
    zhody: zhodyPrijatych(kandidati, uhrada),
    zamok: zamokBlocku(r, zamknuteDo),
  };
}

/**
 * Súbor bločku k prijatej faktúre ako doklad o úhrade, nezaplatená faktúra
 * sa označí ako uhradená a bloček ide do koša. Zamknutý bloček odmietne;
 * keď suma nesedí, bez `ajInuSumu` odmietne s predponou `INA_SUMA:`.
 */
export async function priradBlocekKFakture(
  supabase: Klient,
  userId: string,
  r: Record<string, any>,
  purchaseInvoiceId: string,
  volby: { ajInuSumu?: boolean; zamknuteDo?: string | null } = {},
): Promise<VysledokUhrady> {
  overZamok(r, volby.zamknuteDo !== undefined ? volby.zamknuteDo : await zamknuteDoFirmy(supabase, r.company_id));
  const uhrada = udajeUhradyBlocku(r);
  return prilozUhraduKFakture(
    supabase,
    userId,
    {
      companyId: r.company_id,
      kos: KOS_BLOCKOV,
      filePath: r.file_path,
      fileMime: r.file_mime,
      fileName: r.file_path ? String(r.file_path).split("/").pop() : null,
      uhrada,
      poznamka: POZNAMKA_UHRADY_Z_BLOCKU,
    },
    purchaseInvoiceId,
    { ajInuSumu: volby.ajInuSumu },
    () => blocekDoKosa(supabase, userId, r, `${popisBlocku(r, uhrada)} (doklad o úhrade faktúry)`),
  );
}

/**
 * Bloček → Iný doklad (druh „Iné“) s tým istým súborom, dodávateľom, dátumom
 * a sumou; bloček ide do koša. Keď sa niečo nepodarí, Iný doklad sa zmaže.
 */
export async function presunBlocekDoOstatnych(
  supabase: Klient,
  userId: string,
  r: Record<string, any>,
  volby: { zamknuteDo?: string | null } = {},
): Promise<{ id: string }> {
  overZamok(r, volby.zamknuteDo !== undefined ? volby.zamknuteDo : await zamknuteDoFirmy(supabase, r.company_id));
  const id = crypto.randomUUID();
  const udaje = ostatnyZBlocku(r, dnesBratislava());
  const { error: eZapisu } = await supabase.from("other_documents").insert({
    id,
    company_id: r.company_id,
    ...udaje,
    ...(udaje.status === "processed" ? { processed_at: new Date().toISOString(), processed_by: userId } : {}),
    created_by: userId,
  });
  if (eZapisu) throw new Error(eZapisu.message);

  let cesta: string | null = null;
  const vratit = async () => {
    await supabase.from("other_document_files").delete().eq("document_id", id);
    if (cesta) await supabase.storage.from(KOS_OSTATNYCH).remove([cesta]);
    await supabase.from("other_documents").delete().eq("id", id);
  };
  try {
    if (r.file_path) {
      const { data: subor, error: eStiahnutia } = await supabase.storage.from(KOS_BLOCKOV).download(r.file_path);
      if (eStiahnutia || !subor) throw new Error("Súbor bločku sa nepodarilo načítať.");
      const meno = String(r.file_path).split("/").pop() || "blocek.pdf";
      const bajty = new Uint8Array(await subor.arrayBuffer());
      const typ = r.file_mime || subor.type || "application/octet-stream";
      cesta = `${r.company_id}/${id}/${bezpecneMeno(meno)}`;
      const up = await supabase.storage.from(KOS_OSTATNYCH).upload(cesta, bajty, { contentType: typ, upsert: false });
      if (up.error) {
        cesta = null;
        throw new Error(`Súbor sa nepodarilo uložiť: ${up.error.message}`);
      }
      const { error: eSuboru } = await supabase.from("other_document_files").insert({
        document_id: id,
        company_id: r.company_id,
        path: cesta,
        name: meno.slice(0, 255),
        mime: typ,
        size: bajty.length,
        position: 0,
      });
      if (eSuboru) throw new Error(eSuboru.message);
    }
    await blocekDoKosa(supabase, userId, r, `${popisBlocku(r)} (presunutý do Iných dokladov)`);
  } catch (e) {
    await vratit();
    throw e;
  }
  return { id };
}

/** Hromadné „Priradiť úhrady k faktúram“ — len presná jedinečná zhoda, ostatné s dôvodom. */
export async function priradBlockyHromadne(
  supabase: Klient,
  userId: string,
  companyId: string,
  ids: string[],
): Promise<{ priradene: number; uhradene: number; preskocene: Preskoceny[] }> {
  const { data: rows, error } = await supabase
    .from("expense_documents")
    .select("*")
    .eq("company_id", companyId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const zamknuteDo = await zamknuteDoFirmy(supabase, companyId);
  const zaklad = ((rows ?? []) as any[]).map((r) => ({ r, uhrada: udajeUhradyBlocku(r) }));
  const kandidati = await prijateKUhradam(
    supabase,
    companyId,
    zaklad.filter((x) => jeBlocekUhradou(x.r)).map((x) => x.uhrada),
  );
  let priradene = 0;
  let uhradene = 0;
  const preskocene: Preskoceny[] = [];
  for (const { r, uhrada } of zaklad) {
    const popis = popisBlocku(r, uhrada);
    const rozh = rozhodnutieBlocku({
      r,
      zamok: zamokBlocku(r, zamknuteDo),
      uhrada,
      zhody: zhodyPrijatych(kandidati, uhrada),
    });
    if ("dovod" in rozh) {
      preskocene.push({ popis, dovod: rozh.dovod });
      continue;
    }
    try {
      const v = await priradBlocekKFakture(supabase, userId, r, rozh.purchaseInvoiceId, { zamknuteDo });
      priradene++;
      if (v.uhradene) uhradene++;
    } catch (e: any) {
      preskocene.push({ popis, dovod: { text: String(e?.message ?? "").replace(PREDPONA_INEJ_SUMY, "") || "Nepodarilo sa" } });
    }
  }
  return { priradene, uhradene, preskocene };
}

/** Hromadný presun do Iných dokladov — zamknuté sa preskočia s dôvodom. */
export async function presunBlockyDoOstatnych(
  supabase: Klient,
  userId: string,
  companyId: string,
  ids: string[],
): Promise<{ presunute: number; preskocene: Preskoceny[] }> {
  const { data: rows, error } = await supabase
    .from("expense_documents")
    .select("*")
    .eq("company_id", companyId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const zamknuteDo = await zamknuteDoFirmy(supabase, companyId);
  let presunute = 0;
  const preskocene: Preskoceny[] = [];
  for (const r of (rows ?? []) as any[]) {
    try {
      await presunBlocekDoOstatnych(supabase, userId, r, { zamknuteDo });
      presunute++;
    } catch (e: any) {
      preskocene.push({ popis: popisBlocku(r), dovod: { text: String(e?.message ?? "") || "Nepodarilo sa" } });
    }
  }
  return { presunute, preskocene };
}
