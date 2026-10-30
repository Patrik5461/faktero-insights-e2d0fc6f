/*
  Nespracované doklady — serverová časť: uloženie súboru, vyťaženie AI
  a vytvorenie skutočného dokladu, keď ho človek zaradí.
*/

import {
  blocekZUdajov,
  nacitajUdaje,
  navrhDruhu,
  ostatnyZUdajov,
  prijataZUdajov,
  polozkyZauctovane,
  udajeZAi,
  doplnUdaje,
  type DruhNespracovaneho,
  type PredvolbySkenu,
  type UdajeNespracovaneho,
} from "./nespracovane";
import { zdrojZauctovaniaPriVytvoreni } from "./nespracovane-nastavenia";

type Klient = any;
export const KOS_NESPRACOVANYCH = "nespracovane";

/** Nastavenia Nespracovaných dokladov firmy (`companies.uctovanie_nastavenia.nespracovane`). */
export async function nastaveniaNespracovanychFirmy(supabase: Klient, companyId: string) {
  const { nastaveniaNespracovanych } = await import("./nespracovane-nastavenia");
  const { data } = await supabase
    .from("companies")
    .select("uctovanie_nastavenia")
    .eq("id", companyId)
    .maybeSingle();
  return nastaveniaNespracovanych(data?.uctovanie_nastavenia);
}

/**
 * Voľby čítania dokladu cez AI podľa firmy — uprednostnená domáca mena
 * (`nespracovane.domacaMena`, predvolene zapnuté; SK EUR, CZ CZK).
 */
export async function volbyCitaniaFirmy(supabase: Klient, companyId: string) {
  const { nastaveniaNespracovanych } = await import("./nespracovane-nastavenia");
  const { menaPreVytazenie } = await import("./vytazenie-mena");
  const { data } = await supabase
    .from("companies")
    .select("country, uctovanie_nastavenia")
    .eq("id", companyId)
    .maybeSingle();
  const n = nastaveniaNespracovanych(data?.uctovanie_nastavenia);
  return {
    domacaMena: menaPreVytazenie(n.domacaMena, data?.country),
    predponyObjednavky: n.predponyObjednavky,
  };
}

/**
 * Vyťažené údaje po úprave podľa firmy (vypnuté položky, dodací list) a s
 * nastavením zo skenera — dopĺňa sa len to, čo doklad nepovedal.
 */
async function poNastaveniach(
  supabase: Klient,
  companyId: string,
  druh: DruhNespracovaneho | null,
  udaje: UdajeNespracovaneho,
  predvolby?: PredvolbySkenu | null,
  /** Odpoveď AI — hľadá sa v nej číslo objednávky podľa predpôn firmy. */
  ai?: Record<string, unknown> | null,
): Promise<UdajeNespracovaneho> {
  const { upravVytazeneUdaje, textyPreObjednavku } = await import("./nespracovane-nastavenia");
  let u = upravVytazeneUdaje(
    udaje,
    druh,
    await nastaveniaNespracovanychFirmy(supabase, companyId),
    textyPreObjednavku(ai),
  );
  const p = predvolby ?? u.predvolby;
  if (p && Object.values(p).some(Boolean)) {
    // Uplatní sa raz — „Dočítať z dokladu" neskôr neprepíše, čo človek medzitým zmenil.
    const { doplnZNastavenia } = await import("@/lib/mobile/sken-rozpoznanie");
    const { predvolby: _p, ...bez } = doplnZNastavenia(u, druh ?? "faktura", p);
    u = bez as UdajeNespracovaneho;
  }
  return u;
}

export function priponaSuboru(nazov: string | null | undefined, mime: string | null | undefined): string {
  const z = String(nazov ?? "").toLowerCase().split(".").pop() ?? "";
  if (/^[a-z0-9]{2,5}$/.test(z) && z !== String(nazov ?? "").toLowerCase()) return z;
  const m = String(mime ?? "");
  return m.includes("pdf") ? "pdf" : m.includes("png") ? "png" : m.includes("webp") ? "webp" : m.includes("heic") ? "heic" : "jpg";
}

/**
 * Založí nespracovaný doklad so súborom. `ai` (už prečítané, napr. z mailu)
 * ho rovno vyťaží; bez neho ostane v stave „číta sa" a vyťaží ho `vytazNespracovany`.
 */
