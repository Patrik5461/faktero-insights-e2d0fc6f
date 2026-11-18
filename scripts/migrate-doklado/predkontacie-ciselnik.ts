/*
  Číselník predkontácií firiem prenesených z Doklada — návrh (dry-run + SQL).

    npx jiti scripts/migrate-doklado/predkontacie-ciselnik.ts [--vzorky 3] [--company <IČO>]
    npx jiti scripts/migrate-doklado/predkontacie-ciselnik.ts --cely-zoznam [--company <IČO>]

  Do databázy NEZAPISUJE nič. Číta Doklado (len čítacie cesty z doklado-klient.ts)
  a Faktero servisným kľúčom, vypíše plán po firmách a zapíše SQL:
    --sql <cesta>        INSERT nových položiek (predvolene /home/patrik/.claude/jobs/d7c5304b/tmp/predkontacie-ciselnik.sql)
    --sql-popisy <cesta> UPDATE popisu existujúcich položiek bez názvu (zvlášť, na schválenie)
    --json <cesta>       celý plán ako JSON (na kontrolu)

  Zdroj názvov:
    predvolene (vzorky)  pre každú firmu × kód × tabuľku sa cez /v2/documents/get stiahne
                         najviac N dokladov podľa `doklado_id` (1 jednotka API za doklad).
    --cely-zoznam        celý zoznam dokladov firmy cez /v2/documents (1 jednotka za doklad,
                         ~19 000 jednotiek pre všetky firmy) — zachytí aj kódy, ktoré sú
                         len na položkách, a všetky rozpory v názvoch.
    --aj-bez-prenosu [RRRR-MM-DD]  firmám spárovaným podľa IČO, ktoré ešte nemajú prenesené
                         doklady, stiahne zoznam dokladov z Doklada (predvolene od 2020-01-01)
    --cache <cesta>      použitia kódov podľa documentId; opakovaný beh Doklado znova nevolá
    --za-sekundu <n>     strop požiadaviek na Doklado (predvolene 2)

  Pravidlá:
    - kód = accountingItem.code (inak value — tak ako mapovanie.ts),
      názov = accountingItem.value; keď je názov = kód alebo chýba, použije sa najčastejší
      skutočný názov z iných dokladov; viac názvov → najčastejší, ostatné do „rozporov“.
    - jedna položka na firmu × kód × stranu (prijaté / vydané): Pohoda hľadá kód najprv
      v agende dokladu, potom v hocijakej agende tej istej strany (uctovanie-agenda.ts),
      takže viac riadkov s tým istým kódom na jednej strane by boli len duplicity.
      Agenda: prijatá faktúra → receivedInvoice (len zálohové → receivedAdvanceInvoice),
      len bločky → cashPaid, vydaná → issuedInvoice (len zálohové → issuedAdvanceInvoice).
    - účty MD/D z accountingItem.debitAccount/creditAccount, inak z kódu „501200 325100“.
    - duplicita: firma už má predkontáciu s tým istým kódom (bez ohľadu na veľkosť písmen
      a medzery na krajoch) v agende tej istej strany alebo v agende „všetky“ ('') → preskočí.
      Existujúca položka bez názvu (alebo názov = kód) → návrh UPDATE popisu zvlášť.
    - testovacie firmy (companies.testovacia_pre) sa preskočia. Nič sa nemaže.
*/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DokladoKlient, ChybaDoklada, iso, type DokladAleboFaktura } from "./doklado-klient";
import { druhDokladu, lenCislice } from "./mapovanie";

/* ---------------- voľby a prostredie ---------------- */

