/**
 * Klient verejnej SOAP služby Registra plátců DPH (rozhraniCRPDPH, ADIS).
 *
 * Operácia `getStatusNespolehlivyPlatceRozsireny` vráti pre DIČ (bez CZ)
 * stav nespoľahlivosti, finančný úrad, zverejnené účty aj názov. WSDL je na
 * https://mojedane.gov.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP?wsdl.
 * Výsledok sa pamätá v procese pár hodín — register sa mení po dňoch a pri
 * zozname prijatých faktúr by inak každé otvorenie volalo finančnú správu.
 */
import { XMLParser } from "fast-xml-parser";
import { ceskyUcetNaIban, upravIban, type StavPlatce, type ZverejnenyUcet } from "./cz-registr-dph";

const URL_SLUZBY = "https://mojedane.gov.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP";
const AKCIA = "http://adis.mfcr.cz/rozhraniCRPDPH/getStatusNespolehlivyPlatceRozsireny";
const PLATNOST_MS = 6 * 60 * 60 * 1000;

const pamat = new Map<string, { do: number; stav: StavPlatce }>();
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  isArray: (meno) => meno === "statusPlatceDPH" || meno === "ucet",
});

const text = (v: unknown) => (typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "");

/** Rozparsuje SOAP odpoveď na stavy platcov podľa DIČ. */
export function rozparsujOdpoved(xml: string): { kod: number; text: string; platci: StavPlatce[] } {
  const d: any = parser.parse(xml);
  const telo = d?.Envelope?.Body?.StatusNespolehlivyPlatceRozsirenyResponse ?? {};
  const status = telo.status ?? {};
  const platci: StavPlatce[] = (telo.statusPlatceDPH ?? []).map((p: any) => {
    const ucty: ZverejnenyUcet[] = (p?.zverejneneUcty?.ucet ?? []).map((u: any) => {
      const s = u?.standardniUcet;
      const n = u?.nestandardniUcet;
      const iban = s
        ? ceskyUcetNaIban(s.predcisli ?? null, String(s.cislo), String(s.kodBanky))
        : n?.cislo
          ? upravIban(n.cislo)
          : null;
      return {
        zobrazenie: s
          ? `${s.predcisli ? `${s.predcisli}-` : ""}${s.cislo}/${s.kodBanky}`
          : text(n?.cislo),
        iban,
        od: u?.datumZverejneni ? text(u.datumZverejneni) : null,
        do: u?.datumZverejneniUkonceni ? text(u.datumZverejneniUkonceni) : null,
      };
    });
    return {
      dic: text(p.dic),
      nespolehlivy: (text(p.nespolehlivyPlatce) || "NENALEZEN") as StavPlatce["nespolehlivy"],
      datumNespolehlivosti: p.datumZverejneniNespolehlivosti
        ? text(p.datumZverejneniNespolehlivosti)
        : null,
      cisloFu: p.cisloFu ? text(p.cisloFu) : null,
      nazov: p.nazevSubjektu ? text(p.nazevSubjektu).replace(/\s+/g, " ") : null,
      ucty,
    };
  });
  return { kod: Number(status.statusCode ?? -1), text: text(status.statusText), platci };
}

/** Stav platcu podľa DIČ (bez CZ). Vyhodí chybu, keď je služba nedostupná. */
export async function stavPlatceDph(
  dic: string,
  opts: { obnovit?: boolean } = {},
): Promise<StavPlatce> {
  const kluc = dic.replace(/\D/g, "");
  const ulozene = pamat.get(kluc);
  if (!opts.obnovit && ulozene && ulozene.do > Date.now()) return ulozene.stav;

  const telo =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:roz="http://adis.mfcr.cz/rozhraniCRPDPH/">` +
    `<soapenv:Body><roz:StatusNespolehlivyPlatceRozsirenyRequest><roz:dic>${kluc}</roz:dic>` +
    `</roz:StatusNespolehlivyPlatceRozsirenyRequest></soapenv:Body></soapenv:Envelope>`;
  const res = await fetch(URL_SLUZBY, {
    method: "POST",
    headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: `"${AKCIA}"` },
    body: telo,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Registr plátců DPH odpověděl ${res.status}.`);
  const o = rozparsujOdpoved(await res.text());
  // 2 = technologická odstávka (0:00–0:10), 3 = služba nedostupná.
  if (o.kod !== 0 && o.kod !== 1)
    throw new Error(`Registr plátců DPH je nedostupný (${o.text || o.kod}).`);
  const stav =
    o.platci.find((p) => p.dic === kluc) ??
    ({
      dic: kluc,
      nespolehlivy: "NENALEZEN",
      datumNespolehlivosti: null,
      cisloFu: null,
      nazov: null,
      ucty: [],
    } as StavPlatce);
  pamat.set(kluc, { do: Date.now() + PLATNOST_MS, stav });
  if (pamat.size > 5000) pamat.clear();
  return stav;
}
