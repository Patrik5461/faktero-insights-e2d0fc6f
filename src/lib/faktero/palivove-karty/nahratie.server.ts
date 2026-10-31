/*
  Nahratie výpisu palivovej karty (Up Déjeuner a ďalší bez API).

  Dva kroky:
    1. `nahladVypisu` — súbor (CSV, XLSX, PDF) → riadky, súčty, vozidlá a čo
       je duplicitné. Nič sa nezapisuje.
    2. `ulozVypis` — riadky z náhľadu (server ich znova prepočíta a overí)
       → evidencia transakcií, tankovania, bločky, prijatá faktúra. Ide tou
       istou cestou ako synchronizácia Shell API (`sync.server.ts`).

  Opakované nahratie nič nezdvojí: `externe_id` je odtlačok riadku a riadok,
  ktorý už v evidencii je (aj z iného formátu — CSV aj PDF tej istej
  faktúry), sa preskočí.

  Server-only. Volajúci musí mať overený prístup (`overPristup`).
*/
import { dnesBratislava } from "../datum-vystavenia";
import {
  duplicitneBlocky,
  existujuceTankovanie,
  tankovanieZTransakcie,
  vozidloTransakcie,
} from "./spracovanie";
import { poskytovatel as metaPoskytovatela } from "./register";
import {
  kontext,
  log,
  oznacBlocky,
  ulozTransakcie,
  zalozFakturu,
  type Kontext,
  type VysledokFaktury,
} from "./sync.server";
import type { KartaFaktura, KartaTransakcia } from "./typy";
import {
  POKYN_AI,
  naTransakcie,
  normalizujRiadok,
  sucty,
  rozdielSuctu,
  tabulkaNaRiadky,
  zAiOdpovede,
  type FakturaZVypisu,
  type Mapovanie,
  type NormalizovanyRiadok,
  type SuctyVypisu,
} from "./vypis-karty";

type Admin = any;

/** Strop súboru — mesačný výpis má desiatky kB, faktúra v PDF do pár MB. */
export const STROP_SUBORU = 10 * 1024 * 1024;
/** Strop riadkov jedného nahratia (aj kvôli 30 s limitu volania). */
export const STROP_RIADKOV = 3000;
const STROP_TEXTU_PDF = 150_000;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function getAdmin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function pripojenieFirmy(companyId: string, id: string) {
  const admin = await getAdmin();
  const { data } = await admin
    .from("palivove_karty_pripojenia")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) throw new Error("Pripojenie sa nenašlo.");
  if (!metaPoskytovatela(data.poskytovatel)?.nahratie)
    throw new Error("Toto pripojenie sa synchronizuje cez API, výpis sa k nemu nenahráva.");
  return data;
}

async function krajinaFirmy(admin: Admin, companyId: string): Promise<string> {
  const { data } = await admin
    .from("companies")
    .select("country")
    .eq("id", companyId)
    .maybeSingle();
  const { krajinaDane } = await import("../vat-rates");
  return krajinaDane(data?.country);
}

/* ---------------------------------------------------------- čítanie súboru */

type Druh = "csv" | "xlsx" | "pdf";

export function druhSuboru(nazov: string, b: Uint8Array): Druh {
  const n = nazov.toLowerCase();
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf"; // %PDF
  if (b[0] === 0x50 && b[1] === 0x4b) return "xlsx"; // ZIP (xlsx, ods)
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "xlsx"; // starý .xls
  if (n.endsWith(".pdf")) throw new Error("Súbor sa tvári ako PDF, ale PDF nie je.");
  if (/\.(xlsx|xls|ods)$/.test(n)) throw new Error("Súbor sa tvári ako tabuľka Excel, ale nie je.");
  // Text — nesmie obsahovať binárne nuly (nie je to obrázok ani iný doklad).
  if (b.subarray(0, 4096).includes(0))
    throw new Error("Nepodporovaný súbor. Nahrajte CSV, XLSX alebo PDF.");
  return "csv";
}

export async function tabulkaZXlsx(b: Uint8Array): Promise<unknown[][]> {
  const { overZip } = await import("../bezpecny-zip");
  // XLSX je ZIP — ZIP bomba by po rozbalení zhodila server (jeZip sa overí vnútri).
  overZip(b, { maxBajtov: 60 * 1024 * 1024, maxSuborov: 500 });
  const XLSX = await import("xlsx");
  const kniha = XLSX.read(b, { type: "array", raw: true, cellDates: false, dense: true });
  // Hárok s najviac riadkami s dátumom — výpis býva prvý, súhrn na ďalšom.
  let najlepsi: unknown[][] = [];
  for (const nazov of kniha.SheetNames.slice(0, 10)) {
    const riadky = XLSX.utils.sheet_to_json<unknown[]>(kniha.Sheets[nazov]!, {
      header: 1,
      raw: true,
      defval: "",
    });
    if (riadky.length > najlepsi.length) najlepsi = riadky;
  }
  return najlepsi;
}

