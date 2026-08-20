/**
 * Čítanie bankového výpisu z XML (camt.053, čo banky ponúkajú ako „SEPA XML").
 *
 * Oproti PDF je to iná liga a preto to má zmysel: v XML je suma číslom, symboly
 * vlastnými poľami a protistrana menom — nič sa nerozpoznáva a nič sa nemôže
 * prečítať zle. Z PDF sa dá dostať to isté len odhadom nad textom a účtovník
 * potom kontroluje riadok po riadku.
 *
 * Výsledok je zámerne ten istý `Vypis` ako z PDF, takže obrazovka, úpravy
 * popisov aj oba vývozy (Pohoda XML, camt.053) ostávajú nedotknuté.
 *
 * Súbor je čistý — bez siete, bez AI, bez prehliadača. Beží aj v teste aj
 * v prehliadači, kam sa dotiahne až vtedy, keď človek naozaj vyberie XML.
 */
import { XMLParser } from "fast-xml-parser";
import { normalizujVypis, type SurovyPohyb, type Vypis } from "./vypis-pohyby";

export type CitanieXml = {
  vypis: Vypis;
  /** Čo si má človek pozrieť, kým to pošle do účtovníctva. `null` = všetko sedí. */
  varovanie: string | null;
  /** Ktorý formát sa v súbore našiel — do vety na obrazovke. */
  format: "camt.053" | "camt.052" | "camt.054";
};

type Uzol = Record<string, any>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  /*
    camt beží v mennom priestore (`urn:iso:std:iso:20022:tech:xsd:camt.053.001.02`)
    a niektoré banky ho ešte aj predponujú. Bez tohto by sa uzly volali
    `ns2:Ntry` a nenašlo by sa nič.
  */
  removeNSPrefix: true,
  /*
    Bez tohto si parser hodnoty prevádza na čísla a **zjedá vedúce nuly**:
    z konštantného symbolu `0308` by ostalo 308 a zo sumy `12.30` číslo 12.3.
    Všetko si aj tak prevádzame sami v `vypis-pohyby`.
  */
  parseTagValue: false,
  parseAttributeValue: false,
});

function pole<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Text uzla — či už je to holý reťazec alebo uzol s atribútmi. */
function hodnota(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "object") {
    const t = (v as Uzol)["#text"];
    return t == null ? null : String(t).trim() || null;
  }
  const s = String(v).trim();
  return s || null;
}

/** `<BookgDt><Dt>2026-07-15</Dt></BookgDt>` aj `<DtTm>…T10:00:00</DtTm>`. */
function datum(uzol: unknown): string | null {
  if (uzol == null) return null;
  const u = uzol as Uzol;
  const s = hodnota(u.Dt) ?? hodnota(u.DtTm) ?? hodnota(uzol);
  return s ? s.slice(0, 10) : null;
}

const cent = (n: number) => Math.round(n * 100) / 100;

/*
  Symboly. camt má na ne jediné pole (`EndToEndId`), tak ich slovenské banky
  píšu do textu ako `/VS1234567890/SS0000000000/KS0308` — a tak isto ich tam
  dáva aj vývoz z Fakera, takže vlastný súbor sa načíta späť celý.
*/
function zoZnacky(text: string, kod: "VS" | "SS" | "KS"): string | null {
  const m = new RegExp(`/${kod}\\s*:?\\s*(\\d{1,16})`, "i").exec(text);
  return m ? m[1] : null;
}

/**
 * Vedúce nuly preč — ale len pri VS a SS.
 *
 * Banka variabilný symbol doplní nulami na desať miest (`0012345678`) a Pohoda
 * si ho potom nespáruje s faktúrou číslo 12345678. Konštantný symbol je opak:
 * `0308` je jeho celý tvar a `308` už nie je platný kód.
 */
function bezNul(v: string | null): string | null {
  if (!v) return null;
  const s = v.replace(/^0+/, "");
  return s || null;
}

