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

export type KartaPonuky = {
  token: string;
  cislo?: string | null;
  suma?: number | null;
  mena?: string | null;
  platiDo?: string | null;
};

/**
 * Karta s tlačidlami pod textom správy.
 *
 * Poštoví klienti sú zastaraní: `flex` ani `grid` nevedia a Outlook zahodí aj
 * polovicu CSS. Preto tabuľka, vloženými štýlmi a bez obrázkov — vyzerá to
 * rovnako v Gmaile, na telefóne aj v Outlooku, a keď štýly nepustí vôbec,
 * ostanú čitateľné odkazy pod sebou.
 */
export function tlacidlaDoMailu(vstup: KartaPonuky | string, platiDoStare?: string | null): string {
  const k: KartaPonuky =
    typeof vstup === "string" ? { token: vstup, platiDo: platiDoStare ?? null } : vstup;
  const odkaz = odkazNaPonuku(k.token);
  const suma =
    k.suma != null
      ? `${Number(k.suma).toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${k.mena ?? "EUR"}`
      : null;

  const tlacidlo = (url: string, text: string, plne: boolean) =>
    `<a href="${url}" style="display:inline-block;${
      plne
        ? "background:#12734f;border:1px solid #12734f;color:#ffffff;"
        : "background:#ffffff;border:1px solid #d1d5db;color:#374151;"
    }text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:15px;line-height:1;font-family:Inter,Arial,sans-serif">${text}</a>`;

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px">
    <tr>
      <td style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px;font-family:Inter,Arial,sans-serif">
        ${
          k.cislo
            ? `<div style="font-size:13px;color:#6b7280;margin-bottom:2px">Cenová ponuka ${escapeHtml(k.cislo)}</div>`
            : ""
        }
        ${suma ? `<div style="font-size:22px;font-weight:700;color:#111;margin-bottom:4px">${escapeHtml(suma)}</div>` : ""}
        ${
          k.platiDo
            ? `<div style="font-size:13px;color:#6b7280;margin-bottom:16px">Platí do ${escapeHtml(datumSlovom(k.platiDo))}</div>`
            : '<div style="margin-bottom:16px"></div>'
        }
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-right:10px">${tlacidlo(`${odkaz}?odpoved=prijat`, "Prijať ponuku", true)}</td>
            <td>${tlacidlo(`${odkaz}?odpoved=zamietnut`, "Zamietnuť", false)}</td>
          </tr>
        </table>
        <div style="font-size:13px;color:#6b7280;margin-top:14px">
          Alebo si ponuku najprv pozrite:
          <a href="${odkaz}" style="color:#12734f;text-decoration:underline">otvoriť ponuku online</a>
        </div>
      </td>
    </tr>
  </table>`;
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
