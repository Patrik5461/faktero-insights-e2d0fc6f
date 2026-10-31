/*
  Mail, ktorý posiela firma svojim odberateľom (faktúra, upomienka, ponuka,
  podklady účtovníkovi). Keď má firma zapnutý vlastný SMTP server, ide cez neho
  a odberateľ vidí jej adresu (ako v Doklado); inak cez Resend ako doteraz.

  Keď vlastný server zlyhá, mail odíde cez Resend, aby faktúra neostala
  neodoslaná — chyba sa zapíše k nastaveniu a firma ju uvidí v Nastaveniach.
*/

import type { DruhMailu } from "./ochrana-odosielania.server";

export type PrilohaMailu = { filename: string; content: string /* base64 */ };

/**
 * Údaje pre strážcu odosielania (ochrana-odosielania.server.ts). Povinné, aby
 * sa nová cesta odosielania nedala pridať bez kontroly.
 */
export type OchranaMailu = {
  /** Kto odosiela; `null` pre cron a verejné API. */
  userId: string | null;
  druh: DruhMailu;
  /** Doklad, ku ktorému mail patrí (strop adresátov na doklad). */
  dokladId?: string | null;
  /** Vlastný text správy bez podpisu a tlačidiel Faktera; inak sa vezme `text`. */
  sprava?: string | null;
};

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
  ochrana: OchranaMailu;
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
  const { data } = await supabaseAdmin
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
  const v = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/%.*$/, "");
  if (!v.includes(":")) return jeVnutornaIpv4(v);
  const h = rozbalIpv6(v);
  // Nečitateľná adresa sa radšej odmietne.
  if (!h) return true;
  const ipv4 = (i: number) => `${h[i] >> 8}.${h[i] & 255}.${h[i + 1] >> 8}.${h[i + 1] & 255}`;
  const nuly = (od: number, po: number) => h.slice(od, po).every((x) => x === 0);
  // ::, ::1 a IPv4 vnorené do IPv6 — `::ffff:7f00:1` je 127.0.0.1 (Node ho tak aj pripojí).
  if (nuly(0, 7) && h[7] <= 1) return true;
  if (nuly(0, 5) && h[5] === 0xffff) return jeVnutornaIpv4(ipv4(6)); // ::ffff:a.b.c.d
  if (nuly(0, 4) && h[4] === 0xffff && h[5] === 0) return jeVnutornaIpv4(ipv4(6)); // ::ffff:0:a.b.c.d
  if (nuly(0, 6)) return jeVnutornaIpv4(ipv4(6)); // ::a.b.c.d (zastarané)
  if (h[0] === 0x64 && h[1] === 0xff9b && nuly(2, 6)) return jeVnutornaIpv4(ipv4(6)); // NAT64
  if (h[0] === 0x2002) return jeVnutornaIpv4(ipv4(1)); // 6to4
  return (
    (h[0] & 0xfe00) === 0xfc00 || // fc00::/7 lokálne
    (h[0] & 0xffc0) === 0xfe80 || // fe80::/10 linkové
    (h[0] & 0xffc0) === 0xfec0 || // fec0::/10 site-local
    (h[0] & 0xff00) === 0xff00 // multicast
  );
}

function jeVnutornaIpv4(v: string): boolean {
  const c = v.split(".").map(Number);
  if (c.length !== 4 || c.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a, b] = c;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** IPv6 → 8 čísel po 16 bitoch (aj so zápisom `::` a IPv4 na konci), inak null. */
function rozbalIpv6(v: string): number[] | null {
  let s = v;
  const m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const c = m[2].split(".").map(Number);
    if (c.some((x) => x > 255)) return null;
    s = `${m[1]}${((c[0] << 8) | c[1]).toString(16)}:${((c[2] << 8) | c[3]).toString(16)}`;
  }
  const casti = s.split("::");
  if (casti.length > 2) return null;
  const hex = (x: string) => (x ? x.split(":") : []);
  const pred = hex(casti[0]);
  const za = casti.length === 2 ? hex(casti[1]) : [];
  const chyba = 8 - pred.length - za.length;
  if (casti.length === 2 ? chyba < 1 : chyba !== 0) return null;
  const vsetko = [...pred, ...Array(casti.length === 2 ? chyba : 0).fill("0"), ...za];
  if (vsetko.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return vsetko.map((x) => parseInt(x, 16));
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
export async function posliCezSmtp(
  n: NastavenieSmtp,
  m: Omit<MailFirmy, "ochrana">,
): Promise<string | null> {
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

async function posliCezResend(m: Omit<MailFirmy, "ochrana">): Promise<string | null> {
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

export async function posliMailFirmy(companyId: string, mail: MailFirmy): Promise<VysledokMailu> {
  // Strážca: stropy adresátov, kontrola obsahu, pozastavenie. Keď mail
  // neprejde, vyhodí OdosielanieZastavene a nič neodíde.
  const { strazOdoslanie, rozdelAdresy } = await import("./ochrana-odosielania.server");
  // „a@x.sk, b@y.sk" v jednej položke: strážca aj odoslanie dostanú adresy jednotlivo.
  const m: MailFirmy = { ...mail, to: rozdelAdresy(mail.to) };
  const povolenie = await strazOdoslanie({
    companyId,
    userId: m.ochrana.userId,
    druh: m.ochrana.druh,
    dokladId: m.ochrana.dokladId ?? null,
    adresati: m.to,
    predmet: m.subject,
    sprava: m.ochrana.sprava ?? m.text ?? null,
  });
  try {
    const v = await posliMailFirmyBezStraze(companyId, m);
    await povolenie.hotovo(true);
    return v;
  } catch (e) {
    await povolenie.hotovo(false);
    throw e;
  }
}

async function posliMailFirmyBezStraze(companyId: string, m: MailFirmy): Promise<VysledokMailu> {
  const n = await nastavenieSmtp(companyId).catch(() => null);
  if (n?.aktivne) {
    try {
      const id = await posliCezSmtp(n, m);
      return { id, cez: "smtp" };
    } catch (e: any) {
      const chyba = String(e?.message ?? e).slice(0, 300);
      console.warn(`[smtp] firma ${companyId}: ${chyba} — posielam cez Resend`);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("firma_smtp")
        .update({ posledna_chyba: chyba, posledna_chyba_at: new Date().toISOString() })
        .eq("company_id", companyId);
      const id = await posliCezResend(m);
      return { id, cez: "resend", smtpChyba: chyba };
    }
  }
  return { id: await posliCezResend(m), cez: "resend" };
}
