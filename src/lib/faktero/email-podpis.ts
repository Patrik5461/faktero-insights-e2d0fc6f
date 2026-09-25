/**
 * Pätička odosielateľa v e-mailoch pre odberateľov.
 *
 * Do schránky príde faktúra alebo ponuka od „nejakej firmy" — odosielacia
 * adresa je spoločná (faktury@faktero.sk), takže bez podpisu nemá príjemca
 * ako zistiť, komu má zavolať alebo odpísať. Zákon o e-commerce aj bežná
 * slušnosť pritom chcú, aby obchodná správa niesla identifikáciu odosielateľa.
 */

export type FirmaVPodpise = {
  name?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  ico?: string | null;
  dic?: string | null;
  ic_dph?: string | null;
  email?: string | null;
  email_reply_to?: string | null;
  phone?: string | null;
  website?: string | null;
};

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Adresa na jednom riadku — prázdne časti sa vynechajú. */
export function adresaVRiadku(f: FirmaVPodpise): string {
  const mesto = [f.zip, f.city].filter(Boolean).join(" ").trim();
  return [f.street, mesto].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
}

/** Daňové čísla tak, ako sa uvádzajú pod adresou. */
export function danoveCisla(f: FirmaVPodpise): string {
  return [
    f.ico ? `IČO ${f.ico}` : null,
    f.dic ? `DIČ ${f.dic}` : null,
    f.ic_dph ? `IČ DPH ${f.ic_dph}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** E-mail, na ktorý má odberateľ odpovedať. */
export function kontaktnyEmail(f: FirmaVPodpise): string | null {
  return (f.email_reply_to || f.email || "").trim() || null;
}

/** Riadky podpisu bez značiek — pre textovú podobu e-mailu. */
export function podpisRiadky(f: FirmaVPodpise): string[] {
  const web = String(f.website ?? "").trim();
  return [
    String(f.name ?? "").trim(),
    adresaVRiadku(f),
    danoveCisla(f),
    [
      f.phone ? `tel. ${String(f.phone).trim()}` : null,
      kontaktnyEmail(f),
      web ? web.replace(/^https?:\/\//, "") : null,
    ]
      .filter(Boolean)
      .join(" · "),
  ].filter((r) => r.length > 0);
}

export function podpisText(f: FirmaVPodpise): string {
  const riadky = podpisRiadky(f);
  return riadky.length ? `\n\n—\n${riadky.join("\n")}` : "";
}

export function podpisHtml(f: FirmaVPodpise): string {
  const riadky = podpisRiadky(f);
  if (!riadky.length) return "";
  const [nazov, ...zvysok] = riadky;
  const kontakt = kontaktnyEmail(f);
  return `
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7280">
    <div style="font-weight:600;color:#111">${escapeHtml(nazov)}</div>
    ${zvysok
      .map((r) =>
        kontakt && r.includes(kontakt)
          ? `<div>${escapeHtml(r).replace(
              escapeHtml(kontakt),
              `<a href="mailto:${escapeHtml(kontakt)}" style="color:#12734f">${escapeHtml(kontakt)}</a>`,
            )}</div>`
          : `<div>${escapeHtml(r)}</div>`,
      )
      .join("\n    ")}
  </div>`;
}