function symboly(
  zdroj: string,
  refs: Uzol[],
): { vs: string | null; ks: string | null; ss: string | null } {
  const zPola = (kod: string) => {
    for (const r of refs) {
      for (const p of pole(r.Prtry)) {
        const tp = (hodnota((p as Uzol).Tp) ?? "").toUpperCase();
        if (tp.startsWith(kod)) {
          const ref = hodnota((p as Uzol).Ref);
          if (ref) return ref.replace(/\D/g, "") || null;
        }
      }
    }
    return null;
  };

  let vs = bezNul(zPola("VS") ?? zoZnacky(zdroj, "VS"));
  const ss = bezNul(zPola("SS") ?? zoZnacky(zdroj, "SS"));
  const ks = zPola("KS") ?? zoZnacky(zdroj, "KS");

  if (!vs) {
    /*
      Keď v `EndToEndId` nie je značka a je tam holé číslo, je to variabilný
      symbol — presne tak ho tam píše aj vývoz z Fakera. `NOTPROVIDED` je
      výplň, ktorú tam banka dá, keď symbol nie je.
    */
    for (const r of refs) {
      const e2e = hodnota(r.EndToEndId);
      if (e2e && /^\d{1,16}$/.test(e2e)) {
        vs = bezNul(e2e);
        break;
      }
    }
  }

  return { vs, ks: ks && /[1-9]/.test(ks) ? ks : null, ss };
}

function meno(u: unknown): string | null {
  if (!u) return null;
  const n = u as Uzol;
  // camt.053.001.08 zabalil stranu ešte do `<Pty>`; staršia verzia nie.
  return hodnota(n.Nm) ?? hodnota(n.Pty?.Nm);
}

function ucetStrany(u: unknown): string | null {
  if (!u) return null;
  const n = u as Uzol;
  return hodnota(n.Id?.IBAN) ?? hodnota(n.Id?.Othr?.Id);
}

type ZPohybu = {
  surovy: SurovyPohyb;
  /** Suma so znamienkom — na dopočet zostatkov a na kontrolu proti výpisu. */
  suma: number;
  davka: boolean;
};

function zNtry(n: Uzol): ZPohybu | null {
  /*
    Čakajúci pohyb (`PDNG`) na výpise je, ale zaúčtovaný nie je — v Pohode by
    z neho vznikla úhrada, ktorá sa ešte nestala. Vo výpise camt.053 by byť
    nemal, v camt.052 (priebežný prehľad) býva bežne.
  */
  const stav = (hodnota(n.Sts) ?? hodnota((n.Sts as Uzol)?.Cd) ?? "BOOK").toUpperCase();
  if (stav !== "BOOK") return null;

  const surova = hodnota(n.Amt);
  if (!surova) return null;
  const cislo = Number(surova.replace(",", "."));
  if (!Number.isFinite(cislo) || cislo === 0) return null;

  const vydaj = (hodnota(n.CdtDbtInd) ?? "").toUpperCase() === "DBIT";
  const podrobnosti = pole(n.NtryDtls).flatMap((d) => pole((d as Uzol).TxDtls)) as Uzol[];
  const strany = (podrobnosti.map((t) => t.RltdPties).find(Boolean) ?? {}) as Uzol;
  const refs = podrobnosti.map((t) => t.Refs).filter(Boolean) as Uzol[];

  /*
    Popis sa skladá zo všetkého, čo banka o platbe napísala: `Ustrd` je text
    platby, `CdtrRefInf/Ref` býva variabilný symbol a `AddtlNtryInf` je veta
    banky („Platba kartou, Miesto: BOLT.EU"). Práve tú posledná účtovník
    najčastejšie prepisuje — a preto sa nesmie stratiť.
  */
  const kusy = [
    ...podrobnosti.flatMap((t) => pole(t.RmtInf?.Ustrd).map(hodnota)),
    ...podrobnosti.flatMap((t) =>
      pole(t.RmtInf?.Strd).map((s) => hodnota((s as Uzol)?.CdtrRefInf?.Ref)),
    ),
    hodnota(n.AddtlNtryInf),
  ].filter((x): x is string => !!x);
  const popis = [...new Set(kusy)].join(" ") || null;

  const zdrojSymbolov = [popis ?? "", ...refs.map((r) => hodnota(r.EndToEndId) ?? "")].join(" ");

  return {
    suma: vydaj ? -Math.abs(cislo) : Math.abs(cislo),
    davka: podrobnosti.length > 1,
    surovy: {
      datum: datum(n.BookgDt) ?? datum(n.ValDt),
      suma: Math.abs(cislo),
      smer: vydaj ? "vydaj" : "prijem",
      popis,
      protistrana: vydaj
        ? (meno(strany.Cdtr) ?? meno(strany.Dbtr))
        : (meno(strany.Dbtr) ?? meno(strany.Cdtr)),
      protiucet: vydaj
        ? (ucetStrany(strany.CdtrAcct) ?? ucetStrany(strany.DbtrAcct))
        : (ucetStrany(strany.DbtrAcct) ?? ucetStrany(strany.CdtrAcct)),
      ...symboly(zdrojSymbolov, refs),
    },
  };
}

