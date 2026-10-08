/*
  Zaúčtovaná súpiska CSV — pre programy, do ktorých nemáme priamy formát
  (MRP, Helios, Premier, Excel). Jeden riadok na riadok zaúčtovania: doklad,
  partner, sadzba, základ, daň a kódy (predkontácia s účtami MD/Dal,
  členenie DPH a KV, stredisko, zákazka, činnosť). Účtovníčka si z neho
  urobí hromadný import alebo aspoň prepisuje bez hľadania.

  Bodkočiarka, desatinná čiarka a Windows-1250 (prevod robí sťahovanie) —
  tak ho slovenský Excel otvorí správne. Dobropis má sumy so znamienkom
  mínus, aby sa súpiska dala sčítať.
*/

import { rozdelUcet, type DokladUctovania, type KodUctovania } from "./zauctovanie-export";

const dveSk = (n: unknown): string => {
  const x = Number(n);
  return (Number.isFinite(x) ? x : 0).toFixed(2).replace(".", ",");
};

function pole(h: unknown): string {
  const s = String(h ?? "")
    .trim()
    .replace(/\r?\n/g, " ");
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const AGENDA: Record<DokladUctovania["agenda"], string> = {
  vystavena: "vystavená faktúra",
  prijata: "prijatá faktúra",
  doklad: "bloček",
};
const DRUH: Record<DokladUctovania["druh"], string> = {
  faktura: "faktúra",
  zaloha: "zálohová",
  dobropis: "dobropis",
};
const FORMA: Record<DokladUctovania["forma"], string> = {
  faktura: "faktúra",
  pokladna: "pokladničný doklad",
  interny: "interný doklad",
};

export const STLPCE_CSV_UCTOVANIA = [
  "agenda",
  "druh",
  "forma",
  "cislo",
  "vs",
  "vystavena",
  "dodanie",
  "splatnost",
  "datum_zauctovania",
  "partner",
  "ico",
  "dic",
  "ic_dph",
  "mena",
  "sadzba",
  "zaklad",
  "dph",
  "odpocet_dph",
  "predkontacia",
  "ucet_md",
  "ucet_d",
  "clenenie_dph",
  "kv_dph",
  "stredisko",
  "zakazka",
  "cinnost",
  "rad",
  "platba",
  "celkom_doklad",
  "opravuje",
  "text",
  // Doplnené na koniec, aby staré importy podľa poradia stĺpcov nepraskli.
  "kurz",
  "odpocet_zalohy",
  "poznamka",
];

export function buildCsvUctovanie(opts: {
  doklady: DokladUctovania[];
  kody: Record<string, KodUctovania>;
}): string {
  const riadky: string[] = [STLPCE_CSV_UCTOVANIA.join(";")];
  for (const d of opts.doklady) {
    const zn = d.druh === "dobropis" ? -1 : 1;
    // Doklad bez rozpisu (napr. bez DPH a bez sumy) dostane aspoň jeden riadok.
    const zoznam = d.riadky.length
      ? d.riadky
      : [
          {
            sadzba: 0,
            zaklad: d.celkom,
            dph: 0,
            predkontacia: d.predkontacia,
            clenenie: d.clenenie,
            kv: d.kv,
            odpocet: true,
            text: null,
          },
        ];
    for (const r of zoznam) {
      const kod = r.predkontacia ? opts.kody[r.predkontacia] : undefined;
      const md = rozdelUcet(kod?.ucetMd);
      const dal = rozdelUcet(kod?.ucetD);
      riadky.push(
        [
          AGENDA[d.agenda],
          d.dokladKPlatbe ? "daňový doklad k platbe" : DRUH[d.druh],
          FORMA[d.forma],
          pole(d.cislo),
          pole(d.vs),
          d.datumVystavenia ?? "",
          d.datumDodania ?? "",
          d.datumSplatnosti ?? "",
          d.datumZauctovania ?? "",
          pole(d.partner.nazov),
          pole(d.partner.ico),
          pole(d.partner.dic),
          pole(d.partner.icDph),
          d.mena,
          String(r.sadzba),
          dveSk(zn * r.zaklad),
          dveSk(zn * r.dph),
          r.odpocet ? "áno" : "nie",
          pole(r.predkontacia),
          md ? `${md.synteticky}${md.analyticky}` : pole(kod?.ucetMd),
          dal ? `${dal.synteticky}${dal.analyticky}` : pole(kod?.ucetD),
          pole(r.clenenie),
          pole(r.kv === "X" ? "nezahŕňať" : r.kv),
          pole(d.stredisko),
          pole(d.zakazka),
          pole(d.cinnost),
          pole(d.rad),
          pole(d.platba),
          dveSk(zn * d.celkom),
          pole(d.opravuje),
          pole(r.text ?? d.text),
          d.kurz ? String(d.kurz).replace(".", ",") : "",
          d.odpocetZalohy ? dveSk(d.odpocetZalohy) : "",
          pole(d.poznamka),
        ].join(";"),
      );
    }
  }
  // BOM nie — Windows-1250 ho nepozná; prevod robí sťahovanie v prehliadači.
  return riadky.join("\r\n") + "\r\n";
}
