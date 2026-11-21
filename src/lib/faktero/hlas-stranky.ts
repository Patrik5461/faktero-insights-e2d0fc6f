/*
  Katalóg stránok pre hlasové ovládanie — „otvor pokladňu“, „choď na sklad“.

  Trasy sa negenerujú ručne: `hlas-trasy.gen.ts` vyrába skript
  `scripts/hlas-trasy.mjs` zo `src/routeTree.gen.ts` (test stráži, že sedí).
  Ľudské názvy berie z menu (`nav.ts` — NAV, nastavenia, API, „Vytvoriť“),
  čo v menu nie je (detaily, podstránky, admin), pomenuje `NAZVY_MIMO_MENU`
  a zvyšok sa pomenuje z adresy, aby nová stránka nikdy nevypadla.

  Kľúč stránky = cesta, pri položkách menu s parametrom aj s ním
  (`/faktury?type=credit` = Dobropisy). Model vyberá kľúč z enumu, takže inú
  adresu ako zo zoznamu otvoriť nevie.
*/
import {
  ACCOUNT_API_LINKS,
  ACCOUNT_SETTINGS_LINKS,
  NAV,
  QUICK_CREATE,
  type NavChild,
} from "@/components/faktero/nav";
import { TRASY_ADMINA, TRASY_APLIKACIE } from "./hlas-trasy.gen";
import { UUID, type Navigacia } from "./hlas";

export type StrankaHlasu = {
  /** Kľúč pre model — cesta, prípadne s `?param=hodnota`. */
  kluc: string;
  /** Cesta routera (`/faktury/$id`). */
  to: string;
  search?: Record<string, string>;
  nazov: string;
  /** Sekcia menu (Fakturácia, Banka…), ak stránka v menu je. */
  sekcia: string | null;
  /** Detail potrebuje `id` (uuid). */
  detail: boolean;
  /** Len pre administrátora platformy. */
  admin: boolean;
};

/**
 * Názvy stránok, ktoré v menu nie sú. Administrácia zrkadlí `AdminShell.tsx`
 * (ten je komponent, na serveri sa importovať nemá).
 */
