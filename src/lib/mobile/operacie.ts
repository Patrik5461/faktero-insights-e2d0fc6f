/**
 * Serverové operácie, ktoré potrebuje mobilná appka.
 *
 * Na webe sa volajú ako serverové funkcie. V zabalenej appke to nejde: volajú
 * sa relatívnou adresou a appka beží na vlastnom pôvode (`capacitor://localhost`),
 * takže by mierili do prázdna — a serverové jadro TanStacku sa do balíčka ani
 * zabaliť nedá.
 *
 * Preto tento zoznam: obrazovky si operáciu pýtajú kľúčom a most
 * (`server-most.ts` na webe, `server-most.mobile.ts` v appke) ju vybaví tak,
 * ako sa v danom prostredí dá. Kľúč je zároveň cesta endpointu
 * `/api/mobil/<kľúč>`, cez ktorý appka volá server.
 */

export const OPERACIE = [
  "blocek-precitaj",
  "vydavok-uloz",
  "banka-prehlad",
  "banka-stiahni",
  "faktury-zoznam",
  "faktura-pdf",
  "faktura-email",
  "faktury-uhradene",
  "faktura-upomienka",
  "vydavky-zoznam",
  "vydavok-uprav",
  "vydavok-zmaz",
  "vydavok-subor",
  "faktura-podklady",
  "faktura-posledna",
  "faktura-vystav",
  "cennik-kontext",
  "firma-podla-ica",
  "doklad-presun",
  "ucet-stav-zrusenia",
  "ucet-poziadaj-o-zrusenie",
  "ucet-odvolaj-zrusenie",
] as const;

export type Operacia = (typeof OPERACIE)[number];

export function jeOperacia(hodnota: string): hodnota is Operacia {
  return (OPERACIE as readonly string[]).includes(hodnota);
}

/** Adresa servera pre zabalenú appku. Web volá relatívne, tam sa nepoužije. */
export const SERVER = "https://www.faktero.sk";
