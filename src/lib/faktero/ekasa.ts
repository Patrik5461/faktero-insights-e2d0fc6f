/**
 * Čítanie údajov z eKasa dokladu (Finančná správa SR).
 *
 * Čistá časť dekodéra zámerne oddelená od `ekasa-decoder.server.ts`, ktorý
 * ťahá LZMA a sieť. Práve tu sedia veci, na ktorých sa dá tíško pomýliť —
 * dátum a suma — a tie sa dajú otestovať bez QR kódu aj bez internetu.
 */

export type EkasaItem = {
  name: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  total: number;
};

export type EkasaDecoded = {
  ico?: string;
  dic?: string;
  ic_dph?: string;
  /** Názov predajcu — z QR sa nedá vyčítať, chodí až z Finančnej správy. */
  dodavatel?: string;
  adresa?: string;
  suma?: number;
  dph?: number;
  mena?: string;
  datum?: string; // YYYY-MM-DD
  cisloDokladu?: string;
  kodPokladnice?: string;
  ocpId?: string;
  /** Unikátny identifikátor dokladu pridelený systémom eKasa. */
  uid?: string;
  polozky: EkasaItem[];
  raw_xml?: string;
};

/**
 * Kandidáti na base64 payload v QR kóde, od najpravdepodobnejšieho.
 *
 * Pôvodne to bol jeden reťazec z regulárneho výrazu `[?&#/]([A-Za-z0-9+/=_-]{40,})$`.
 * Lomka je v tej triede znakov, takže výraz sa chytil už prvej lomky v ceste
 * a vrátil `mdu/qr/AAAA…` aj s cestou — base64 z toho vyšlo ako nezmysel,
 * LZMA zlyhala a **eKasa QR v tvare odkazu sa nedekódoval nikdy**.
 *
 * Skutočný tvar payloadu (URL-safe verzus klasické base64 s lomkami) sa
 * medzi tlačiarňami líši, tak sa neháda: vrátia sa všetky rozumné možnosti
 * a dekodér skúša jednu po druhej.
 */
