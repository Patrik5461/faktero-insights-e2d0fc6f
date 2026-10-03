export type GoPayEnv = "sandbox" | "production";

/*
  Prostredie GoPay z nastavení (databáza, potom env). Prázdny reťazec znamená
  „nenastavené" — `??` ho však prepustí, a tak `GOPAY_ENV: ""` v ecosystem
  dávalo prostredie `""`, ktoré nie je ani pieskovisko, ani produkcia. Berie sa
  preto prvá neprázdna hodnota a všetko okrem produkcie je pieskovisko.
*/
export function prostredieGopay(...hodnoty: (string | null | undefined)[]): GoPayEnv {
  const h = hodnoty.map((v) => (v ?? "").trim().toLowerCase()).find(Boolean) ?? "";
  return h === "production" || h === "prod" || h === "live" ? "production" : "sandbox";
}
