/**
 * AI čítanie notifikácie banky — pokyn a prevod odpovede na `Notifikacia`.
 *
 * Použije sa len vtedy, keď na mail nesedí žiadne pravidlo
 * (`banka-notifikacie-parsery.ts`). Čo AI vráti, sa nikdy neberie naslepo:
 * prejde rovnakou validáciou ako pravidlo a navyše sa suma a VS musia
 * doslovne nájsť v texte mailu (`udajeVTexte`), inak ide mail na kontrolu.
 */
import {
  citajDatum,
  citajSumu,
  citajSumuSoZnamienkom,
  normIban,
  normMena,
  symbol,
  textPola,
  type Notifikacia,
} from "./banka-notifikacie";

export const PROMPT_NOTIFIKACIA = `Si účtovník. Dostaneš text e-mailu, ktorý firme poslala banka (alebo ho firma preposlala).
Zisti, či je to notifikácia o JEDNOM pohybe na bankovom účte (prijatá alebo odoslaná platba, kredit/debet), a vytiahni údaje.
Vráť VÝLUČNE JSON v tvare:
{"je_pohyb": boolean,
 "smer": "kredit"|"debet"|null,
 "suma": string|null,
 "mena": string|null,
 "datum": "YYYY-MM-DD"|null,
 "variabilny_symbol": string|null, "konstantny_symbol": string|null, "specificky_symbol": string|null,
 "sprava": string|null,
 "protistrana_meno": string|null, "protistrana_iban": string|null,
 "iban_uctu": string|null,
 "zostatok": string|null,
 "referencia": string|null}
Pravidlá:
- "je_pohyb": false pre reklamu, zmenu hesla, výpis za obdobie, upomienku, potvrdenie prihlásenia, platbu kartou čakajúcu na zaúčtovanie (blokáciu) a pre mail s viacerými pohybmi naraz.
- "smer": "kredit" keď peniaze na účet PRIŠLI (príjem, kredit, připsání, incoming), "debet" keď ODIŠLI (výdaj, debet, odepsání, platba kartou, outgoing).
- "suma": suma pohybu PRESNE tak, ako je napísaná v maile (napr. "1 234,56"), bez meny a bez znamienka.
- "mena": ISO kód (EUR, CZK, USD…).
- "variabilny_symbol" atď.: len číslice, presne z mailu (VS, Variabilní symbol, Variable symbol). Nehádaj ho z textu správy.
- "protistrana_*": druhá strana platby (platiteľ pri kredite, príjemca pri debete), nie majiteľ účtu.
- "iban_uctu": účet, ku ktorému notifikácia je, tak ako je v maile (môže byť skrátený hviezdičkami).
- "zostatok": zostatok po pohybe, ak je v maile.
Čo v maile nie je, daj null. Nič si nevymýšľaj a nič nedopočítavaj.`;

/** Odpoveď AI → `Notifikacia`. Neznáme a zlé typy sa zahodia. */
export function notifikaciaZAi(o: Record<string, unknown> | null | undefined): Notifikacia | null {
  if (!o || typeof o !== "object") return null;
  const smer = o.smer === "kredit" || o.smer === "debet" ? o.smer : null;
  const suma = typeof o.suma === "number" ? Math.abs(o.suma) : citajSumu(String(o.suma ?? ""));
  const zostatok =
    o.zostatok == null
      ? null
      : typeof o.zostatok === "number"
        ? o.zostatok
        : citajSumuSoZnamienkom(String(o.zostatok));
  const datum = typeof o.datum === "string" ? citajDatum(o.datum) : null;
  const iban = textPola(o.protistrana_iban, 40);
  return {
    jePohyb: o.je_pohyb === true,
    smer,
    suma,
    mena: normMena(String(o.mena ?? "")),
    datum,
    vs: symbol(o.variabilny_symbol),
    ks: symbol(o.konstantny_symbol),
    ss: symbol(o.specificky_symbol),
    sprava: textPola(o.sprava, 300),
    protistrana: textPola(o.protistrana_meno, 120),
    protistranaIban: iban ? normIban(iban) : null,
    ibanUctu: textPola(o.iban_uctu, 40),
    zostatok,
    referencia: textPola(o.referencia, 80),
  };
}
