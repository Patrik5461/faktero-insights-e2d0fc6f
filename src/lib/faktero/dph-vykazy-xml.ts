/**
 * XML pre elektronickú podateľňu finančnej správy.
 *
 * Tvar sa drží oficiálnych schém, ktoré sú uložené vedľa v `schemy/`
 * (`dph2021.xsd`, `kv_dph_2025.xsd`, `svdph20.xsd`) — testy proti nim výstup
 * overujú, rovnako ako pri ISDOC-u. Podateľňa odmietne súbor, ktorý schéme
 * nesedí, takže „skoro správne" XML je horšie než žiadne.
 */

import { centy, type KontrolnyVykaz, type Obdobie, type SuhrnnyVykaz } from "./dph-vykazy";

export type UdajeFirmy = {
  icDph: string;
  dic: string;
  nazov: string;
  ulica?: string | null;
  cislo?: string | null;
  psc?: string | null;
  obec?: string | null;
  stat?: string | null;
  tel?: string | null;
  email?: string | null;
  /** Názov daňového úradu, napr. „Bratislava". */
  danovyUrad?: string | null;
  /** Kto výkaz podáva — meno a priezvisko. */
  konatel?: string | null;
};

/** Riadny, opravný alebo dodatočný výkaz. */
export type TypVykazu = "R" | "O" | "D";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function suma(n: number | null | undefined): string {
  return centy(Number(n ?? 0)).toFixed(2);
}

/** IČ DPH bez medzier a veľkými písmenami; podateľňa iné nezoberie. */
export function upravIcDph(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/[\s.-]/g, "")
    .toUpperCase();
}

/**
 * Slovenské IČ DPH bez predpony SK — tlačivo priznania a súhrnného výkazu má
 * kód štátu vo vlastnom poli.
 */
function skCislo(icDph: string): string {
  const s = upravIcDph(icDph);
  return s.startsWith("SK") ? s.slice(2) : s;
}

/**
 * Slovenské IČ DPH aj s predponou — kontrolný výkaz ho chce celé (`SK` a desať
 * číslic) a bez nej podateľňa súbor odmietne.
 */
function sPredponou(icDph: string | null | undefined): string {
  const s = upravIcDph(icDph);
  if (!s) return "";
  return /^\d{10}$/.test(s) ? `SK${s}` : s;
}

function obdobieKv(o: Obdobie): string {
  const vnutro = o.stvrtrok ? `<Stvrtrok>${o.stvrtrok}</Stvrtrok>` : `<Mesiac>${o.mesiac}</Mesiac>`;
  return `<Obdobie><Rok>${o.rok}</Rok>${vnutro}</Obdobie>`;
}

function atr(nazov: string, hodnota: string | number | undefined | null): string {
  if (hodnota === undefined || hodnota === null || hodnota === "") return "";
  return ` ${nazov}="${esc(hodnota)}"`;
}

// ── Kontrolný výkaz ───────────────────────────────────────────────────────