export function kandidatiPayloadu(qr: string): string[] {
  const t = qr.trim();
  const out: string[] = [];
  const pridaj = (s?: string) => {
    if (s && s.length >= 40 && /^[A-Za-z0-9+/=_-]+$/.test(s) && !out.includes(s)) out.push(s);
  };

  if (!t.startsWith("http")) {
    pridaj(t);
    return out.length ? out : [t];
  }

  const zaDomenou = t
    .replace(/^https?:\/\/[^/]+\/?/i, "")
    .replace(/^#\/?/, "")
    .replace(/[?&].*$/, "");
  const useky = zaDomenou.split("/").filter(Boolean);

  // Od najkratšieho konca po najdlhší: posledný úsek sedí na URL-safe payload,
  // dlhší koniec na payload, ktorý sám obsahuje lomky. Skúsiť sa dajú všetky,
  // lebo LZMA na nezmysle zlyhá okamžite.
  for (let i = useky.length - 1; i >= 0; i--) pridaj(useky.slice(i).join("/"));
  return out;
}

/** Prvý kandidát na payload; ponechané pre spätnú kompatibilitu. */
export function extractPayload(qr: string): string {
  return kandidatiPayloadu(qr)[0] ?? qr.trim();
}

/**
 * Číslo z dokladu.
 *
 * Pôvodne `s.replace(",", ".")` — `String.replace` s reťazcom nahradí len prvý
 * výskyt, takže „1,234,56" skončilo ako „1.234,56" a z toho NaN. Oddeľovač
 * tisícov sa preto odstraňuje zvlášť a desatinná čiarka až potom.
 */
export function parseNumber(s?: string | null): number | undefined {
  if (s == null) return undefined;
  let t = String(s).replace(/\s| /g, "");
  if (!t) return undefined;
  // „1.234,56" (slovenský zápis) vs „1,234.56" (anglický) — rozhoduje, ktorý
  // oddeľovač je v reťazci posledný.
  const poslednaCiarka = t.lastIndexOf(",");
  const poslednaBodka = t.lastIndexOf(".");
  if (poslednaCiarka >= 0 && poslednaBodka >= 0) {
    if (poslednaCiarka > poslednaBodka) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
  } else if (poslednaCiarka >= 0) {
    // Jedna čiarka je desatinná; viac čiarok sú oddeľovače tisícov.
    t = t.split(",").length === 2 ? t.replace(",", ".") : t.replace(/,/g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Dátum dokladu ako `YYYY-MM-DD`.
 *
 * `new Date(x).toISOString()` sa použiť nesmie: doklad vydaný o 00:30 v našom
 * pásme má v UTC ešte predošlý deň, takže bloček z prvej polhodiny po polnoci
 * by sa zaevidoval na včerajšok — a s ním do zlého mesiaca DPH. Dátum sa preto
 * berie tak, ako je na doklade napísaný.
 */
export function parseDatum(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const t = String(raw).trim();

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Slovenský zápis 9.8.2026 aj 09. 08. 2026; pôvodná verzia ho nevedela
  // prečítať vôbec a doklad ostal bez dátumu.
  const sk = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (sk) {
    const d = sk[1].padStart(2, "0");
    const m = sk[2].padStart(2, "0");
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${sk[3]}-${m}-${d}`;
    }
    return undefined;
  }

  const iny = t.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (iny) return `${iny[1]}-${iny[2].padStart(2, "0")}-${iny[3].padStart(2, "0")}`;

  return undefined;
}

/** Najjednoduchší XML parser — vyťahuje polia bez závislostí. */
export function pick(xml: string, tag: string): string | undefined {
  // `[^>]*` musí začínať medzerou alebo `/`, inak by `<Dic…>` chytilo aj
  // `<DicDodavatela>` a do DIČ by sa dostala cudzia hodnota.
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, "i");
  return xml.match(re)?.[1]?.trim();
}

export function parseEkasaXml(xml: string): EkasaDecoded {
  const items: EkasaItem[] = [];
  const itemRe = /<(?:Item|Polozka)(?:\s[^>]*)?>([\s\S]*?)<\/(?:Item|Polozka)\s*>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const chunk = m[1];
    items.push({
      name: pick(chunk, "Name") ?? pick(chunk, "Nazov") ?? "",
      quantity: parseNumber(pick(chunk, "Quantity") ?? pick(chunk, "Mnozstvo")) ?? 1,
      unit_price: parseNumber(pick(chunk, "UnitPrice") ?? pick(chunk, "JednotkovaCena")) ?? 0,
      vat_rate: parseNumber(pick(chunk, "VatRate") ?? pick(chunk, "SadzbaDPH")) ?? 0,
      total: parseNumber(pick(chunk, "Price") ?? pick(chunk, "Suma")) ?? 0,
    });
  }

  return {
    ico: pick(xml, "Ico") ?? pick(xml, "ICO"),
    dic: pick(xml, "Dic") ?? pick(xml, "DIC"),
    ic_dph: pick(xml, "IcDph") ?? pick(xml, "IC_DPH") ?? pick(xml, "VatId"),
    suma: parseNumber(pick(xml, "TotalPrice") ?? pick(xml, "SumaCelkom") ?? pick(xml, "Amount")),
    dph: parseNumber(pick(xml, "TotalVat") ?? pick(xml, "DPH")),
    mena: pick(xml, "Currency") ?? pick(xml, "Mena") ?? "EUR",
    datum: parseDatum(pick(xml, "IssueDate") ?? pick(xml, "Datum") ?? pick(xml, "CreateDate")),
    cisloDokladu:
      pick(xml, "ReceiptNumber") ?? pick(xml, "CisloDokladu") ?? pick(xml, "InvoiceNumber"),
    kodPokladnice:
      pick(xml, "CashRegisterCode") ?? pick(xml, "KodPokladnice") ?? pick(xml, "OrpCode"),
    ocpId: pick(xml, "Okp") ?? pick(xml, "OkpCode") ?? pick(xml, "VerificationCode"),
    polozky: items,
    raw_xml: xml.length < 20000 ? xml : xml.slice(0, 20000),
  };
}

/**
 * Podľa čoho sa doklad hľadá vo Finančnej správe.
 *
 * Online vydaný doklad má **unikátny identifikátor (UID)**, ktorý mu pridelí
 * systém eKasa — ten je v QR kóde a stačí sám. Doklad vydaný v režime offline
 * UID ešte nemá, preto na ňom QR nesie **overovací kód podnikateľa (OKP)**
 * spolu s kódom pokladnice, dátumom a časom, poradovým číslom a sumou; hľadá
 * sa potom podľa tejto pätice.
 */
export type EkasaHladanie =
  | { receiptId: string }
  | {
      okp: string;
      cashRegisterCode: string;
      issueDate: string;
      receiptNumber: string;
      totalAmount: number;
    };

/** Unikátny identifikátor dokladu, napr. `O-8F3C…`. */
const UID = /\bO-[0-9A-Za-z]{8,}\b/;
/** OKP je päť osemznakových skupín oddelených pomlčkou. */
const OKP = /\b[0-9a-f]{8}(?:-[0-9a-f]{8}){4}\b/i;
/** Kód pokladnice (ORP) má 17 číslic a začína osmičkami. */
const KOD_POKLADNICE = /\b\d{17}\b/;

/**
 * Identifikátory dokladu z obsahu QR kódu.
 *
 * QR sa medzi tlačiarňami líši — raz je to holý identifikátor, raz odkaz do
 * aplikácie Finančnej správy, raz zlepenec polí. Preto sa nič nepredpokladá a
 * hľadá sa podľa tvaru jednotlivých hodnôt.
 */
export function identifikatoryZQr(qr: string): EkasaHladanie | null {
  const t = (qr ?? "").trim();
  if (!t) return null;

  const uid = t.match(UID)?.[0];
  if (uid) return { receiptId: uid };

  // Odkaz do aplikácie: …/receipt/<id> alebo …/opd/<kód>/<id>.
  const zOdkazu = t.match(/(?:receipt|opd)\/(?:[A-Za-z0-9-]+\/)?([A-Za-z0-9-]{8,})/i)?.[1];
  if (zOdkazu && !/^\d{1,8}$/.test(zOdkazu)) return { receiptId: zOdkazu };

  const okp = t.match(OKP)?.[0];
  const kod = t.match(KOD_POKLADNICE)?.[0];
  if (okp && kod) {
    const datum = parseDatum(t.match(/\d{4}-\d{2}-\d{2}[T ]?\d{0,2}:?\d{0,2}/)?.[0] ?? t);
    // Suma je posledné číslo s dvomi desatinnými miestami — poradové číslo
    // dokladu je celé, tak sa s ňou nepomýli.
    const sumy = t.match(/\d+[.,]\d{2}\b/g);
    const cislo = t.match(/(?:^|[|;,\s])(\d{1,10})(?=[|;,\s]|$)/)?.[1];
    const suma = sumy?.length ? parseNumber(sumy[sumy.length - 1]) : undefined;
    if (datum && cislo && suma != null) {
      return {
        okp,
        cashRegisterCode: kod,
        issueDate: datum,
        receiptNumber: cislo,
        totalAmount: suma,
      };
    }
  }

  return null;
}

/** Doklad tak, ako ho vydáva rozhranie Finančnej správy. */
export type FsDoklad = Record<string, any>;

/**
 * Odpoveď Finančnej správy → náš doklad.
 *
 * Sumár DPH chodí rozpísaný po sadzbách (základná verzus znížená), položky
 * majú cenu s DPH za celý riadok. Jednotková cena sa preto dopočítava — na
 * doklade býva uvedená len niekedy.
 */
export function mapujFsDoklad(r: FsDoklad): EkasaDecoded {
  const cislo = (v: unknown): number | undefined => {
    if (v == null || v === "") return undefined;
    const n = typeof v === "number" ? v : parseNumber(String(v));
    return n != null && Number.isFinite(n) ? n : undefined;
  };

  const polozky: EkasaItem[] = (Array.isArray(r.items) ? r.items : []).map((p: any) => {
    const mnozstvo = cislo(p?.quantity) ?? 1;
    const spolu = cislo(p?.price) ?? 0;
    return {
      name: String(p?.name ?? "").trim(),
      quantity: mnozstvo,
      unit_price: mnozstvo ? Math.round((spolu / mnozstvo) * 10000) / 10000 : spolu,
      vat_rate: sadzbaVPercentach(p?.vatRate) ?? 0,
      total: spolu,
    };
  });

  const dph =
    (cislo(r.vatAmountBasic) ?? 0) +
    (cislo(r.vatAmountReduced) ?? 0) +
    (cislo(r.vatAmountThirdReduced) ?? 0);

  // Doklad nesie dátum vydania aj čas zaevidovania; platí ten z dokladu.
  const datum = parseDatum(r.issueDate ?? r.createDate ?? r.receiptIssueDate);

  return {
    ico: r.ico ? String(r.ico) : undefined,
    dic: r.dic ? String(r.dic) : undefined,
    ic_dph: r.icDph ? String(r.icDph) : undefined,
    dodavatel: r.organization?.name ? String(r.organization.name) : undefined,
    adresa: adresaOrganizacie(r.organization),
    suma: cislo(r.priceWithVat) ?? cislo(r.totalPrice),
    dph: dph > 0 ? Math.round(dph * 100) / 100 : undefined,
    mena: r.currency ? String(r.currency) : "EUR",
    datum,
    cisloDokladu: r.receiptNumber ? String(r.receiptNumber) : undefined,
    kodPokladnice: r.cashRegisterCode ? String(r.cashRegisterCode) : undefined,
    ocpId: r.okp ? String(r.okp) : undefined,
    uid: r.receiptId ? String(r.receiptId) : undefined,
    polozky,
  };
}

/**
 * Adresa ako jeden riadok — skladá sa rovnako ako v aplikácii Finančnej
 * správy: `Ulica súpisné/orientačné, PSČ Obec, Krajina`. Orientačné číslo
 * chodí raz ako `buildingNumber`, raz ako `houseNumber`.
 */
function adresaOrganizacie(o: any): string | undefined {
  if (!o || typeof o !== "object") return undefined;
  const orientacne = String(o.houseNumber ?? o.buildingNumber ?? "").trim();
  const supisne = String(o.propertyRegistrationNumber ?? "").trim();
  const cislo = [supisne, orientacne].filter(Boolean).join("/");
  const casti = [
    [String(o.streetName ?? "").trim(), cislo].filter(Boolean).join(" "),
    [o.postalCode, o.municipality].filter(Boolean).join(" ").trim(),
    String(o.country ?? "").trim(),
  ].filter(Boolean);
  return casti.length ? casti.join(", ") : undefined;
}

/**
 * Sadzba DPH v percentách.
 *
 * Finančná správa ju posiela ako zlomok (`0.19`) — ich vlastná aplikácia to
 * pozná podľa toho, či je hodnota väčšia než jedna. Bez tohto prepočtu by sa
 * do dokladu uložila sadzba „0,19 %" a DPH by z nej vyšla nezmyselná.
 */
function sadzbaVPercentach(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : parseNumber(v == null ? undefined : String(v));
  if (n == null || !Number.isFinite(n)) return undefined;
  if (n === 0) return 0;
  return n <= 1 ? Math.round(n * 10000) / 100 : n;
}

/** Rozpozná, či QR patrí eKasa (Finančná správa SR). */
export function isEkasaQr(qr: string): boolean {
  const t = qr.trim();
  if (/financnasprava\.sk/i.test(t)) return true;
  if (/opd\/[A-Za-z0-9]+\/[A-Za-z0-9]+/i.test(t)) return true;
  if (/^[A-Za-z0-9+/=_-]{80,}$/.test(t)) return true;
  return false;
}

/**
 * Dopočíta chýbajúce sumy. Bloček nesie raz celkovú sumu, raz základ a DPH —
 * a do evidencie treba všetky tri, inak DPH prehľad počíta s nulou.
 */
export function doplnSumy(d: { suma?: number; dph?: number; zaklad?: number }): {
  suma?: number;
  dph?: number;
  zaklad?: number;
} {
  const zaokruhli = (n: number) => Math.round(n * 100) / 100;
  let { suma, dph, zaklad } = d;
  if (suma != null && dph != null && zaklad == null) zaklad = zaokruhli(suma - dph);
  else if (suma != null && zaklad != null && dph == null) dph = zaokruhli(suma - zaklad);
  else if (zaklad != null && dph != null && suma == null) suma = zaokruhli(zaklad + dph);
  return { suma, dph, zaklad };
}
