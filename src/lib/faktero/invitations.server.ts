/*
  Pozvánka do firmy — spoločné pre aplikáciu (Nastavenia → Používatelia) aj
  verejné API (POST /api/v1/companies/{id}/invitations). Právo pozývať
  kontroluje volajúci; tu sa zakladá záznam a posiela e-mail cez strážcu.
*/
import { escHtml, menoOdosielatela } from "@/lib/bezpecny-text";
import { vycistiOpravnenia } from "./opravnenia";

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type RolaPozvanky = "admin" | "accountant" | "employee" | "custom";

export async function vytvorPozvanku(
  supabaseAdmin: any,
  a: {
    companyId: string;
    email: string;
    role: RolaPozvanky;
    permissions?: unknown;
    invitedBy: string | null;
  },
): Promise<{
  id: string;
  token: string;
  odkaz: string;
  emailOdoslany: boolean;
  chybaEmailu: string | null;
}> {
  if (!["admin", "accountant", "employee", "custom"].includes(a.role))
    throw new Error("Neplatná rola pozvánky.");
  const email = a.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Neplatný email");
  const token = randomToken();

  const { data: inv, error } = await supabaseAdmin
    .from("company_invitations")
    .insert({
      company_id: a.companyId,
      email,
      role: a.role,
      // Oblasti majú zmysel len pri vlastnom prístupe; inak sa nič neukladá.
      permissions: a.role === "custom" ? vycistiOpravnenia(a.permissions) : {},
      token,
      invited_by: a.invitedBy,
    })
    .select("*, companies(name)")
    .single();
  if (error) throw error;

  const base = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
  const odkaz = `${base}/pridat-pouzivatela?token=${token}`;

  // E-mail je len pohodlie: keď neodíde, pozvánka platí ďalej a pozývajúci
  // dostane odkaz, ktorý môže poslať sám. Predtým sa chyba prehltla a
  // aplikácia aj tak hlásila „Pozvánka odoslaná".
  let emailOdoslany = false;
  let chybaEmailu: string | null = null;
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) chybaEmailu = "Odosielanie e-mailov nie je nastavené.";
    if (apiKey) {
      const url = odkaz;
      const fromEmail = process.env.RESEND_FROM_EMAIL || "faktury@faktero.sk";
      const companyName = menoOdosielatela((inv as any)?.companies?.name);
      // Pozvánka nesie názov firmy na ľubovoľnú adresu — strážca ako pri faktúre.
      // Keď ju zastaví, pozvánka platí a pozývajúci dostane odkaz s hláškou.
      const { strazOdoslanie } = await import("./ochrana-odosielania.server");
      const povolenie = await strazOdoslanie({
        companyId: a.companyId,
        userId: a.invitedBy,
        druh: "pozvanka",
        adresati: [email],
        predmet: `Pozvánka do firmy ${companyName} vo Faktero`,
        sprava: "",
      });
      const odpoved = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: `Faktero <${fromEmail}>`,
          to: [email],
          subject: `Pozvánka do firmy ${companyName} vo Faktero`,
          html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
            <h2 style="margin:0 0 12px">Boli ste pozvaný do Faktera</h2>
            <p>Firma <strong>${escHtml(companyName)}</strong> vás pozvala do svojho účtu vo Faktero.</p>
            <p><a href="${url}" style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Prijať pozvánku</a></p>
            <p style="color:#666;font-size:12px">Alebo skopírujte odkaz: ${url}<br/>Platnosť pozvánky je 14 dní.</p>
          </div>`,
        }),
      });
      await povolenie.hotovo(odpoved.ok);
      if (odpoved.ok) emailOdoslany = true;
      else chybaEmailu = `Poštová služba odmietla e-mail (${odpoved.status}).`;
    }
  } catch (e: any) {
    console.error("[invitation-email]", e);
    chybaEmailu = e?.message ?? "E-mail sa nepodarilo odoslať.";
  }

  return { id: inv.id, token, odkaz, emailOdoslany, chybaEmailu };
}