async function zPdf(
  b: Uint8Array,
  companyId: string,
): Promise<{ faktura: FakturaZVypisu; riadky: Record<string, unknown>[] }> {
  const { odpovedNaJson } = await import("../json-odpoved");
  const { aiText, aiVision } = await import("../ai.server");
  // `ucel` a `firma` → meranie v ai_pouzitie (Admin → AI a kredity).
  const nastavenie = {
    json: true,
    maxOutputTokens: 16000,
    ucel: "palivova-karta",
    firma: companyId,
  };
  let text = "";
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(b));
    if (doc.numPages > 40) throw new Error("PDF má viac ako 40 strán — rozdeľte ho, prosím.");
    text = String((await extractText(doc, { mergePages: true })).text ?? "").trim();
  } catch (e: any) {
    if (/40 strán/.test(String(e?.message))) throw e;
    throw new Error("Toto nevyzerá na PDF — súbor sa nedá otvoriť.");
  }
  let odpoved: string;
  if (text.length >= 200) {
    if (text.length > STROP_TEXTU_PDF)
      throw new Error(
        "Faktúra je na jedno spracovanie príliš dlhá. Nahrajte radšej výpis v CSV alebo XLSX.",
      );
    odpoved = await aiText(`${POKYN_AI}\n\nTEXT DOKLADU:\n${text}`, nastavenie);
  } else {
    // Sken bez textovej vrstvy — číta sa z obrazu.
    odpoved = await aiVision(
      Buffer.from(b).toString("base64"),
      "application/pdf",
      POKYN_AI,
      nastavenie,
    );
  }
  const o = odpovedNaJson(odpoved);
  if (!o) throw new Error("Z PDF sa nepodarilo nič prečítať. Skúste výpis v CSV alebo XLSX.");
  return zAiOdpovede(o);
}

/* ---------------------------------------------------------------- náhľad */

export type RiadokNahladu = NormalizovanyRiadok & {
  externeId: string;
  vehicle_id: string | null;
  /** Riadok s týmto odtlačkom už v evidencii je — uloženie ho len obnoví. */
  uzNahraty: boolean;
  /** Ten istý nákup (deň, suma, množstvo) už je nahratý z iného súboru — preskočí sa. */
  podobny: boolean;
  /** Bloček z pumpy s rovnakým dňom a sumou. */
  blocekId: string | null;
  /** Tankovanie tohto auta v ten deň s rovnakými litrami už je (GPS, ručne). */
  tankovanieId: string | null;
};

export type NahladVypisu = {
  druh: Druh;
  hlavicka: string[];
  hlavickaIndex: number;
  mapovanie: Mapovanie;
  iste: boolean;
  ukazka: string[][];
  preskocene: { riadok: number; dovod: string }[];
  riadky: RiadokNahladu[];
  sucty: SuctyVypisu;
  faktura: FakturaZVypisu;
  /** Prijatá faktúra s tým istým číslom, ktorá už vo Fakteri je (prepojí sa). */
  existujucaFaktura: { id: string; supplier_name: string | null; amount_total: number } | null;
  rozdiel: number | null;
  vozidla: { id: string; nazov: string; riadkov: number }[];
};

const dniRozsah = (tx: { datum: string }[]) => {
  const d = tx.map((t) => t.datum).sort();
  return [d[0], d[d.length - 1]] as const;
};

