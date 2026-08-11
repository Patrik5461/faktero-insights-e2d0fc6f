/**
 * Preklad chýb z prihlasovania do zrozumiteľnej slovenčiny.
 *
 * Supabase vracia anglické vety („Email not confirmed"), ktoré sa dosiaľ
 * ukazovali používateľovi tak, ako prišli. Pri prvom prihlásení je to
 * najhoršie možné miesto na cudzojazyčnú hlášku — človek nevie, či spravil
 * chybu on, alebo je pokazená aplikácia.
 *
 * Neznáme chyby sa nechávajú tak, ako prišli. Vymyslená veta by zakryla to,
 * čo sa naozaj stalo.
 */

export type AuthChyba = {
  sprava: string;
  /** Účet existuje, len nie je potvrdený — vtedy má zmysel ponúknuť odoslanie znova. */
  nepotvrdeny: boolean;
};

export function prelozAuthChybu(surova: string | null | undefined): AuthChyba {
  const t = (surova ?? "").trim();
  const n = t.toLowerCase();

  if (!t) return { sprava: "Prihlásenie zlyhalo.", nepotvrdeny: false };

  if (n.includes("email not confirmed") || n.includes("email_not_confirmed")) {
    return {
      sprava: "Účet ešte nie je potvrdený. Otvorte odkaz v e-maile, ktorý sme vám poslali.",
      nepotvrdeny: true,
    };
  }
  if (n.includes("invalid login credentials") || n.includes("invalid_credentials")) {
    return { sprava: "Nesprávny e-mail alebo heslo.", nepotvrdeny: false };
  }
  if (n.includes("user already registered") || n.includes("already been registered")) {
    return { sprava: "Tento e-mail už je zaregistrovaný. Prihláste sa.", nepotvrdeny: false };
  }
  if (n.includes("password should be at least")) {
    return { sprava: "Heslo musí mať aspoň 8 znakov.", nepotvrdeny: false };
  }
  if (n.includes("unable to validate email address") || n.includes("invalid email")) {
    return { sprava: "E-mailová adresa nie je platná.", nepotvrdeny: false };
  }
  // „For security purposes, you can only request this after 47 seconds."
  const sekundy = /after (\d+) seconds?/i.exec(t);
  if (sekundy) {
    return {
      sprava: `Skúste to znova o ${sekundy[1]} s — na ochranu pred zneužitím je medzi pokusmi pauza.`,
      nepotvrdeny: false,
    };
  }
  if (n.includes("email rate limit exceeded") || n.includes("over_email_send_rate_limit")) {
    return { sprava: "Priveľa e-mailov za sebou. Skúste to o chvíľu.", nepotvrdeny: false };
  }

  return { sprava: t, nepotvrdeny: false };
}