export function kvNaXml(
  vykaz: KontrolnyVykaz,
  firma: UdajeFirmy,
  obdobie: Obdobie,
  typ: TypVykazu = "R",
): string {
  const riadky: string[] = [];

  for (const a of vykaz.a1) {
    riadky.push(
      `<A1${atr("Odb", sPredponou(a.odb) || null)} F="${esc(a.f)}" Den="${esc(a.den)}" Z="${suma(a.z)}" D="${suma(a.d)}" S="${a.s}"/>`,
    );
  }
  for (const a of vykaz.a2) {
    riadky.push(
      `<A2 Odb="${esc(sPredponou(a.odb))}" F="${esc(a.f)}" Den="${esc(a.den)}" Z="${suma(a.z)}"/>`,
    );
  }
  for (const b of vykaz.b1) {
    riadky.push(
      `<B1${atr("Dod", sPredponou(b.dod) || null)} F="${esc(b.f)}" Den="${esc(b.den)}" Z="${suma(b.z)}" D="${suma(b.d)}" S="${b.s}" O="${suma(b.o)}"/>`,
    );
  }
  for (const b of vykaz.b2) {
    riadky.push(
      `<B2 Dod="${esc(sPredponou(b.dod))}" F="${esc(b.f)}" Den="${esc(b.den)}" Z="${suma(b.z)}" D="${suma(b.d)}" S="${b.s}" O="${suma(b.o)}"/>`,
    );
  }
  if (vykaz.b31) {
    riadky.push(
      `<B31 Z="${suma(vykaz.b31.z)}" D="${suma(vykaz.b31.d)}" O="${suma(vykaz.b31.o)}"/>`,
    );
  }
  for (const b of vykaz.b32) {
    riadky.push(
      `<B32 Dod="${esc(sPredponou(b.dod))}" Z="${suma(b.z)}" D="${suma(b.d)}" O="${suma(b.o)}"/>`,
    );
  }
  for (const c of vykaz.c1) {
    riadky.push(
      `<C1${atr("Odb", sPredponou(c.odb) || null)} FO="${esc(c.fo)}" FP="${esc(c.fp)}" ZR="${suma(c.zr)}" DR="${suma(c.dr)}" S="${c.s}"/>`,
    );
  }
  for (const c of vykaz.c2) {
    riadky.push(
      `<C2${atr("Dod", sPredponou(c.dod) || null)} FO="${esc(c.fo)}" FP="${esc(c.fp)}" ZR="${suma(c.zr)}" DR="${suma(c.dr)}" S="${c.s}" OR="${suma(c.or)}"/>`,
    );
  }

  const ns = "https://ekr.financnasprava.sk/Formulare/XSD/kv_dph_2025.xsd";
  return `<?xml version="1.0" encoding="UTF-8"?>
<KVDPH_2025 xmlns="${ns}">
  <Identifikacia>
    <IcDphPlatitela>${esc(sPredponou(firma.icDph))}</IcDphPlatitela>
    <Druh>${typ}</Druh>
    ${obdobieKv(obdobie)}
    <Nazov>${esc(firma.nazov)}</Nazov>
    <Stat>${esc(firma.stat || "Slovensko")}</Stat>
    <Obec>${esc(firma.obec ?? "")}</Obec>
    <PSC>${esc((firma.psc ?? "").replace(/\s/g, ""))}</PSC>
    <Ulica>${esc(firma.ulica ?? "")}</Ulica>
    <Cislo>${esc(firma.cislo ?? "")}</Cislo>
    <Tel>${esc(firma.tel ?? "")}</Tel>
    <Email>${esc(firma.email ?? "")}</Email>
  </Identifikacia>
  <Transakcie>
${riadky.map((r) => `    ${r}`).join("\n")}
  </Transakcie>
</KVDPH_2025>`;
}

// ── Priznanie k DPH ───────────────────────────────────────────────────────

/** Riadky priznania, ktoré idú do XML. Prázdny riadok sa posiela ako prázdny. */
export const RIADKY_PRIZNANIA = Array.from(
  { length: 37 },
  (_, i) => `r${String(i + 1).padStart(2, "0")}`,
);

function den(datum: string): string {
  // Schéma chce dd.mm.rrrr, nie ISO.
  const [r, m, d] = String(datum).split("-");
  return `${Number(d)}.${Number(m)}.${r}`;
}

