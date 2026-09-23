/**
 * Import prijatých dokladov — serverová časť: rozbalenie súborov, kontrola
 * duplicít, zápis do databázy a čítanie skenov bez páru cez AI.
 *
 * Beží na pozadí (nginx zruší požiadavku po 30 s a sto skenov číta AI aj
 * desať minút); priebeh sa zapisuje do `import_jobs` a stránka sa naň pýta.
 */
import { XMLParser } from "fast-xml-parser";
import {
  citajCsv,
  datumZTextu,
  jePohodaXmlObsah,
  klucDuplicity,
  normalizuj,
  pohodaPrijate,
  priradSkeny,
  riadokBlocku,
  riadokPrijatejFaktury,
  tabulkaNaZaznamy,
  zaznamZAI,
  type PrijatyZaznam,
  type StavImportu,
} from "./import-prijatych";

export type Vstup = { meno: string; bajty: Uint8Array };

const SKENY = /\.(pdf|jpe?g|png|webp|heic)$/i;

export function mimeZMena(meno: string): string {
  const p = meno.toLowerCase().split(".").pop() ?? "";
  if (p === "pdf") return "application/pdf";
  if (p === "jpg" || p === "jpeg") return "image/jpeg";
  if (p === "png") return "image/png";
  if (p === "webp") return "image/webp";
  if (p === "heic") return "image/heic";
  return "application/octet-stream";
}

/** UTF-8, a keď to nejde, Windows-1250 — staré exporty zo slovenských programov. */
function dekoduj(bajty: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bajty);
  } catch {
    return new TextDecoder("windows-1250").decode(bajty);
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: true,
  removeNSPrefix: true,
  // Bez tohto stráca IČO vedúce nuly.
  parseTagValue: false,
  parseAttributeValue: false,
});

/**
 * Z nahratých súborov (aj ZIP-ov vnorených do seba) vytiahne doklady a skeny.
 * Neznáme súbory sa preskočia s poznámkou — ZIP od Doklado býva aj s
 * pomocnými súbormi.
 */
export async function rozbal(vstupy: Vstup[], hlbka = 0): Promise<{
  zaznamy: PrijatyZaznam[];
  skeny: Vstup[];
  poznamky: string[];
}> {
  const zaznamy: PrijatyZaznam[] = [];
  const skeny: Vstup[] = [];
  const poznamky: string[] = [];
  for (const v of vstupy) {
    const meno = v.meno.split("/").pop() ?? v.meno;
    const nizke = meno.toLowerCase();
    if (!meno || meno.startsWith(".") || v.meno.includes("__MACOSX")) continue;
    try {
      if (nizke.endsWith(".zip")) {
        if (hlbka > 2) continue;
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(v.bajty);
        const vnutri: Vstup[] = [];
        for (const f of Object.values(zip.files)) {
          if (f.dir) continue;
          vnutri.push({ meno: f.name, bajty: new Uint8Array(await f.async("uint8array")) });
        }
        const r = await rozbal(vnutri, hlbka + 1);
        zaznamy.push(...r.zaznamy);
        skeny.push(...r.skeny);
        poznamky.push(...r.poznamky);
      } else if (nizke.endsWith(".xml")) {
        const obsah = dekoduj(v.bajty);
        if (!jePohodaXmlObsah(obsah)) {
          poznamky.push(`${meno}: XML nie je vo formáte Pohody, preskočené`);
          continue;
        }
        const najdene = pohodaPrijate(parser.parse(obsah));
        if (!najdene.length) poznamky.push(`${meno}: v XML nie sú prijaté faktúry ani pokladničné výdavky`);
        zaznamy.push(...najdene);
      } else if (nizke.endsWith(".csv") || nizke.endsWith(".txt")) {
        const najdene = tabulkaNaZaznamy(citajCsv(dekoduj(v.bajty)), "CSV");
        if (!najdene.length) poznamky.push(`${meno}: v tabuľke sa nenašli stĺpce dokladov`);
        zaznamy.push(...najdene);
      } else if (nizke.endsWith(".xlsx") || nizke.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const kniha = XLSX.read(v.bajty, { type: "array" });
        let pocet = 0;
        for (const nazov of kniha.SheetNames) {
          const riadky = XLSX.utils.sheet_to_json<unknown[]>(kniha.Sheets[nazov]!, {
            header: 1,
            raw: true,
            defval: "",
          });
          const najdene = tabulkaNaZaznamy(riadky, "XLSX");
          pocet += najdene.length;
          zaznamy.push(...najdene);
        }
        if (!pocet) poznamky.push(`${meno}: v tabuľke sa nenašli stĺpce dokladov`);
      } else if (SKENY.test(nizke)) {
        skeny.push({ meno, bajty: v.bajty });
      } else {
        poznamky.push(`${meno}: neznámy typ súboru, preskočené`);
      }
    } catch (e: any) {
      poznamky.push(`${meno}: súbor sa nepodarilo prečítať (${String(e?.message ?? e).slice(0, 80)})`);
    }
  }
  return { zaznamy, skeny, poznamky };
}

