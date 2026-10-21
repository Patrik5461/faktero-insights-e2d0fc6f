/*
  Oznam o povinnej e-fakturácii od 1. 1. 2027 — kedy sa ukáže okno, kedy
  tenký pás a kedy nič. Čistá logika bez databázy (testy v efaktura-oznam.test.ts).

  Okno (modal) dostane len majiteľ alebo admin slovenskej firmy, ktorá eFaktúru
  ešte nemá aktivovanú. Česká a nemecká firma slovenskú povinnosť nemá.
  Po zatvorení krížikom (alebo kliknutí na „Pokračovať na prepojenie") sa
  okno vráti najskôr o 7 dní; po aktivácii už nikdy. Kým čaká platná pozvánka
  pre účtovníka, namiesto okna je hore pás „Čakáme na aktiváciu…".
*/

export const ODLOZENIE_DNI = 7;
export const PLATNOST_POZVANKY_DNI = 30;
const DEN_MS = 86_400_000;

export type ZobrazenieOznamu = "okno" | "pas" | "nic";

/** Profil eFaktúry je aktivovaný, keď je zapnutý a spárovaný s ePoštákom. */
export function jeEfakturaAktivovana(
  profil: { enabled?: boolean | null; epostak_firm_id?: string | null } | null | undefined,
): boolean {
  return !!profil?.enabled && !!profil?.epostak_firm_id;
}

/** Pozvánka platí, kým nie je zrušená a nevypršala. */
export function jePozvankaPlatna(
  p: { expires_at?: string | null; zrusena_at?: string | null } | null | undefined,
  teraz: Date = new Date(),
): boolean {
  if (!p || p.zrusena_at) return false;
  const kon = p.expires_at ? Date.parse(p.expires_at) : NaN;
  return Number.isFinite(kon) && kon > teraz.getTime();
}

/*
  Stránky, kde okno neprekáža tomu, čo človek práve robí: na eFaktúre sám
  aktiváciu rieši, v Pomoci číta návod, v onboardingu firmu ešte zakladá.
*/
const BEZ_OKNA = ["/efaktura", "/pomoc", "/onboarding", "/podpora"];

export function jeCestaBezOkna(cesta: string): boolean {
  const c = cesta.replace(/\/+$/, "") || "/";
  return BEZ_OKNA.some((p) => c === p || c.startsWith(p + "/"));
}

export type VstupOznamu = {
  rola: string | null | undefined;
  /** Krajina dane firmy (`krajinaDane`): SK | CZ | DE. */
  krajina: string | null | undefined;
  aktivovana: boolean;
  dismissedAt?: string | null;
  ctaClickedAt?: string | null;
  /** Platná (nezrušená, nevypršaná) pozvánka pre účtovníka v tejto firme. */
  uctovnikPozvany: boolean;
  cesta: string;
  teraz?: Date;
};

export function coZobrazitOznam(v: VstupOznamu): ZobrazenieOznamu {
  if (v.rola !== "owner" && v.rola !== "admin") return "nic";
  if ((v.krajina ?? "SK") !== "SK") return "nic";
  if (v.aktivovana) return "nic";
  if (v.uctovnikPozvany) return "pas";
  if (jeCestaBezOkna(v.cesta)) return "nic";
  const teraz = (v.teraz ?? new Date()).getTime();
  const odlozene = [v.dismissedAt, v.ctaClickedAt]
    .map((d) => (d ? Date.parse(d) : NaN))
    .filter(Number.isFinite);
  if (odlozene.length && teraz - Math.max(...odlozene) < ODLOZENIE_DNI * DEN_MS) return "nic";
  return "okno";
}

/** Rozumná kontrola e-mailu účtovníka (presnejšie overí až doručenie). */
export function jePlatnyEmail(s: string): boolean {
  const e = s.trim();
  return e.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(e);
}

/** DIČ firmy tak, ako ho chce Portál FS — desať číslic bez predpony. */
export function dicPrePortal(dic: string | null | undefined): string | null {
  const d = String(dic ?? "")
    .replace(/\s+/g, "")
    .replace(/^SK/i, "");
  return /^\d{10}$/.test(d) ? d : null;
}

export const PORTAL_FS = "https://www.financnasprava.sk";
