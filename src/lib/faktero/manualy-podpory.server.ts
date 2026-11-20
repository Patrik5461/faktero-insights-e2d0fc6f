/*
  Interné manuály podpory — čítanie obsahu. Súbory NIE sú v repozitári (ten je
  verejný): ležia len na serveri v `MANUALY_PODPORY_DIR` (predvolene
  /home/patrik/faktero-podpora-manualy) a čítajú sa pri každom otvorení, takže
  úprava manuálu nepotrebuje nasadenie. Do prehliadača sa dostanú výlučne cez
  `adminManualyPodporyFn`, ktorá overí platformového admina s dvojfaktorom.
  Tento modul sa smie importovať len dynamicky vnútri obsluhy serverovej funkcie.
*/
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { manualZoSuboru, type ManualPodpory } from "./manualy-podpory";

export function priecinokManualov(): string {
  return process.env.MANUALY_PODPORY_DIR?.trim() || "/home/patrik/faktero-podpora-manualy";
}

export async function nacitajManualyPodpory(dir = priecinokManualov()): Promise<ManualPodpory[]> {
  let mena: string[] = [];
  try {
    mena = (await readdir(dir)).filter((m) => /^[\w.-]+\.md$/.test(m));
  } catch {
    return [];
  }
  const manualy = await Promise.all(
    mena.map(async (m) => manualZoSuboru(`/${m}`, await readFile(join(dir, m), "utf8"))),
  );
  return manualy.sort((a, b) => a.slug.localeCompare(b.slug));
}