/** Zostatok daného druhu; `DBIT` znamená, že účet je v mínuse. */
function zostatok(stmt: Uzol, kody: string[]): number | null {
  for (const kod of kody) {
    for (const b of pole(stmt.Bal) as Uzol[]) {
      const tp = hodnota(b.Tp?.CdOrPrtry?.Cd) ?? hodnota(b.Tp?.CdOrPrtry?.Prtry);
      if ((tp ?? "").toUpperCase() !== kod) continue;
      const s = hodnota(b.Amt);
      if (!s) continue;
      const n = Number(s.replace(",", "."));
      if (!Number.isFinite(n)) continue;
      return (hodnota(b.CdtDbtInd) ?? "").toUpperCase() === "DBIT" ? -Math.abs(n) : n;
    }
  }
  return null;
}

function menaUctu(stmt: Uzol): string | null {
  const zUctu = hodnota(stmt.Acct?.Ccy);
  if (zUctu) return zUctu;
  for (const b of pole(stmt.Bal) as Uzol[]) {
    const m = (b.Amt as Uzol)?.["@Ccy"];
    if (m) return String(m);
  }
  for (const n of pole(stmt.Ntry) as Uzol[]) {
    const m = (n.Amt as Uzol)?.["@Ccy"];
    if (m) return String(m);
  }
  return null;
}

function nieJeVypis(koren: Uzol): string {
  if (koren.CstmrCdtTrfInitn)
    return "Toto je príkaz na úhradu (pain.001), nie výpis z účtu. Vo výpise sú pohyby, ktoré už banka zaúčtovala.";
  if (koren.dataPack || koren.dataPackItem)
    return "Toto je XML pre Pohodu, nie výpis z banky — nahrajte súbor stiahnutý z internetbankingu.";
  return "V súbore nie je bankový výpis. V internetbankingu si stiahnite výpis vo formáte XML (SEPA XML, camt.053).";
}

/**
 * Výpis z XML.
 *
 * Vyhodí zrozumiteľnú chybu, keď súbor výpis nie je — človek si najčastejšie
 * pomýli výpis s príkazom na úhradu a z holého „nepodarilo sa" nevie, čo ďalej.
 */