export const NAZVY_MIMO_MENU: Record<string, string> = {
  "/dashboard": "Prehľad (úvodná stránka)",
  "/moje-ulohy": "Moje úlohy",
  "/partner": "Partnerský program",
  "/onboarding": "Prvé nastavenie firmy",
  "/faktury": "Vystavené faktúry",
  "/faktury/$id": "Detail vystavenej faktúry",
  "/faktury/$id/upravit": "Úprava vystavenej faktúry",
  "/faktury/parovanie": "Párovanie platieb s faktúrami",
  "/prijate-faktury/$id": "Detail prijatej faktúry",
  "/prijate-faktury/$id/upravit": "Úprava prijatej faktúry",
  "/prijate-faktury/nova": "Nová prijatá faktúra",
  "/nespracovane/$id": "Detail nespracovaného dokladu",
  "/ponuky/$id": "Detail cenovej ponuky",
  "/objednavky/$id": "Detail objednávky",
  "/objednavky/nova": "Nová objednávka",
  "/opakovane/$id": "Detail opakovanej faktúry",
  "/zakazky/$id": "Detail zákazky",
  "/financovanie/$id": "Detail leasingu alebo úveru",
  "/vozovy-park/$id": "Detail vozidla",
  "/zamestnanci/$id": "Detail zamestnanca",
  "/podpora/$id": "Detail požiadavky na podporu",
  "/doklady/vyuctovania/$id": "Detail vyúčtovania výdavkov",
  "/ostatne-doklady/novy": "Nový iný doklad",
  "/bankove-ucty/import": "Import bankového výpisu",
  "/bankove-ucty/notifikacie": "Bankové notifikácie e-mailom",
  "/bankove-ucty/revolut": "Pripojenie Revolut",
  "/efaktura": "Prehľad eFaktúry",
  "/financovanie": "Leasingy a úvery",
  "/importy": "História importov",
  "/importy/doklady": "Import dokladov",
  "/importy/idoklad": "Import z iDokladu",
  "/importy/kros": "Import z KROS",
  "/importy/money-s3": "Import z Money S3",
  "/importy/omega": "Import z Omegy",
  "/importy/pohoda": "Import z Pohody",
  "/importy/superfaktura": "Import zo SuperFaktúry",
  "/jazdy/gps": "Jazdy z GPS",
  "/jazdy/prehlad": "Prehľad knihy jázd",
  "/sklad/dodaci-list": "Dodací list (rozpoznanie)",
  "/sklad/dodacie-listy": "Dodacie listy",
  "/sklad/hodnota": "Hodnota skladu",
  "/sklad/import": "Import skladu",
  "/sklad/nastavenia": "Nastavenia skladu",
  "/sklad/objednavky/$id": "Detail objednávky u dodávateľa",
  "/sklad/objednavky/nova": "Nová objednávka u dodávateľa",
  "/sklad/pohyby/$id": "Detail skladového pohybu",
  "/sklad/presuny": "Presuny medzi skladmi",
  "/sklad/presuny/$id": "Detail presunu",
  "/sklad/presuny/nova": "Nový presun",
  "/sklad/prijem": "Príjem na sklad",
  "/sklad/vydaj": "Výdaj zo skladu",
  "/sklad/produkty/$id": "Detail skladovej položky",
  "/sklad/produkty/$id/upravit": "Úprava skladovej položky",
  "/uctovnictvo/konvertor": "Konvertor",
  "/uctovnictvo/na-kontrolu": "Na kontrolu (zaúčtovanie)",
  "/uctovnictvo/pravidla": "Pravidlá účtovania",
  "/uctovnictvo/vypis-do-pohody": "Bankový výpis do Pohody",
  "/nastavenia/online-platby": "Online platby",
  "/admin": "Administrácia — prehľad",
  "/admin/podpora": "Administrácia — podpora",
  "/admin/podpora/$id": "Administrácia — detail požiadavky",
  "/admin/efaktura": "Administrácia — eFaktúra",
  "/admin/odosielanie": "Administrácia — odosielanie e-mailov",
  "/admin/oznamy": "Administrácia — oznamy o aktualizácii",
  "/admin/health": "Administrácia — health check",
  "/admin/companies": "Administrácia — firmy",
  "/admin/companies/$id": "Administrácia — detail firmy",
  "/admin/users": "Administrácia — používatelia",
  "/admin/users/$id": "Administrácia — detail používateľa",
  "/admin/subscriptions": "Administrácia — predplatné",
  "/admin/gopay": "Administrácia — GoPay",
  "/admin/platform-invoices": "Administrácia — platformové faktúry",
  "/admin/usage": "Administrácia — využitie",
  "/admin/ai": "Administrácia — AI a kredity",
  "/admin/kniha-jazd": "Administrácia — kniha jázd",
  "/admin/errors": "Administrácia — chyby",
  "/admin/audit-log": "Administrácia — audit log",
  "/admin/banky": "Administrácia — bankové pripojenia",
  "/admin/legal": "Administrácia — právne dokumenty",
  "/admin/seo": "Administrácia — SEO",
  "/admin/ucty-zdarma": "Administrácia — účty zadarmo",
  "/admin/partnersky-program": "Administrácia — partnerský program",
  "/admin/partneri": "Administrácia — partneri (logá na webe)",
  "/admin/integrations": "Administrácia — integrácie",
  "/admin/payment-providers": "Administrácia — platobné brány",
};

function klucStranky(to: string, search?: Record<string, string>): string {
  const q = search ? new URLSearchParams(search).toString() : "";
  return q ? `${to}?${q}` : to;
}

