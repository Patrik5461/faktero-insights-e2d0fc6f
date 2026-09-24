/**
 * E-maily okolo prijatia ponuky.
 *
 * Tlačidlá v e-maile sú jediná vec, ktorá odberateľa delí od odpovede — preto
 * sú to obyčajné odkazy s tokenom, nie formulár: formulár v pošte polovica
 * klientov nezobrazí a druhá polovica ho zablokuje.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { datumSlovom } from "./ponuka-odpoved";

export function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function zakladnaAdresa(): string {
  return (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
}

export function odkazNaPonuku(token: string): string {
  return `${zakladnaAdresa()}/ponuka/${token}`;
}

/** Blok s tlačidlami, ktorý sa pridá pod text správy v e-maile s ponukou. */
export function tlacidlaDoMailu(token: string, platiDo?: string | null): string {
  const odkaz = odkazNaPonuku(token);
  const tlacidlo = (url: string, text: string, farba: string) =>
    `<a href="${url}" style="display:inline-block;background:${farba};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${text}</a>`;
  return `
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb">
    <p style="margin:0 0 12px;font-size:14px;color:#111">Odpovedať sa dá jedným kliknutím:</p>
    <div>
      ${tlacidlo(`${odkaz}?odpoved=prijat`, "Prijať ponuku", "#12734f")}
      &nbsp;
      ${tlacidlo(`${odkaz}?odpoved=zamietnut`, "Zamietnuť", "#b91c1c")}
    </div>
    <p style="margin:12px 0 0;font-size:13px;color:#6b7280">
      Alebo si ponuku pozrite online: <a href="${odkaz}" style="color:#12734f">${odkaz}</a>
      ${platiDo ? `<br>Ponuka platí do ${escapeHtml(datumSlovom(platiDo))}.` : ""}
    </p>
  </div>`;
}

/** To isté do textovej podoby — čítačky aj poštoví klienti bez HTML. */
export function tlacidlaDoTextu(token: string, platiDo?: string | null): string {
  const odkaz = odkazNaPonuku(token);
  return [
    "",
    "Odpovedať môžete tu:",
    `  Prijať ponuku:  ${odkaz}?odpoved=prijat`,
    `  Zamietnuť:      ${odkaz}?odpoved=zamietnut`,
    `  Zobraziť online: ${odkaz}`,
    platiDo ? `Ponuka platí do ${datumSlovom(platiDo)}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Dodávateľovi príde správa, že odberateľ odpovedal. */
export async function oznamOdpoved(opts: {
  ponuka: {
    quote_number: string;
    customer_name: string | null;
    total: number | null;
    currency: string | null;
  };
  firma: { name?: string | null; email?: string | null } | null;
  prijate: boolean;
  dovod?: string | null;
}): Promise<void> {
  const komu = opts.firma?.email;
  const apiKey = process.env.RESEND_API_KEY;
  if (!komu || !apiKey) return;

  const stav = opts.prijate ? "prijatá" : "zamietnutá";
  const suma = `${Number(opts.ponuka.total ?? 0).toLocaleString("sk-SK", {
    minimumFractionDigits: 2,
  })} ${opts.ponuka.currency ?? "EUR"}`;
  const predmet = `Cenová ponuka ${opts.ponuka.quote_number} bola ${stav}`;
  const text = [
    `${opts.ponuka.customer_name ?? "Odberateľ"} ${opts.prijate ? "prijal" : "zamietol"} cenovú ponuku ${opts.ponuka.quote_number} (${suma}).`,
    opts.dovod ? `\nDôvod: ${opts.dovod}` : "",
    opts.prijate ? "\nPonuku teraz viete jedným klikom premeniť na faktúru." : "",
  ].join("");

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
        to: [komu],
        subject: predmet,
        text,
        html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
          <p>${escapeHtml(opts.ponuka.customer_name ?? "Odberateľ")}
          <strong style="color:${opts.prijate ? "#12734f" : "#b91c1c"}">${opts.prijate ? "prijal" : "zamietol"}</strong>
          cenovú ponuku <strong>${escapeHtml(opts.ponuka.quote_number)}</strong> (${escapeHtml(suma)}).</p>
          ${
            opts.dovod
              ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:16px 0">
                   <div style="font-size:12px;color:#991b1b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Dôvod zamietnutia</div>
                   <div style="white-space:pre-wrap">${escapeHtml(opts.dovod)}</div>
                 </div>`
              : ""
          }
          ${opts.prijate ? `<p><a href="${zakladnaAdresa()}/ponuky" style="color:#12734f">Otvoriť ponuky vo Fakteru</a> — prijatú ponuku viete premeniť na faktúru.</p>` : ""}
        </div>`,
      }),
    });
  } catch (e) {
    // Oznámenie je príjemné, nie povinné — odpoveď odberateľa je už zapísaná.
    console.warn("[ponuka] oznámenie dodávateľovi zlyhalo:", String((e as Error)?.message ?? e));
  }
}

/** Token pre verejný odkaz; vyrobí sa raz a ostáva ponuke. */
export async function zabezpecToken(quoteId: string, existujuci?: string | null): Promise<string> {
  if (existujuci) return existujuci;
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("hex");
  const { error } = await supabaseAdmin
    .from("quotes")
    .update({ approval_token: token })
    .eq("id", quoteId);
  if (error) throw new Error(error.message);
  return token;
}