export function citajBankoveXml(xml: string): CitanieXml {
  let obj: Uzol;
  try {
    obj = parser.parse(xml) as Uzol;
  } catch {
    throw new Error("Súbor sa nepodarilo prečítať ako XML — je poškodený alebo to XML nie je.");
  }

  const koren = (obj.Document ?? obj) as Uzol;
  const skupiny: { vety: Uzol[]; format: CitanieXml["format"] } = koren.BkToCstmrStmt
    ? { vety: pole((koren.BkToCstmrStmt as Uzol).Stmt) as Uzol[], format: "camt.053" }
    : koren.BkToCstmrAcctRpt
      ? { vety: pole((koren.BkToCstmrAcctRpt as Uzol).Rpt) as Uzol[], format: "camt.052" }
      : koren.BkToCstmrDbtCdtNtfctn
        ? { vety: pole((koren.BkToCstmrDbtCdtNtfctn as Uzol).Ntfctn) as Uzol[], format: "camt.054" }
        : { vety: [], format: "camt.053" };

  if (!skupiny.vety.length) throw new Error(nieJeVypis(koren));

  const ucetVety = (s: Uzol) => ucetStrany(s.Acct);

  /*
    Jeden súbor môže niesť výpisy k viacerým účtom. Zliať ich do jedného by bola
    tichá chyba — v Pohode by z toho vznikol jeden výpis s cudzími pohybmi a
    zostatok by nesedel ani na jednom účte. Berie sa preto prvý účet a o
    ostatných sa povie.
  */
  const prvyUcet = skupiny.vety.map(ucetVety).find((u) => u != null) ?? null;
  const nase = skupiny.vety.filter((s) => {
    const u = ucetVety(s);
    return u == null || u === prvyUcet;
  });
  const inyUcet = [...new Set(skupiny.vety.map(ucetVety).filter((u) => u && u !== prvyUcet))];

  const surove: ZPohybu[] = [];
  let vynechanych = 0;
  for (const s of nase) {
    for (const n of pole(s.Ntry) as Uzol[]) {
      const p = zNtry(n);
      if (p) surove.push(p);
      else vynechanych += 1;
    }
  }

  const prva = nase[0] ?? {};
  const posledna = nase[nase.length - 1] ?? {};

  const vypis = normalizujVypis({
    cisloVypisu: hodnota(prva.LglSeqNb) ?? hodnota(prva.ElctrncSeqNb) ?? hodnota(prva.Id),
    ucet: prvyUcet,
    mena: menaUctu(prva),
    datumVypisu:
      hodnota(posledna.FrToDt?.ToDtTm)?.slice(0, 10) ??
      hodnota(posledna.CreDtTm)?.slice(0, 10) ??
      null,
    pohyby: surove.map((p) => p.surovy),
  });

  const suma = cent(surove.reduce((s, p) => s + p.suma, 0));
  const pociatocny = zostatok(prva, ["OPBD", "PRCD", "OPAV"]);
  const konecny = zostatok(posledna, ["CLBD", "CLAV", "ITBD"]);

  /*
    Zostatok po každom pohybe sa dopočíta z počiatočného. V camt-e pri riadkoch
    nie je, ale export do camt.053 ho potrebuje — a bez neho by výpis odišiel do
    Pohody s nulovým počiatočným aj konečným zostatkom.
  */
  const zaciatok = pociatocny ?? (konecny != null ? cent(konecny - suma) : null);
  if (zaciatok != null) {
    let bezi = zaciatok;
    for (const p of vypis.pohyby) {
      bezi = cent(bezi + (p.smer === "vydaj" ? -p.suma : p.suma));
      p.zostatok = bezi;
    }
  }

  const varovania: string[] = [];
  if (pociatocny != null && konecny != null) {
    const rozdiel = cent(konecny - (pociatocny + suma));
    if (Math.abs(rozdiel) >= 0.015) {
      varovania.push(
        `Súčet pohybov nesedí so zostatkami vo výpise o ${rozdiel.toFixed(2)} — niektorý pohyb v súbore chýba.`,
      );
    }
  }
  if (vynechanych === 1) {
    varovania.push("Vynechal sa 1 nezaúčtovaný riadok (čakajúca platba) — z účtu ešte neodišla.");
  } else if (vynechanych > 1) {
    varovania.push(
      vynechanych < 5
        ? `Vynechali sa ${vynechanych} nezaúčtované riadky (čakajúce platby) — z účtu ešte neodišli.`
        : `Vynechalo sa ${vynechanych} nezaúčtovaných riadkov (čakajúce platby) — z účtu ešte neodišli.`,
    );
  }
  if (surove.some((p) => p.davka)) {
    varovania.push(
      "Niektoré riadky sú hromadné dávky — banka v nich posiela viac platieb naraz a v Pohode budú ako jeden doklad.",
    );
  }
  if (inyUcet.length) {
    varovania.push(`Súbor obsahuje aj výpis k účtu ${inyUcet.join(", ")} — ten sa nenačítal.`);
  }

  return { vypis, varovanie: varovania.join(" ") || null, format: skupiny.format };
}