/** Kľúče dokladov, ktoré vo firme už sú — aby sa import dal pustiť aj druhý raz. */
export async function existujuceKluce(klient: any, companyId: string): Promise<Set<string>> {
  const kluce = new Set<string>();
  for (let od = 0; od < 50000; od += 1000) {
    const { data } = await klient
      .from("purchase_invoices")
      .select("invoice_number, supplier_ico, supplier_name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .range(od, od + 999);
    for (const r of data ?? [])
      kluce.add(
        klucDuplicity({ typ: "faktura", cislo: r.invoice_number, ico: r.supplier_ico, dodavatel: r.supplier_name, vystavenie: null, spolu: null }),
      );
    if (!data || data.length < 1000) break;
  }
  for (let od = 0; od < 50000; od += 1000) {
    const { data } = await klient
      .from("expense_documents")
      .select("document_number, supplier_ico, supplier_name, issue_date, total_amount")
      .eq("company_id", companyId)
      .range(od, od + 999);
    for (const r of data ?? [])
      kluce.add(
        klucDuplicity({
          typ: "blocek",
          cislo: r.document_number,
          ico: r.supplier_ico,
          dodavatel: r.supplier_name,
          vystavenie: r.issue_date,
          spolu: r.total_amount == null ? null : Number(r.total_amount),
        }),
      );
    if (!data || data.length < 1000) break;
  }
  return kluce;
}

export type Plan = {
  zaznamy: PrijatyZaznam[];
  skeny: Vstup[];
  parovanie: Map<number, number>;
  duplicity: Set<number>;
  skenyBezParu: number[];
  poznamky: string[];
};

export async function naplanuj(klient: any, companyId: string, vstupy: Vstup[]): Promise<Plan> {
  const { zaznamy, skeny, poznamky } = await rozbal(vstupy);
  const existuju = await existujuceKluce(klient, companyId);
  const duplicity = new Set<number>();
  const videne = new Set<string>();
  zaznamy.forEach((z, i) => {
    const k = klucDuplicity(z);
    // Ten istý doklad v XML aj v CSV sa naimportuje raz.
    if (existuju.has(k) || videne.has(k)) duplicity.add(i);
    videne.add(k);
  });
  const parovanie = priradSkeny(zaznamy, skeny);
  const sparovane = new Set(parovanie.values());
  const skenyBezParu = skeny.map((_, j) => j).filter((j) => !sparovane.has(j));
  return { zaznamy, skeny, parovanie, duplicity, skenyBezParu, poznamky };
}

export function suhrnPlanu(p: Plan) {
  const nove = p.zaznamy.filter((_, i) => !p.duplicity.has(i));
  return {
    faktury: nove.filter((z) => z.typ === "faktura").length,
    blocky: nove.filter((z) => z.typ === "blocek").length,
    duplicity: p.duplicity.size,
    skenyPriradene: [...p.parovanie.keys()].filter((i) => !p.duplicity.has(i)).length,
    skenyBezParu: p.skenyBezParu.length,
    poznamky: p.poznamky.slice(0, 30),
    ukazka: p.zaznamy.slice(0, 15).map((z, i) => ({
      typ: z.typ,
      cislo: z.cislo,
      dodavatel: z.dodavatel,
      vystavenie: z.vystavenie,
      spolu: z.spolu,
      mena: z.mena,
      duplicita: p.duplicity.has(i),
      sken: p.parovanie.has(i) ? p.skeny[p.parovanie.get(i)!]!.meno : null,
    })),
  };
}

type Zapisany = { tabulka: "purchase_invoices" | "expense_documents"; id: string; zaznam: PrijatyZaznam; maSubor: boolean };

async function nahrajSubor(klient: any, kbelik: string, companyId: string, sken: Vstup) {
  const mime = mimeZMena(sken.meno);
  const pripona = sken.meno.toLowerCase().split(".").pop() ?? "pdf";
  const cesta = `${companyId}/${crypto.randomUUID()}.${pripona}`;
  const { error } = await klient.storage.from(kbelik).upload(cesta, sken.bajty, { contentType: mime, upsert: false });
  if (error) throw new Error(`súbor ${sken.meno}: ${error.message}`);
  return { cesta, mime, velkost: sken.bajty.length };
}

async function zapisZaznam(
  klient: any,
  o: { companyId: string; userId: string; stav: StavImportu; doPokladne: boolean; zdrojAplikacie: string; dnes: string },
  z: PrijatyZaznam,
  sken: Vstup | null,
): Promise<Zapisany> {
  if (z.typ === "faktura") {
    const subor = sken ? await nahrajSubor(klient, "purchase-invoices", o.companyId, sken) : null;
    const { data, error } = await klient
      .from("purchase_invoices")
      .insert({
        ...riadokPrijatejFaktury(z, o),
        company_id: o.companyId,
        created_by: o.userId,
        file_path: subor?.cesta ?? null,
        file_mime: subor?.mime ?? null,
        file_size: subor?.velkost ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { tabulka: "purchase_invoices", id: data.id, zaznam: z, maSubor: Boolean(subor) };
  }
  const subor = sken ? await nahrajSubor(klient, "expense-receipts", o.companyId, sken) : null;
  const { data, error } = await klient
    .from("expense_documents")
    .insert({
      ...riadokBlocku(z, o),
      company_id: o.companyId,
      created_by: o.userId,
      file_path: subor?.cesta ?? null,
      file_mime: subor?.mime ?? null,
      file_size: subor?.velkost ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { tabulka: "expense_documents", id: data.id, zaznam: z, maSubor: Boolean(subor) };
}

/**
 * Doklad z tohto importu, ku ktorému patrí sken prečítaný AI: rovnaké číslo,
 * alebo rovnaká suma aj dátum a ten istý dodávateľ. Tak sa sken priradí aj
 * vtedy, keď Doklado súbory nepomenuje číslom dokladu.
 */
function najdiParPreSken(zapisane: Zapisany[], z: PrijatyZaznam): Zapisany | null {
  const a = (t: unknown) => normalizuj(t).replace(/[^a-z0-9]/g, "");
  const kandidati = zapisane.filter((w) => !w.maSubor && w.zaznam.typ === z.typ);
  const podlaCisla = a(z.cislo).length >= 3 ? kandidati.filter((w) => a(w.zaznam.cislo) === a(z.cislo)) : [];
  if (podlaCisla.length === 1) return podlaCisla[0]!;
  const podlaSumy = kandidati.filter(
    (w) =>
      z.spolu != null &&
      w.zaznam.spolu != null &&
      Math.abs(w.zaznam.spolu - z.spolu) < 0.01 &&
      w.zaznam.vystavenie === z.vystavenie &&
      (a(w.zaznam.ico) && a(z.ico) ? a(w.zaznam.ico) === a(z.ico) : true),
  );
  return podlaSumy.length === 1 ? podlaSumy[0]! : null;
}

/** Celý import. Priebeh zapisuje do `import_jobs`, výsledok do `result`. */
export async function vykonajImport(args: {
  klient: any;
  jobId: string;
  companyId: string;
  userId: string;
  plan: Plan;
  stav: StavImportu;
  doPokladne: boolean;
  citatSkeny: boolean;
  zdrojAplikacie: string;
}) {
  const { klient, plan } = args;
  const o = {
    companyId: args.companyId,
    userId: args.userId,
    stav: args.stav,
    doPokladne: args.doPokladne,
    zdrojAplikacie: args.zdrojAplikacie,
    dnes: new Date().toISOString().slice(0, 10),
  };
  const vysledok = { faktury: 0, blocky: 0, ostatne: 0, skenyPriradene: 0, preskocene: 0, chyby: [] as string[] };
  const zapisane: Zapisany[] = [];
  let hotovo = 0;
  const priebeh = async (koniec = false) => {
    await klient
      .from("import_jobs")
      .update({
        processed_rows: hotovo,
        imported_invoices: vysledok.faktury + vysledok.blocky + vysledok.ostatne,
        failed_rows: vysledok.chyby.length,
        result: { ...vysledok, chyby: vysledok.chyby.slice(0, 50) },
        ...(koniec ? { status: "completed", completed_at: new Date().toISOString() } : {}),
      })
      .eq("id", args.jobId);
  };

  // 1. Doklady s presnými údajmi (XML, tabuľka) aj s priradenými skenmi.
  for (const [i, z] of plan.zaznamy.entries()) {
    if (plan.duplicity.has(i)) {
      vysledok.preskocene++;
    } else {
      try {
        const sken = plan.parovanie.has(i) ? plan.skeny[plan.parovanie.get(i)!]! : null;
        const w = await zapisZaznam(klient, o, z, sken);
        zapisane.push(w);
        if (z.typ === "faktura") vysledok.faktury++;
        else vysledok.blocky++;
        if (sken) vysledok.skenyPriradene++;
      } catch (e: any) {
        vysledok.chyby.push(`${z.cislo ?? z.dodavatel ?? "doklad"}: ${String(e?.message ?? e).slice(0, 120)}`);
      }
    }
    hotovo++;
    if (hotovo % 20 === 0) await priebeh();
  }
  await priebeh();

  // 2. Skeny bez páru prečíta AI — najprv sa skúsi priradiť k dokladu z importu.
  if (args.citatSkeny) {
    const { precitajDoklad } = await import("./mail-prijem.server");
    const { jeOstatnyZMailu, ostatnyZMailu, bezpecneMeno } = await import("./ostatne-doklady");
    const existuju = await existujuceKluce(klient, args.companyId);
    const naRade = [...plan.skenyBezParu];
    const pracovnik = async () => {
      while (naRade.length) {
        const j = naRade.shift()!;
        const sken = plan.skeny[j]!;
        try {
          /*
            Ten istý sken z predchádzajúceho importu. Ostatné doklady si pamätajú
            meno a veľkosť súboru, tak sa pozná ešte pred AI — opakovaný import
            by inak založil exekúciu či predpis druhý raz.
          */
          const { data: uzJe } = await klient
            .from("other_document_files")
            .select("id")
            .eq("company_id", args.companyId)
            .eq("name", sken.meno)
            .eq("size", sken.bajty.length)
            .limit(1);
          if (uzJe?.length) {
            vysledok.preskocene++;
            hotovo++;
            await priebeh();
            continue;
          }
          const mime = mimeZMena(sken.meno);
          const ai = await precitajDoklad(Buffer.from(sken.bajty).toString("base64"), mime);
          if (ai && jeOstatnyZMailu(ai)) {
            const id = crypto.randomUUID();
            const cesta = `${args.companyId}/${id}/${Date.now()}-${bezpecneMeno(sken.meno)}`;
            const up = await klient.storage.from("other-docs").upload(cesta, sken.bajty, { contentType: mime });
            if (up.error) throw new Error(up.error.message);
            const now = new Date().toISOString();
            const { error } = await klient.from("other_documents").insert({
              id,
              company_id: args.companyId,
              created_by: args.userId,
              ...ostatnyZMailu({ ai, odosielatel: null, predmet: null, nazovSuboru: sken.meno, dnes: o.dnes }),
              note: `Importované z ${args.zdrojAplikacie} (sken ${sken.meno}).`,
              status: args.stav,
              processed_at: args.stav === "new" ? null : now,
              exported_at: args.stav === "exported" ? now : null,
            });
            if (error) throw new Error(error.message);
            await klient.from("other_document_files").insert({
              document_id: id,
              company_id: args.companyId,
              path: cesta,
              name: sken.meno,
              mime,
              size: sken.bajty.length,
              position: 0,
            });
            vysledok.ostatne++;
          } else if (ai && (await import("./mail-prijem")).maPouzitelneUdaje(ai)) {
            const z = zaznamZAI(ai, sken.meno);
            if (!z.vystavenie) z.vystavenie = datumZTextu(ai.issue_date);
            const par = najdiParPreSken(zapisane, z);
            if (par) {
              const kbelik = par.tabulka === "purchase_invoices" ? "purchase-invoices" : "expense-receipts";
              const subor = await nahrajSubor(klient, kbelik, args.companyId, sken);
              await klient
                .from(par.tabulka)
                .update({ file_path: subor.cesta, file_mime: subor.mime, file_size: subor.velkost })
                .eq("id", par.id);
              par.maSubor = true;
              vysledok.skenyPriradene++;
            } else if (existuju.has(klucDuplicity(z))) {
              vysledok.preskocene++;
            } else {
              const w = await zapisZaznam(klient, o, z, sken);
              zapisane.push(w);
              existuju.add(klucDuplicity(z));
              if (z.typ === "faktura") vysledok.faktury++;
              else vysledok.blocky++;
            }
          } else {
            // Logo, podpis či prázdna strana — doklad z toho nerobíme.
            vysledok.chyby.push(`${sken.meno}: nevyzerá ako doklad, preskočené`);
          }
        } catch (e: any) {
          vysledok.chyby.push(`${sken.meno}: ${String(e?.message ?? e).slice(0, 120)}`);
        }
        hotovo++;
        await priebeh();
      }
    };
    // Tri naraz: rýchlejšie, a poskytovateľa AI to ešte nezahltí.
    await Promise.all([pracovnik(), pracovnik(), pracovnik()]);
  }
  await priebeh(true);
  return vysledok;
}
