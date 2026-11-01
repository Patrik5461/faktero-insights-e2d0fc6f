/*
  Záznamy o vývoji do Jiry (faktero.atlassian.net, projekt FAK).

    node scripts/jira.mjs over                         # prístup a typy úloh
    node scripts/jira.mjs zaloz "Názov" "Popis" [Typ]  # vypíše kľúč, napr. FAK-12
    node scripts/jira.mjs komentar FAK-12 "Text"
    node scripts/jira.mjs stav FAK-12 "Hotovo"         # prechod podľa názvu stavu
    node scripts/jira.mjs hladaj "text"
    node scripts/jira.mjs cas FAK-12 "2h 30m" ["popis"] [začiatok ISO]   # odpracovaný čas
    node scripts/jira.mjs davka subor.json             # epiky s úlohami naraz

  Dávka: [{ "epik": "Názov", "popis": "…", "ulohy": [{ "nazov", "popis", "typ"?, "stav"?,
           "cas"?: "2h 30m", "zaciatok"?: "2026-11-01T10:00:00+01:00" }] }].
  Epik aj úloha s rovnakým názvom sa druhýkrát nezaloží (dávka sa dá pustiť znova).
  POZOR: úloha bez "stav" skončí v stave Hotovo – otvorené body vždy "stav": "Úlohy".
  Čas sa nezdvojí: rovnaká dĺžka s rovnakým začiatkom (bez začiatku rovnaká dĺžka) sa preskočí.

  Prihlásenie: JIRA_EMAIL a JIRA_API_TOKEN v ecosystem.config.cjs
  (~/vloz-tajomstvo.sh JIRA_EMAIL, ~/vloz-tajomstvo.sh JIRA_API_TOKEN).
  Text sa posiela ako odseky ADF; riadok začínajúci „- “ je odrážka.
*/
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = { ...require("/home/patrik/ecosystem.config.cjs").apps[0].env, ...process.env };
const ZAKLAD = (env.JIRA_URL || "https://faktero.atlassian.net").replace(/\/+$/, "");
const PROJEKT = env.JIRA_PROJEKT || "FAK";
if (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN) {
  console.error("Chýba JIRA_EMAIL alebo JIRA_API_TOKEN (~/vloz-tajomstvo.sh).");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");

async function api(metoda, cesta, telo) {
  const r = await fetch(`${ZAKLAD}/rest/api/3${cesta}`, {
    method: metoda,
    headers: {
      authorization: auth,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: telo ? JSON.stringify(telo) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Jira ${r.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

/** Obyčajný text → Atlassian Document Format (odseky a odrážky). */
function adf(text) {
  const obsah = [];
  let zoznam = null;
  for (const riadok of String(text ?? "").split("\n")) {
    if (/^\s*[-•] /.test(riadok)) {
      zoznam ??= { type: "bulletList", content: [] };
      zoznam.content.push({
        type: "listItem",
        content: [
          { type: "paragraph", content: [{ type: "text", text: riadok.replace(/^\s*[-•] /, "") }] },
        ],
      });
      continue;
    }
    if (zoznam) (obsah.push(zoznam), (zoznam = null));
    if (riadok.trim()) obsah.push({ type: "paragraph", content: [{ type: "text", text: riadok }] });
  }
  if (zoznam) obsah.push(zoznam);
  return {
    type: "doc",
    version: 1,
    content: obsah.length ? obsah : [{ type: "paragraph", content: [] }],
  };
}

/** „1d 2h 30m“ → sekundy (deň = 8 h, týždeň = 5 dní ako v Jire). */
function sekundy(cas) {
  const jednotky = { w: 5 * 8 * 3600, d: 8 * 3600, h: 3600, m: 60 };
  let spolu = 0;
  for (const [, n, j] of String(cas).matchAll(/(\d+(?:[.,]\d+)?)\s*([wdhm])/gi))
    spolu += Number(n.replace(",", ".")) * jednotky[j.toLowerCase()];
  if (!spolu) throw new Error(`Neplatný čas „${cas}“ (napr. "2h 30m").`);
  return Math.round(spolu);
}

/** ISO dátum → formát Jiry 2026-11-01T10:00:00.000+0000. */
function zaciatokJiry(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error(`Neplatný začiatok „${iso}“.`);
  return d.toISOString().replace("Z", "+0000");
}

/** Zapíše odpracovaný čas; rovnaký záznam (dĺžka + začiatok) druhýkrát nepridá. */
async function zapisCas(kluc, cas, popis, zaciatok) {
  const dlzka = sekundy(cas);
  const { worklogs = [] } = await api("GET", `/issue/${kluc}/worklog?maxResults=1000`);
  const uz = worklogs.find(
    (w) =>
      w.timeSpentSeconds === dlzka &&
      (!zaciatok || new Date(w.started).getTime() === new Date(zaciatok).getTime()),
  );
  if (uz) return false;
  await api("POST", `/issue/${kluc}/worklog?notifyUsers=false`, {
    timeSpentSeconds: dlzka,
    started: zaciatokJiry(zaciatok),
    ...(popis ? { comment: adf(popis) } : {}),
  });
  return true;
}

const [prikaz, ...a] = process.argv.slice(2);
if (prikaz === "over") {
  const ja = await api("GET", "/myself");
  const p = await api("GET", `/project/${PROJEKT}`);
  console.log(`Prihlásený: ${ja.displayName}; projekt ${p.key} – ${p.name}`);
  console.log("Typy úloh:", (p.issueTypes ?? []).map((t) => t.name).join(", "));
} else if (prikaz === "zaloz") {
  const [nazov, popis, typ = "Úloha"] = a;
  const r = await api("POST", "/issue", {
    fields: {
      project: { key: PROJEKT },
      summary: nazov,
      description: adf(popis),
      issuetype: { name: typ },
    },
  });
  console.log(r.key, `${ZAKLAD}/browse/${r.key}`);
} else if (prikaz === "komentar") {
  const [kluc, text] = a;
  await api("POST", `/issue/${kluc}/comment`, { body: adf(text) });
  console.log("ok", kluc);
} else if (prikaz === "stav") {
  const [kluc, nazov] = a;
  const { transitions } = await api("GET", `/issue/${kluc}/transitions`);
  const t = transitions.find(
    (x) =>
      x.to?.name?.toLowerCase() === nazov.toLowerCase() ||
      x.name.toLowerCase() === nazov.toLowerCase(),
  );
  if (!t)
    throw new Error(
      `Prechod „${nazov}“ neexistuje. Možné: ${transitions.map((x) => x.to?.name ?? x.name).join(", ")}`,
    );
  await api("POST", `/issue/${kluc}/transitions`, { transition: { id: t.id } });
  console.log("ok", kluc, "→", t.to?.name ?? t.name);
} else if (prikaz === "cas") {
  const [kluc, cas, popis, zaciatok] = a;
  if (!kluc || !cas) throw new Error('Použitie: cas FAK-12 "2h 30m" ["popis"] [začiatok ISO]');
  const novy = await zapisCas(kluc, cas, popis, zaciatok);
  console.log(novy ? "ok" : "už zapísané", kluc, cas);
} else if (prikaz === "hladaj") {
  const jql = `project = ${PROJEKT} AND text ~ "${String(a[0] ?? "").replace(/"/g, "")}" ORDER BY updated DESC`;
  const r = await api("POST", "/search/jql", {
    jql,
    maxResults: 20,
    fields: ["summary", "status"],
  });
  for (const i of r.issues ?? [])
    console.log(i.key, `[${i.fields.status?.name}]`, i.fields.summary);
} else if (prikaz === "davka") {
  const { readFileSync } = await import("node:fs");
  const davka = JSON.parse(readFileSync(a[0], "utf8"));
  const existujuce = new Map();
  for (let start = null; ;) {
    const r = await api("POST", "/search/jql", {
      jql: `project = ${PROJEKT}`,
      maxResults: 100,
      fields: ["summary"],
      ...(start ? { nextPageToken: start } : {}),
    });
    for (const i of r.issues ?? []) existujuce.set(i.fields.summary, i.key);
    if (!r.nextPageToken) break;
    start = r.nextPageToken;
  }
  const zaloz = async (fields) => {
    if (existujuce.has(fields.summary)) return existujuce.get(fields.summary);
    const r = await api("POST", "/issue", { fields: { project: { key: PROJEKT }, ...fields } });
    existujuce.set(fields.summary, r.key);
    return r.key;
  };
  const prejdi = async (kluc, nazov) => {
    if (!nazov) return;
    const { transitions } = await api("GET", `/issue/${kluc}/transitions`);
    const t = transitions.find((x) => (x.to?.name ?? x.name).toLowerCase() === nazov.toLowerCase());
    if (t) await api("POST", `/issue/${kluc}/transitions`, { transition: { id: t.id } });
  };
  for (const e of davka) {
    const epik = await zaloz({
      summary: e.epik,
      description: adf(e.popis),
      issuetype: { name: "Epik" },
    });
    let hotove = 0;
    for (const u of e.ulohy ?? []) {
      const k = await zaloz({
        summary: u.nazov,
        description: adf(u.popis),
        issuetype: { name: u.typ ?? "Úloha" },
        parent: { key: epik },
      });
      if (u.cas) await zapisCas(k, u.cas, u.casPopis, u.zaciatok);
      await prejdi(k, u.stav ?? "Hotovo");
      if ((u.stav ?? "Hotovo") === "Hotovo") hotove++;
    }
    if (e.ulohy?.length && hotove === e.ulohy.length) await prejdi(epik, "Hotovo");
    console.log(epik, e.epik, `(${e.ulohy?.length ?? 0} úloh)`);
  }
} else {
  console.log("Použitie: over | zaloz | komentar | stav | cas | hladaj | davka");
}
