/*
  Jednorazovo nahrá históriu referenčných úrokových sadzieb do `referencne_sadzby`.
  Denné dopĺňanie potom robí hook kurzov (/api/public/hooks/kurzy-ecb).

  Zdroje (verejné, zadarmo):
    - EURIBOR 1M/3M/6M/12M — ECB Data Portal, dataset FM, mesačný priemer
    - €STR                 — ECB Data Portal, dataset EST, denne
    - PRIBOR 1M/3M/6M/1R   — ČNB, ročný TXT fixingov, denne

  Použitie:
    SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/nahraj-referencne-sadzby.mjs [od=2020-01-01]

  Čítanie zdrojov je rovnaké ako v src/lib/faktero/referencne-sadzby.ts —
  pri zmene formátu treba upraviť obe miesta.
*/
const url = process.env.SUPABASE_URL;
const kluc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const od = process.argv[2] ?? "2020-01-01";
if (!url || !kluc || !/^\d{4}-\d{2}-\d{2}$/.test(od)) {
  throw new Error(
    "Použitie: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/nahraj-referencne-sadzby.mjs [YYYY-MM-DD]",
  );
}

const ECB = "https://data-api.ecb.europa.eu/service/data";
const SERIE = {
  EURIBOR_1M: ["FM", "M.U2.EUR.RT.MM.EURIBOR1MD_.HSTA", "mesacny_priemer"],
  EURIBOR_3M: ["FM", "M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA", "mesacny_priemer"],
  EURIBOR_6M: ["FM", "M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA", "mesacny_priemer"],
  EURIBOR_12M: ["FM", "M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA", "mesacny_priemer"],
  ESTR: ["EST", "B.EU000A2X2A25.WT", "denna"],
};
const CNB =
  "https://www.cnb.cz/cs/financni-trhy/penezni-trh/pribor/fixing-urokovych-sazeb-na-mezibankovnim-trhu-depozit-pribor/rok.txt";
const PRIBOR = {
  "1 měsíc": "PRIBOR_1M",
  "3 měsíce": "PRIBOR_3M",
  "6 měsíců": "PRIBOR_6M",
  "1 rok": "PRIBOR_1R",
};

async function text(u) {
  const r = await fetch(u, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${u} → HTTP ${r.status}`);
  return r.text();
}

function ecbCsv(t, index, druh) {
  const riadky = t.split(/\r?\n/).filter((r) => r.trim());
  const h = riadky[0].split(",");
  const iObd = h.indexOf("TIME_PERIOD");
  const iHod = h.indexOf("OBS_VALUE");
  const out = [];
  for (const r of riadky.slice(1)) {
    const s = r.split(",");
    const obd = s[iObd];
    const hod = Number(s[iHod]);
    if (!obd || s[iHod] === "" || !Number.isFinite(hod)) continue;
    out.push({
      index,
      druh,
      datum: /^\d{4}-\d{2}$/.test(obd) ? `${obd}-01` : obd,
      hodnota: hod,
      zdroj: "ECB",
    });
  }
  return out;
}

function cnbRok(t) {
  const riadky = t.split(/\r?\n/).filter((r) => r.trim());
  const stlpce = [];
  riadky[0]
    .split("|")
    .forEach((s, i) => PRIBOR[s.trim()] && stlpce.push([i + 1, PRIBOR[s.trim()]]));
  const out = [];
  for (const r of riadky.slice(2)) {
    const p = r.split("|");
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((p[0] ?? "").trim());
    if (!m) continue;
    for (const [i, index] of stlpce) {
      const v = (p[i] ?? "").trim().replace(",", ".");
      if (v && Number.isFinite(Number(v))) {
        out.push({
          index,
          druh: "denna",
          datum: `${m[3]}-${m[2]}-${m[1]}`,
          hodnota: Number(v),
          zdroj: "CNB",
        });
      }
    }
  }
  return out;
}

async function uloz(riadky) {
  for (let i = 0; i < riadky.length; i += 1000) {
    const r = await fetch(`${url}/rest/v1/referencne_sadzby?on_conflict=index,druh,datum`, {
      method: "POST",
      headers: {
        apikey: kluc,
        Authorization: `Bearer ${kluc}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(riadky.slice(i, i + 1000)),
    });
    if (!r.ok) throw new Error(`Zápis zlyhal: ${r.status} ${await r.text()}`);
  }
}

for (const [index, [dataset, k, druh]] of Object.entries(SERIE)) {
  const start = druh === "mesacny_priemer" ? od.slice(0, 7) : od;
  const riadky = ecbCsv(
    await text(`${ECB}/${dataset}/${k}?format=csvdata&startPeriod=${start}`),
    index,
    druh,
  );
  await uloz(riadky);
  console.log(index, riadky.length, riadky.at(-1)?.datum, riadky.at(-1)?.hodnota);
}
for (let rok = Number(od.slice(0, 4)); rok <= new Date().getUTCFullYear(); rok++) {
  const riadky = cnbRok(await text(`${CNB}?year=${rok}`)).filter((r) => r.datum >= od);
  await uloz(riadky);
  console.log("PRIBOR", rok, riadky.length);
}
