/**
 * Príjem e-mailových notifikácií banky — serverová časť.
 *
 * Mail príde tým istým webhookom Resendu ako doklady (`/api/public/mail/prijem`);
 * `spracujPrijatyMail` ho podľa predpony adresy `banka-` pošle sem. Tu sa:
 *
 * 1. nájde adresa (a s ňou firma a účet) podľa tajného tokenu,
 * 2. zachytí overovací mail preposielania z Gmailu (kód a odkaz do nastavenia),
 * 3. overí odosielateľ (DKIM domény banky),
 * 4. mail prečíta pravidlom pre banku, a keď žiadne nesedí, cez AI,
 * 5. a buď sa založí pohyb a spáruje, alebo ide mail na kontrolu.
 *
 * Zápis ide cez `supabaseAdmin` — webhook nemá prihláseného používateľa.
 * Firma sa určuje výhradne z tajnej adresy, nikdy z obsahu mailu.
 */
import {
  bankaPodlaDomeny,
  bankaPodlaKodu,
  hlavicka,
  jeRovnakyPohyb,
  overOdosielatela,
  pohybZNotifikacie,
  povodnyOdosielatelZTela,
  rozhodni,
  validujNotifikaciu,
  PRAZDNA_NOTIFIKACIA,
  type Notifikacia,
  type Sposob,
} from "./banka-notifikacie";
import { citajPravidlom } from "./banka-notifikacie-parsery";
import { notifikaciaZAi, PROMPT_NOTIFIKACIA } from "./banka-notifikacie-ai";

export type VysledokNotifikacie =
  | "spracovane"
  | "na_kontrolu"
  | "duplicita"
  | "potvrdenie"
  | "nie_pohyb"
  | "neznama_adresa"
  | "chyba";

/** AI číta len začiatok mailu — pohyb býva v prvých riadkoch, zvyšok je pätička. */
const MAX_TEXT_PRE_AI = 6000;

/** Prečíta notifikáciu cez AI. Pri zlyhaní `null` — mail potom ide na kontrolu. */
export async function citajCezAi(
  text: string,
  predmet: string | null,
  firma: string,
): Promise<Notifikacia | null> {
  try {
    const { aiText } = await import("./ai.server");
    const pokyn = `${PROMPT_NOTIFIKACIA}\n\nPredmet: ${predmet ?? ""}\n\nText mailu:\n"""\n${text.slice(0, MAX_TEXT_PRE_AI)}\n"""`;
    const odpoved = await aiText(pokyn, {
      json: true,
      bezUvazovania: true,
      maxOutputTokens: 800,
      ucel: "banka_notifikacia",
      firma,
    });
    const json = odpoved.match(/\{[\s\S]*\}/)?.[0];
    return json ? notifikaciaZAi(JSON.parse(json)) : null;
  } catch (e: any) {
    console.error(
      "[banka-notifikacie] čítanie cez AI zlyhalo:",
      String(e?.message ?? e).slice(0, 200),
    );
    return null;
  }
}

type Ucet = {
  id: string;
  iban: string | null;
  currency: string;
  company_id: string;
  provider: string | null;
};

async function nacitajUcet(supabaseAdmin: any, uctuId: string): Promise<Ucet | null> {
  const { data } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, iban, currency, company_id, bank_connections(provider)")
    .eq("id", uctuId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    iban: data.iban,
    currency: data.currency,
    company_id: data.company_id,
    provider: data.bank_connections?.provider ?? null,
  };
}

/**
 * Založí pohyb z notifikácie a spáruje ho. Duplicita (ten istý pohyb už na
 * účte je — z inej notifikácie alebo z nahratého výpisu) sa nezaloží.
 *
 * Párovanie je to isté ako pri sťahovaní z banky (`sparujFirmuAutomaticky`):
 * automaticky sa zapíše len zhoda VS **a** sumy, ostatné ostáva návrhom.
 * Splátky a kontokorent sa z notifikácií zámerne nepárujú automaticky —
 * tam stačí zhoda protistrany, a to je pre pohyb z mailu málo.
 */
