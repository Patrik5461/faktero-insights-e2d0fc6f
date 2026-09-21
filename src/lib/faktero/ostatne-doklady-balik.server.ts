import type JSZip from "jszip";
import { bezpecneMeno, nazovDruhu } from "./ostatne-doklady";

type DokladVBaliku = {
  id: string;
  kind: string;
  sender: string | null;
  subject: string | null;
  received_date: string;
  amount: number | null;
  currency: string;
  due_date: string | null;
  note: string | null;
  status: string;
  other_document_files?: { path: string; name: string; position: number }[] | null;
  zamestnanec?: { first_name: string | null; last_name: string | null } | null;
  zmluva?: { name: string | null; provider_name: string | null; contract_number: string | null } | null;
};

function csv(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Súpis ostatných dokladov v CSV — oddeľovač bodkočiarka, ako čaká Excel v SK. */
export function supisOstatnych(doklady: DokladVBaliku[]): string {
  const hlavicka = [
    "prijate",
    "druh",
    "odosielatel",
    "predmet",
    "suma",
    "mena",
    "lehota",
    "zamestnanec",
    "zmluva",
    "poznamka",
    "prilohy",
  ];
  const riadky = doklady.map((d) =>
    [
      d.received_date,
      nazovDruhu(d.kind),
      d.sender,
      d.subject,
      d.amount != null ? String(d.amount).replace(".", ",") : "",
      d.currency,
      d.due_date,
      d.zamestnanec ? [d.zamestnanec.first_name, d.zamestnanec.last_name].filter(Boolean).join(" ") : "",
      d.zmluva
        ? [d.zmluva.name || d.zmluva.provider_name, d.zmluva.contract_number].filter(Boolean).join(" ")
        : "",
      d.note,
      (d.other_document_files ?? []).length,
    ]
      .map(csv)
      .join(";"),
  );
  // BOM, aby Excel čítal diakritiku.
  return "﻿" + [hlavicka.join(";"), ...riadky].join("\r\n");
}

/** Priečinok dokladu v balíku: dátum, druh a odosielateľ, nech sa dá triediť. */
export function priecinokDokladu(d: DokladVBaliku, poradie: number): string {
  const zaklad = [d.received_date, nazovDruhu(d.kind), d.sender ?? d.subject ?? ""]
    .filter(Boolean)
    .join("_");
  return `${String(poradie + 1).padStart(3, "0")}_${bezpecneMeno(zaklad)}`;
}

/**
 * Pridá do ZIP-u súpis a prílohy ostatných dokladov. Príloha, ktorá sa
 * nestiahne, balík nezhodí — spočíta sa do `vynechane`.
 */
export async function balikOstatnych(
  zip: JSZip,
  doklady: DokladVBaliku[],
  supabase: any,
  predpona = "",
): Promise<{ vynechane: number }> {
  zip.file(`${predpona}supis-ostatnych-dokladov.csv`, supisOstatnych(doklady));
  let vynechane = 0;
  for (const [i, d] of doklady.entries()) {
    const prilohy = [...(d.other_document_files ?? [])].sort((a, b) => a.position - b.position);
    if (!prilohy.length) continue;
    const priecinok = zip.folder(`${predpona}${priecinokDokladu(d, i)}`)!;
    for (const p of prilohy) {
      try {
        const { data: subor } = await supabase.storage.from("other-docs").download(p.path);
        if (!subor) {
          vynechane++;
          continue;
        }
        priecinok.file(bezpecneMeno(p.name), await subor.arrayBuffer());
      } catch {
        vynechane++;
      }
    }
  }
  return { vynechane };
}
