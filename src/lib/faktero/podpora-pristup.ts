import { OBLASTI, type Opravnenia } from "./opravnenia";

/*
  Dočasný prístup technickej podpory Faktero k firme.

  Udeľuje ho len majiteľ firmy, na pár dní a v rozsahu „len čítanie" alebo
  „plný". Podpora dostane vo firme rolu Vlastný prístup — nikdy správu
  používateľov, banky, API ani predplatného a nikdy oblasť Zamestnanci
  (rodné čísla a zmluvy). Po uplynutí ho server zruší sám; majiteľ ho môže
  odobrať kedykoľvek. Každé udelenie ostáva v histórii.

  Čisté funkcie bez databázy.
*/

export type RozsahPodpory = "citanie" | "plny";

export const NAZVY_ROZSAHU: Record<RozsahPodpory, string> = {
  citanie: "Len čítanie",
  plny: "Plný prístup k dokladom",
};

/** Na koľko dní sa dá prístup udeliť. */
export const DNI_PODPORY = [1, 3, 7, 14, 30] as const;
export const MAX_DNI_PODPORY = 30;

/** Oblasti, ku ktorým podpora nesmie nikdy — ani pri plnom prístupe. */
const BEZ_PODPORY = new Set(["zamestnanci"]);

export function opravneniaPodpory(rozsah: RozsahPodpory): Opravnenia {
  const uroven = rozsah === "plny" ? "edit" : "read";
  return Object.fromEntries(
    OBLASTI.filter((o) => !BEZ_PODPORY.has(o.kluc)).map((o) => [o.kluc, uroven]),
  ) as Opravnenia;
}

export function platnostDo(dni: number, teraz = new Date()): Date {
  const d = Math.min(MAX_DNI_PODPORY, Math.max(1, Math.round(dni)));
  return new Date(teraz.getTime() + d * 24 * 60 * 60 * 1000);
}

export type StavPristupu = "aktivny" | "odobraty" | "vyprsal";

/**
 * Stav, ako ho treba ukázať. Prístup po čase, ktorý server ešte nestihol
 * zrušiť (beží každú minútu), sa ukazuje ako vypršaný.
 */
export function stavPristupu(
  r: { stav: string; platne_do: string },
  teraz = Date.now(),
): StavPristupu {
  if (r.stav === "odobraty") return "odobraty";
  if (r.stav === "vyprsal" || new Date(r.platne_do).getTime() <= teraz) return "vyprsal";
  return "aktivny";
}

/**
 * E-mail platform adminom (schránka podpory), že firma udelila prístup.
 * Len názov firmy, rozsah a platnosť — dôvod ani nič z dokladov nie, mail
 * ide mimo aplikácie a dôvod môže obsahovať čokoľvek.
 */
export function oznamUdeleniaPodpore(v: {
  firma: string;
  rozsah: RozsahPodpory;
  dni: number;
  platneDo: string | Date;
}): { predmet: string; text: string } {
  const firma =
    String(v.firma ?? "")
      .replace(/\s+/g, " ")
      .trim() || "Firma";
  const kedy = new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v.platneDo));
  const dni = Math.round(v.dni);
  const slovo = dni === 1 ? "deň" : dni >= 2 && dni <= 4 ? "dni" : "dní";
  return {
    predmet: `${firma} udelila prístup technickej podpore do ${kedy}`,
    text:
      `Firma ${firma} udelila technickej podpore Faktero dočasný prístup do ${kedy} ` +
      `(${dni} ${slovo}), rozsah: ${NAZVY_ROZSAHU[v.rozsah].toLowerCase()}.\n` +
      `Firma sa zobrazí v prepínači firiem; prístup sa po uplynutí zruší sám.`,
  };
}