export async function zalozNespracovany(
  supabase: Klient,
  args: {
    companyId: string;
    userId: string | null;
    zdroj: "mail" | "nahratie" | "skener" | "apka" | "api";
    bajty: Buffer;
    nazov: string | null;
    mime: string;
    ai?: Record<string, unknown> | null;
    druh?: DruhNespracovaneho | null;
    poznamka?: string | null;
    inboxMessageId?: string | null;
    /** Nastavenie zo skenera v appke — platí aj pre doklad dokončený na webe. */
    predvolby?: PredvolbySkenu | null;
    /** Do firmy ho zaradil rozdeľovač (osobná adresa alebo nahratie bez výberu firmy). */
    cezRozdelovac?: boolean;
  },
): Promise<{ id: string; udaje: UdajeNespracovaneho | null }> {
  const id = crypto.randomUUID();
  const cesta = `${args.companyId}/${id}.${priponaSuboru(args.nazov, args.mime)}`;
  const up = await supabase.storage
    .from(KOS_NESPRACOVANYCH)
    .upload(cesta, args.bajty, { contentType: args.mime, upsert: false });
  if (up.error) throw new Error(`Súbor sa nepodarilo uložiť: ${up.error.message}`);
  const dnes = new Date().toISOString().slice(0, 10);
  const vytazene = args.ai !== undefined;
  let udaje = vytazene ? udajeZAi(args.ai, dnes) : null;
  if (udaje && args.poznamka) udaje.poznamka = [udaje.poznamka, args.poznamka].filter(Boolean).join("\n");
  const druh = args.druh ?? (vytazene ? navrhDruhu(args.ai, args.nazov) : null);
  // Čo človek pri tomto dodávateľovi volil naposledy — len do prázdnych polí.
  if (udaje && args.ai) {
    const { doplnUcenim } = await import("./ucenie-z-oprav.server");
    udaje = await doplnUcenim(supabase, {
      companyId: args.companyId,
      druh,
      udaje,
      createdBy: args.userId,
      inboxMessageId: args.inboxMessageId,
    });
  }
  if (udaje) udaje = await poNastaveniach(supabase, args.companyId, druh, udaje, args.predvolby, args.ai);
  // Ešte nevyťažený doklad: nastavenie zo skenera počká v údajoch na vyťaženie.
  const predvolby = args.predvolby && Object.values(args.predvolby).some(Boolean) ? args.predvolby : null;
  const { error } = await supabase.from("nespracovane_doklady").insert({
    id,
    company_id: args.companyId,
    created_by: args.userId,
    zdroj: args.zdroj,
    stav: vytazene ? (args.ai ? "vytazene" : "chyba") : "cita",
    chyba: vytazene && !args.ai ? "Z dokladu sa nič nedalo prečítať — doplňte údaje ručne." : null,
    druh,
    file_path: cesta,
    file_name: args.nazov,
    file_mime: args.mime,
    file_size: args.bajty.length,
    ai: args.ai ?? null,
    udaje: udaje ?? (predvolby ? { predvolby } : {}),
    inbox_message_id: args.inboxMessageId ?? null,
    cez_rozdelovac: !!args.cezRozdelovac,
  });
  if (error) {
    await supabase.storage.from(KOS_NESPRACOVANYCH).remove([cesta]);
    throw new Error(error.message);
  }
  return { id, udaje };
}

