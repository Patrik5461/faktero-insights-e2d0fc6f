/*
  Mail, ktorý posiela firma svojim odberateľom (faktúra, upomienka, ponuka,
  podklady účtovníkovi). Keď má firma zapnutý vlastný SMTP server, ide cez neho
  a odberateľ vidí jej adresu (ako v Doklado); inak cez Resend ako doteraz.

  Keď vlastný server zlyhá, mail odíde cez Resend, aby faktúra neostala
  neodoslaná — chyba sa zapíše k nastaveniu a firma ju uvidí v Nastaveniach.
*/

export type PrilohaMailu = { filename: string; content: string /* base64 */ };

export type MailFirmy = {
  /** Odosielateľ pre Resend, napr. `Firma <faktury@faktero.sk>`. */
  from: string;
  /** Meno odosielateľa pre vlastný SMTP, keď ho nastavenie nemá. */
  fromName?: string | null;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  reply_to?: string | null;
  attachments?: PrilohaMailu[];
};

export type VysledokMailu = { id: string | null; cez: "smtp" | "resend"; smtpChyba?: string };

type NastavenieSmtp = {
  aktivne: boolean;
  host: string;
  port: number;
  zabezpecenie: "ssl" | "starttls" | "ziadne";
  pouzivatel: string | null;
  heslo_sifrovane: string | null;
  od_email: string;
  od_meno: string | null;
};

export async function nastavenieSmtp(companyId: string): Promise<NastavenieSmtp | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("firma_smtp")
    .select("aktivne, host, port, zabezpecenie, pouzivatel, heslo_sifrovane, od_email, od_meno")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as NastavenieSmtp | null) ?? null;
}

/**
 * Server firmy musí byť verejný. Vnútorná adresa (localhost, 10.x, 192.168.x…)
 * by z nastavenia spravila nástroj na skúšanie služieb na našom serveri.
 */
export function jeVnutornaAdresa(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  if (v === "::1" || v === "::" || v.startsWith("fe80:") || /^f[cd][0-9a-f]{2}:/.test(v))
    return true;
  const c = v.split(".").map(Number);
  if (c.length !== 4 || c.some((x) => !Number.isInteger(x))) return false;
  const [a, b] = c;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export async function overVerejnyServer(host: string): Promise<string> {
  const { lookup } = await import("node:dns/promises");
  let adresy: { address: string }[];
  try {
    adresy = await lookup(host, { all: true });
  } catch {
    throw new Error(`Server ${host} sa nedá nájsť — skontrolujte názov.`);
  }
  if (!adresy.length || adresy.some((a) => jeVnutornaAdresa(a.address))) {
    throw new Error(`Server ${host} nie je verejná adresa — zadajte poštový server poskytovateľa.`);
  }
  return adresy[0].address;
}

/** Odošle cez SMTP podľa nastavenia; vráti Message-ID. */
export async function posliCezSmtp(n: NastavenieSmtp, m: MailFirmy): Promise<string | null> {
  // Pripája sa na overenú adresu, nie znova na meno — DNS by medzitým mohol vrátiť inú.
  const ip = await overVerejnyServer(n.host);
  const nodemailer = (await import("nodemailer")).default;
  const { decryptSecret } = await import("./payment-crypto.server");
  const transport = nodemailer.createTransport({
    host: ip,
    name: "faktero.sk",
    tls: { servername: n.host },
    port: n.port,
    secure: n.zabezpecenie === "ssl",
    requireTLS: n.zabezpecenie === "starttls",
    ignoreTLS: n.zabezpecenie === "ziadne",
    auth: n.pouzivatel
      ? { user: n.pouzivatel, pass: n.heslo_sifrovane ? decryptSecret(n.heslo_sifrovane) : "" }
      : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  const meno = (n.od_meno || m.fromName || "").replace(/["<>]/g, "").trim();
  const info = await transport.sendMail({
    from: meno ? `"${meno}" <${n.od_email}>` : n.od_email,
    to: m.to,
    subject: m.subject,
    text: m.text,
    html: m.html,
    replyTo: m.reply_to || undefined,
    attachments: (m.attachments ?? []).map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, "base64"),
    })),
  });
  return info.messageId ?? null;
}

async function posliCezResend(m: MailFirmy): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY nie je nastavený");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: m.from,
      to: m.to,
      subject: m.subject,
      reply_to: m.reply_to || undefined,
      text: m.text,
      html: m.html,
      attachments: m.attachments?.length ? m.attachments : undefined,
    }),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    // Resend pri chybe niekedy vráti HTML/prázdno
  }
  if (!res.ok) throw new Error(`Resend error: ${json?.message ?? text.slice(0, 500)}`);
  return json?.id ?? null;
}

export async function posliMailFirmy(companyId: string, m: MailFirmy): Promise<VysledokMailu> {
  const n = await nastavenieSmtp(companyId).catch(() => null);
  if (n?.aktivne) {
    try {
      const id = await posliCezSmtp(n, m);
      return { id, cez: "smtp" };
    } catch (e: any) {
      const chyba = String(e?.message ?? e).slice(0, 300);
      console.warn(`[smtp] firma ${companyId}: ${chyba} — posielam cez Resend`);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any)
        .from("firma_smtp")
        .update({ posledna_chyba: chyba, posledna_chyba_at: new Date().toISOString() })
        .eq("company_id", companyId);
      const id = await posliCezResend(m);
      return { id, cez: "resend", smtpChyba: chyba };
    }
  }
  return { id: await posliCezResend(m), cez: "resend" };
}
