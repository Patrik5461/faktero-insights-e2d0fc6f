/**
 * Odpoveď Pohody na XML import (`rsp:responsePack`) — čistá časť.
 *
 * Štruktúra podľa response.xsd a documentresponse.xsd (Stormware, version_2):
 *  - `responsePack@state` = ok | error (celý balík; pri chybe prihlásenia či
 *    práv nemusí byť ani jedna položka) a `@note` s dôvodom;
 *  - `responsePackItem@id` = `dataPackItem@id` z dávky, `@state` ok | error;
 *    vnútri buď odpoveď agendy (`inv:invoiceResponse`…), alebo `rsp:errorDetail`
 *    (kontrola duplicity dávky: `recordDuplicity`);
 *  - odpoveď agendy: `rdc:importDetails/rdc:detail` (state ok|warning|error,
 *    errno, note, XPath, valueRequested, valueProduced) a
 *    `rdc:producedDetails` (id, number — číslo, ktoré doklad dostal).
 *
 * Upozornenie (warning) je len v detailoch — položka ostáva `ok`. Predtým sa
 * upozornenia zahadzovali (napr. 603 „hodnota bola upravená“ pri dátume či
 * sadzbe), hoci práve tie hovoria, že Pohoda doklad zapísala inak, než prišiel.
 *
 * Kódy chýb: https://www.stormware.cz/pohoda/xml/podrobnosti/
 */

export type DetailOdpovede = {
  stav: "ok" | "warning" | "error";
  errno: number | null;
  poznamka: string;
  xpath: string | null;
  pozadovane: string | null;
  vytvorene: string | null;
};

export type VysledokDokladu = {
  id: string;
  stav: "ok" | "warning" | "error";
  cislo: string | null;
  poznamka: string | null;
  /** Agenda odpovede (invoiceResponse → invoice). */
  agenda?: string | null;
  detaily?: DetailOdpovede[];
  /**
   * Pohoda tú istú položku dávky už raz importovala (kontrola duplicity dávok,
   * `recordDuplicity`) — doklad v nej je, nie je čo opakovať. Bez tohto by sa
   * odmietnutý doklad vracal do fronty a chodil by donekonečna.
   */
  duplicita?: boolean;
};

export type OdpovedPohody = {
  stav: "ok" | "error" | null;
  poznamka: string | null;
  programVersion: string | null;
  ico: string | null;
  polozky: VysledokDokladu[];
};

/** Kódy chýb a upozornení Pohody a čo s nimi urobiť (po slovensky pre používateľa). */
export const KODY_POHODY: Record<number, string> = {
  101: "Používateľ nemá v Pohode právo zapisovať do tejto agendy.",
  102: "Doklad patrí do obdobia po dátovej uzávierke v Pohode.",
  103: "Obdobie dokladu je v Pohode uzamknuté.",
  104: "Pohoda doklad nevedela uložiť — pozrite poznámku a skontrolujte povinné údaje.",
  105: "Položku dokladu sa nepodarilo vytvoriť.",
  106: "Položku dokladu sa nepodarilo uložiť.",
  108: "Neznáma hodnota — skratka (predkontácia, členenie DPH, účet, stredisko…) v Pohode neexistuje.",
  109: "Doklad s týmto číslom už v Pohode je (duplicita čísla).",
  110: "Číselný rad v Pohode neexistuje.",
  111: "Mena bankového účtu nesedí s menou dokladu.",
  113: "Neznáma verzia XML.",
  551: "Balík sa nedal spracovať.",
  552: "Balík sa nedal spracovať.",
  553: "IČO v dávke nesedí s účtovnou jednotkou v Pohode.",
  554: "Prihlásenie do Pohody zlyhalo (meno alebo heslo v konektore).",
  555: "Používateľ nemá v Pohode právo na import XML.",
  556: "Balík sa nedal spracovať.",
  557: "Balík sa nedal spracovať.",
  601: "Neznáma hodnota — Pohoda ju vynechala.",
  602: "Hodnota sa pri tomto doklade nepoužíva — Pohoda ju vynechala.",
  603: "Pohoda hodnotu upravila — skontrolujte doklad v Pohode.",
  604: "Záznam s týmto ID sa v Pohode nenašiel.",
  605: "Mena sa nepoužíva.",
  606: "Dátum je mimo účtovného obdobia.",
  607: "Pohoda vytvorila duplicitnú hodnotu (napr. upravené číslo dokladu).",
  608: "Zásoba nie je na sklade.",
  609: "Nesprávne číslo účtu.",
};