/** Vyťaží nespracovaný doklad cez AI (beží na pozadí, po odpovedi klientovi). */
export async function vytazNespracovany(id: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: r } = await supabaseAdmin
    .from("nespracovane_doklady")
    .select("id, company_id, created_by, inbox_message_id, file_path, file_mime, file_name, druh, udaje, ai")
    .eq("id", id)
    .maybeSingle();
  if (!r?.file_path) return;
  try {
    const { data: subor, error } = await supabaseAdmin.storage.from(KOS_NESPRACOVANYCH).download(r.file_path);
    if (error || !subor) throw new Error("Súbor sa nepodarilo načítať.");
    const bajty = Buffer.from(await subor.arrayBuffer());
    const { precitajDoklad } = await import("./mail-prijem.server");
    const ai = await precitajDoklad(
      bajty.toString("base64"),
      r.file_mime ?? "application/pdf",
      r.company_id ? await volbyCitaniaFirmy(supabaseAdmin, r.company_id) : null,
      { ucel: "nespracovane", firma: r.company_id ?? null },
    );
    const dnes = new Date().toISOString().slice(0, 10);
    const povodne = nacitajUdaje(r.udaje);
    const druh = r.druh ?? navrhDruhu(ai, r.file_name);
    // Čo už človek vyplnil (napr. druh z appky), sa neprepisuje.
    let udaje = povodne.dodavatel.nazov || povodne.cislo ? doplnUdaje(povodne, udajeZAi(ai, dnes)) : udajeZAi(ai, dnes);
    /*
      Naučené z predchádzajúcich dokladov dodávateľa — len do prázdnych polí.
      Firma je z riadka dokladu, nie z požiadavky (beží cez supabaseAdmin).
    */
    if (r.company_id) {
      const { doplnUcenim } = await import("./ucenie-z-oprav.server");
      udaje = await doplnUcenim(supabaseAdmin, {
        companyId: r.company_id,
        druh,
        udaje,
        createdBy: r.created_by ?? null,
        inboxMessageId: r.inbox_message_id ?? null,
      });
      // Nastavenia firmy a nastavenie zo skenera (uložené pri nahratí).
      udaje = await poNastaveniach(supabaseAdmin, r.company_id, druh as DruhNespracovaneho | null, udaje, povodne.predvolby, ai);
    }
    await supabaseAdmin
      .from("nespracovane_doklady")
      .update({
        ai: (ai ?? r.ai ?? null) as any,
        stav: ai || r.ai || povodne.cislo || povodne.dodavatel.nazov ? "vytazene" : "chyba",
        chyba: ai || r.ai || povodne.cislo || povodne.dodavatel.nazov ? null : "Z dokladu sa nič nedalo prečítať — doplňte údaje ručne.",
        druh,
        udaje: udaje as any,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  } catch (e: any) {
    await supabaseAdmin
      .from("nespracovane_doklady")
      .update({ stav: "chyba", chyba: String(e?.message ?? e).slice(0, 300) })
      .eq("id", id);
  }
}

const ZDROJ_PRIJATEJ: Record<string, string> = {
  mail: "mail",
  nahratie: "nahrate",
  skener: "nahrate",
  apka: "nahrate",
  api: "import",
  efaktura: "efaktura",
};
const ZDROJ_BLOCKU: Record<string, string> = {
  mail: "upload",
  nahratie: "upload",
  skener: "upload",
  apka: "photo",
  api: "import",
};

/**
 * Z nespracovaného dokladu vytvorí skutočný doklad podľa druhu, presunie
 * súbor do kbelíka cieľovej agendy a nespracovaný záznam zmaže. Píše sa cez
 * klienta prihláseného — RLS a obmedzenia rolí platia ako pri ručnom zápise.
 */
export async function vytvorDoklad(
  supabase: Klient,
  userId: string,
  r: Record<string, any>,
  druh: DruhNespracovaneho,
  u: UdajeNespracovaneho,
): Promise<{ agenda: "prijata" | "doklad" | "ostatny"; id: string; zauctovana?: boolean; cudzia?: boolean }> {
  const dnes = new Date().toISOString().slice(0, 10);
  const teraz = new Date().toISOString();
  let bajty: Uint8Array | null = null;
  if (r.file_path) {
    const { data: subor } = await supabase.storage.from(KOS_NESPRACOVANYCH).download(r.file_path);
    if (subor) bajty = new Uint8Array(await subor.arrayBuffer());
  }
  const mime = r.file_mime ?? "application/pdf";
  const pripona = priponaSuboru(r.file_name, mime);
  // Predmet mailu a kto doklad nahral — podľa nich vedia zaúčtovať pravidlá.
  let predmetMailu: string | null = null;
  if (r.inbox_message_id) {
    const { data: m } = await supabase.from("inbox_messages").select("subject").eq("id", r.inbox_message_id).maybeSingle();
    predmetMailu = m?.subject ?? null;
  }
  const autor = r.created_by ?? userId;

  /*
    Učenie z opráv: naučené hodnoty, ktoré človek nechal tak, v poliach
    ručného pravidla sa vyprázdnia — spúšťač `faktero_uplatni_pravidlo`
    dopĺňa len prázdne polia a pravidlo má mať prednosť.
  */
  const ucenie = await import("./ucenie-z-oprav.server");
  const { jeDruhUcenia, volbyZUdajov, hodnotaPola } = await import("./ucenie-z-oprav");
  /*
    Nepotvrdený návrh AI do dokladu nejde — doklad by sa ním zaúčtoval bez
    človeka. Prenesie sa k vytvorenému dokladu, kde ho človek potvrdí.
  */
  const { nepotvrdeneAi, bezNepotvrdenehoAi } = await import("./ai-predkontacia");
  const nepotvrdeneNavrhy = nepotvrdeneAi(u);
  u = bezNepotvrdenehoAi(u);
  if (jeDruhUcenia(druh))
    u = await ucenie.pripravNaZapis(supabase, { companyId: r.company_id, druh, udaje: u, createdBy: autor, predmetMailu });

  const nastavenia = await nastaveniaNespracovanychFirmy(supabase, r.company_id);
  /*
    Malý rozdiel položiek oproti sume (tolerancia firmy) doplní vyrovnávacia
    položka, aby export sedel na cent. Hotovostné zaokrúhlenie na 5 centov
    rieši export bločku sám (predkontácia pre zaokrúhlenie).
  */
  {
    const { rozdielPoloziek, rozdielVTolerancii, vyrovnajPolozky } = await import("./nespracovane");
    const rozdiel = rozdielPoloziek(u);
    const hotovostne = u.platba === "hotovost" && rozdiel && Math.abs(rozdiel.rozdiel) <= 0.02;
    if (rozdiel && !hotovostne && rozdielVTolerancii(u, nastavenia)) u = vyrovnajPolozky(u);
  }

  /*
    Pravidlo účtovania zvolené pri spracovaní (alebo doplnené podľa
    dodávateľa). Doklad ho dostane rovno — spúšťač by inak vzal prvé zhodné
    pravidlo, nie to, ktoré človek vybral. Odpočet a poznámku pravidla
    doplníme tu, ako by to urobil spúšťač.
  */
  let pravidlo: Record<string, any> | null = null;
  if (u.pravidloId && /^[0-9a-f-]{36}$/i.test(u.pravidloId) && druh !== "ostatny") {
    const { data: p } = await supabase
      .from("pravidla_uctovania")
      .select("id, odpocet, poznamka, aktivne, pokladna, rozuctovanie")
      .eq("id", u.pravidloId)
      .eq("company_id", r.company_id)
      .maybeSingle();
    pravidlo = p?.aktivne ? p : null;
  }
  const zPravidla = async (
    riadok: { note?: string | null; issue_date?: string | null; odpocet?: boolean },
    blocek = false,
  ) => {
    if (!pravidlo) return {};
    const { premennePoznamky } = await import("./pravidla-uctovania");
    const pozn = premennePoznamky(String(pravidlo.poznamka ?? ""), riadok.issue_date ?? null).trim();
    const note = String(riadok.note ?? "");
    return {
      pravidlo_id: pravidlo.id as string,
      ...(typeof pravidlo.odpocet === "boolean" ? { odpocet: pravidlo.odpocet } : {}),
      ...(pozn && !note.includes(pozn) ? { note: [note.trim(), pozn].filter(Boolean).join(" ") } : {}),
      // Rozúčtovanie pomerom a pokladňa bločku — spúšťač ich pri zvolenom pravidle nedoplní.
      ...(pravidlo.rozuctovanie ? { rozuctovanie: pravidlo.rozuctovanie } : {}),
      ...(blocek && String(pravidlo.pokladna ?? "").trim() ? { pohoda_pokladna: String(pravidlo.pokladna).trim() } : {}),
    };
  };

  let vysledok: { agenda: "prijata" | "doklad" | "ostatny"; id: string; zauctovana?: boolean; cudzia?: boolean };
  if (druh === "faktura" || druh === "zalohova" || druh === "dobropis") {
    const cesta = bajty ? `${r.company_id}/${crypto.randomUUID()}.${pripona}` : null;
    if (cesta && bajty) {
      const up = await supabase.storage.from("purchase-invoices").upload(cesta, bajty, { contentType: mime });
      if (up.error) throw new Error(`Súbor sa nepodarilo uložiť: ${up.error.message}`);
    }
    const zakl = prijataZUdajov(druh, u, dnes);
    /*
      Odberateľ na doklade je iná firma — faktúra vznikne (človek zvolil
      „Uložiť aj tak“) s príznakom a nezaúčtuje sa, kým nepotvrdí, že patrí
      tejto firme. Spúšťač v databáze to stráži aj sám.
    */
    const { nesediNespracovany, firmaNaPorovnanie } = await import("./cudzia-faktura.server");
    const cudzia = nesediNespracovany({ ...r, druh }, await firmaNaPorovnanie(supabase, r.company_id));
    // Zaúčtovaná je aj faktúra, ktorej každá položka má vlastnú predkontáciu (hlavička môže ostať prázdna).
    const zauctovat =
      !cudzia && Boolean(zakl.pohoda_predkontacia || zakl.pohoda_clenenie_dph || polozkyZauctovane(u));
    // Zaplatená ostáva zaplatená aj zaúčtovaná (ako po zaúčtovaní v paneli).
    const stav = (zauct: boolean) => (u.uhradene ? "paid" : zauct ? "booked" : "received");
    const { data, error } = await supabase
      .from("purchase_invoices")
      .insert({
        ...zakl,
        ...(await zPravidla(zakl)),
        company_id: r.company_id,
        created_by: autor,
        predmet_mailu: predmetMailu,
        inbox_message_id: r.inbox_message_id ?? null,
        // Zaúčtovaná faktúra je „booked“ ako po zaúčtovaní v paneli.
        status: stav(zauctovat),
        source: ZDROJ_PRIJATEJ[r.zdroj] ?? "nahrate",
        file_path: cesta,
        file_mime: cesta ? mime : null,
        file_size: bajty?.length ?? null,
        // Kto vyplnil predkontáciu či členenie, doklad tým zaúčtoval.
        zauctovane_at: zauctovat ? teraz : null,
        zauctoval: zauctovat ? userId : null,
        ...zdrojZauctovaniaPriVytvoreni(zauctovat),
        ...(cudzia ? { odberatel_nesedi: { ...cudzia, zistene_at: teraz } } : {}),
      })
      .select("id, pohoda_predkontacia, pohoda_clenenie_dph, category, reverse_charge")
      .single();
    if (error) {
      if (cesta) await supabase.storage.from("purchase-invoices").remove([cesta]);
      throw new Error(error.message);
    }
    /*
      Kto klikol Vytvoriť (stĺpec „Spracoval“) — `created_by` ostáva ten, kto
      doklad nahral. Zvlášť, aby chýbajúci stĺpec nezablokoval vytvorenie.
    */
    await supabase.from("purchase_invoices").update({ spracoval: userId, spracovane_at: teraz }).eq("id", data.id);
    /*
      Vytvorením je faktúra skontrolovaná — keď sa dá určiť predkontácia aj
      členenie (vlastné, z pravidla, ktoré doplnil spúšťač, z kategórie alebo
      predvolené firmy), je zaúčtovaná a pripravená na export. Nepotvrdený
      návrh AI počká na potvrdenie v zaúčtovaní faktúry.
    */
    let zauctovana = zauctovat;
    if (!cudzia && !zauctovat && nastavenia.zauctovat && !nepotvrdeneNavrhy.length) {
      const { kodyPrijatejUrcene } = await import("./nespracovane-nastavenia");
      const { kodyPodlaKategorie } = await import("./predkontacie.server");
      const { data: firma } = await supabase
        .from("companies")
        .select("pohoda_predkontacia_prijata, pohoda_clenenie_dph_prijata, pohoda_clenenie_dph_prijata_pdp")
        .eq("id", r.company_id)
        .maybeSingle();
      if (kodyPrijatejUrcene(data, firma, await kodyPodlaKategorie(supabase, r.company_id))) {
        const { error: eZ } = await supabase
          .from("purchase_invoices")
          .update({ zauctovane_at: teraz, zauctoval: userId, status: stav(true), ...zdrojZauctovaniaPriVytvoreni(true) })
          .eq("id", data.id);
        if (!eZ) zauctovana = true;
      }
    }
    /* Doklad v cudzej mene potrebuje kurz (SK ECB, CZ ČNB); bez neho by chýbal vo výkaze k DPH. */
    {
      try {
        const { prepocitajDoklad, pravidloKurzuFirmy } = await import("./kurzy.server");
        const { domacaMena } = await import("./kurzy");
        const { krajina: krajinaKurzu, nastavenieDe } = await pravidloKurzuFirmy(r.company_id);
        const p =
          zakl.currency !== domacaMena(krajinaKurzu)
            ? await prepocitajDoklad(
                zakl.currency,
                zakl.delivery_date ?? zakl.issue_date,
                {
                  zaklad: zakl.amount_without_vat,
                  dan: zakl.vat_amount,
                  celkom: zakl.amount_total,
                },
                krajinaKurzu,
                nastavenieDe,
              )
            : null;
        if (p)
          await supabase
            .from("purchase_invoices")
            .update({
              exchange_rate: p.kurz,
              exchange_rate_source: p.zdroj,
              amount_without_vat_eur: p.zaklad,
              vat_amount_eur: p.dan,
            })
            .eq("id", data.id);
      } catch {
        /* Kurz je doplnok — doklad je uložený. */
      }
    }
    vysledok = { agenda: "prijata", id: data.id, zauctovana, ...(cudzia ? { cudzia: true } : {}) };
  } else if (druh === "blocek") {
    const cesta = bajty ? `${r.company_id}/${crypto.randomUUID()}.${pripona}` : null;
    if (cesta && bajty) {
      const up = await supabase.storage.from("expense-receipts").upload(cesta, bajty, { contentType: mime });
      if (up.error) throw new Error(`Súbor sa nepodarilo uložiť: ${up.error.message}`);
    }
    // Bloček v cudzej mene si kurz pamätá ako faktúra (export ho inak nemá z čoho prepočítať).
    const kurzBlocku = await (await import("./kurz-dokladu.server")).doplnovacKurzov(r.company_id)(
      "expense_documents",
      blocekZUdajov(u),
    );
    const { data, error } = await supabase
      .from("expense_documents")
      .insert({
        ...blocekZUdajov(u),
        ...kurzBlocku,
        ...(await zPravidla(blocekZUdajov(u), true)),
        predmet_mailu: predmetMailu,
        inbox_message_id: r.inbox_message_id ?? null,
        company_id: r.company_id,
        created_by: autor,
        // Človek ho práve skontroloval — je spracovaný.
        status: "processed",
        processed_at: teraz,
        processed_by: userId,
        source: ZDROJ_BLOCKU[r.zdroj] ?? "upload",
        file_path: cesta,
        file_mime: cesta ? mime : null,
        file_size: bajty?.length ?? null,
        ai_raw: r.ai ?? null,
      })
      .select("id, pohoda_predkontacia")
      .single();
    if (error) {
      if (cesta) await supabase.storage.from("expense-receipts").remove([cesta]);
      throw new Error(error.message);
    }
    /*
      Vytvorením s predkontáciou je bloček zaúčtovaný (ako ručná predkontácia
      v Dokladoch). Inak by ho fronta automatického zaúčtovania vzala ako nový
      a položila na kontrolu, hoci ho človek práve zaúčtoval.
    */
    const { blocekZauctovanyPriVytvoreni } = await import("./nespracovane-nastavenia");
    const zauctovanyBlocek = blocekZauctovanyPriVytvoreni({
      odCloveka: Boolean(blocekZUdajov(u).pohoda_predkontacia || polozkyZauctovane(u)),
      predkontaciaPoZapise: data.pohoda_predkontacia,
      zauctovat: nastavenia.zauctovat,
      nepotvrdenychNavrhov: nepotvrdeneNavrhy.length,
    });
    if (zauctovanyBlocek)
      await supabase
        .from("expense_documents")
        .update({ zauctovane_at: teraz, zauctoval: userId, ...zdrojZauctovaniaPriVytvoreni(true) })
        .eq("id", data.id)
        .is("zauctovane_at", null);
    vysledok = { agenda: "doklad", id: data.id, zauctovana: zauctovanyBlocek };
  } else {
    const idDokladu = crypto.randomUUID();
    const { error } = await supabase.from("other_documents").insert({
      id: idDokladu,
      ...ostatnyZUdajov(u, dnes),
      inbox_message_id: r.inbox_message_id ?? null,
      company_id: r.company_id,
      created_by: userId,
      status: "new",
    });
    if (error) throw new Error(error.message);
    if (bajty) {
      const meno = r.file_name || `doklad.${pripona}`;
      const cesta = `${r.company_id}/${idDokladu}/${Date.now()}-${String(meno).replace(/[^\w.-]+/g, "_")}`;
      const up = await supabase.storage.from("other-docs").upload(cesta, bajty, { contentType: mime });
      if (!up.error)
        await supabase.from("other_document_files").insert({
          document_id: idDokladu,
          company_id: r.company_id,
          path: cesta,
          name: meno,
          mime,
          size: bajty.length,
          position: 0,
        });
    }
    vysledok = { agenda: "ostatny", id: idDokladu };
  }

  // Čo človek pri dodávateľovi zvolil — návrh pre ďalší doklad.
  if (jeDruhUcenia(druh)) {
    const volby = volbyZUdajov(u, druh);
    // Prázdne pole nie je voľba človeka — buď ho vyprázdnilo pravidlo (kódy doplní
    // spúšťač až po zápise), alebo ho nikto nevyplnil. Zapísané „“ by z histórie
    // vytlačilo skutočne naučenú hodnotu.
    for (const k of Object.keys(volby) as (keyof typeof volby)[])
      if (!hodnotaPola(u, k)) delete volby[k];
    // Hodnota z pravidla nie je voľba človeka — návyk by pravidlo len zdvojil.
    for (const k of Object.keys(volby) as (keyof typeof volby)[])
      if (u.zPravidla?.[k] && u.zPravidla[k] === hodnotaPola(u, k)) delete volby[k];
    await ucenie.zaznamenajVolby(supabase, {
      companyId: r.company_id,
      druh,
      dodavatel: u.dodavatel,
      volby,
      dokladId: vysledok.id,
      userId,
    });
  }

  {
    // Nepotvrdený návrh AI počká na prijatej faktúre v zaúčtovaní; inak sa pamäť zmaže.
    const { prenesNavrh } = await import("./ai-predkontacia.server");
    await prenesNavrh(supabase, {
      companyId: r.company_id,
      nespracovanyId: r.id,
      typ: vysledok.agenda === "prijata" ? "prijata" : "doklad",
      id: vysledok.id,
      preniest: vysledok.agenda === "prijata" && nepotvrdeneNavrhy.length > 0,
    });
  }

  /* eFaktúra odložená v Nespracovaných: prijatá eFaktúra dostane väzbu na
     vytvorenú faktúru (inak by po zmazaní záznamu ponúkala Zaevidovať znova). */
  if (vysledok.agenda === "prijata") {
    await supabase
      .from("efaktura_received_documents")
      .update({ matched_supplier_invoice_id: vysledok.id, status: "matched", processed_at: teraz })
      .eq("company_id", r.company_id)
      .eq("nespracovany_id", r.id);
  }

  await supabase.from("nespracovane_doklady").delete().eq("id", r.id);
  if (r.file_path) await supabase.storage.from(KOS_NESPRACOVANYCH).remove([r.file_path]);
  return vysledok;
}

/**
 * Upozornenia pri spracovaní: doklad, ktorý už vo firme je (rovnaké číslo od
 * toho istého dodávateľa), a faktúra vystavená na inú firmu — odberateľ
 * prečítaný z dokladu nemá IČO ani IČ DPH tejto firmy.
 */
export async function varovaniaNespracovaneho(
  supabase: Klient,
  r: { id: string; company_id: string; ai?: unknown },
  u: UdajeNespracovaneho,
  firma: { ico?: string | null; ic_dph?: string | null; dic?: string | null } | null,
): Promise<string[]> {
  const out: string[] = [];
  const cislo = u.cislo.trim();
  const ico = u.dodavatel.ico.replace(/\s/g, "");
  const tenIstyDodavatel = (x: { supplier_ico?: string | null; supplier_name?: string | null }) =>
    ico
      ? String(x.supplier_ico ?? "").replace(/\s/g, "") === ico
      : String(x.supplier_name ?? "").trim().toLowerCase() === u.dodavatel.nazov.trim().toLowerCase();
  if (cislo) {
    const [{ data: prijate }, { data: blocky }, { data: ine }] = await Promise.all([
      supabase
        .from("purchase_invoices")
        .select("invoice_number, supplier_ico, supplier_name")
        .eq("company_id", r.company_id)
        .eq("invoice_number", cislo)
        .is("deleted_at", null)
        .limit(5),
      supabase
        .from("expense_documents")
        .select("document_number, supplier_ico, supplier_name")
        .eq("company_id", r.company_id)
        .eq("document_number", cislo)
        .limit(5),
      supabase
        .from("nespracovane_doklady")
        .select("id, udaje")
        .eq("company_id", r.company_id)
        .neq("id", r.id)
        .eq("udaje->>cislo", cislo)
        .limit(5),
    ]);
    // Prijaté porovná aj číslo zapísané inak (nuly, pomlčky) a dodávateľa podľa IBAN-u či sumy.
    const { najdiDuplicituPrijatej } = await import("./prijate-duplicity.server");
    const dup = await najdiDuplicituPrijatej(
      supabase,
      r.company_id,
      {
        invoice_number: cislo,
        supplier_ico: u.dodavatel.ico,
        supplier_name: u.dodavatel.nazov,
        supplier_iban: u.dodavatel.iban,
        amount_total: u.celkom,
      },
      { nespracovanyId: r.id },
    );
    if (dup?.kde === "prijate" || (prijate ?? []).some(tenIstyDodavatel))
      out.push(`Prijatá faktúra ${cislo} od tohto dodávateľa už v evidencii je — možno ide o duplicitu.`);
    else if ((blocky ?? []).some(tenIstyDodavatel))
      out.push(`Doklad ${cislo} od tohto dodávateľa už je medzi bločkami — možno ide o duplicitu.`);
    if (
      (ine ?? []).some((x: any) =>
        tenIstyDodavatel({ supplier_ico: x.udaje?.dodavatel?.ico, supplier_name: x.udaje?.dodavatel?.nazov }),
      )
    )
      out.push(`Ten istý doklad ${cislo} čaká v Nespracovaných ešte raz.`);
  }
  /*
    Odberateľ z dokladu, ktorý nesedí na firmu, ukazuje detail zvlášť
    (upozornenie s voľbami Zmazať / Uložiť aj tak / Presunúť) — `cudzia-faktura.ts`.
  */
  void firma;
  return out;
}

/**
 * Nespracovaný bloček do Nespracovaných dokladov (presun aj so skenom).
 * Odovzdaný či spárovaný ostáva bločkom — vráti `{ id: null }`.
 */
export async function presunBlocekDoNespracovanych(supabase: Klient, id_: string, userId: string | null) {
  const { data: e } = await supabase.from("expense_documents").select("*").eq("id", id_).maybeSingle();
  if (!e) throw new Error("Doklad sa nenašiel.");
  if (e.status !== "new" || e.exported_at) return { id: null as string | null };
  const { data: parovany } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("matched_expense_id", e.id)
    .limit(1);
  // Spárovaný s platbou ostáva bločkom — párovanie by sa presunom stratilo.
  if (parovany?.length) return { id: null as string | null };

  const { prazdneUdaje } = await import("./nespracovane");
  const u = prazdneUdaje();
  u.dodavatel.nazov = e.supplier_name ?? "";
  u.dodavatel.ico = e.supplier_ico ?? "";
  u.dodavatel.icDph = e.supplier_ic_dph ?? "";
  u.cislo = e.document_number ?? "";
  u.datumVystavenia = e.issue_date ?? "";
  u.datumDodania = e.issue_date ?? "";
  u.mena = e.currency ?? "EUR";
  const rozpis = Array.isArray(e.vat_breakdown) ? e.vat_breakdown : null;
  u.rozpis = rozpis?.length
    ? rozpis.map((r: any) => ({ sadzba: Number(r.sadzba) || 0, zaklad: Number(r.zaklad) || 0, dph: Number(r.dph) || 0 }))
    : e.net_amount != null || e.vat_amount != null
      ? [{ sadzba: Number(e.vat_rate) || 0, zaklad: Number(e.net_amount) || 0, dph: Number(e.vat_amount) || 0 }]
      : [];
  u.celkom = e.total_amount != null ? Number(e.total_amount) : null;
  u.platba = e.payment_method ?? "";
  u.kategoria = e.category ?? "";
  u.poznamka = e.note ?? "";
  u.polozky = Array.isArray(e.items) ? e.items : [];
  u.kody = {
    predkontacia: e.pohoda_predkontacia ?? "",
    clenenie: e.pohoda_clenenie_dph ?? "",
    kv: e.kv_clenenie ?? "",
    stredisko: e.stredisko ?? "",
    cinnost: e.cinnost ?? "",
    rad: e.pohoda_rad ?? "",
    intPoznamka: e.int_poznamka ?? "",
  };

  const id = crypto.randomUUID();
  let cesta: string | null = null;
  if (e.file_path) {
    const { data: subor } = await supabase.storage.from("expense-receipts").download(e.file_path);
    if (subor) {
      const pripona = String(e.file_path).split(".").pop()?.toLowerCase().slice(0, 5) || "jpg";
      cesta = `${e.company_id}/${id}.${pripona}`;
      const up = await supabase.storage
        .from("nespracovane")
        .upload(cesta, new Uint8Array(await subor.arrayBuffer()), { contentType: e.file_mime ?? subor.type });
      if (up.error) throw new Error(`Súbor sa nepodarilo presunúť: ${up.error.message}`);
    }
  }
  const pdf = String(e.file_mime ?? "").includes("pdf");
  const { error } = await supabase.from("nespracovane_doklady").insert({
    id,
    company_id: e.company_id,
    created_by: e.created_by ?? userId,
    zdroj: e.source === "photo" || e.source === "qr" ? "apka" : "nahratie",
    stav: "vytazene",
    druh: pdf ? "faktura" : "blocek",
    file_path: cesta,
    file_name: e.file_path ? String(e.file_path).split("/").pop() : null,
    file_mime: e.file_mime,
    file_size: e.file_size,
    ai: e.ai_raw ?? null,
    udaje: u,
  });
  if (error) {
    if (cesta) await supabase.storage.from("nespracovane").remove([cesta]);
    throw new Error(error.message);
  }
  await supabase.from("expense_documents").delete().eq("id", e.id);
  if (e.file_path) await supabase.storage.from("expense-receipts").remove([e.file_path]);
  /*
    Bločkové čítanie nepozná VS, IBAN, splatnosť ani adresu — faktúra zo
    skenera ich preto nemala. Dočíta ich faktúrové čítanie na pozadí;
    doplní len prázdne polia.
  */
  if (cesta) {
    void vytazNespracovany(id);
  }
  return { id };
}
