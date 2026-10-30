/*
  Odpoveď zákazníkovi po nasadení automatickej opravy.

  Volá ju spúšťač (scripts/auto-oprava/oprava.mjs) cez hook, keď overí, že
  commit opravy je v bežiacom vydaní, a podpora tlačidlom „Odoslať teraz“.
  Odpoveď ide tou istou cestou ako ručná odpoveď podpory (`pridajSpravu`):
  vlákno, e-mail s adresou pre odpoveď a chat požiadavky v Telegrame. Navyše
  ju dostanú chaty, ktoré si zákazník spároval so svojím účtom. Potom sa
  požiadavka uzavrie.

  Hook dostane len id riadku — text si server berie sám z DB, takže volajúci
  nemôže zákazníkovi podstrčiť vlastné slová.
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cisloPoziadavky } from "./podpora";
import { obsahujeTajomstvo, smieOdpovedat, textOdpovede } from "./auto-oprava-odpoved";

export type VysledokOdpovede =
  | { ok: true; odoslana: true }
  | { ok: true; odoslana: false; dovod: string }
  | { ok: false; chyba: string };

const db = supabaseAdmin as any;

/** Hodnoty premenných prostredia, ktoré podľa mena nesú kľúč alebo heslo. */
const tajneHodnoty = () =>
  Object.entries(process.env)
    .filter(
      ([k]) =>
        /KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CERT/i.test(k) && !/^VITE_|PUBLISHABLE/i.test(k),
    )
    .map(([, v]) => v);

export async function odosliOdpovedPoOprave(args: {
  id: string;
  /** Podpora klikla „Odoslať teraz“ — neplatí vypnutá automatika ani lehota. */
  rucne?: boolean;
}): Promise<VysledokOdpovede> {
  const { data: o } = await db
    .from("podpora_auto_opravy")
    .select(
      "id, poziadavka_id, stav, zmena, odpoved_zhrnutie, odpoved_text, odpoved_auto, nasadena_at, odpoved_odoslana_at",
    )
    .eq("id", args.id)
    .maybeSingle();
  if (!o) return { ok: false, chyba: "Návrh opravy sa nenašiel." };

  const { nacitajPoziadavku, pridajSpravu } = await import("./podpora.server");
  const p = await nacitajPoziadavku(o.poziadavka_id);
  if (!p) return { ok: false, chyba: "Požiadavka sa nenašla." };

  const dovod = smieOdpovedat(o, p.stav);
  if (dovod && (!args.rucne || dovod === "nie_je_nasadena" || dovod === "uz_odoslana"))
    return { ok: true, odoslana: false, dovod };

  const text = textOdpovede({ ...o, cislo: p.cislo, predmet: p.predmet });
  if (obsahujeTajomstvo(text, tajneHodnoty())) {
    await db
      .from("podpora_auto_opravy")
      .update({
        odpoved_chyba: "Text odpovede obsahuje hodnotu zo serverových tajomstiev — neodoslané.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", o.id);
    return { ok: false, chyba: "Text odpovede obsahuje tajnú hodnotu — neodoslané." };
  }

  // Zábrana proti dvojitému odoslaniu (cron a tlačidlo naraz): vyhrá len jeden.
  const teraz = new Date().toISOString();
  const { data: zabrate } = await db
    .from("podpora_auto_opravy")
    .update({ odpoved_odoslana_at: teraz, odpoved_chyba: null, updated_at: teraz })
    .eq("id", o.id)
    .is("odpoved_odoslana_at", null)
    .select("id");
  if (!zabrate?.length) return { ok: true, odoslana: false, dovod: "uz_odoslana" };

  try {
    await pridajSpravu({ poziadavka: p, autorId: null, od: "podpora", text });
  } catch (e: any) {
    // Správa sa nezapísala — nič neodišlo, dá sa skúsiť znova.
    await db
      .from("podpora_auto_opravy")
      .update({
        odpoved_odoslana_at: null,
        odpoved_chyba: String(e?.message ?? e).slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", o.id);
    return { ok: false, chyba: String(e?.message ?? e) };
  }

  // Zapamätá sa presne to, čo odišlo.
  await db
    .from("podpora_auto_opravy")
    .update({ odpoved_text: text, updated_at: new Date().toISOString() })
    .eq("id", o.id);

  await posliDoSparovanychChatov(p, text);

  // Oprava je vonku a zákazník to vie — požiadavka je vybavená. Keď odpíše,
  // `stavPoSprave` ju znova otvorí.
  await supabaseAdmin
    .from("podpora_poziadavky")
    .update({ stav: "vyriesena", updated_at: new Date().toISOString() })
    .eq("id", p.id);
  return { ok: true, odoslana: true };
}

/**
 * Zákazník, ktorý si Telegram spároval so svojím účtom, dostane odpoveď aj
 * tam — aj keď požiadavku založil na webe. Chat požiadavky už obslúžilo
 * `pridajSpravu`, ten sa preskočí. Zlyhanie sa len zaloguje.
 */
async function posliDoSparovanychChatov(
  p: { id: string; cislo: number; user_id: string | null; telegram_chat_id?: number | null },
  text: string,
): Promise<void> {
  if (!p.user_id) return;
  try {
    const { jeTelegramNastaveny, posliOdpovedZakaznikovi } = await import("./telegram.server");
    if (!jeTelegramNastaveny()) return;
    const { data } = await supabaseAdmin
      .from("telegram_chaty")
      .select("chat_id")
      .eq("user_id", p.user_id)
      .limit(5);
    for (const c of (data ?? []) as { chat_id: number }[]) {
      if (c.chat_id === p.telegram_chat_id) continue;
      await posliOdpovedZakaznikovi({ chatId: c.chat_id, cislo: cisloPoziadavky(p.cislo), text });
    }
  } catch (e: any) {
    console.error("[auto-oprava] odpoveď do Telegramu zlyhala:", e?.message ?? e);
  }
}