/** Duplicity voči tomu, čo už vo Fakteri je — spoločné pre náhľad aj uloženie. */
async function porovnaj(k: Kontext, tx: KartaTransakcia[]) {
  const ids = tx.map((t) => t.externeId);
  const uz = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await k.admin
      .from("palivove_karty_transakcie")
      .select("externe_id")
      .eq("pripojenie_id", k.pripojenie.id)
      .in("externe_id", ids.slice(i, i + 200));
    for (const r of data ?? []) uz.add(r.externe_id);
  }
  /** nový odtlačok → odtlačok toho istého nákupu, ktorý už v evidencii je */
  const podobne = new Map<string, string>();
  const vozidlo = new Map<string, string | null>();
  const tankovanie = new Map<string, string>();
  let blocky = new Map<string, string>();
  if (!tx.length) return { uz, podobne, vozidlo, tankovanie, blocky };
  const [od, do_] = dniRozsah(tx);

  // Ten istý nákup z iného súboru (CSV vs. PDF faktúry) — iný odtlačok, rovnaký deň, suma a litre.
  const { data: ine } = await k.admin
    .from("palivove_karty_transakcie")
    .select("externe_id, datum, spolu, mnozstvo")
    .eq("pripojenie_id", k.pripojenie.id)
    .gte("datum", od)
    .lte("datum", do_)
    .limit(1000);
  const volne = ((ine ?? []) as any[]).filter((r) => !ids.includes(r.externe_id));
  for (const t of tx) {
    if (uz.has(t.externeId)) continue;
    const i = volne.findIndex(
      (r) =>
        r.datum === t.datum &&
        Math.abs(Number(r.spolu) - t.spolu) < 0.005 &&
        Math.abs(Number(r.mnozstvo ?? 0) - Number(t.mnozstvo ?? 0)) < 0.01,
    );
    if (i >= 0) {
      podobne.set(t.externeId, volne[i].externe_id);
      volne.splice(i, 1);
    }
  }

  for (const t of tx) vozidlo.set(t.externeId, vozidloTransakcie(t, k.vazby, k.vozidla));

  const [{ data: bl }, { data: fr }] = await Promise.all([
    k.admin
      .from("expense_documents")
      .select("id, issue_date, total_amount")
      .eq("company_id", k.companyId)
      .gte("issue_date", od)
      .lte("issue_date", do_)
      .limit(1000),
    k.admin
      .from("fuel_records")
      .select("id, vehicle_id, fuel_date, liters, external_source, external_id")
      .eq("company_id", k.companyId)
      .gte("fuel_date", od)
      .lte("fuel_date", do_)
      .limit(1000),
  ]);
  blocky = duplicitneBlocky(tx, bl ?? []);
  const zoznam = (fr ?? []) as any[];
  for (const t of tx) {
    const f = tankovanieZTransakcie(t, {
      companyId: k.companyId,
      vehicleId: vozidlo.get(t.externeId) ?? null,
      zdroj: k.zdroj,
    });
    if (!f) continue;
    const id = existujuceTankovanie(f, zoznam);
    if (id) tankovanie.set(t.externeId, id);
  }
  return { uz, podobne, vozidlo, tankovanie, blocky };
}

async function existujucaFaktura(k: Kontext, cislo: string | null) {
  if (!cislo) return null;
  const meta = metaPoskytovatela(k.poskytovatel);
  const { data } = await k.admin
    .from("purchase_invoices")
    .select("id, supplier_name, supplier_ico, amount_total, external_id")
    .eq("company_id", k.companyId)
    .eq("invoice_number", cislo)
    .is("deleted_at", null)
    .limit(5);
  const vzor = new RegExp(meta?.dodavatel?.vzor ?? k.poskytovatel, "i");
  const ico = meta?.dodavatel?.ico ?? "";
  const f = ((data ?? []) as any[]).find(
    (x) =>
      x.external_id === `${k.poskytovatel}:faktura:${cislo}` ||
      (ico && String(x.supplier_ico ?? "").replace(/\D/g, "") === ico) ||
      vzor.test(String(x.supplier_name ?? "")),
  );
  return f
    ? { id: f.id as string, supplier_name: f.supplier_name, amount_total: Number(f.amount_total) }
    : null;
}

