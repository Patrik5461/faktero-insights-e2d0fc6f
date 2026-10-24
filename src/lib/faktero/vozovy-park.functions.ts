import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizujPreukaz, type PrecitanyPreukaz } from "./vozovy-park";

const POKYN = `Si asistent pre slovenské a české osvedčenia o evidencii vozidla (technický preukaz, časť I alebo II, „malý“ a „veľký“ TP).
Z dokumentu prečítaj údaje o vozidle. Polia osvedčenia majú kódy podľa smernice EÚ:
A = evidenčné číslo (ŠPZ), B = dátum prvej evidencie, C.1.1/C.1.2 = držiteľ (meno/názov), C.2 alebo C.4 = vlastník, D.1 = značka, D.3 = obchodný názov (model),
E = VIN (identifikačné číslo vozidla), F.2 = najväčšia prípustná celková hmotnosť (kg), J = kategória (M1, N1…), P.1 = zdvihový objem (cm³), P.2 = výkon (kW),
P.3 = palivo, R = farba, S.1 = počet miest na sedenie. Rok výroby býva v poli „Rok výroby“ alebo ho nevypĺňaj.

Pravidlá:
- Dátumy vracaj vo formáte YYYY-MM-DD.
- Čísla bez jednotiek a bez medzier.
- vlastnik_ico = IČO vlastníka, ak je uvedené.
- fuel_type: "nafta", "benzín", "elektro", "LPG", "CNG" alebo "hybrid".
- Keď údaj v dokumente nie je alebo sa nedá prečítať, daj null. Nič si nevymýšľaj.

Vráť VÝHRADNE JSON:
{"license_plate":string|null,"vin":string|null,"znacka":string|null,"model":string|null,"kategoria":string|null,"farba":string|null,"rok_vyroby":number|null,"datum_prvej_evidencie":"YYYY-MM-DD"|null,"objem_cm3":number|null,"vykon_kw":number|null,"celkova_hmotnost_kg":number|null,"pocet_miest":number|null,"fuel_type":string|null,"vlastnik_nazov":string|null,"vlastnik_ico":string|null,"drzitel_nazov":string|null}`;

/**
 * Prečíta technický preukaz už nahratý k vozidlu. Súbor ide zo súkromného
 * kbelíka `vehicle-docs` cez klienta prihláseného človeka, takže cudzí
 * dokument sa sem nedostane (politiky úložiska pustia len členov firmy).
 */
export const precitajTechnickyPreukazFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), file_path: z.string().min(3).max(500) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<PrecitanyPreukaz> => {
    const { supabase, userId } = context as any;
    const { data: clen } = await supabase.rpc("is_company_member", {
      _company_id: data.company_id,
      _user_id: userId,
    });
    if (!clen) throw new Error("Nemáte prístup k firme.");
    if (!data.file_path.startsWith(`${data.company_id}/`))
      throw new Error("Dokument nepatrí firme.");

    const { data: subor, error } = await supabase.storage
      .from("vehicle-docs")
      .download(data.file_path);
    if (error || !subor) throw new Error("Dokument sa nepodarilo načítať.");
    const mime = (subor.type || "application/pdf").split(";")[0];
    if (!/^(application\/pdf|image\/(png|jpe?g|webp|heic))$/i.test(mime)) {
      throw new Error("Prečítať sa dá PDF alebo fotka technického preukazu.");
    }
    const base64 = Buffer.from(await subor.arrayBuffer()).toString("base64");

    const { aiVision } = await import("./ai.server");
    const { odpovedNaJson } = await import("./json-odpoved");
    const odpoved = await aiVision(base64, mime, POKYN, {
      ucel: "vozidlo",
      firma: data.company_id,
    });
    const parsed = odpovedNaJson<any>(odpoved);
    if (!parsed) throw new Error("Z technického preukazu sa nepodarilo prečítať nič.");
    return normalizujPreukaz(parsed);
  });
