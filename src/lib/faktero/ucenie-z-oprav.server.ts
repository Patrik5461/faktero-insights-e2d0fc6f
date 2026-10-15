/*
  Učenie z opráv — čítanie a zápis návykov (`doklad_navyky`) a doplnenie
  návrhu do údajov nespracovaného dokladu. Logika je v `ucenie-z-oprav.ts`.

  Klient je ten, ktorý dostane volajúci: pri vytvorení a zaúčtovaní
  prihlásený používateľ (RLS, oblasť „doklady"), pri vyťažení na pozadí
  `supabaseAdmin` — vtedy je firma vždy z riadka nespracovaného dokladu,
  nikdy z požiadavky. Učenie je doplnok: žiadna chyba tu nesmie zastaviť
  vytvorenie či vyťaženie dokladu.
*/

import type { UdajeNespracovaneho } from "./nespracovane";
import {
  prvePravidlo,
  typPrijatej,
  type DokladNaPorovnanie,
  type Pravidlo,
} from "./pravidla-uctovania";
import {
  bezNaucenychPodPravidlom,
  doplnNaucene,
  klucDodavatela,
  navrhPola,
  poliaPravidla,
  pridajVolby,
  zmeneneNaucene,
  type DruhUcenia,
  type PoleUcenia,
  type PoliaNavyku,
} from "./ucenie-z-oprav";

type Klient = any;

async function nacitajPolia(
  supabase: Klient,
  companyId: string,
  kluc: string,
  druh: DruhUcenia,
): Promise<PoliaNavyku | null> {
  const { data } = await supabase
    .from("doklad_navyky")
    .select("polia")
    .eq("company_id", companyId)
    .eq("kluc_dodavatela", kluc)
    .eq("druh", druh)
    .maybeSingle();
  return (data?.polia as PoliaNavyku | undefined) ?? null;
}

/** Doklad v tvare, v akom ho porovnáva spúšťač pravidiel. */
function naPorovnanie(
  u: UdajeNespracovaneho,
  druh: DruhUcenia,
  createdBy: string | null,
  predmetMailu: string | null,
): DokladNaPorovnanie {
  const blocek = druh === "blocek";
  return {
    supplier_ico: u.dodavatel.ico || null,
    supplier_name: u.dodavatel.nazov || (blocek ? null : "Neurčený dodávateľ"),
    // Rovnaké predvolené hodnoty ako `prijataZUdajov` / `blocekZUdajov`.
    payment_method: u.platba || (blocek ? "karta" : "prevod"),
    created_by: createdBy,
    predmet_mailu: predmetMailu,
    druh: blocek ? "blocek" : "prijata",
    typ: blocek
      ? null
      : typPrijatej(
          druh === "zalohova" ? "proforma" : "regular",
          druh === "dobropis" ? -1 : 1,
          u.opravuje,
        ),
  };
}

/** Polia, ktoré na tento doklad vyplní ručné pravidlo (prvé platné, ako v databáze). */
export async function poliaRucnehoPravidla(
  supabase: Klient,
  companyId: string,
  u: UdajeNespracovaneho,
  druh: DruhUcenia,
  createdBy: string | null,
  predmetMailu: string | null,
): Promise<PoleUcenia[]> {
  const { data } = await supabase
    .from("pravidla_uctovania")
    .select("*")
    .eq("company_id", companyId)
    .eq("aktivne", true);
  const p = prvePravidlo(
    (data ?? []) as Pravidlo[],
    naPorovnanie(u, druh, createdBy, predmetMailu),
  );
  return poliaPravidla(p);
}

async function predmetMailu(
  supabase: Klient,
  inboxMessageId: string | null | undefined,
): Promise<string | null> {
  if (!inboxMessageId) return null;
  const { data } = await supabase
    .from("inbox_messages")
    .select("subject")
    .eq("id", inboxMessageId)
    .maybeSingle();
  return data?.subject ?? null;
}

/**
 * Doplní do údajov naučené hodnoty pre dodávateľa a druh — len do prázdnych
 * polí, mimo polí ručného pravidla a mimo polí, ktoré človek po minulom
 * doplnení zmenil. Pri akejkoľvek chybe vráti údaje bez zmeny.
 */