export async function nahladVypisu(o: {
  pripojenie: any;
  nazov: string;
  bajty: Uint8Array;
  mapovanie?: Mapovanie | null;
  hlavickaIndex?: number | null;
}): Promise<NahladVypisu> {
  if (!o.bajty.length) throw new Error("Súbor je prázdny.");
  if (o.bajty.length > STROP_SUBORU) throw new Error("Súbor je väčší ako 10 MB.");
  const admin = await getAdmin();
  const k = await kontext(admin, o.pripojenie);
  const krajina = await krajinaFirmy(admin, k.companyId);
  const kv = { krajinaFirmy: krajina, mena: krajina === "CZ" ? "CZK" : "EUR" };
  const druh = druhSuboru(o.nazov, o.bajty);

  let zaklad: Omit<NahladVypisu, "riadky" | "sucty" | "existujucaFaktura" | "rozdiel" | "vozidla">;
  let riadky: NormalizovanyRiadok[];
  if (druh === "pdf") {
    const ai = await zPdf(o.bajty, k.companyId);
    const preskocene: { riadok: number; dovod: string }[] = [];
    riadky = [];
    ai.riadky.forEach((r, i) => {
      const n = normalizujRiadok(r, kv);
      if (n.ok) riadky.push(n.riadok);
      else preskocene.push({ riadok: i + 1, dovod: n.dovod });
    });
    zaklad = {
      druh,
      hlavicka: [],
      hlavickaIndex: 0,
      mapovanie: {},
      iste: true,
      ukazka: [],
      preskocene,
      faktura: ai.faktura,
    };
  } else {
    let tabulka: unknown[][];
    if (druh === "xlsx") tabulka = await tabulkaZXlsx(o.bajty);
    else {
      const { dekodujCsv } = await import("../vypis-brany");
      const { citajCsv } = await import("../import-prijatych");
      tabulka = citajCsv(dekodujCsv(o.bajty));
    }
    const t = tabulkaNaRiadky(tabulka, kv, {
      hlavickaIndex: o.hlavickaIndex ?? undefined,
      mapovanie: o.mapovanie ?? undefined,
    });
    riadky = t.iste ? t.riadky : [];
    const cisla = [...new Set(t.riadky.map((r) => r.fakturaCislo).filter(Boolean))] as string[];
    zaklad = {
      druh,
      hlavicka: t.hlavicka,
      hlavickaIndex: t.hlavickaIndex,
      mapovanie: t.mapovanie,
      iste: t.iste,
      ukazka: t.ukazka,
      preskocene: t.preskocene,
      faktura: {
        cislo: cisla.length === 1 ? cisla[0] : null,
        datum: null,
        splatnost: null,
        zaklad: null,
        dph: null,
        spolu: t.sucetVypisu,
        mena: null,
      },
    };
  }
  if (riadky.length > STROP_RIADKOV)
    throw new Error(
      `Výpis má ${riadky.length} riadkov, naraz sa dá nahrať najviac ${STROP_RIADKOV}.`,
    );

  const tx = naTransakcie(riadky);
  const p = await porovnaj(k, tx);
  const nahlad: RiadokNahladu[] = riadky.map((r, i) => {
    const id = tx[i].externeId;
    return {
      ...r,
      externeId: id,
      vehicle_id: p.vozidlo.get(id) ?? null,
      uzNahraty: p.uz.has(id),
      podobny: p.podobne.has(id),
      blocekId: p.blocky.get(id) ?? null,
      tankovanieId: p.tankovanie.get(id) ?? null,
    };
  });
  const s = sucty(riadky);
  const poVozidlach = new Map<string, number>();
  for (const r of nahlad)
    if (r.vehicle_id) poVozidlach.set(r.vehicle_id, (poVozidlach.get(r.vehicle_id) ?? 0) + 1);
  return {
    ...zaklad,
    riadky: nahlad,
    sucty: s,
    existujucaFaktura: await existujucaFaktura(k, zaklad.faktura.cislo),
    rozdiel: rozdielSuctu(zaklad.faktura.spolu, s.spolu),
    vozidla: [...poVozidlach].map(([id, n]) => {
      const v = k.vozidla.find((x) => x.id === id);
      return {
        id,
        nazov: [v?.name, v?.license_plate ? `(${v.license_plate})` : ""].filter(Boolean).join(" "),
        riadkov: n,
      };
    }),
  };
}

/* --------------------------------------------------------------- uloženie */

export type HlavickaFaktury = {
  cislo: string | null;
  datum: string | null;
  splatnost: string | null;
  spolu: number | null;
  dph: number | null;
  mena: string | null;
};

export type VysledokNahratia = {
  transakcie: number;
  preskocene: number;
  tankovania: number;
  blocky: number;
  faktury: { cislo: string; stav: VysledokFaktury["stav"]; id: string | null }[];
  sprava: string;
};

/**
 * Uloží riadky z náhľadu. Klient posiela už rozpoznané riadky; odtlačky a
 * duplicity sa počítajú znova tu, nič z prehliadača sa neberie naslepo.
 */
