/*
  Konektor do POHODY — potvrdzovanie dávky (čistá časť, bez databázy).

  Audit exportov 14. 11. 2026:
   - K3: konektor doklady označil za odovzdané (a zamkol) už pri stiahnutí
     dávky. Keď POHODA odmietla celý balík (zlé meno/heslo, IČO, databáza,
     odrezaný súbor) alebo odpoveď neprišla vôbec, nič sa nevrátilo a doklady
     boli „v Pohode“ len u nás. Teraz je každá položka dávky najprv
     `odoslane` a odovzdaná je až po potvrdení odpovede POHODY; nepotvrdená
     dávka po {@link LIMIT_POTVRDENIA_HODIN} hodinách vyprší a doklady
     idú znova (kontrola duplicity POHODY druhý import toho istého odmietne
     ako `recordDuplicity` — a to sa berie ako potvrdenie).
   - V12: odpoveď na storno (`<id>-storno`) sa nespárovala a odmietnuté
     storno ticho zmizlo. Položky sa teraz párujú podľa presného
     `dataPackItem id`, ktoré si dávka zapísala.
   - V13: oprava odovzdaného dokladu išla do POHODY ako ďalší doklad.
     POHODA (XML version_2) doklad neprepíše ani nezmaže — `invoice.xsd` ani
     `voucher.xsd` nemajú `actionType` (ten majú len adresár a zásoby), majú
     len `cancelDocument`. Oprava preto ide dvojfázovo: najprv storno
     pôvodného dokladu (keď poznáme jeho číslo v POHODE a agenda storno
     dovoľuje), nová verzia až po jeho potvrdení; inak sa doklad zadrží,
     kým človek v Kontrole Pohody nepotvrdí, že pôvodný v POHODE zmazal.
*/

import type { VysledokDokladu } from "./pohoda-odpoved";

/** Za koľko hodín bez odpovede POHODY dávka vyprší a doklady idú znova. */
export const LIMIT_POTVRDENIA_HODIN = 6;

export type DruhPolozky =
  | "faktura"
  | "prijata"
  | "doklad"
  | "pokladna"
  | "adresar"
  | "sklad"
  | "zakazka"
  | "pohyb"
  | "storno"
  | "storno_opravy"
  | "zmazane_v_pohode";

export type StavPolozky = "odoslane" | "ok" | "chyba" | "vyprsane";

/** Riadok `pohoda_konektor_polozky`. */
export type RiadokKonektora = {
  id?: string;
  export_job_id: string | null;
  polozka_id: string;
  druh: DruhPolozky;
  zaznam_id: string;
  verzia: string | null;
  stav: StavPolozky;
  pohoda_cislo?: string | null;
  chyba?: string | null;
  created_at?: string | null;
  potvrdene_at?: string | null;
};

/** Položka dávky pred zápisom (bez stavu). */
export type PolozkaDavky = {
  polozka_id: string;
  druh: DruhPolozky;
  zaznam_id: string;
  verzia: string | null;
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Všetky `dataPackItem id` v dávke v poradí. */
export function idPoloziekDavky(xml: string): string[] {
  return [...String(xml ?? "").matchAll(/<dat:dataPackItem\b[^>]*?\bid="([^"]*)"/g)].map((m) =>
    m[1]!.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
  );
}

/** Obsah jednej položky dávky (to, čo je medzi `<dat:dataPackItem …>` a jej koncom). */
export function blokPolozky(xml: string, id: string): string | null {
  const m = new RegExp(`<dat:dataPackItem\\b[^>]*?\\bid="${esc(id)}"[^>]*>([\\s\\S]*?)</dat:dataPackItem>`).exec(
    String(xml ?? ""),
  );
  return m ? m[1]! : null;
}

/** Identifikátor záznamu (uuid) na začiatku `dataPackItem id`. */
export function zaznamPolozky(id: string): string | null {
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(String(id ?? ""));
  return m ? m[1]!.toLowerCase() : null;
}

/** Položka storna pôvodnej verzie opraveného dokladu. */
export function idStornaOpravy(zaznamId: string, predoslaVerzia: string | number | null): string {
  const v = Math.trunc(Number(predoslaVerzia) || 0);
  return `${zaznamId}-${v}-storno`;
}

