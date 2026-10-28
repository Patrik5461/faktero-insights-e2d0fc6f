/*
  Záznamy o vývoji do Jiry (faktero.atlassian.net, projekt FAK).

    node scripts/jira.mjs over                         # prístup a typy úloh
    node scripts/jira.mjs zaloz "Názov" "Popis" [Typ]  # vypíše kľúč, napr. FAK-12
    node scripts/jira.mjs komentar FAK-12 "Text"
    node scripts/jira.mjs stav FAK-12 "Hotovo"         # prechod podľa názvu stavu
    node scripts/jira.mjs hladaj "text"

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

const [prikaz, ...a] = process.argv.slice(2);
if (prikaz === "over") {
  const ja = await api("GET", "/myself");
  const p = await api("GET", `/project/${PROJEKT}`);
  console.log(`Prihlásený: ${ja.displayName}; projekt ${p.key} – ${p.name}`);
  console.log("Typy úloh:", (p.issueTypes ?? []).map((t) => t.name).join(", "));
} else if (prikaz === "zaloz") {
  const [nazov, popis, typ = "Task"] = a;
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
} else if (prikaz === "hladaj") {
  const jql = `project = ${PROJEKT} AND text ~ "${String(a[0] ?? "").replace(/"/g, "")}" ORDER BY updated DESC`;
  const r = await api("POST", "/search/jql", {
    jql,
    maxResults: 20,
    fields: ["summary", "status"],
  });
  for (const i of r.issues ?? [])
    console.log(i.key, `[${i.fields.status?.name}]`, i.fields.summary);
} else {
  console.log("Použitie: over | zaloz | komentar | stav | hladaj");
}