/** Názov z adresy, keď stránka nemá meno nikde inde („/sklad/inventura“ → „sklad › inventura“). */
export function nazovZCesty(cesta: string): string {
  return cesta
    .split("/")
    .filter(Boolean)
    .map((c) => (c === "$id" ? "detail" : c.replace(/-/g, " ")))
    .join(" › ");
}

/** Celý katalóg (aj admin). Prvá položka s rovnakým kľúčom vyhráva (menu má prednosť). */
export function katalogStranok(): StrankaHlasu[] {
  const out = new Map<string, StrankaHlasu>();
  const pridaj = (c: NavChild, sekcia: string | null) => {
    const kluc = klucStranky(c.to, c.search);
    if (out.has(kluc)) return;
    out.set(kluc, {
      kluc,
      to: c.to,
      ...(c.search ? { search: c.search } : {}),
      nazov: c.label,
      sekcia,
      detail: false,
      admin: false,
    });
  };
  for (const g of NAV) for (const c of g.children) pridaj(c, g.label);
  for (const c of ACCOUNT_SETTINGS_LINKS) pridaj(c, "Nastavenia");
  for (const c of ACCOUNT_API_LINKS) pridaj(c, "API a prepojenia");
  for (const c of QUICK_CREATE as NavChild[]) pridaj(c, "Vytvoriť");

  const existuje = new Set<string>([...TRASY_APLIKACIE, ...TRASY_ADMINA]);
  // Položky menu, ktorých trasa (už) neexistuje, by viedli na 404.
  for (const [k, s] of out) if (!existuje.has(s.to)) out.delete(k);

  const vsetky: [string, boolean][] = [
    ...TRASY_APLIKACIE.map((c): [string, boolean] => [c, false]),
    ...TRASY_ADMINA.map((c): [string, boolean] => [c, true]),
  ];
  for (const [cesta, admin] of vsetky) {
    if (out.has(cesta)) continue;
    out.set(cesta, {
      kluc: cesta,
      to: cesta,
      nazov: NAZVY_MIMO_MENU[cesta] ?? nazovZCesty(cesta),
      sekcia: null,
      detail: cesta.includes("$id"),
      admin,
    });
  }
  return [...out.values()];
}

let kesKatalogu: StrankaHlasu[] | null = null;

/** Stránky, ktoré smie hlas otvoriť — admin len administrátorovi platformy. */
export function strankyPreHlas(jeAdminPlatformy: boolean): StrankaHlasu[] {
  kesKatalogu ??= katalogStranok();
  return kesKatalogu.filter((s) => jeAdminPlatformy || !s.admin);
}

/** Katalóg ako text pre model (jeden riadok na stránku). */
export function katalogPreModel(stranky: StrankaHlasu[]): string {
  return stranky
    .map(
      (s) =>
        `${s.kluc} — ${s.nazov}${s.sekcia ? ` (${s.sekcia})` : ""}${s.detail ? " [potrebuje id]" : ""}`,
    )
    .join("\n");
}

/**
 * Kľúč stránky (+ id pri detaile, + hľadaný text pri zozname) → navigácia
 * routera. Čokoľvek mimo katalógu, detail bez platného id alebo admin pre
 * neadmina → null.
 */
export function navigaciaPreStranku(
  stranky: StrankaHlasu[],
  kluc: string,
  id?: string | null,
  hladat?: string | null,
): (Navigacia & { nazov: string }) | null {
  const s = stranky.find((x) => x.kluc === kluc);
  if (!s) return null;
  if (s.detail) {
    if (!id || !UUID.test(id)) return null;
    return { to: s.to, params: { id }, nazov: s.nazov };
  }
  const q = typeof hladat === "string" ? hladat.trim().slice(0, 80) : "";
  const search = { ...(s.search ?? {}), ...(q ? { q } : {}) };
  return { to: s.to, ...(Object.keys(search).length ? { search } : {}), nazov: s.nazov };
}