/**
 * Priradí položky dávky k záznamom podľa toho, čo do dávky naozaj išlo.
 *
 * Id sa berú z hotového XML — doklad, ktorý generátor vynechal (prekážka,
 * nevyviezteľná faktúra), sa tak nezapíše ako odoslaný. Pohyby: príjemka či
 * výdajka nesie id prvého pohybu, zapíše sa každý pohyb skupiny pod tým
 * istým `polozka_id` (odpoveď ich potvrdí alebo vráti naraz).
 */
export function polozkyZDavky(
  xml: string,
  zaznamy: {
    faktury?: { id: string; verzia: unknown }[];
    prijate?: { id: string; verzia: unknown }[];
    doklady?: { id: string; verzia: unknown }[];
    pokladna?: { id: string; verzia: unknown }[];
    adresar?: { id: string; verzia: unknown }[];
    sklad?: { id: string; verzia: unknown }[];
    zakazka?: { id: string; verzia: unknown }[];
    /** Skupiny pohybov: id dokladu = id prvého pohybu. */
    pohyby?: { id: string; pohyby: { id: string; verzia: unknown }[] }[];
    storna?: { id: string }[];
    stornaOprav?: { id: string; predoslaVerzia: unknown }[];
  },
  teraz: string,
): PolozkaDavky[] {
  type Ciel = { druh: DruhPolozky; zaznamy: { id: string; verzia: string | null }[] };
  const doklad = new Map<string, Ciel>();
  const verziaDokladu = (v: unknown) => String(Math.trunc(Number(v) || 0));
  const pridaj = (druh: DruhPolozky, riadky: { id: string; verzia: unknown }[] | undefined, verzia: (v: unknown) => string | null) => {
    for (const r of riadky ?? [])
      doklad.set(String(r.id).toLowerCase(), { druh, zaznamy: [{ id: String(r.id), verzia: verzia(r.verzia) }] });
  };
  pridaj("faktura", zaznamy.faktury, verziaDokladu);
  pridaj("prijata", zaznamy.prijate, verziaDokladu);
  pridaj("doklad", zaznamy.doklady, verziaDokladu);
  pridaj("pokladna", zaznamy.pokladna, verziaDokladu);
  const cas = (v: unknown) => (v == null ? null : String(v));
  pridaj("adresar", zaznamy.adresar, cas);
  pridaj("sklad", zaznamy.sklad, cas);
  pridaj("zakazka", zaznamy.zakazka, cas);
  for (const s of zaznamy.pohyby ?? [])
    doklad.set(String(s.id).toLowerCase(), {
      druh: "pohyb",
      zaznamy: s.pohyby.map((p) => ({ id: String(p.id), verzia: cas(p.verzia) })),
    });
  const storno = new Map<string, Ciel>();
  for (const s of zaznamy.storna ?? [])
    storno.set(`${String(s.id).toLowerCase()}-storno`, {
      druh: "storno",
      zaznamy: [{ id: String(s.id), verzia: teraz }],
    });
  for (const s of zaznamy.stornaOprav ?? [])
    storno.set(idStornaOpravy(String(s.id).toLowerCase(), s.predoslaVerzia as any), {
      druh: "storno_opravy",
      zaznamy: [{ id: String(s.id), verzia: verziaDokladu(s.predoslaVerzia) }],
    });

  const out: PolozkaDavky[] = [];
  for (const id of idPoloziekDavky(xml)) {
    const ciel = /-storno$/i.test(id)
      ? storno.get(id.toLowerCase())
      : doklad.get(zaznamPolozky(id) ?? id.toLowerCase());
    if (!ciel) continue;
    for (const z of ciel.zaznamy)
      out.push({ polozka_id: id, druh: ciel.druh, zaznam_id: z.id, verzia: z.verzia });
  }
  return out;
}

