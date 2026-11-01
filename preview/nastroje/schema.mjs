#!/usr/bin/env node
/**
 * Vyrobí `preview/server/schema.gen.json` z `src/integrations/supabase/types.ts`.
 *
 * Demo databáza v preview potrebuje vedieť, aké stĺpce má ktorá tabuľka
 * (`select=*`) a ako sú tabuľky prepojené cudzími kľúčmi (vnorené
 * `customers(name)` v selecte). Obe veci sú v typoch vygenerovaných zo
 * Supabase, takže sa netreba pýtať živej databázy.
 *
 * Spustenie: `node preview/nastroje/schema.mjs` (po každom doplnení typov).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const koren = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const zdroj = readFileSync(resolve(koren, "src/integrations/supabase/types.ts"), "utf8");
const sf = ts.createSourceFile("types.ts", zdroj, ts.ScriptTarget.Latest, true);

function clen(typ, meno) {
  if (!typ || !ts.isTypeLiteralNode(typ)) return undefined;
  for (const m of typ.members) {
    if (ts.isPropertySignature(m) && m.name.getText(sf).replace(/"/g, "") === meno) return m.type;
  }
  return undefined;
}

let databaza;
sf.forEachChild((n) => {
  if (ts.isTypeAliasDeclaration(n) && n.name.text === "Database") databaza = n.type;
});
const verejne = clen(databaza, "public");

function stlpce(typ) {
  const out = {};
  if (!typ || !ts.isTypeLiteralNode(typ)) return out;
  for (const m of typ.members) {
    if (!ts.isPropertySignature(m)) continue;
    const meno = m.name.getText(sf).replace(/"/g, "");
    const t = m.type.getText(sf).replace(/\s+/g, " ");
    let druh = "text";
    if (/\bnumber\b/.test(t)) druh = "number";
    else if (/\bboolean\b/.test(t)) druh = "boolean";
    else if (/\[\]/.test(t) || /^string\[\]/.test(t)) druh = "array";
    else if (/\bJson\b/.test(t)) druh = "json";
    out[meno] = { druh, nullable: /\| null/.test(t), volitelny: !!m.questionToken };
  }
  return out;
}

function vztahy(typ) {
  if (!typ || !ts.isTupleTypeNode(typ)) return [];
  return typ.elements.map((e) => {
    const o = {};
    for (const m of e.members) {
      const k = m.name.getText(sf);
      const v = m.type;
      if (ts.isTupleTypeNode(v)) o[k] = v.elements.map((x) => x.getText(sf).replace(/"/g, ""));
      else o[k] = v.getText(sf).replace(/"/g, "");
    }
    return {
      fk: o.foreignKeyName,
      stlpce: o.columns,
      tabulka: o.referencedRelation,
      ciel: o.referencedColumns,
      jedenNaJeden: o.isOneToOne === "true",
    };
  });
}

const schema = { tabulky: {}, funkcie: [] };
for (const sekcia of ["Tables", "Views"]) {
  const s = clen(verejne, sekcia);
  if (!s || !ts.isTypeLiteralNode(s)) continue;
  for (const m of s.members) {
    const meno = m.name.getText(sf).replace(/"/g, "");
    const row = clen(m.type, "Row");
    const ins = clen(m.type, "Insert");
    const st = stlpce(row);
    const insSt = stlpce(ins);
    for (const [k, v] of Object.entries(st)) v.povinny = insSt[k] ? !insSt[k].volitelny : false;
    schema.tabulky[meno] = {
      pohlad: sekcia === "Views",
      stlpce: st,
      vztahy: vztahy(clen(m.type, "Relationships")),
    };
  }
}
const f = clen(verejne, "Functions");
if (f && ts.isTypeLiteralNode(f)) schema.funkcie = f.members.map((m) => m.name.getText(sf));

writeFileSync(resolve(koren, "preview/server/schema.gen.json"), JSON.stringify(schema));
console.log(
  `schema.gen.json: ${Object.keys(schema.tabulky).length} tabuliek, ${schema.funkcie.length} funkcií`,
);