export function priznanieNaXml(
  hodnoty: Record<string, number>,
  firma: UdajeFirmy,
  obdobie: Obdobie,
  nastavenie: {
    typ?: TypVykazu;
    /** Dátum vyhlásenia; predvolene dnešok. */
    datum?: string;
    /** Platiteľ podľa § 4, alebo osoba registrovaná podľa § 7/§ 7a. */
    registrovanaOsoba?: boolean;
    /** Zaškrtnutie „nevznikla daňová povinnosť". */
    nevzniklaPovinnost?: boolean;
  } = {},
): string {
  const typ = nastavenie.typ ?? "R";
  const datum = nastavenie.datum ?? new Date().toISOString().slice(0, 10);
  const menoRiadky = rozdelNaRiadky(firma.nazov, 4);
  const telo = RIADKY_PRIZNANIA.map((kluc) => {
    const v = hodnoty[kluc];
    return `    <${kluc}>${v === undefined || v === 0 ? "" : suma(v)}</${kluc}>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<dokument>
  <hlavicka>
    <identifikacneCislo>
      <kodStatu>SK</kodStatu>
      <cislo>${esc(skCislo(firma.icDph))}</cislo>
    </identifikacneCislo>
    <dic>${esc(firma.dic)}</dic>
    <danovyUrad>${esc(firma.danovyUrad ?? "")}</danovyUrad>
    <nevzniklaPov>${nastavenie.nevzniklaPovinnost ? "true" : ""}</nevzniklaPov>
    <typDP>
      <rdp>${typ === "R" ? "true" : ""}</rdp>
      <odp>${typ === "O" ? "true" : ""}</odp>
      <ddp>${typ === "D" ? "true" : ""}</ddp>
      <datumZisteniaDdp></datumZisteniaDdp>
    </typDP>
    <osoba>
      <platitel>${nastavenie.registrovanaOsoba ? "" : "true"}</platitel>
      <registrovana>${nastavenie.registrovanaOsoba ? "true" : ""}</registrovana>
      <inaPovinna></inaPovinna>
      <zdanitelna></zdanitelna>
      <zastupca></zastupca>
      <zastupca69aa></zastupca69aa>
    </osoba>
    <zdanObd>
      <mesiac>${obdobie.mesiac ? String(obdobie.mesiac).padStart(2, "0") : ""}</mesiac>
      <stvrtrok>${obdobie.stvrtrok ?? ""}</stvrtrok>
      <rok>${obdobie.rok}</rok>
    </zdanObd>
    <meno>
${menoRiadky.map((r) => `      <riadok>${esc(r)}</riadok>`).join("\n")}
    </meno>
    <adresa>
      <ulica>${esc(firma.ulica ?? "")}</ulica>
      <cislo>${esc(firma.cislo ?? "")}</cislo>
      <psc>${esc((firma.psc ?? "").replace(/\s/g, ""))}</psc>
      <obec>${esc(firma.obec ?? "")}</obec>
      <telefon>${esc(firma.tel ?? "")}</telefon>
      <email>${esc(firma.email ?? "")}</email>
    </adresa>
    <opravnenaOsoba>
      <menoPriezvisko>${esc(firma.konatel ?? "")}</menoPriezvisko>
      <telefon>${esc(firma.tel ?? "")}</telefon>
      <email>${esc(firma.email ?? "")}</email>
    </opravnenaOsoba>
    <datumVyhlasenia>${den(datum)}</datumVyhlasenia>
  </hlavicka>
  <telo>
${telo}
  </telo>
</dokument>`;
}

/** Názov firmy sa do tlačiva vpisuje po riadkoch s pevným počtom znakov. */
export function rozdelNaRiadky(text: string, pocet: number, sirka = 35): string[] {
  const slova = String(text ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const riadky: string[] = [];
  let aktualny = "";
  for (const s of slova) {
    if (!aktualny) aktualny = s;
    else if ((aktualny + " " + s).length <= sirka) aktualny += " " + s;
    else {
      riadky.push(aktualny);
      aktualny = s;
    }
  }
  if (aktualny) riadky.push(aktualny);
  while (riadky.length < pocet) riadky.push("");
  return riadky.slice(0, pocet);
}

// ── Súhrnný výkaz ─────────────────────────────────────────────────────────

const ZAZNAMOV_NA_STRANE = 12;

export function svNaXml(
  vykaz: SuhrnnyVykaz,
  firma: UdajeFirmy,
  obdobie: Obdobie,
  nastavenie: { typ?: TypVykazu; datum?: string } = {},
): string {
  const typ = nastavenie.typ ?? "R";
  const datum = nastavenie.datum ?? new Date().toISOString().slice(0, 10);
  const [rok, mesiac, denCislo] = datum.split("-");
  const menoRiadky = rozdelNaRiadky(firma.nazov, 4);

  // Schéma chce na strane vždy dvanásť záznamov; nevyplnené sa posielajú prázdne.
  const pocetStran = Math.max(1, Math.ceil(vykaz.riadky.length / ZAZNAMOV_NA_STRANE));
  const strany: string[] = [];
  for (let i = 0; i < pocetStran; i++) {
    const kusy = vykaz.riadky.slice(i * ZAZNAMOV_NA_STRANE, (i + 1) * ZAZNAMOV_NA_STRANE);
    const zaznamy = Array.from({ length: ZAZNAMOV_NA_STRANE }, (_, j) => {
      const r = kusy[j];
      return `      <zaznam><kodStatu>${esc(r?.kodStatu ?? "")}</kodStatu><idCislo>${esc(r?.idCislo ?? "")}</idCislo><hodnota>${r ? suma(r.hodnota) : ""}</hodnota><kod>${esc(r?.kod ?? "")}</kod></zaznam>`;
    }).join("\n");
    const cast2 = Array.from(
      { length: ZAZNAMOV_NA_STRANE },
      () =>
        `      <zaznamCast2><kodStatu></kodStatu><idCislo></idCislo><idCislo2></idCislo2><vratenieTovaru></vratenieTovaru><oprava></oprava></zaznamCast2>`,
    ).join("\n");
    strany.push(`    <strana>\n${zaznamy}\n${cast2}\n    </strana>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<dokument>
  <hlavicka>
    <identifikacneCislo>
      <kodStatu>SK</kodStatu>
      <dic>${esc(skCislo(firma.icDph))}</dic>
    </identifikacneCislo>
    <danovyUrad>${esc(firma.danovyUrad ?? "")}</danovyUrad>
    <druhSV>
      <riadny>${typ === "R" ? "true" : ""}</riadny>
      <opravny>${typ === "O" ? "true" : ""}</opravny>
      <dodatocny>${typ === "D" ? "true" : ""}</dodatocny>
    </druhSV>
    <obdobie>
      <mesiac>${obdobie.mesiac ? String(obdobie.mesiac).padStart(2, "0") : ""}</mesiac>
      <stvrtrok>${obdobie.stvrtrok ?? ""}</stvrtrok>
      <rok>${obdobie.rok}</rok>
    </obdobie>
    <obchodneMeno>
${menoRiadky.map((r) => `      <riadok>${esc(r)}</riadok>`).join("\n")}
    </obchodneMeno>
    <adresa>
      <ulica>${esc(firma.ulica ?? "")}</ulica>
      <cislo>${esc(firma.cislo ?? "")}</cislo>
      <psc>${esc((firma.psc ?? "").replace(/\s/g, ""))}</psc>
      <obec>${esc(firma.obec ?? "")}</obec>
      <tel>${esc(firma.tel ?? "")}</tel>
      <email>${esc(firma.email ?? "")}</email>
    </adresa>
    <celkovaHodnota>${suma(vykaz.celkom)}</celkovaHodnota>
    <konatel>${esc(firma.konatel ?? "")}</konatel>
    <konatelTel>${esc(firma.tel ?? "")}</konatelTel>
    <konatelEmail>${esc(firma.email ?? "")}</konatelEmail>
    <datumVyhlasenia>
      <den>${Number(denCislo)}</den>
      <mesiac>${Number(mesiac)}</mesiac>
      <rok>${rok}</rok>
    </datumVyhlasenia>
  </hlavicka>
  <telo>
${strany.join("\n")}
  </telo>
</dokument>`;
}