export async function zalozPohyb(
  supabaseAdmin: any,
  ucet: Ucet,
  n: Notifikacia,
): Promise<{ stav: "spracovane"; id: string } | { stav: "duplicita"; id: string | null }> {
  const riadok = { company_id: ucet.company_id, bank_account_id: ucet.id, ...pohybZNotifikacie(n) };

  const { data: rovnakaRef } = await supabaseAdmin
    .from("bank_transactions")
    .select("id")
    .eq("bank_account_id", ucet.id)
    .eq("transaction_reference", riadok.transaction_reference)
    .maybeSingle();
  if (rovnakaRef) return { stav: "duplicita", id: rovnakaRef.id };

  // Ten istý pohyb z iného zdroja (výpis, API) — deň ± 1 a rovnaká suma.
  const od = new Date(Date.parse(riadok.booking_date) - 86_400_000).toISOString().slice(0, 10);
  const doDna = new Date(Date.parse(riadok.booking_date) + 86_400_000).toISOString().slice(0, 10);
  const { data: blizke } = await supabaseAdmin
    .from("bank_transactions")
    .select("id, booking_date, amount, variable_symbol, counterparty")
    .eq("bank_account_id", ucet.id)
    .eq("amount", riadok.amount)
    .gte("booking_date", od)
    .lte("booking_date", doDna)
    .limit(50);
  const rovnaky = (blizke ?? []).find((p: any) => jeRovnakyPohyb(n, p));
  if (rovnaky) return { stav: "duplicita", id: rovnaky.id };

  const { data, error } = await supabaseAdmin
    .from("bank_transactions")
    .insert(riadok)
    .select("id")
    .single();
  if (error) {
    if (/duplicate key|23505/.test(error.message ?? "")) return { stav: "duplicita", id: null };
    throw new Error(`zápis pohybu zlyhal: ${error.message}`);
  }

  // Zostatok vedie pri účte bez napojenia len notifikácia — keď ho nesie.
  if (n.zostatok != null && (ucet.provider === "email" || ucet.provider === "import")) {
    await supabaseAdmin
      .from("bank_accounts")
      .update({
        balance: n.zostatok,
        booked_balance: n.zostatok,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", ucet.id);
  } else {
    await supabaseAdmin
      .from("bank_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", ucet.id);
  }

  if (riadok.amount > 0) {
    try {
      const { sparujFirmuAutomaticky } = await import("./parovanie.functions");
      const { uhradene } = await sparujFirmuAutomaticky(ucet.company_id);
      if (uhradene.length) {
        const { oznamUhradu } = await import("./push-uhrada.server");
        await oznamUhradu(ucet.company_id, uhradene);
      }
    } catch (e: any) {
      // Párovanie je nadstavba — pohyb ostáva, spáruje sa pri ďalšom behu alebo ručne.
      console.error("[banka-notifikacie] párovanie zlyhalo:", e?.message ?? e);
    }
  }
  return { stav: "spracovane", id: data.id };
}

/**
 * Spracuje jeden mail na adrese `banka-<token>@…`. Do `banka_notifikacie_maily`
 * zapíše vždy, ako to dopadlo — bez toho by človek nevedel, prečo pohyb nevznikol.
 */
export async function prijmiBankovuNotifikaciu(args: {
  emailId: string;
  token: string;
  from: string | null;
  subject: string | null;
  naseAdresy: (string | null | undefined)[];
  /** Na test: dnešný deň. */
  dnes?: string;
}): Promise<VysledokNotifikacie> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: adresa } = await supabaseAdmin
    .from("banka_notifikacie_adresy")
    .select("id, company_id, bank_account_id, banka, active")
    .eq("token", args.token)
    .maybeSingle();
  if (!adresa || !adresa.active) return "neznama_adresa";

  // Opakovaný webhook toho istého mailu.
  const { data: uz } = await supabaseAdmin
    .from("banka_notifikacie_maily")
    .select("id")
    .eq("provider_email_id", args.emailId)
    .maybeSingle();
  if (uz) return "duplicita";

  const predmet = (args.subject ?? "").trim().slice(0, 300) || null;
  const zaklad = {
    company_id: adresa.company_id,
    adresa_id: adresa.id,
    bank_account_id: adresa.bank_account_id,
    provider_email_id: args.emailId,
    from_email: (args.from ?? "").trim().slice(0, 300) || null,
    subject: predmet,
  };

  async function zapis(riadok: Record<string, unknown>) {
    const { error } = await supabaseAdmin
      .from("banka_notifikacie_maily")
      .insert({ ...zaklad, ...riadok });
    if (error && !/duplicate key|23505/.test(error.message ?? "")) {
      console.error("[banka-notifikacie] zápis do denníka zlyhal:", error.message);
    }
    await supabaseAdmin
      .from("banka_notifikacie_adresy")
      .update({ last_received_at: new Date().toISOString() })
      .eq("id", adresa!.id);
  }

  try {
    const apiKey = (process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY)?.trim();
    if (!apiKey) throw new Error("RESEND_INBOUND_API_KEY ani RESEND_API_KEY nie je nastavený");
    const { obsahMailu } = await import("./mail-prijem.server");
    const { poskytovatelPotvrdenia, overPravostPotvrdenia, potvrdenieZMailu, rozbalTelo } =
      await import("./mail-potvrdenie");
    const obsah = await obsahMailu(args.emailId, apiKey);

    /*
      Gmail pred zapnutím preposielania pošle na cieľovú adresu overovací kód.
      Adresa je naša, takže bez tohto kroku by ho klient nikdy nevidel. Uloží
      sa len kód, odkaz a schránka — a len keď mail naozaj podpísal Google.
    */
    const poskytovatel = poskytovatelPotvrdenia(args.from);
    if (poskytovatel) {
      const pravost = overPravostPotvrdenia({
        headers: obsah.headers ?? null,
        spf: obsah.spf,
        dkim: obsah.dkim,
        domena: poskytovatel.domena,
      });
      if (!pravost.ok) {
        await zapis({
          stav: "chyba",
          overenie: pravost.dovod,
          dovod: "Potvrdenie preposielania neprešlo overením pravosti — zahodené.",
        });
        return "chyba";
      }
      const udaje = potvrdenieZMailu({
        provider: poskytovatel.provider,
        predmet,
        text: rozbalTelo(obsah.text),
        html: rozbalTelo(obsah.html),
        naseAdresy: args.naseAdresy,
      });
      await zapis({
        stav: "potvrdenie",
        overenie: `DKIM ${poskytovatel.domena}`,
        udaje: {
          code: udaje.code,
          confirm_url: udaje.confirm_url,
          source_email: udaje.source_email,
        },
      });
      return "potvrdenie";
    }

    const messageId =
      (hlavicka(obsah.headers, "message-id") || String(obsah.message_id ?? ""))
        .trim()
        .slice(0, 300) || null;
    if (messageId) {
      const { data: rovnaky } = await supabaseAdmin
        .from("banka_notifikacie_maily")
        .select("id")
        .eq("company_id", adresa.company_id)
        .eq("message_id", messageId)
        .maybeSingle();
      if (rovnaky) return "duplicita";
    }

    const { textMailu, htmlNaText } = await import("./zdrojovy-mail");
    const text = textMailu(rozbalTelo(obsah.text), rozbalTelo(obsah.html)) ?? "";
    // Pre čítanie aj HTML: niektoré banky dávajú do textovej časti len odkaz.
    const html = rozbalTelo(obsah.html);
    const naCitanie = html ? `${text}\n${htmlNaText(html)}` : text;

    const overenie = overOdosielatela({
      from: args.from,
      headers: obsah.headers ?? null,
      // Napr. „inbound.resend.com" — over naostro z prvého prijatého mailu.
      authservId: process.env.MAIL_AUTHSERV_ID ?? null,
    });
    const povodny = povodnyOdosielatelZTela(text);
    const bankaPreCitanie =
      overenie.banka ?? bankaPodlaDomeny(povodny?.split("@")[1]) ?? bankaPodlaKodu(adresa.banka);

    /*
      Pravidlo vráti aj viac pohybov (ČSOB posiela v jednom maile niekoľko).
      Každý ide do denníka vlastným riadkom, aby sa dal zaradiť zvlášť.
    */
    let sposob: Sposob | null = null;
    let zoznam: Notifikacia[] | null = citajPravidlom(bankaPreCitanie?.kod ?? null, {
      predmet,
      text: naCitanie,
    });
    if (zoznam) sposob = "pravidlo";
    else if (naCitanie.trim()) {
      const zAi = await citajCezAi(naCitanie, predmet, adresa.company_id);
      if (zAi) {
        zoznam = [zAi];
        sposob = "ai";
      }
    }

    const ucet = await nacitajUcet(supabaseAdmin, adresa.bank_account_id);
    if (!ucet || ucet.company_id !== adresa.company_id)
      throw new Error("účet k adrese sa nenašiel");

    const dnes = args.dnes ?? new Date().toISOString().slice(0, 10);
    const datumMailu = Date.parse(
      String(obsah.created_at ?? (hlavicka(obsah.headers, "date") || "")),
    );
    const denMailu = Number.isFinite(datumMailu)
      ? new Date(datumMailu).toISOString().slice(0, 10)
      : dnes;

    const vysledky: VysledokNotifikacie[] = [];
    const polozky: (Notifikacia | null)[] = zoznam && zoznam.length ? zoznam : [null];
    for (let i = 0; i < polozky.length; i++) {
      let n = polozky[i]!;
      // Bez dátumu v maile: notifikácia chodí hneď, deň doručenia je deň pohybu.
      if (n && n.jePohyb && !n.datum) n = { ...n, datum: denMailu };
      const validacia = n
        ? validujNotifikaciu(n, { dnes, menaUctu: ucet.currency, ibanUctu: ucet.iban })
        : null;
      const r = rozhodni({ overenie, sposob, notifikacia: n, validacia, text: naCitanie });

      const pripona = i === 0 ? "" : `#${i + 1}`;
      const spolocne = {
        provider_email_id: `${args.emailId}${pripona}`,
        message_id: messageId ? `${messageId}${pripona}` : null,
        sposob: sposob === "pravidlo" ? `pravidlo:${bankaPreCitanie?.kod ?? "?"}` : sposob,
        banka: overenie.banka?.kod ?? bankaPreCitanie?.kod ?? null,
        overenie: overenie.popis,
        udaje: { ...(n ?? PRAZDNA_NOTIFIKACIA), problemy: validacia?.problemy ?? [] },
        text_mailu: text || null,
      };

      if (r.akcia === "nie_pohyb") {
        await zapis({ ...spolocne, stav: "nie_pohyb", dovod: r.dovod });
        vysledky.push("nie_pohyb");
        continue;
      }
      if (r.akcia === "kontrola") {
        await zapis({ ...spolocne, stav: "na_kontrolu", dovod: r.dovod });
        vysledky.push("na_kontrolu");
        continue;
      }
      const vysledok = await zalozPohyb(supabaseAdmin, ucet, n!);
      await zapis({
        ...spolocne,
        stav: vysledok.stav,
        bank_transaction_id: vysledok.id,
        dovod: vysledok.stav === "duplicita" ? "Ten istý pohyb už na účte je." : null,
      });
      vysledky.push(vysledok.stav);
    }
    if (vysledky.includes("spracovane")) return "spracovane";
    if (vysledky.includes("na_kontrolu")) return "na_kontrolu";
    return vysledky[0] ?? "na_kontrolu";
  } catch (e: any) {
    const detail = String(e?.message ?? e).slice(0, 300);
    console.error("[banka-notifikacie] spracovanie zlyhalo:", detail);
    await zapis({ stav: "chyba", dovod: detail });
    return "chyba";
  }
}
