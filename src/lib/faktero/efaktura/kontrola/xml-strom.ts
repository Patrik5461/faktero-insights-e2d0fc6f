/**
 * Malý XML parser pre kontrolu e-faktúry.
 *
 * Prehliadačový `DOMParser` by stačil na načítanie, ale nepovie, na ktorom
 * riadku prvok je, a v Node (testy, server) nie je vôbec. Toto je preto
 * vlastný parser bez závislostí: kontroluje dobre formovaný dokument
 * (párovanie značiek, atribúty, entity, jeden koreň), rozlišuje menné
 * priestory a pri každom prvku si pamätá riadok a stĺpec.
 *
 * DOCTYPE zámerne odmieta — UBL ho nepoužíva a vlastné entity v ňom sú
 * známa cesta k útokom (XXE, „billion laughs“).
 */

export type XmlUzol = {
  /** Menný priestor (URI), prázdny reťazec = bez menného priestoru. */
  ns: string;
  /** Miestne meno bez predpony. */
  meno: string;
  /** Meno tak, ako je v dokumente (s predponou). */
  qname: string;
  atributy: Record<string, string>;
  deti: XmlUzol[];
  /** Priamy text prvku (bez textu detí), entity rozbalené. */
  text: string;
  riadok: number;
  stlpec: number;
  rodic: XmlUzol | null;
};

export class ChybaXml extends Error {
  constructor(
    message: string,
    public riadok: number,
    public stlpec: number,
  ) {
    super(message);
  }
}

const ENTITY: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const NS_XML = "http://www.w3.org/XML/1998/namespace";
const MENO = /^[A-Za-z_À-￿][\w.\-·À-￿]*(?::[A-Za-z_À-￿][\w.\-·À-￿]*)?$/;

