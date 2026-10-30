import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
/*
  Konvertor šablóny XLSX/CSV na XML Pohody. Riadky prečíta prehliadač, sem
  prídu ako objekty podľa hlavičky. Doklady vzniknú len v pamäti a prevedú
  sa tým istým exportom ako doklady z Faktera (s predkontáciami a nastaveniami
  firmy). Do databázy sa nič nezapisuje — ani export, ani doklad.
*/

const STROP_RIADKOV = 5000;

export const konvertorDoPohodyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        druh: z.enum(["vydane", "prijate", "blocky"]),
        riadky: z.array(z.record(z.string(), z.unknown())).max(STROP_RIADKOV),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    // Firma cez klienta prihláseného — RLS pustí len člena firmy.
    const { data: company, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", data.company_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!company) throw new Error("Firma sa nenašla alebo k nej nemáte prístup.");

    const { prevedRiadky } = await import("./konvertor");
    const { domacaMena } = await import("./kurzy");
    const { faktury, doklady, chyby } = prevedRiadky(data.druh, data.riadky, {
      domacaMena: domacaMena(company.country),
    });
    if (!faktury.length && !doklady.length) {
      throw new Error(
        chyby.length ? chyby.slice(0, 10).join(" · ") : "Tabuľka neobsahuje žiadny doklad.",
      );
    }

    const { buildPohodaInvoiceXml, buildPohodaExpensesXml, pohodaPrekazka } =
      await import("./export.server");
    const { nastaveniaFaktur, nastaveniaDokladovPohody } = await import("./export-priprava.server");
    const { doplnkyExportu } = await import("./export-nastavenia.server");
    const { prekazkaDokladu } = await import("./pohoda-kontrola");
    // Partneri z tabuľky v adresári Faktera nie sú — párovať ich nie je s čím.
    const doplnky = {
      ...(await doplnkyExportu(supabase, company)),
      partneriVPohode: [] as string[],
    };

    const preskocene: string[] = [...chyby];
    let xml = "";
    let pocet = 0;
    if (data.druh === "vydane") {
      const nastavenia = { ...nastaveniaFaktur(company), ...doplnky };
      const ok = faktury.filter(({ invoice, items }) => {
        const dovod = pohodaPrekazka(invoice as any, company, {
          items: items as any[],
          nastavenia,
        });
        if (dovod) preskocene.push(dovod);
        return !dovod;
      });
      pocet = ok.length;
      if (ok.length) xml = buildPohodaInvoiceXml({ company, invoices: ok as any, nastavenia });
    } else {
      const nastavenia = {
        ...(await nastaveniaDokladovPohody(supabase, company, doklady)),
        ...doplnky,
      };
      const ok = doklady.filter((d) => {
        const dovod = prekazkaDokladu(d as any, company, nastavenia as any);
        if (dovod) preskocene.push(dovod);
        return !dovod;
      });
      pocet = ok.length;
      if (ok.length) xml = buildPohodaExpensesXml({ company, doklady: ok as any, nastavenia });
    }
    if (!xml)
      throw new Error(preskocene.slice(0, 10).join(" · ") || "Žiadny doklad sa nedal previesť.");

    const dnes = dnesBratislava();
    return {
      xml,
      fileName: `pohoda-${data.druh === "vydane" ? "vydane-faktury" : data.druh === "prijate" ? "prijate-faktury" : "blocky"}-${dnes}.xml`,
      pocet,
      preskocene,
    };
  });
