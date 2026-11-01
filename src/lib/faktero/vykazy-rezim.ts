/*
  Čo má firma na stránke Výkazy k DPH vidieť podľa registrácie (`vat_scheme`).

  - platiteľ: všetky tlačivá ako doteraz (bežná SK/CZ firma sa nemení);
  - registrovaná osoba (SK § 7/§ 7a, CZ identifikovaná osoba): priznanie len
    za obdobie, v ktorom jej vznikla daňová povinnosť (nadobudnutie tovaru,
    služby z EÚ), súhrnný výkaz pri službách do EÚ; kontrolný výkaz /
    kontrolní hlášení podáva len platiteľ — tlačivá ostanú, nad nimi vysvetlenie;
  - neplatiteľ (SK, CZ): výkazy nepodáva — namiesto tlačív vysvetlenie
    s možnosťou ich aj tak zobraziť (keby bol režim firmy nastavený zle).

  Nemecký Kleinunternehmer má vlastný box priamo v UStVA (DeUstva.tsx).
*/
import type { SchemaDph } from "./dph-rezim";

export type DruhVykazov = "platitel" | "registrovana" | "neplatitel";

export function druhVykazov(schema: SchemaDph | string | null | undefined): DruhVykazov {
  if (schema === "sk_neplatitel" || schema === "cz_neplatce") return "neplatitel";
  if (schema === "sk_7" || schema === "sk_7a" || schema === "cz_identifikovana")
    return "registrovana";
  return "platitel";
}

/** Forma kontrolního hlášení zvolená pre mesiac; nezvolená = riadne („B“). */
export function formaKhPreMesiac<F extends string>(
  formy: Readonly<Record<number, F>>,
  mesiac: number,
): F | "B" {
  return formy[mesiac] ?? "B";
}