function atribut(znacka: string, nazov: string): string | null {
  const m = znacka.match(new RegExp(`\\b${nazov}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1]! : null;
}

const MENO = "(?:[A-Za-z0-9_.-]+:)?";

function vsetky(xml: string, nazov: string): { atr: string; telo: string }[] {
  const re = new RegExp(`<${MENO}${nazov}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${MENO}${nazov}>)`, "gi");
  const von: { atr: string; telo: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) von.push({ atr: m[1] ?? "", telo: m[2] ?? "" });
  return von;
}

function vnutro(xml: string, nazov: string): string | null {
  return vsetky(xml, nazov)[0]?.telo ?? null;
}

export function bezZnaciek(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function text(xml: string, nazov: string): string | null {
  const v = vnutro(xml, nazov);
  return v == null ? null : bezZnaciek(v) || null;
}

function detaily(telo: string): DetailOdpovede[] {
  const blok = vnutro(telo, "importDetails");
  if (!blok) return [];
  return vsetky(blok, "detail").map(({ telo: d }) => {
    const s = (text(d, "state") ?? "").toLowerCase();
    const errno = Number(text(d, "errno"));
    return {
      stav: s === "error" ? "error" : s === "warning" ? "warning" : "ok",
      errno: Number.isFinite(errno) && text(d, "errno") ? errno : null,
      poznamka: text(d, "note") ?? "",
      xpath: text(d, "XPath"),
      pozadovane: text(d, "valueRequested"),
      vytvorene: text(d, "valueProduced"),
    } satisfies DetailOdpovede;
  });
}

/** Jedna veta o detaile: kód, vysvetlenie, pole a hodnoty. */
export function popisDetailu(d: DetailOdpovede): string {
  const pole = d.xpath ? d.xpath.replace(/^.*\/(?=[^/]+$)/, "").replace(/^\w+:/, "") : null;
  const vysvetlenie = d.errno != null ? KODY_POHODY[d.errno] : null;
  const hodnoty =
    d.pozadovane != null || d.vytvorene != null
      ? ` (${d.pozadovane ?? "—"} → ${d.vytvorene ?? "—"})`
      : "";
  return [
    d.errno != null ? `[${d.errno}]` : null,
    pole ? `${pole}:` : null,
    d.poznamka || vysvetlenie || "bez popisu",
    d.poznamka && vysvetlenie && !d.poznamka.includes(vysvetlenie) ? `— ${vysvetlenie}` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .concat(hodnoty);
}

/**
 * Detaily s rovnakým kódom a textom v jednej vete (Pohoda posiela 603 „hodnota
 * bola upravená“ za každé pole zvlášť) — inak by sa podstatné stratilo za
 * opakovaním.
 */
function zlucDetaily(det: DetailOdpovede[]): string {
  const skupiny = new Map<string, DetailOdpovede[]>();
  for (const d of det) {
    const k = `${d.errno ?? ""}|${d.poznamka}`;
    skupiny.set(k, [...(skupiny.get(k) ?? []), d]);
  }
  return [...skupiny.values()]
    .map((g) =>
      g.length === 1
        ? popisDetailu(g[0]!)
        : `${popisDetailu({ ...g[0]!, xpath: null, pozadovane: null, vytvorene: null })}: ${g
            .map((d) => {
              const pole = d.xpath
                ? d.xpath.replace(/^.*\/(?=[^/]+$)/, "").replace(/^\w+:/, "")
                : "?";
              return d.vytvorene != null ? `${pole} → ${d.vytvorene}` : pole;
            })
            .join(", ")}`,
    )
    .join(" · ");
}

/** Celá odpoveď: stav balíka a výsledok každej položky dávky. */
export function rozoberBalikOdpovede(xml: string): OdpovedPohody {
  const koren = /<(?:[A-Za-z0-9_.-]+:)?responsePack\b([^>]*)>/i.exec(xml);
  const atr = koren?.[1] ?? "";
  const stavBaliku = (atribut(atr, "state") ?? "").toLowerCase();
  const polozky: VysledokDokladu[] = [];
  const re = new RegExp(
    `<${MENO}responsePackItem\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${MENO}responsePackItem>)`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const id = atribut(m[1] ?? "", "id");
    if (!id) continue;
    const telo = m[2] ?? "";
    const stavAtr = (atribut(m[1] ?? "", "state") ?? "").toLowerCase();
    const agenda = /<(?:[A-Za-z0-9_.-]+:)?(\w+)Response\b/.exec(telo)?.[1] ?? null;

    const vyrobene = vnutro(telo, "producedDetails");
    const cislo = vyrobene ? text(vyrobene, "number") : null;
    const det = detaily(telo);

    const chybaDavky = vnutro(telo, "errorDetail");
    const duplicitaDavky = chybaDavky != null && /recordDuplicity/i.test(telo);
    const cisloDuplicity = duplicitaDavky
      ? text(vnutro(telo, "recordDuplicity") ?? "", "number")
      : null;

    const chybaVDetaile = det.some((d) => d.stav === "error");
    const upozornenie = det.some((d) => d.stav === "warning");
    let stav: VysledokDokladu["stav"] =
      stavAtr === "error" || chybaVDetaile
        ? "error"
        : upozornenie || stavAtr === "warning"
          ? "warning"
          : "ok";
    if (duplicitaDavky) stav = "warning";

    const relevantne = det.filter((d) => (stav === "error" ? d.stav === "error" : d.stav !== "ok"));
    const poznamka = duplicitaDavky
      ? `Doklad už v Pohode je — tá istá položka dávky sa importovala skôr${
          cisloDuplicity ? ` (č. ${cisloDuplicity})` : ""
        }.`
      : relevantne.length
        ? zlucDetaily(relevantne).slice(0, 1000)
        : stav === "error"
          ? bezZnaciek(chybaDavky ?? "") ||
            atribut(m[1] ?? "", "note") ||
            "Pohoda doklad odmietla bez popisu."
          : null;

    polozky.push({
      id,
      stav,
      cislo: cislo ?? cisloDuplicity,
      poznamka,
      agenda,
      detaily: det,
      ...(duplicitaDavky ? { duplicita: true } : {}),
    });
  }
  return {
    stav: stavBaliku === "error" ? "error" : stavBaliku === "ok" ? "ok" : null,
    poznamka: atribut(atr, "note"),
    programVersion: atribut(atr, "programVersion"),
    ico: atribut(atr, "ico"),
    polozky,
  };
}

/** Súhrn odpovede po slovensky (správa pre používateľa a skript na skúšku). */
export function suhrnOdpovede(o: OdpovedPohody): {
  ok: number;
  upozornenia: number;
  chyby: number;
  vety: string[];
} {
  const ok = o.polozky.filter((p) => p.stav === "ok").length;
  const upozornenia = o.polozky.filter((p) => p.stav === "warning").length;
  const chyby = o.polozky.filter((p) => p.stav === "error").length;
  const vety: string[] = [];
  if (o.stav === "error" && !o.polozky.length)
    vety.push(`Pohoda celý balík odmietla: ${o.poznamka ?? "bez popisu"}`);
  for (const p of o.polozky)
    if (p.stav !== "ok")
      vety.push(
        `${p.cislo ?? p.id}: ${p.poznamka ?? (p.stav === "error" ? "chyba" : "upozornenie")}`,
      );
  return { ok, upozornenia, chyby, vety };
}