/** Výsledok položky odpovede POHODY pre riadok konektora. */
export function stavZOdpovede(v: VysledokDokladu): {
  stav: "ok" | "chyba";
  cislo: string | null;
  poznamka: string | null;
} {
  // Duplicita dávky = doklad už v POHODE je (rovnaký import prišiel skôr) — to je potvrdenie.
  const chyba = v.stav === "error" && !v.duplicita;
  return {
    stav: chyba ? "chyba" : "ok",
    cislo: v.cislo ?? null,
    poznamka: v.stav === "ok" ? null : (v.poznamka ?? (chyba ? "POHODA položku odmietla bez popisu." : null)),
  };
}

/** Dávka čaká na odpoveď dlhšie, než je limit. */
export function jeVyprsana(vytvorena: string | null | undefined, teraz: Date): boolean {
  const t = Date.parse(String(vytvorena ?? ""));
  if (!Number.isFinite(t)) return false;
  return teraz.getTime() - t > LIMIT_POTVRDENIA_HODIN * 3600_000;
}

export type RozhodnutieOpravy =
  | { akcia: "poslat" }
  | { akcia: "cakat"; dovod: string }
  | { akcia: "drzat"; dovod: string; povodneCislo: string | null; potvrditZmazanie: boolean }
  | { akcia: "storno"; cislo: string; predoslaVerzia: string; povodna: RiadokKonektora };

const novsie = (a: RiadokKonektora, b: RiadokKonektora) =>
  String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));

/**
 * Čo s dokladom, ktorý sa vrátil z POHODY na opravu (`pohoda_verzia` > 0).
 *
 * Predošlá verzia v POHODE je (vrátiť sa dá len odovzdaný doklad). Nová ide
 * až keď je pôvodná preč — stornovaná cez konektor (potvrdené storno) alebo
 * zmazaná ručne (potvrdenie v Kontrole Pohody pri tejto verzii).
 *
 * Vydaná faktúra sa nestornuje: storno v POHODE číslo neuvoľní a oprava s tým
 * istým číslom by skončila chybou duplicitného čísla (`numberRequested
 * checkDuplicity`), pod iným číslom by nesedela s faktúrou u odberateľa.
 */
export function rozhodnutieOpravy(vstup: {
  druh: "faktura" | "prijata" | "doklad" | "pokladna";
  verzia: number | null | undefined;
  /** Všetky riadky konektora k tomuto záznamu. */
  riadky: RiadokKonektora[];
  /** Číslo dokladu (naše) do hlášky. */
  cislo: string;
  /** Vydaná faktúra: číslo v POHODE (`export_logs.pohoda_cislo`), inak naše. */
  cisloVPohode?: string | null;
}): RozhodnutieOpravy {
  const verzia = Math.trunc(Number(vstup.verzia) || 0);
  if (verzia <= 0) return { akcia: "poslat" };
  const v = String(verzia);
  const riadky = [...vstup.riadky].sort(novsie);
  if (riadky.some((r) => r.druh === "zmazane_v_pohode" && r.verzia === v)) return { akcia: "poslat" };

  const storna = riadky.filter((r) => r.druh === "storno_opravy" && r.stav !== "vyprsane");
  // Storno ktorejkoľvek predošlej verzie, ktoré POHODA potvrdila po poslednom vrátení.
  const poslednaVerzia = riadky.find((r) => r.druh === vstup.druh && r.stav === "ok" && Number(r.verzia) < verzia);
  const stornoTejto = storna.filter((r) => !poslednaVerzia || r.verzia === poslednaVerzia.verzia);
  if (stornoTejto.some((r) => r.stav === "ok")) return { akcia: "poslat" };
  const posledneStorno = stornoTejto[0];
  if (posledneStorno?.stav === "odoslane")
    return { akcia: "cakat", dovod: `${vstup.cislo} — čaká, kým POHODA potvrdí storno pôvodného dokladu` };
  if (posledneStorno?.stav === "chyba")
    return {
      akcia: "drzat",
      dovod: `${vstup.cislo} — POHODA storno pôvodného dokladu${
        posledneStorno.pohoda_cislo ? ` č. ${posledneStorno.pohoda_cislo}` : ""
      } odmietla (${posledneStorno.chyba ?? "bez popisu"}). Opravu konektor nepošle, kým pôvodný doklad v POHODE nezmažete a nepotvrdíte to v Kontrole Pohody`,
      povodneCislo: poslednaVerzia?.pohoda_cislo ?? null,
      potvrditZmazanie: true,
    };

  if (vstup.druh === "faktura") {
    const c = vstup.cisloVPohode || vstup.cislo;
    return {
      akcia: "drzat",
      dovod: `${vstup.cislo} — oprava faktúry, ktorá už v POHODE je (č. ${c}). POHODA cez XML faktúru neprepíše ani nezmaže a storno by číslo neuvoľnilo — zmažte ju v POHODE a potvrďte to v Kontrole Pohody, konektor potom opravu pošle`,
      povodneCislo: c,
      potvrditZmazanie: true,
    };
  }
  if (poslednaVerzia?.pohoda_cislo)
    return {
      akcia: "storno",
      cislo: String(poslednaVerzia.pohoda_cislo),
      predoslaVerzia: String(poslednaVerzia.verzia ?? "0"),
      povodna: poslednaVerzia,
    };
  return {
    akcia: "drzat",
    dovod: `${vstup.cislo} — oprava dokladu, ktorý už v POHODE je, no jeho číslo v POHODE nepoznáme (odišiel súborom alebo balíkom). Zmažte ho v POHODE a potvrďte to v Kontrole Pohody — inak by tam bol dvakrát`,
    povodneCislo: null,
    potvrditZmazanie: true,
  };
}