export async function ulozVypis(o: {
  pripojenie: any;
  riadky: NormalizovanyRiadok[];
  faktura: HlavickaFaktury;
  nazovSuboru: string;
}): Promise<VysledokNahratia> {
  if (o.riadky.length > STROP_RIADKOV) throw new Error("Priveľa riadkov naraz.");
  const admin = await getAdmin();
  const k = await kontext(admin, o.pripojenie);
  const krajina = await krajinaFirmy(admin, k.companyId);
  const meta = metaPoskytovatela(k.poskytovatel);
  const cisloHlavicky = o.faktura.cislo?.trim() || null;

  // Riadok bez čísla faktúry patrí k faktúre z hlavičky (výpis k jednej faktúre).
  const riadky = o.riadky.map((r) => ({
    ...r,
    fakturaCislo: r.fakturaCislo || cisloHlavicky,
    fakturaDatum: r.fakturaCislo && r.fakturaCislo !== cisloHlavicky ? null : o.faktura.datum,
  }));
  const vsetky = naTransakcie(riadky);
  const p = await porovnaj(k, vsetky);
  const tx = vsetky.filter((t) => !p.podobne.has(t.externeId));

  await admin
    .from("palivove_karty_pripojenia")
    .update({ stav: "prebieha" })
    .eq("id", k.pripojenie.id);
  try {
    await ulozTransakcie(k, tx);
    // Nákup nahratý skôr bez faktúry (výpis) a teraz s faktúrou (PDF) — doplní sa mu číslo.
    for (const t of vsetky) {
      const povodne = p.podobne.get(t.externeId);
      if (!povodne || !t.fakturaCislo) continue;
      await admin
        .from("palivove_karty_transakcie")
        .update({ faktura_cislo: t.fakturaCislo, faktura_datum: t.fakturaDatum })
        .eq("pripojenie_id", k.pripojenie.id)
        .eq("externe_id", povodne)
        .is("faktura_cislo", null);
    }
    await oznacBlocky(k, tx);

    const faktury: VysledokNahratia["faktury"] = [];
    if (k.pripojenie.rezim === "faktura") {
      const skupiny = new Map<string, KartaTransakcia[]>();
      for (const t of vsetky) {
        if (!t.fakturaCislo) continue;
        const g = skupiny.get(t.fakturaCislo) ?? [];
        g.push(t);
        skupiny.set(t.fakturaCislo, g);
      }
      // Faktúra z hlavičky aj bez riadkov (PDF bez rozpisu) — celá suma jedným riadkom.
      if (cisloHlavicky && !skupiny.has(cisloHlavicky) && o.faktura.spolu != null)
        skupiny.set(cisloHlavicky, []);
      for (const [cislo, g] of skupiny) {
        const s = sucty(g);
        const zHlavicky = cislo === cisloHlavicky;
        const posledny =
          g
            .map((t) => t.datum)
            .sort()
            .pop() ?? dnesBratislava();
        const datum = (zHlavicky && o.faktura.datum) || posledny;
        const spolu = zHlavicky && o.faktura.spolu != null ? r2(o.faktura.spolu) : s.spolu;
        const dph = zHlavicky && o.faktura.dph != null ? r2(o.faktura.dph) : s.dph;
        const f: KartaFaktura = {
          externeId: cislo,
          cislo,
          datum,
          splatnost: (zHlavicky && o.faktura.splatnost) || null,
          dodavatel: {
            nazov: meta?.dodavatel?.nazov ?? meta?.nazov ?? k.poskytovatel,
            krajina: meta?.dodavatel?.krajina ?? null,
          },
          mena: (zHlavicky && o.faktura.mena) || g[0]?.mena || (krajina === "CZ" ? "CZK" : "EUR"),
          zaklad: r2(spolu - dph),
          dph,
          spolu,
          typ: null,
          dobropis: spolu < 0,
          zahranicna: false,
        };
        const v = await zalozFakturu(k, f, krajina);
        faktury.push({ cislo, stav: v.stav, id: v.id });
      }
    }

    const sprava =
      `Nahratý výpis ${o.nazovSuboru.slice(0, 80)}: nákupov ${tx.length}` +
      (p.podobne.size ? `, preskočených (už nahraté z iného súboru) ${p.podobne.size}` : "") +
      `, nových tankovaní ${k.pocty.tankovania}` +
      (faktury.length ? `, faktúr ${faktury.map((f) => f.cislo).join(", ")}` : "") +
      (k.pocty.blocky ? `, bločkov na kontrolu ${k.pocty.blocky}` : "") +
      ".";
    await admin
      .from("palivove_karty_pripojenia")
      .update({
        stav: "ok",
        posledna_sync_at: new Date().toISOString(),
        posledna_chyba: null,
      })
      .eq("id", k.pripojenie.id);
    await log(admin, k.pripojenie, "nahratie", "ok", sprava, { ...k.pocty, faktury });
    return {
      transakcie: tx.length,
      preskocene: p.podobne.size,
      tankovania: k.pocty.tankovania,
      blocky: k.pocty.blocky,
      faktury,
      sprava,
    };
  } catch (e: any) {
    const sprava = `Nahratie výpisu zlyhalo: ${String(e?.message ?? e).slice(0, 300)}`;
    await admin
      .from("palivove_karty_pripojenia")
      .update({ stav: "chyba", posledna_chyba: sprava })
      .eq("id", k.pripojenie.id);
    await log(admin, k.pripojenie, "nahratie", "chyba", sprava, k.pocty);
    throw new Error(sprava);
  }
}
