import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Čísla faktúr dopredu — aby sa dalo fakturovať aj bez signálu.
 *
 * Bežne prideľuje číslo server až pri vystavení, a to je správne: dvaja ľudia
 * naraz tak nikdy nedostanú to isté. Lenže remeselník po oprave alebo predajca
 * z auta potrebuje odovzdať doklad na mieste, aj keď telefón nemá signál.
 *
 * Riešenie je vypýtať si zopár čísel dopredu, kým signál je. Rezervácia je pre
 * generátor rovnako záväzná ako vystavená faktúra, takže sa to isté číslo
 * nedostane nikam inam. Keď sa nepoužije, po vypršaní prestane blokovať a
 * číslo sa vráti do rady — generátor hľadá najnižšie voľné, takže dieru sám
 * zaplní. Trvalé diery v číselnom rade z toho teda nevznikajú.
 */

const Rezervuj = z.object({
  company_id: z.string().uuid(),
  /** Koľko čísel dopredu. Viac než pár dní práce dopredu nemá zmysel držať. */
  count: z.number().int().min(1).max(30).default(5),
  /** Ktorý telefón si ich drží — nech sa dá dohľadať, kde číslo uviazlo. */
  device: z.string().max(120).optional().nullable(),
  /** Po koľkých dňoch sa nepoužité čísla vrátia do rady. */
  days: z.number().int().min(1).max(90).default(14),
});

export type RezervovaneCislo = {
  invoice_number: string;
  sequence_number: number;
  issue_date: string;
  expires_at: string;
};

export const rezervujCislaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Rezervuj.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r, error } = await supabase.rpc("faktero_reserve_invoice_numbers", {
      _company_id: data.company_id,
      _count: data.count,
      _device: data.device ?? null,
      _days: data.days,
    } as never);
    if (error) throw new Error(error.message);
    return { cisla: (r ?? []) as unknown as RezervovaneCislo[] };
  });

const Uvolni = z.object({
  company_id: z.string().uuid(),
  /** Bez zoznamu sa vrátia všetky nepoužité čísla tohto človeka. */
  numbers: z.array(z.string().max(60)).max(60).optional().nullable(),
});

export const uvolniCislaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Uvolni.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r, error } = await supabase.rpc("faktero_release_invoice_numbers", {
      _company_id: data.company_id,
      _numbers: data.numbers?.length ? data.numbers : null,
    } as never);
    if (error) throw new Error(error.message);
    return { uvolnene: Number(r ?? 0) };
  });

const Stav = z.object({ company_id: z.string().uuid() });

/**
 * Ktoré čísla ešte držíme.
 *
 * Appka si zoznam pamätá v telefóne, ale po preinštalovaní alebo na druhom
 * zariadení by o ňom nevedela — a čísla by ležali ladom až do vypršania.
 */
export const stavRezervaciiFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Stav.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r, error } = await supabase
      .from("invoice_number_reservations")
      .select("invoice_number, sequence_number, issue_date, expires_at, used_at")
      .eq("company_id", data.company_id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("sequence_number");
    if (error) throw new Error(error.message);
    return { cisla: (r ?? []) as unknown as RezervovaneCislo[] };
  });