function volby(argv: string[]) {
  const o: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const dalsi = argv[i + 1];
    if (dalsi !== undefined && !dalsi.startsWith("--")) {
      o[a.slice(2)] = dalsi;
      i++;
    } else o[a.slice(2)] = true;
  }
  return {
    company: typeof o.company === "string" ? lenCislice(o.company) : null,
    celyZoznam: Boolean(o["cely-zoznam"]),
    /** Firmám bez prenesených dokladov stiahne zoznam dokladov od tohto dátumu (1 jednotka za doklad). */
    ajBezPrenosu:
      typeof o["aj-bez-prenosu"] === "string"
        ? o["aj-bez-prenosu"]
        : o["aj-bez-prenosu"]
          ? "2020-01-01"
          : null,
    vzorky: Math.max(1, Number(o.vzorky) || 3),
    zaSekundu: Number(o["za-sekundu"]) || 2,
    sql:
      typeof o.sql === "string"
        ? o.sql
        : "/home/patrik/.claude/jobs/d7c5304b/tmp/predkontacie-ciselnik.sql",
    sqlPopisy:
      typeof o["sql-popisy"] === "string"
        ? o["sql-popisy"]
        : "/home/patrik/.claude/jobs/d7c5304b/tmp/predkontacie-ciselnik-popisy.sql",
    json:
      typeof o.json === "string"
        ? o.json
        : "/home/patrik/.claude/jobs/d7c5304b/tmp/predkontacie-ciselnik.json",
    /** Použitia predkontácií podľa documentId — opakovaný beh už Doklado nevolá (len kódy, žiadne údaje partnerov). */
    cache:
      typeof o.cache === "string"
        ? o.cache
        : "/home/patrik/.claude/jobs/d7c5304b/tmp/predkontacie-doklado-cache.json",
  };
}