/** Načíta XML do stromu. Pri chybe hodí `ChybaXml` s miestom. */
export function nacitajXml(vstup: string): XmlUzol {
  const s = vstup.charCodeAt(0) === 0xfeff ? vstup.slice(1) : vstup;
  let i = 0;
  // Začiatky riadkov — miesto sa dopočíta binárnym hľadaním.
  const zaciatky = [0];
  for (let k = 0; k < s.length; k++) if (s.charCodeAt(k) === 10) zaciatky.push(k + 1);
  const miesto = (pos: number) => {
    let lo = 0;
    let hi = zaciatky.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (zaciatky[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return { riadok: lo + 1, stlpec: pos - zaciatky[lo] + 1 };
  };
  const chyba = (sprava: string, pos = i): never => {
    const m = miesto(pos);
    throw new ChybaXml(sprava, m.riadok, m.stlpec);
  };

  const rozbalEntity = (t: string, pos: number) =>
    t.replace(/&([^;&\s]*);?/g, (cele, nazov: string) => {
      if (!cele.endsWith(";")) chyba("Znak „&“ musí začínať entitu (napr. &amp;amp;).", pos);
      if (nazov.startsWith("#x") || nazov.startsWith("#X")) {
        const n = parseInt(nazov.slice(2), 16);
        if (!Number.isFinite(n) || !/^[0-9a-fA-F]+$/.test(nazov.slice(2)))
          chyba(`Neplatná číselná entita &${nazov};`, pos);
        return String.fromCodePoint(n);
      }
      if (nazov.startsWith("#")) {
        if (!/^\d+$/.test(nazov.slice(1))) chyba(`Neplatná číselná entita &${nazov};`, pos);
        return String.fromCodePoint(Number(nazov.slice(1)));
      }
      const v = ENTITY[nazov];
      if (v === undefined) chyba(`Neznáma entita &${nazov};`, pos);
      return v;
    });

  const preskocBiele = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };

  // Prológ: deklarácia, komentáre, spracovacie inštrukcie.
  const prolog = () => {
    for (;;) {
      preskocBiele();
      if (s.startsWith("<?", i)) {
        const k = s.indexOf("?>", i);
        if (k < 0) chyba("Neukončená spracovacia inštrukcia <? … ?>.");
        i = k + 2;
      } else if (s.startsWith("<!--", i)) {
        const k = s.indexOf("-->", i);
        if (k < 0) chyba("Neukončený komentár <!-- … -->.");
        i = k + 3;
      } else if (s.startsWith("<!DOCTYPE", i) || s.startsWith("<!doctype", i)) {
        chyba("DOCTYPE nie je v e-faktúre povolený.");
      } else return;
    }
  };

  type Otvoreny = { uzol: XmlUzol; nsMapa: Record<string, string>; pos: number };
  const zasobnik: Otvoreny[] = [];
  let koren: XmlUzol | null = null;

  prolog();
  if (i >= s.length) chyba("Súbor je prázdny alebo neobsahuje žiadny XML prvok.");
  if (s[i] !== "<") chyba("Dokument musí začínať prvkom (<Invoice …>), nie textom.");

  const vyriesNs = (qname: string, mapa: Record<string, string>, pos: number, atribut = false) => {
    const d = qname.indexOf(":");
    if (d < 0) return { ns: atribut ? "" : (mapa[""] ?? ""), meno: qname };
    const pred = qname.slice(0, d);
    if (pred === "xml") return { ns: NS_XML, meno: qname.slice(d + 1) };
    const ns = mapa[pred];
    if (ns === undefined)
      chyba(`Predpona „${pred}:“ nemá deklarovaný menný priestor (xmlns:${pred}).`, pos);
    return { ns: ns as string, meno: qname.slice(d + 1) };
  };

  while (i < s.length) {
    const lt = s.indexOf("<", i);
    const koniecTextu = lt < 0 ? s.length : lt;
    if (koniecTextu > i) {
      const t = s.slice(i, koniecTextu);
      const vrch = zasobnik[zasobnik.length - 1];
      if (!vrch) {
        if (t.trim()) chyba("Za koreňovým prvkom je ešte text.", i);
      } else {
        if (t.includes("]]>")) chyba("Reťazec „]]>“ nesmie byť v texte.", i + t.indexOf("]]>"));
        vrch.uzol.text += rozbalEntity(t, i);
      }
      i = koniecTextu;
      continue;
    }
    // i stojí na „<“
    if (s.startsWith("<!--", i)) {
      const k = s.indexOf("-->", i);
      if (k < 0) chyba("Neukončený komentár <!-- … -->.");
      i = k + 3;
      continue;
    }
    if (s.startsWith("<![CDATA[", i)) {
      const k = s.indexOf("]]>", i);
      if (k < 0) chyba("Neukončená sekcia CDATA.");
      const vrch = zasobnik[zasobnik.length - 1];
      if (!vrch) chyba("Sekcia CDATA mimo koreňového prvku.");
      vrch.uzol.text += s.slice(i + 9, k);
      i = k + 3;
      continue;
    }
    if (s.startsWith("<?", i)) {
      const k = s.indexOf("?>", i);
      if (k < 0) chyba("Neukončená spracovacia inštrukcia <? … ?>.");
      if (/^<\?xml[\s?]/i.test(s.slice(i, i + 6)))
        chyba("Deklarácia <?xml …?> smie byť len na úplnom začiatku súboru.");
      i = k + 2;
      continue;
    }
    if (s.startsWith("<!", i)) chyba("DOCTYPE ani iné deklarácie <!… nie sú v e-faktúre povolené.");
    if (s.startsWith("</", i)) {
      const k = s.indexOf(">", i);
      if (k < 0) chyba("Neukončená zatváracia značka.");
      const meno = s.slice(i + 2, k).trim();
      const vrch = zasobnik.pop();
      if (!vrch) chyba(`Zatváracia značka </${meno}> bez otváracej.`);
      else if (vrch.uzol.qname !== meno) {
        const m = miesto(vrch.pos);
        chyba(`Značka <${vrch.uzol.qname}> z riadku ${m.riadok} je zatvorená ako </${meno}>.`);
      }
      i = k + 1;
      continue;
    }
    if (koren && !zasobnik.length) chyba("Dokument smie mať len jeden koreňový prvok.");

    // Otváracia značka
    const zac = i;
    i++;
    let k = i;
    while (k < s.length && !/[\s/>]/.test(s[k])) k++;
    const qname = s.slice(i, k);
    if (!MENO.test(qname)) chyba(`Neplatné meno prvku „${qname || s.slice(i, i + 10)}“.`, zac);
    i = k;
    const surove: { meno: string; hodnota: string; pos: number }[] = [];
    let prazdny = false;
    for (;;) {
      preskocBiele();
      if (i >= s.length) chyba(`Neukončená značka <${qname}>.`, zac);
      if (s[i] === ">") {
        i++;
        break;
      }
      if (s.startsWith("/>", i)) {
        prazdny = true;
        i += 2;
        break;
      }
      const posAtr = i;
      let e = i;
      while (e < s.length && !/[\s=/>]/.test(s[e])) e++;
      const meno = s.slice(i, e);
      if (!meno || !MENO.test(meno)) chyba(`Neplatný atribút v značke <${qname}>.`, posAtr);
      i = e;
      preskocBiele();
      if (s[i] !== "=") chyba(`Atribút „${meno}“ nemá hodnotu (chýba =).`, posAtr);
      i++;
      preskocBiele();
      const uv = s[i];
      if (uv !== '"' && uv !== "'") chyba(`Hodnota atribútu „${meno}“ musí byť v úvodzovkách.`, i);
      const konHod = s.indexOf(uv, i + 1);
      if (konHod < 0) chyba(`Neukončená hodnota atribútu „${meno}“.`, i);
      const hodnota = s.slice(i + 1, konHod);
      if (hodnota.includes("<")) chyba(`Hodnota atribútu „${meno}“ nesmie obsahovať „<“.`, i);
      if (surove.some((a) => a.meno === meno))
        chyba(`Atribút „${meno}“ je v značke dvakrát.`, posAtr);
      surove.push({ meno, hodnota: rozbalEntity(hodnota, i), pos: posAtr });
      i = konHod + 1;
    }

    const rodic = zasobnik[zasobnik.length - 1];
    const nsMapa: Record<string, string> = { ...(rodic?.nsMapa ?? {}) };
    for (const a of surove) {
      if (a.meno === "xmlns") nsMapa[""] = a.hodnota;
      else if (a.meno.startsWith("xmlns:")) nsMapa[a.meno.slice(6)] = a.hodnota;
    }
    const { ns, meno } = vyriesNs(qname, nsMapa, zac);
    const atributy: Record<string, string> = {};
    for (const a of surove) {
      if (a.meno === "xmlns" || a.meno.startsWith("xmlns:")) continue;
      const r = vyriesNs(a.meno, nsMapa, a.pos, true);
      // Atribúty UBL sú bez predpony (currencyID, schemeID…); s predponou ich necháme celé.
      atributy[r.ns ? a.meno : r.meno] = a.hodnota;
    }
    const m = miesto(zac);
    const uzol: XmlUzol = {
      ns,
      meno,
      qname,
      atributy,
      deti: [],
      text: "",
      riadok: m.riadok,
      stlpec: m.stlpec,
      rodic: rodic?.uzol ?? null,
    };
    if (rodic) rodic.uzol.deti.push(uzol);
    else koren = uzol;
    if (!prazdny) zasobnik.push({ uzol, nsMapa, pos: zac });
  }

  if (zasobnik.length) {
    const v = zasobnik[zasobnik.length - 1];
    chyba(`Prvok <${v.uzol.qname}> nie je zatvorený.`, v.pos);
  }
  if (!koren) chyba("Dokument neobsahuje žiadny prvok.");
  return koren as XmlUzol;
}

/** Cesta k prvku v tvare blízkom XPath: /Invoice/cac:InvoiceLine[2]/cbc:ID. */
export function cestaUzla(u: XmlUzol): string {
  const casti: string[] = [];
  for (let x: XmlUzol | null = u; x; x = x.rodic) {
    const rovnaki = x.rodic ? x.rodic.deti.filter((d) => d.ns === x!.ns && d.meno === x!.meno) : [];
    const poradie = rovnaki.length > 1 ? `[${rovnaki.indexOf(x) + 1}]` : "";
    casti.unshift(x.qname + poradie);
  }
  return "/" + casti.join("/");
}