/**
 * Storno pôvodnej verzie opraveného dokladu v tej istej agende, v ktorej
 * pôvodný doklad do POHODY odišiel (vyčíta sa z jeho položky v dávke).
 * Interný doklad a iné agendy storno cez XML nemajú — vtedy `null`.
 */
export function stornoOpravyXml(p: { id: string; cislo: string; povodnyBlok: string }): string | null {
  const x = (s: string) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const cislo = String(p.cislo).slice(0, 32);
  const text = `Storno dokladu č. ${cislo} — oprava z Faktera`.slice(0, 240);
  const blok = p.povodnyBlok ?? "";
  if (/<inv:invoice\b/.test(blok)) {
    const typ = /<inv:invoiceType>\s*([A-Za-z]+)\s*<\/inv:invoiceType>/.exec(blok)?.[1];
    if (!typ) return null;
    return `
  <dat:dataPackItem id="${x(p.id)}" version="2.0">
    <inv:invoice version="2.0">
      <inv:cancelDocument>
        <typ:sourceDocument>
          <typ:number>${x(cislo)}</typ:number>
        </typ:sourceDocument>
      </inv:cancelDocument>
      <inv:invoiceHeader>
        <inv:invoiceType>${typ}</inv:invoiceType>
        <inv:text>${x(text)}</inv:text>
      </inv:invoiceHeader>
    </inv:invoice>
  </dat:dataPackItem>`;
  }
  if (/<vch:voucher\b/.test(blok)) {
    const typ = /<vch:voucherType>\s*([A-Za-z]+)\s*<\/vch:voucherType>/.exec(blok)?.[1];
    const pokladna = /<vch:cashAccount>\s*<typ:ids>([^<]*)<\/typ:ids>/.exec(blok)?.[1];
    if (!typ) return null;
    return `
  <dat:dataPackItem id="${x(p.id)}" version="2.0">
    <vch:voucher version="2.0">
      <vch:cancelDocument>
        <typ:sourceDocument>
          <typ:number>${x(cislo)}</typ:number>
        </typ:sourceDocument>
      </vch:cancelDocument>
      <vch:voucherHeader>
        <vch:voucherType>${typ}</vch:voucherType>${
          pokladna ? `\n        <vch:cashAccount><typ:ids>${pokladna}</typ:ids></vch:cashAccount>` : ""
        }
        <vch:text>${x(text)}</vch:text>
      </vch:voucherHeader>
    </vch:voucher>
  </dat:dataPackItem>`;
  }
  return null;
}

/** Vloží položky na koniec dávky (pred `</dat:dataPack>`). */
export function pridajPolozky(xml: string, polozky: string): string {
  if (!polozky) return xml;
  return xml.replace(/\n?<\/dat:dataPack>\s*$/, `${polozky}\n</dat:dataPack>`);
}
