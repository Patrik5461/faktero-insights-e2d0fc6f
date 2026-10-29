/*
  E-mail firme, keď jej príde eFaktúra.

  Volá sa z `stiahniPrijate` (webhook ePoštáka, nočná úloha aj tlačidlo
  „Stiahnuť nové“) s id dokladov, ktoré sa práve uložili. Doklady sa najprv
  „zaberú“ zápisom `upozornenie_odoslane_at` (len tie, ktoré ho ešte nemajú) —
  keď súbežne bežia webhook aj tlačidlo, e-mail pošle len ten, kto doklad
  zabral. Pri chybe Resendu sa značka nevracia: doklad by sa znova stiahol
  len ťažko a dvojitý e-mail je horší než žiadny (v zvončeku a v menu je tak
  či tak).

  Ide cez `posliMailFirmy`, teda cez strážcu odosielania (pozastavená firma
  nedostane nič). Text správy pre kontrolu obsahu je prázdny a predmet bez
  mena dodávateľa — oboje je cudzí text, a keby ho strážca vyhodnotil ako
  podvod, zastavil by firme odosielanie pre faktúru, ktorú poslal niekto iný.

  Adresa je e-mail firmy (Firma → E-mail), vypína sa prepínačom
  `companies.efaktura_upozornenie_email`.
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  STLPCE_UPOZORNENIA,
  cakaNaZaevidovanie,
  zostavEmailPrijatych,
  type PrijataEfaktura,
} from "./upozornenie-prijatej";

const web = () => (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");

export async function upozorniFirmuNaPrijateEfaktury(
  companyId: string,
  ids: string[],
): Promise<{ odoslane: boolean; dovod?: string }> {
  if (!ids.length) return { odoslane: false, dovod: "ziadne" };

  // Zabrať — ďalší beh s tými istými dokladmi už nedostane nič.
  const { data: zabrate, error } = await supabaseAdmin
    .from("efaktura_received_documents")
    .update({ upozornenie_odoslane_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .in("id", ids)
    .is("upozornenie_odoslane_at", null)
    .select(STLPCE_UPOZORNENIA);
  if (error) throw new Error(error.message);
  const riadky = ((zabrate ?? []) as unknown as PrijataEfaktura[]).filter(cakaNaZaevidovanie);
  if (!riadky.length) return { odoslane: false, dovod: "ziadne" };

  const { data: firma } = await supabaseAdmin
    .from("companies")
    .select("name, email, efaktura_upozornenie_email, odosielanie_pozastavene")
    .eq("id", companyId)
    .maybeSingle();
  if (!firma) return { odoslane: false, dovod: "firma" };
  if (firma.efaktura_upozornenie_email === false) return { odoslane: false, dovod: "vypnute" };
  const email = String(firma.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { odoslane: false, dovod: "bez_emailu" };
  if (firma.odosielanie_pozastavene) return { odoslane: false, dovod: "pozastavene" };

  riadky.sort((a, b) => String(b.received_at ?? "").localeCompare(String(a.received_at ?? "")));
  const m = zostavEmailPrijatych({
    firma: firma.name,
    riadky,
    // Cez Moje úlohy: tie prepnú na správnu firmu a pokračujú na Prijaté eFaktúry.
    odkaz: `${web()}/moje-ulohy?firma=${companyId}&dalej=efaktury`,
    odkazNastavenia: `${web()}/firma`,
  });
  const { posliMailFirmy } = await import("../odoslanie-mailu.server");
  try {
    await posliMailFirmy(companyId, {
      from: `Faktero eFaktúra <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      fromName: "Faktero eFaktúra",
      to: [email],
      subject: m.predmet,
      text: m.text,
      html: m.html,
      ochrana: { userId: null, druh: "efaktura_prijata", sprava: "" },
    });
    return { odoslane: true };
  } catch (e: any) {
    console.warn("[efaktura-prijata] e-mail", companyId, String(e?.message ?? e).slice(0, 300));
    return { odoslane: false, dovod: e?.name === "OdosielanieZastavene" ? "strazca" : "chyba" };
  }
}
