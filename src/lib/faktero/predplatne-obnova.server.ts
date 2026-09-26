/**
 * Automatická obnova predplatného.
 *
 * Podmienky (`/pravne/opakovane-platby`) sľubujú dve veci, ktoré systém doteraz
 * nerobil: mesačné strhnutie z uloženej karty a upozornenie **7 dní vopred**.
 * Bez toho sa predplatné obnovilo len tak, že človek sám znovu prešiel bránou.
 *
 * Beží z cronu raz denne. Účtovanie samo nič nepredlžuje — platbu potvrdí až
 * webhook GoPay, ktorý predĺži obdobie a vystaví doklad. Tu sa len iniciuje
 * strhnutie a stráži sa, čo zlyhalo.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Po koľkých neúspešných pokusoch sa predplatné označí ako po splatnosti. */
const MAX_POKUSOV = 3;

/** Koľko dní pred strhnutím ide upozornenie. Podmienky hovoria „najmenej 7". */
const DNI_VOPRED = 7;

const escapeHtml = (s: string) =>
  String(s).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );

function eur(centy: number) {
  return `${(centy / 100).toFixed(2).replace(".", ",")} €`;
}

function appUrl() {
  return (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
}

async function posliMail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY nie je nastavený.");
  const from = process.env.RESEND_FROM_EMAIL ?? "noreply@faktero.sk";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/** Upozornenia na blížiacu sa obnovu. */
export async function posliUpozorneniaNaObnovu() {
  const od = new Date(Date.now() + DNI_VOPRED * 86_400_000).toISOString();
  const do_ = new Date(Date.now() + (DNI_VOPRED + 1) * 86_400_000).toISOString();

  const { data: riadky } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "company_id, plan, next_billing_at, monthly_price_cents, cancel_at_period_end, gopay_subscription_id, companies(name, email)",
    )
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .is("renewal_reminder_sent_at", null)
    .gte("next_billing_at", od)
    .lt("next_billing_at", do_);

  const { sumaSDph } = await import("./predplatne-cena");
  let odoslane = 0;
  let zlyhalo = 0;

  for (const r of riadky ?? []) {
    const email = (r as any).companies?.email as string | undefined;
    const firma = escapeHtml((r as any).companies?.name ?? "vaša firma");
    const suma = sumaSDph(Number(r.monthly_price_cents ?? 0));
    const den = r.next_billing_at
      ? new Date(r.next_billing_at).toLocaleDateString("sk-SK")
      : "čoskoro";
    if (!email) {
      // Bez adresy sa upozorniť nedá; príznak sa aj tak nastaví, aby sa to
      // neskúšalo každý deň znova.
      await supabaseAdmin
        .from("subscriptions")
        .update({ renewal_reminder_sent_at: new Date().toISOString() })
        .eq("company_id", r.company_id);
      continue;
    }
    /*
      Keď brána nemá povolené opakované platby, kartu si neuložila a nie je
      z čoho strhnúť. Upozornenie musí prísť aj tak — inak by predplatné ticho
      dobehlo a nikto by nevedel, že treba zaplatiť.
    */
    const automaticky = Boolean(r.gopay_subscription_id);
    const predmet = automaticky
      ? `Predplatné Faktero sa o ${DNI_VOPRED} dní obnoví`
      : `Predplatné Faktero končí o ${DNI_VOPRED} dní`;
    const telo = automaticky
      ? `<p>predplatné pre <strong>${firma}</strong> sa automaticky obnoví <strong>${den}</strong>.
         Z vašej platobnej karty strhneme <strong>${eur(suma)}</strong> s DPH.</p>
         <p>Ak pokračovať nechcete, zrušte predplatné do tohto dátumu — bez poplatku,
         v sekcii Predplatné. Služba vám pobeží do konca zaplateného obdobia.</p>`
      : `<p>predplatné pre <strong>${firma}</strong> platí do <strong>${den}</strong>.
         Platba sa nestrhne sama — ak chcete pokračovať, uhraďte ďalšie obdobie
         (<strong>${eur(suma)}</strong> s DPH) v sekcii Predplatné.</p>
         <p>Ak nezaplatíte, nič sa nestratí: doklady aj údaje vám ostanú prístupné.</p>`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
        <h1 style="font-size:20px;margin:0 0 12px">${predmet}</h1>
        <p>Dobrý deň,</p>
        ${telo}
        <p><a href="${appUrl()}/predplatne" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Otvoriť predplatné</a></p>
        <p style="color:#64748b;font-size:12px;margin-top:24px">Faktero · Tobify s. r. o. · podpora@faktero.sk · +421902101967</p>
      </div>`;
    try {
      await posliMail(email, predmet, html);
      await supabaseAdmin
        .from("subscriptions")
        .update({ renewal_reminder_sent_at: new Date().toISOString() })
        .eq("company_id", r.company_id);
      odoslane += 1;
    } catch (e: any) {
      zlyhalo += 1;
      await supabaseAdmin.from("billing_events").insert({
        company_id: r.company_id,
        event_type: "renewal_reminder_failed",
        payload: { error: String(e?.message ?? e) },
      });
    }
  }
  return { odoslane, zlyhalo };
}

/**
 * Predplatné, ktorému uplynulo obdobie a nemá sa z čoho strhnúť.
 *
 * Kým brána nemá povolené opakované platby, platí sa ručne. Bez tejto kontroly
 * by predplatné po uplynutí obdobia ticho bežalo ďalej zadarmo a nikto by o
 * tom nevedel — ani zákazník, ani my.
 */
export async function oznacNezaplatene() {
  // Tri dni odkladu: platba cez víkend alebo pomalý prevod nemajú nikoho hneď
  // označiť za neplatiča.
  const hranica = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data: riadky } = await supabaseAdmin
    .from("subscriptions")
    .select("company_id, next_billing_at, gopay_subscription_id")
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .is("gopay_subscription_id", null)
    .lt("next_billing_at", hranica);

  let oznacene = 0;
  for (const r of riadky ?? []) {
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "past_due", last_renewal_error: "Obdobie uplynulo, platba neprišla." })
      .eq("company_id", r.company_id);
    await supabaseAdmin.from("billing_events").insert({
      company_id: r.company_id,
      event_type: "subscription_past_due",
      payload: { dovod: "bez_automatickej_platby", platilo_do: r.next_billing_at },
    });
    oznacene += 1;
  }
  return { oznacene };
}

/** Strhnutie ďalšieho mesiaca z uloženej karty. */
export async function strhniObnovy() {
  const teraz = new Date().toISOString();
  const { data: riadky } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "company_id, plan, plan_id, next_billing_at, monthly_price_cents, renewal_attempts, gopay_subscription_id, cancel_at_period_end, companies(name, email)",
    )
    .in("status", ["active", "past_due"])
    .eq("cancel_at_period_end", false)
    .eq("billing_suspended", false)
    .not("gopay_subscription_id", "is", null)
    .lte("next_billing_at", teraz);

  const { sumaSDph } = await import("./predplatne-cena");
  const { gopayCreateRecurrence } = await import("./gopay.server");
  let spustene = 0;
  let zlyhane = 0;
  let poSplatnosti = 0;
  /* Účet v bráne nemá zapnuté opakované platby — iná vec než zamietnutá karta. */
  let nepodporovane = 0;

  for (const r of riadky ?? []) {
    const cenaBezDph = Number(r.monthly_price_cents ?? 0);
    if (cenaBezDph <= 0) continue; // Enterprise a ručne dohodnuté plány sa neúčtujú automaticky.
    const suma = sumaSDph(cenaBezDph);
    const email = (r as any).companies?.email as string | undefined;
    const orderNumber = `FK-${r.company_id.slice(0, 8)}-${Date.now()}`;

    try {
      const platba = await gopayCreateRecurrence(r.gopay_subscription_id!, {
        amountCents: suma,
        orderNumber,
        orderDescription: `Faktero ${r.plan} — mesačné predplatné`,
      });
      /*
        Riadok sa zakladá hneď, aby mal webhook čo spárovať — bez neho by
        prišlo potvrdenie o platbe, ktorú nepoznáme, a predplatné by sa
        nepredĺžilo.
      */
      await supabaseAdmin.from("billing_payments").upsert(
        {
          company_id: r.company_id,
          plan_slug: r.plan,
          amount_cents: suma,
          currency: "EUR",
          status: String(platba.state ?? "CREATED"),
          provider: "gopay",
          provider_payment_id: String(platba.id),
        },
        { onConflict: "provider,provider_payment_id" },
      );
      await supabaseAdmin
        .from("subscriptions")
        .update({ last_renewal_at: new Date().toISOString(), last_renewal_error: null })
        .eq("company_id", r.company_id);
      await supabaseAdmin.from("billing_events").insert({
        company_id: r.company_id,
        event_type: "subscription_renewal_charged",
        payload: { payment_id: String(platba.id), amount_cents: suma, state: platba.state },
      });
      spustene += 1;
    } catch (e: any) {
      const sprava = String(e?.message ?? e);
      /*
        „PAYMENT_RECURRENCE_NOT_SUPPORTED" nie je problém karty — brána
        opakované platby na tomto účte nemá zapnuté. Skúšať to zajtra znovu
        nemá zmysel: súhlas sa zahodí, aby cron prestal biť do zamknutých
        dverí, a zákazník dostane odkaz na ručnú platbu.
      */
      if (/PAYMENT_RECURRENCE_NOT_SUPPORTED|error_code.{0,3}341/.test(sprava)) {
        nepodporovane += 1;
        await supabaseAdmin
          .from("subscriptions")
          .update({
            gopay_subscription_id: null,
            last_renewal_error: "Brána nemá povolené opakované platby.",
            next_billing_at: r.next_billing_at,
          })
          .eq("company_id", r.company_id);
        await supabaseAdmin.from("billing_events").insert({
          company_id: r.company_id,
          event_type: "subscription_recurrence_unsupported",
          payload: { error: sprava.slice(0, 300) },
        });
        continue;
      }
      zlyhane += 1;
      const pokusy = Number(r.renewal_attempts ?? 0) + 1;
      const vycerpane = pokusy >= MAX_POKUSOV;
      await supabaseAdmin
        .from("subscriptions")
        .update({
          renewal_attempts: pokusy,
          last_renewal_error: sprava.slice(0, 500),
          ...(vycerpane ? { status: "past_due" as const } : {}),
          /*
            Ďalší pokus zajtra. Bez posunu by cron skúšal to isté každých
            pár hodín a banka by kartu začala blokovať.
          */
          next_billing_at: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .eq("company_id", r.company_id);
      await supabaseAdmin.from("billing_events").insert({
        company_id: r.company_id,
        event_type: vycerpane ? "subscription_past_due" : "subscription_renewal_failed",
        payload: { pokus: pokusy, error: sprava.slice(0, 300) },
      });
      if (vycerpane) poSplatnosti += 1;
      if (vycerpane && email) {
        try {
          await posliMail(
            email,
            "Platbu za Faktero sa nepodarilo strhnúť",
            `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
              <h1 style="font-size:20px;margin:0 0 12px">Platbu sa nepodarilo strhnúť</h1>
              <p>Dobrý deň,</p>
              <p>mesačnú platbu za Faktero (${eur(suma)}) sa nám ani po ${MAX_POKUSOV} pokusoch
              nepodarilo strhnúť z vašej karty. Najčastejšie je to expirovaná karta alebo
              nedostatok prostriedkov.</p>
              <p>Predplatné zatiaľ beží ďalej. Obnovíte ho novou platbou v sekcii Predplatné.</p>
              <p><a href="${appUrl()}/predplatne" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Zaplatiť znovu</a></p>
              <p style="color:#64748b;font-size:12px;margin-top:24px">Faktero · podpora@faktero.sk · +421902101967</p>
            </div>`,
          );
        } catch {
          /* e-mail je len sprievodný; stav je zapísaný v udalostiach */
        }
      }
    }
  }
  return { spustene, zlyhane, poSplatnosti, nepodporovane };
}