export async function doplnUcenim(
  supabase: Klient,
  args: {
    companyId: string;
    druh: string | null | undefined;
    udaje: UdajeNespracovaneho;
    createdBy: string | null;
    inboxMessageId?: string | null;
  },
): Promise<UdajeNespracovaneho> {
  const { companyId, udaje: u } = args;
  const druh = args.druh;
  if (druh !== "faktura" && druh !== "zalohova" && druh !== "dobropis" && druh !== "blocek")
    return u;
  try {
    const kluc = klucDodavatela(u.dodavatel);
    if (!kluc) return u;
    const polia = await nacitajPolia(supabase, companyId, kluc, druh);
    if (!polia) return u;
    /*
      Spúšťač pravidiel dopĺňa až pri zápise dokladu a len prázdne polia —
      naučená hodnota by ho prebila. Polia pravidla sa preto vynechajú tu
      a ešte raz sa prečistia pri vytvorení (človek mohol zmeniť platbu,
      a tým aj to, ktoré pravidlo platí).
    */
    const pravidlo = await poliaRucnehoPravidla(
      supabase,
      companyId,
      u,
      druh,
      args.createdBy,
      await predmetMailu(supabase, args.inboxMessageId),
    );
    let platneZakazky: Set<string> | null = null;
    const zakazka = navrhPola(polia.zakazka);
    if (zakazka && !u.jobId) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id")
        .eq("company_id", companyId)
        .eq("id", zakazka)
        .eq("status", "active")
        .maybeSingle();
      platneZakazky = new Set(job?.id ? [job.id] : []);
    }
    return doplnNaucene(u, druh, polia, {
      chranene: [...pravidlo, ...zmeneneNaucene(u)],
      platneZakazky: platneZakazky ?? new Set(),
    });
  } catch {
    return u;
  }
}

/** Pred zápisom dokladu: naučené hodnoty v poliach ručného pravidla nechá na spúšťač. */
export async function pripravNaZapis(
  supabase: Klient,
  args: {
    companyId: string;
    druh: DruhUcenia;
    udaje: UdajeNespracovaneho;
    createdBy: string | null;
    predmetMailu: string | null;
  },
): Promise<UdajeNespracovaneho> {
  if (!args.udaje.naucene || !Object.keys(args.udaje.naucene).length) return args.udaje;
  try {
    const polia = await poliaRucnehoPravidla(
      supabase,
      args.companyId,
      args.udaje,
      args.druh,
      args.createdBy,
      args.predmetMailu,
    );
    return bezNaucenychPodPravidlom(args.udaje, polia);
  } catch {
    return args.udaje;
  }
}

/**
 * Zapamätá voľby človeka pre dodávateľa. `dokladId` — oprava už
 * vytvoreného dokladu nahradí jeho predchádzajúcu voľbu, nepridá ďalšiu.
 * Zápis je čítanie + upsert; súbeh dvoch zápisov pre toho istého
 * dodávateľa v tej istej sekunde môže jednu voľbu stratiť — pri návrhoch to
 * nevadí.
 */
export async function zaznamenajVolby(
  supabase: Klient,
  args: {
    companyId: string;
    druh: DruhUcenia;
    dodavatel: { ico?: string | null; icDph?: string | null; nazov?: string | null };
    volby: Partial<Record<PoleUcenia, string | null | undefined>>;
    dokladId?: string | null;
    userId?: string | null;
  },
): Promise<void> {
  try {
    const kluc = klucDodavatela(args.dodavatel);
    if (!kluc || !Object.keys(args.volby).length) return;
    const { data: stary } = await supabase
      .from("doklad_navyky")
      .select("polia, pocet")
      .eq("company_id", args.companyId)
      .eq("kluc_dodavatela", kluc)
      .eq("druh", args.druh)
      .maybeSingle();
    const teraz = new Date().toISOString();
    const polia = pridajVolby(
      stary?.polia as PoliaNavyku | undefined,
      args.volby,
      teraz,
      args.dokladId,
    );
    await supabase.from("doklad_navyky").upsert(
      {
        company_id: args.companyId,
        kluc_dodavatela: kluc,
        druh: args.druh,
        nazov_dodavatela:
          String(args.dodavatel.nazov ?? "")
            .trim()
            .slice(0, 200) || null,
        polia: polia as any,
        pocet: Number(stary?.pocet ?? 0) + 1,
        naposledy: teraz,
        updated_by: args.userId ?? null,
      },
      { onConflict: "company_id,kluc_dodavatela,druh" },
    );
  } catch {
    /* Učenie je doplnok — doklad je uložený. */
  }
}