function prostredie() {
  let eco: Record<string, string> = {};
  try {
    eco = createRequire(import.meta.url)("/home/patrik/ecosystem.config.cjs").apps[0].env ?? {};
  } catch {
    /* mimo servera stačí prostredie */
  }
  const z = (k: string) => process.env[k] || eco[k] || "";
  return {
    doklado: z("DOKLADO_API_KEY"),
    url: z("SUPABASE_URL") || z("VITE_SUPABASE_URL"),
    sluzba: z("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

type Db = ReturnType<typeof createClient<any>>;

async function vsetko<T>(
  dotaz: (od: number, po: number) => PromiseLike<{ data: T[] | null; error: any }>,
) {
  const von: T[] = [];
  for (let od = 0; ; od += 1000) {
    const { data, error } = await dotaz(od, od + 999);
    if (error) throw new Error(error.message);
    von.push(...(data ?? []));
    if (!data || data.length < 1000) return von;
  }
}

/* ---------------- pomocné ---------------- */

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ") : null;
export const normKod = (k: string) => k.trim().replace(/\s+/g, " ").toLowerCase();

type Strana = "prijate" | "vydane";
const AGENDY_STRANY: Record<Strana, string[]> = {
  prijate: [
    "receivedInvoice",
    "receivedAdvanceInvoice",
    "cashPaid",
    "commitment",
    "internalDocument",
    "bankIssued",
  ],
  vydane: ["issuedInvoice", "issuedAdvanceInvoice", "claim", "cashReceived", "bankReceived"],
};
const stranaAgendy = (a: string): Strana | null =>
  AGENDY_STRANY.prijate.includes(a)
    ? "prijate"
    : AGENDY_STRANY.vydane.includes(a)
      ? "vydane"
      : null;

class Pocty {
  m = new Map<string, number>();
  pridaj(k: string | null | undefined, n = 1) {
    if (k == null) return;
    this.m.set(k, (this.m.get(k) ?? 0) + n);
  }
  zoradene() {
    return [...this.m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sk"));
  }
  najcastejsi() {
    return this.zoradene()[0]?.[0] ?? null;
  }
  get size() {
    return this.m.size;
  }
}

/** Čo sa o jednom kóde zistilo z Doklada (obe strany spolu). */
type Zber = {
  strany: Pocty; // prijate | vydane — počet použití
  bezKodu: number; // koľkokrát chýbal `code` a kód je názov (`value`)
  spisy: Pocty; // podoby kódu (veľkosť písmen)
  nazvy: Pocty; // skutočné názvy (≠ kód)
  agendy: Pocty;
  typy: Pocty; // faktura | blocek
  platby: Pocty; // hotovost | karta | prevod (len bločky)
  ucty: Pocty; // "MD|D"
  dokladov: number;
  naPolozkach: number;
};

type Pouzitie = {
  kod: string;
  nazov: string | null;
  md: string | null;
  d: string | null;
  strana: Strana;
  agenda: string;
  typ: "faktura" | "blocek";
  platba: string | null;
  polozka: boolean;
  /** Doklado nemalo `code` — kód je názov účtovnej položky. */
  bezKodu: boolean;
};

const PLATBA: Record<string, string> = { cash: "hotovost", card: "karta", transfer: "prevod" };

const jeUcet = (s: string) => /^\d{3,6}[A-Za-z0-9]{0,3}$/.test(s);

/** Použitia predkontácie na jednom doklade (hlavička aj položky). */
export function pouzitiaDokladu(d: DokladAleboFaktura): Pouzitie[] {
  const druh = druhDokladu(d);
  if (druh === "nezname") return [];
  const pod = String(d.subType ?? "");
  const zaloha = pod.includes("advance");
  const strana: Strana = druh === "vystavena" ? "vydane" : "prijate";
  const agenda =
    druh === "vystavena"
      ? zaloha
        ? "issuedAdvanceInvoice"
        : "issuedInvoice"
      : druh === "prijata"
        ? zaloha
          ? "receivedAdvanceInvoice"
          : "receivedInvoice"
        : "cashPaid";
  const typ = druh === "blocek" ? "blocek" : "faktura";
  const platba =
    druh === "blocek" ? (PLATBA[String((d as any).paymentType ?? "").toLowerCase()] ?? null) : null;
  const z = (a: any, polozka: boolean): Pouzitie | null => {
    const it = a?.accountingItem;
    if (!it) return null;
    const code = text(it.code);
    const value = text(it.value);
    const kod = code ?? value;
    if (!kod) return null;
    let md = text(it.debitAccount);
    let dd = text(it.creditAccount);
    if (!md && !dd) {
      const casti = kod.split(" ");
      if (casti.length === 2 && casti.every(jeUcet)) [md, dd] = [casti[0]!, casti[1]!];
    }
    return {
      kod,
      nazov: value && normKod(value) !== normKod(kod) ? value : null,
      md,
      d: dd,
      strana,
      agenda,
      typ,
      platba,
      polozka,
      bezKodu: !code,
    };
  };
  const von: Pouzitie[] = [];
  const h = z((d as any).accountingSettings, false);
  if (h) von.push(h);
  for (const p of ((d as any).items ?? []) as any[]) {
    const x = z(p?.accountingSettings, true);
    if (x) von.push(x);
  }
  return von;
}

function zluc(a: Zber, b: Zber): Zber {
  const p = (x: Pocty, y: Pocty) => {
    const z = new Pocty();
    for (const [k, n] of x.m) z.pridaj(k, n);
    for (const [k, n] of y.m) z.pridaj(k, n);
    return z;
  };
  return {
    strany: p(a.strany, b.strany),
    bezKodu: a.bezKodu + b.bezKodu,
    spisy: p(a.spisy, b.spisy),
    nazvy: p(a.nazvy, b.nazvy),
    agendy: p(a.agendy, b.agendy),
    typy: p(a.typy, b.typy),
    platby: p(a.platby, b.platby),
    ucty: p(a.ucty, b.ucty),
    dokladov: a.dokladov + b.dokladov,
    naPolozkach: a.naPolozkach + b.naPolozkach,
  };
}

/* ---------------- hlavný beh ---------------- */

type Firma = { id: string; name: string; ico: string; dokladov: number };

async function main() {
  const o = volby(process.argv.slice(2));
  const env = prostredie();
  if (!env.url || !env.sluzba)
    throw new Error("Chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY.");
  const db: Db = createClient<any>(env.url, env.sluzba, { auth: { persistSession: false } });
  const doklado = new DokladoKlient(env.doklado, {
    zaSekundu: o.zaSekundu,
    log: (r) => {
      if (/ (4\d\d|5\d\d) |čakám|sieť/.test(r)) console.log(r);
    },
  });

  /* firmy */
  const firmy = await vsetko<any>((od, po) =>
    db.from("companies").select("id, name, ico, testovacia_pre").order("id").range(od, po),
  );
  const tabulky = ["invoices", "purchase_invoices", "expense_documents"] as const;
  type RiadokDb = {
    id: string;
    company_id: string;
    doklado_id: string;
    pohoda_predkontacia: string | null;
    issue_date: string | null;
  };
  const riadky: Record<string, RiadokDb[]> = {};
  for (const t of tabulky) {
    riadky[t] = await vsetko<RiadokDb>((od, po) =>
      db
        .from(t)
        .select("id, company_id, doklado_id, pohoda_predkontacia, issue_date")
        .not("doklado_id", "is", null)
        .order("id")
        .range(od, po),
    );
  }
  const dokladovFirmy = new Pocty();
  for (const t of tabulky) for (const r of riadky[t]!) dokladovFirmy.pridaj(r.company_id);

  const organizacie = await doklado.organizacie();
  const icaDoklada = new Map<string, string>();
  for (const org of organizacie as any[]) {
    // `organizationId` je interné ID Doklada, IČO je `identificationNumber`.
    const ico = lenCislice(org.identificationNumber ?? org.organizationId);
    if (ico) icaDoklada.set(ico, String(org.name ?? org.organizationName ?? ""));
  }

  const vybrane: Firma[] = [];
  const preskoceneTest: string[] = [];
  for (const c of firmy) {
    const ico = lenCislice(c.ico);
    const n = dokladovFirmy.m.get(c.id) ?? 0;
    if (!n && !(ico && icaDoklada.has(ico))) continue;
    if (o.company && ico !== o.company) continue;
    if (c.testovacia_pre) {
      preskoceneTest.push(`${c.name} (${ico})`);
      continue;
    }
    vybrane.push({ id: c.id, name: c.name, ico, dokladov: n });
  }
  // Viac firiem s tým istým IČO bez dokladov z Doklada — tie sa nepočítajú.
  const sDokladmiIco = new Set(vybrane.filter((f) => f.dokladov).map((f) => f.ico));
  const firmyNaBeh = vybrane.filter((f) => f.dokladov || !sDokladmiIco.has(f.ico));
  firmyNaBeh.sort((a, b) => b.dokladov - a.dokladov);
  const icaFakteri = new Set(firmy.map((c: any) => lenCislice(c.ico)).filter(Boolean));
  const orgBezFirmy = [...icaDoklada.entries()]
    .filter(([ico]) => !icaFakteri.has(ico))
    .map(([ico, n]) => `${n} (${ico})`);
  const orgBezDokladov = firmyNaBeh.filter((f) => !f.dokladov).map((f) => `${f.name} (${f.ico})`);
  console.log(
    `Doklado organizácií: ${icaDoklada.size}, firiem na spracovanie: ${firmyNaBeh.length} (z toho bez prenesených dokladov ${orgBezDokladov.length}), organizácie Doklada bez firmy vo Fakteri: ${orgBezFirmy.length}`,
  );
  const cache: Record<string, Pouzitie[]> = existsSync(o.cache)
    ? JSON.parse(readFileSync(o.cache, "utf8"))
    : {};
  const ulozCache = () => {
    mkdirSync(dirname(o.cache), { recursive: true });
    writeFileSync(o.cache, JSON.stringify(cache));
  };

  /* existujúci číselník */
  const idFiriem = firmyNaBeh.map((f) => f.id);
  const existujuce: {
    id: string;
    company_id: string;
    kod: string;
    popis: string | null;
    agenda: string;
    zdroj: string;
    aktivne: boolean;
  }[] = [];
  for (let i = 0; i < idFiriem.length; i += 50) {
    existujuce.push(
      ...(await vsetko<any>((od, po) =>
        db
          .from("predkontacie")
          .select("id, company_id, kod, popis, agenda, zdroj, aktivne")
          .eq("druh", "predkontacia")
          .in("company_id", idFiriem.slice(i, i + 50))
          .order("id")
          .range(od, po),
      )),
    );
  }

  /* zber z Doklada */
  const vystup: any[] = [];
  const inserty: { riadok: string; poznamka: string }[] = [];
  const updaty: string[] = [];
  const spolu = { novych: 0, duplicit: 0, update: 0, rozporov: 0 };
  const bezKodov: string[] = [];
  const chyby: string[] = [];

  for (const f of firmyNaBeh) {
    const zber = new Map<string, Zber>();
    const kodyVDb = new Pocty();
    let stiahnutych = 0;
    const pridaj = (pouzitia: Pouzitie[]) => {
      stiahnutych++;
      for (const p of pouzitia) {
        const k = `${p.strana}|${normKod(p.kod)}`;
        let z = zber.get(k);
        if (!z) {
          z = {
            strany: new Pocty(),
            bezKodu: 0,
            spisy: new Pocty(),
            nazvy: new Pocty(),
            agendy: new Pocty(),
            typy: new Pocty(),
            platby: new Pocty(),
            ucty: new Pocty(),
            dokladov: 0,
            naPolozkach: 0,
          };
          zber.set(k, z);
        }
        z.strany.pridaj(p.strana);
        if (p.bezKodu) z.bezKodu++;
        z.spisy.pridaj(p.kod);
        z.nazvy.pridaj(p.nazov);
        z.agendy.pridaj(p.agenda);
        z.typy.pridaj(p.typ);
        z.platby.pridaj(p.platba);
        if (p.md || p.d) z.ucty.pridaj(`${p.md ?? ""}|${p.d ?? ""}`);
        if (p.polozka) z.naPolozkach++;
        else z.dokladov++;
      }
    };

    const mojeRiadky = tabulky.flatMap((t) =>
      riadky[t]!.filter((r) => r.company_id === f.id).map((r) => ({ ...r, t })),
    );
    for (const r of mojeRiadky) kodyVDb.pridaj(text(r.pohoda_predkontacia));

    try {
      if (!mojeRiadky.length && o.ajBezPrenosu) {
        for (const d of await doklado.doklady({
          ico: f.ico,
          od: new Date(`${o.ajBezPrenosu}T00:00:00Z`),
          do: new Date(),
        })) {
          const u = pouzitiaDokladu(d);
          if (d.documentId) cache[d.documentId] = u;
          pridaj(u);
        }
        ulozCache();
      } else if (o.celyZoznam) {
        const datumy = mojeRiadky
          .map((r) => r.issue_date)
          .filter(Boolean)
          .sort() as string[];
        if (datumy.length) {
          const od = new Date(`${datumy[0]}T00:00:00Z`);
          od.setUTCDate(od.getUTCDate() - 2);
          const po = new Date(`${datumy[datumy.length - 1]}T23:59:59Z`);
          po.setUTCDate(po.getUTCDate() + 2);
          for (const d of await doklado.doklady({ ico: f.ico, od, do: po })) {
            const u = pouzitiaDokladu(d);
            if (d.documentId) cache[d.documentId] = u;
            pridaj(u);
          }
          ulozCache();
        }
      } else {
        // Vzorky: pre každý kód a tabuľku najviac N dokladov (najnovšie).
        const skupiny = new Map<string, typeof mojeRiadky>();
        for (const r of mojeRiadky) {
          const k = text(r.pohoda_predkontacia);
          if (!k) continue;
          const kl = `${r.t}|${normKod(k)}`;
          (skupiny.get(kl) ?? skupiny.set(kl, []).get(kl)!).push(r);
        }
        for (const s of skupiny.values()) {
          s.sort((a, b) => String(b.issue_date).localeCompare(String(a.issue_date)));
          for (const r of s.slice(0, o.vzorky)) {
            try {
              let u = cache[r.doklado_id];
              if (!u) {
                const d = await doklado.detail(r.doklado_id);
                if (!d) continue;
                u = cache[r.doklado_id] = pouzitiaDokladu(d);
              }
              pridaj(u);
            } catch (e) {
              if (e instanceof ChybaDoklada && e.kod === "LIMIT") throw e;
              chyby.push(`${f.name}: doklad ${r.doklado_id} — ${(e as Error).message}`);
            }
          }
        }
        ulozCache();
      }
    } catch (e) {
      ulozCache();
      if (e instanceof ChybaDoklada && e.kod === "LIMIT") throw e;
      chyby.push(`${f.name}: ${(e as Error).message}`);
      continue;
    }

    /* plán firmy */
    const mojeExist = existujuce.filter((x) => x.company_id === f.id);
    const nove: any[] = [];
    const duplicity: any[] = [];
    const popisy: any[] = [];
    const rozpory: any[] = [];
    const bezNazvu: string[] = [];
    const obojstranne: any[] = [];
    /*
      Kód na oboch stranách: s rôznymi názvami („2“ = Tržby z predaja služieb
      vo vydaných, Nakúpené ostatné služby v prijatých) sú to dve rôzne
      predkontácie Pohody v dvoch agendách — ostanú dve. S rovnakým názvom alebo
      bez neho je to jedna položka omylom použitá aj na opačnej strane.
    */
    const polozky: Zber[] = [];
    const podlaKodu = new Map<string, Zber[]>();
    for (const [k, z] of zber) {
      const kod = k.slice(k.indexOf("|") + 1);
      (podlaKodu.get(kod) ?? podlaKodu.set(kod, []).get(kod)!).push(z);
    }
    for (const strany of podlaKodu.values()) {
      if (strany.length < 2) {
        polozky.push(strany[0]!);
        continue;
      }
      const [a, b] = strany as [Zber, Zber];
      const na = a.nazvy.najcastejsi();
      const nb = b.nazvy.najcastejsi();
      if (na && nb && normKod(na) !== normKod(nb)) polozky.push(a, b);
      else polozky.push(zluc(a, b));
    }
    for (const z of polozky) {
      const kod = z.spisy.najcastejsi()!;
      const nazovZDoklada = z.nazvy.najcastejsi();
      // Doklado bez `code`: kód je sám názov účtovnej položky („Kancelárske potreby“).
      const nazov = nazovZDoklada ?? (z.bezKodu > 0 || /\p{Ll}{3,}/u.test(kod) ? kod : null);
      if (z.nazvy.size > 1) rozpory.push({ kod, nazvy: z.nazvy.zoradene() });
      /*
        Jeden kód = jedna položka. Keď ho firma v Doklade dala aj na doklad
        opačnej strany (prijatý kód na vydanú faktúru), rozhodnú účty
        (MD 311… = vydané, MD 0…/5… = prijaté), inak väčšina dokladov.
      */
      const ucty = z.ucty.najcastejsi();
      const [md, d] = ucty ? ucty.split("|").map((x) => x || null) : [null, null];
      let strana: Strana = (z.strany.najcastejsi() as Strana) ?? "prijate";
      if (z.strany.size > 1) {
        if (md && /^311/.test(md)) strana = "vydane";
        else if (md && /^[05]/.test(md)) strana = "prijate";
        obojstranne.push({ kod, strany: z.strany.zoradene(), zvolena: strana });
      }
      const agendy = z.agendy
        .zoradene()
        .map(([a]) => a)
        .filter((a) => stranaAgendy(a) === strana);
      const agenda =
        strana === "vydane"
          ? agendy.every((a) => a === "issuedAdvanceInvoice")
            ? "issuedAdvanceInvoice"
            : "issuedInvoice"
          : agendy.includes("receivedInvoice")
            ? "receivedInvoice"
            : agendy.every((a) => a === "receivedAdvanceInvoice")
              ? "receivedAdvanceInvoice"
              : agendy.includes("receivedAdvanceInvoice")
                ? "receivedInvoice"
                : "cashPaid";
      const typy = z.typy.zoradene().map(([t]) => t);
      const typDokladu = strana === "vydane" ? null : typy.length === 1 ? typy[0]! : null;
      const typPlatby =
        typDokladu === "blocek" &&
        z.platby.size === 1 &&
        z.typy.m.get("blocek") === [...z.platby.m.values()][0]
          ? z.platby.najcastejsi()
          : null;
      const zaznam = {
        kod,
        popis: nazov,
        agenda,
        ucet_md: md ?? null,
        ucet_d: d ?? null,
        typ_dokladu: typDokladu,
        typ_platby: typPlatby,
        dokladov: z.dokladov,
        naPolozkach: z.naPolozkach,
      };
      if (kod.length > 30) {
        chyby.push(`${f.name}: kód „${kod}“ má viac ako 30 znakov — vynechaný`);
        continue;
      }
      if (!nazovZDoklada) bezNazvu.push(kod);
      const zhoda = mojeExist.filter(
        (x) =>
          normKod(x.kod) === normKod(kod) &&
          (x.agenda === "" ||
            x.agenda === agenda ||
            stranaAgendy(x.agenda) === strana ||
            stranaAgendy(x.agenda) === null ||
            z.strany.size > 1),
      );
      if (zhoda.length) {
        duplicity.push({
          ...zaznam,
          existuje: zhoda.map(
            (x) => `${x.kod} [${x.agenda || "všetky"}] ${x.popis ?? "—"} (${x.zdroj})`,
          ),
        });
        for (const x of zhoda) {
          const prazdny = !text(x.popis) || normKod(x.popis!) === normKod(x.kod);
          if (prazdny && nazov)
            popisy.push({ id: x.id, kod: x.kod, agenda: x.agenda, stary: x.popis, novy: nazov });
        }
        continue;
      }
      nove.push(zaznam);
    }
    nove.sort((a, b) => a.kod.localeCompare(b.kod, "sk"));

    // Kódy, ktoré má firma na dokladoch vo Fakteri, ale z Doklada sa k nim nič nezistilo.
    const zistene = new Set([...zber.values()].map((z) => normKod(z.spisy.najcastejsi()!)));
    const nezistene = kodyVDb.zoradene().filter(([k]) => !zistene.has(normKod(k)));

    for (const n of nove) {
      inserty.push({
        riadok: `  (${q(f.id)}::uuid, ${q(n.kod)}, ${q(n.popis)}, ${q(n.agenda)}, ${q(n.ucet_md)}, ${q(n.ucet_d)}, ${q(n.typ_dokladu)}, ${q(n.typ_platby)})`,
        poznamka: `${f.name} (${f.ico})`.replace(/[\r\n]+/g, " "),
      });
    }
    for (const p of popisy)
      updaty.push(
        `update public.predkontacie set popis = ${q(p.novy)}, updated_at = now() where id = ${q(p.id)}::uuid and (popis is null or btrim(popis) = '' or lower(btrim(popis)) = lower(btrim(kod))); -- ${f.name.replace(/[\r\n]+/g, " ")}: ${p.kod.replace(/[\r\n]+/g, " ")} [${p.agenda || "všetky"}]`,
      );
    spolu.novych += nove.length;
    spolu.duplicit += duplicity.length;
    spolu.update += popisy.length;
    spolu.rozporov += rozpory.length;
    if (!zber.size)
      bezKodov.push(
        `${f.name} (${f.ico}) — dokladov z Doklada ${f.dokladov}, s kódom vo Fakteri ${[...kodyVDb.m.values()].reduce((a, b) => a + b, 0)}`,
      );

    const r = {
      firma: f.name,
      ico: f.ico,
      company_id: f.id,
      dokladovVoFakteri: f.dokladov,
      stiahnutych,
      nove,
      duplicity,
      popisy,
      rozpory,
      bezNazvu,
      nezistene,
      obojstranne,
    };
    vystup.push(r);
    console.log(
      `${f.name} (${f.ico}): stiahnutých ${stiahnutych}, nových ${nove.length}, duplicít ${duplicity.length}, popis na doplnenie ${popisy.length}, rozporov ${rozpory.length}${bezNazvu.length ? `, bez názvu: ${bezNazvu.join(", ")}` : ""}${nezistene.length ? `, nezistené z Doklada: ${nezistene.map(([k, n]) => `${k}×${n}`).join(", ")}` : ""}`,
    );
    for (const n of nove.slice(0, 6))
      console.log(
        `    + ${n.kod} — ${n.popis ?? "(bez názvu)"} [${n.agenda}${n.typ_dokladu ? `, ${n.typ_dokladu}` : ""}${n.ucet_md || n.ucet_d ? `, ${n.ucet_md ?? "—"}/${n.ucet_d ?? "—"}` : ""}]`,
      );
    for (const x of obojstranne)
      console.log(
        `    ~ ${x.kod}: na oboch stranách ${x.strany.map(([s, c]: [string, number]) => `${s}×${c}`).join(", ")} → ${x.zvolena}`,
      );
    for (const x of rozpory)
      console.log(
        `    ! ${x.kod}: ${x.nazvy.map(([n, c]: [string, number]) => `„${n}“×${c}`).join(", ")}`,
      );
  }

  /* SQL */
  const hlavicka = `-- Číselník predkontácií z Doklada — vygenerované ${new Date().toISOString()} (${o.celyZoznam ? "celý zoznam" : `vzorky ${o.vzorky}/kód`})
-- Nové položky: ${spolu.novych}. Duplicity sa preskočia aj pri spustení (NOT EXISTS + ON CONFLICT).
-- Projekt sywcjxydnljkzoepfcaz. Nič nemaže.
`;
  const sql = `${hlavicka}
begin;

insert into public.predkontacie
  (company_id, druh, kod, popis, agenda, ucet_md, ucet_d, zdroj, aktivne, druhy_dokladov, typ_dokladu, typ_platby)
select v.company_id, 'predkontacia', v.kod, v.popis, v.agenda, v.ucet_md, v.ucet_d, 'subor', true, '{}'::text[], v.typ_dokladu, v.typ_platby
from (values
${inserty.map((r, i) => `${r.riadok}${i < inserty.length - 1 ? "," : ""} -- ${r.poznamka}`).join("\n")}
) as v(company_id, kod, popis, agenda, ucet_md, ucet_d, typ_dokladu, typ_platby)
where not exists (
  select 1 from public.predkontacie p
  where p.company_id = v.company_id
    and p.druh = 'predkontacia'
    and lower(btrim(p.kod)) = lower(btrim(v.kod))
    and (
      p.agenda = v.agenda
      or btrim(p.agenda) = ''
      or (p.agenda = any (array[${AGENDY_STRANY.prijate.map(q).join(", ")}]) and v.agenda = any (array[${AGENDY_STRANY.prijate.map(q).join(", ")}]))
      or (p.agenda = any (array[${AGENDY_STRANY.vydane.map(q).join(", ")}]) and v.agenda = any (array[${AGENDY_STRANY.vydane.map(q).join(", ")}]))
      or not (p.agenda = any (array[${[...AGENDY_STRANY.prijate, ...AGENDY_STRANY.vydane].map(q).join(", ")}]))
    )
)
on conflict (company_id, druh, kod, agenda) do nothing;

commit;
`;
  mkdirSync(dirname(o.sql), { recursive: true });
  if (inserty.length) writeFileSync(o.sql, sql);
  else writeFileSync(o.sql, `${hlavicka}-- nič na vloženie\n`);
  writeFileSync(
    o.sqlPopisy,
    `-- Doplnenie popisu existujúcich predkontácií bez názvu (návrh, ${updaty.length} riadkov) — spustiť len po schválení.\nbegin;\n${updaty.join("\n")}\ncommit;\n`,
  );
  writeFileSync(
    o.json,
    JSON.stringify(
      { spolu, bezKodov, preskoceneTest, chyby, orgBezFirmy, orgBezDokladov, firmy: vystup },
      null,
      2,
    ),
  );

  console.log("\n=== Spolu ===");
  console.log(
    `firiem: ${firmyNaBeh.length}, nových položiek: ${spolu.novych}, preskočené duplicity: ${spolu.duplicit}, popis na doplnenie: ${spolu.update}, kódy s viacerými názvami: ${spolu.rozporov}`,
  );
  console.log(`volaní Doklada: ${doklado.volani}`);
  if (bezKodov.length) console.log(`firmy bez kódov:\n  ${bezKodov.join("\n  ")}`);
  if (orgBezFirmy.length)
    console.log(`organizácie Doklada bez firmy vo Fakteri:\n  ${orgBezFirmy.join("\n  ")}`);
  if (preskoceneTest.length) console.log(`testovacie (preskočené): ${preskoceneTest.join(", ")}`);
  if (chyby.length) console.log(`chyby:\n  ${chyby.join("\n  ")}`);
  console.log(`SQL: ${o.sql}\nSQL popisy: ${o.sqlPopisy}\nJSON: ${o.json}`);
  void iso;
}

function q(v: string | null | undefined): string {
  if (v == null) return "null";
  return `'${String(v).replace(/'/g, "''")}'`;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
