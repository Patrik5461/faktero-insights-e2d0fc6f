/*
  Vymazanie údajov testovacej firmy („začať odznova“).

  Postup: overí správcu (majiteľ/admin/účtovník) TESTOVACEJ firmy a že firma
  je naozaj testovacia, zmaže jej súbory zo Storage a zavolá
  `faktero_obnov_testovaciu_firmu` — tá firmu zmaže a založí znova s tým
  istým id, s údajmi a členmi skopírovanými zo skutočnej firmy.

  Súbory idú cez Storage API, lebo `storage.protect_delete()` nedovolí
  zmazať objekty obyčajným SQL a kaskáda na ne nesiaha.
*/
import { overPristup } from "./over-pristup";
import { jeTestovaciaFirma } from "./testovacia-firma.server";

/**
 * Úložiská, v ktorých cesta súboru začína `<company_id>/`. Overené 17. 11.
 * 2026 nad storage.objects — `rozdelovac`, `podpora-prilohy` a dočasné
 * úložiská firmu v ceste nemajú.
 */
export const BUCKETY_FIRMY = [
  "bank-statements",
  "company-logos",
  "efaktura-xml",
  "employee-docs",
  "expense-receipts",
  "export-firmy",
  "financing-documents",
  "imports",
  "invoice-attachments",
  "invoice-pdfs",
  "nespracovane",
  "other-docs",
  "product-photos",
  "purchase-invoices",
  "vehicle-docs",
] as const;

type Ulozisko = {
  storage: {
    from: (bucket: string) => {
      list: (
        prefix: string,
        o?: { limit?: number; offset?: number },
      ) => Promise<{ data: { name: string; id?: string | null }[] | null; error: unknown }>;
      remove: (cesty: string[]) => Promise<{ error: unknown }>;
    };
  };
};

const STRANA = 1000;

/** Cesty všetkých súborov pod prefixom, aj vo vnorených priečinkoch (po stranách). */
async function cesty(k: Ulozisko, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += STRANA) {
    const { data, error } = await k.storage.from(bucket).list(prefix, { limit: STRANA, offset });
    if (error) throw new Error(`Súbory v ${bucket} sa nepodarilo načítať.`);
    for (const p of data ?? []) {
      const cesta = `${prefix}/${p.name}`;
      // Priečinok sa od súboru pozná podľa chýbajúceho `id`.
      if (p.id) out.push(cesta);
      else out.push(...(await cesty(k, bucket, cesta)));
    }
    if ((data ?? []).length < STRANA) break;
  }
  return out;
}

/** Zmaže všetky súbory firmy zo všetkých úložísk. Vracia počet zmazaných. */
export async function zmazSuboryTestovacejFirmy(k: Ulozisko, companyId: string): Promise<number> {
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) throw new Error("Neplatná firma.");
  let spolu = 0;
  for (const bucket of BUCKETY_FIRMY) {
    const zoznam = await cesty(k, bucket, companyId);
    for (let i = 0; i < zoznam.length; i += 100) {
      const davka = zoznam.slice(i, i + 100);
      const { error } = await k.storage.from(bucket).remove(davka);
      if (error) throw new Error(`Súbory v ${bucket} sa nepodarilo zmazať.`);
      spolu += davka.length;
    }
  }
  return spolu;
}

type Admin = Ulozisko & {
  from: (t: "companies") => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: any }>;
};

/** Celé vymazanie. `ctx.supabase` je klient prihláseného (RLS), `admin` servisný. */
export async function vymazTestovaciuFirmu(
  ctx: { supabase: any; userId: string },
  companyId: string,
  admin: Admin,
): Promise<{ subory: number }> {
  await overPristup(ctx, companyId, { spravca: true });
  // Fail-closed: chyba DB vyhodí, nikdy nepokračuje na skutočnej firme.
  if (!(await jeTestovaciaFirma(companyId, admin))) {
    throw new Error("Vymazať údaje sa dajú len v testovacej firme.");
  }
  const subory = await zmazSuboryTestovacejFirmy(admin, companyId);
  const { error } = await admin.rpc("faktero_obnov_testovaciu_firmu", { _company_id: companyId });
  if (error) throw new Error(`Údaje testovacej firmy sa nepodarilo vymazať: ${error.message}`);
  return { subory };
}
