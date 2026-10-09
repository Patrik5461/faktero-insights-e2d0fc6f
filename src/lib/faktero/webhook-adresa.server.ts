/*
  Adresa webhooku je text, ktorý zadá zákazník — a náš server na ňu posiela
  POST a odpoveď ukladá do denníka doručení. Bez kontroly by sa cez webhook
  dali skúšať služby na našej vnútornej sieti (router, databáza, metadáta).
  Kontrola v prehliadači nestačí, riadok sa dá zapísať priamo cez API.
*/
import { overVerejnyServer } from "./odoslanie-mailu.server";

/** Vyhodí chybu, keď adresa nie je https na verejnom serveri. */
export async function overAdresuWebhooku(url: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Adresa webhooku nie je platná.");
  }
  if (u.protocol !== "https:") throw new Error("Webhook musí mieriť na https:// adresu.");
  if (u.username || u.password) throw new Error("Adresa webhooku nesmie obsahovať meno a heslo.");
  if (u.port && u.port !== "443") throw new Error("Webhook musí používať štandardný port 443.");
  await overVerejnyServer(u.hostname.replace(/^\[|\]$/g, ""));
  return u;
}
