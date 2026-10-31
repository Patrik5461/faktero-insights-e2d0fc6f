/*
  Zoznam poskytovateľov palivových kariet. Smie ísť do prehliadača — samotné
  adaptéry (`<id>.server.ts`) načítava len server cez `adaptery.server.ts`.

  Nový poskytovateľ: doplniť sem polia a postup prístupu, napísať
  `<id>.server.ts` s `adapter: KartaAdapter`, pridať ho do `adaptery.server.ts`
  a prepnúť `dostupne` na true.
*/
import type { KartaPoskytovatel } from "./typy";

export const POSKYTOVATELIA: KartaPoskytovatel[] = [
  {
    id: "shell",
    nazov: "Shell Card",
    web: "https://www.shell.sk",
    dokumentacia:
      "https://developer.shell.com/api-catalog/b2b-mobility-card-transaction-data/api-overview",
    dostupne: true,
    faktury: true,
    pristup:
      "Prístup do API vydáva Shell na požiadanie: v Shell Card Online alebo cez obchodníka požiadajte o B2B Mobility API (Transaction Data a Invoice). Shell pošle e-mailom client ID a client secret. Payer number nájdete na faktúre Shell alebo v Shell Card Online.",
    polia: [
      { kluc: "client_id", nazov: "Client ID", typ: "text", povinne: true, tajne: true },
      { kluc: "client_secret", nazov: "Client secret", typ: "heslo", povinne: true, tajne: true },
      {
        kluc: "payer_number",
        nazov: "Payer number",
        typ: "text",
        povinne: true,
        tajne: false,
        pomoc: "Číslo platiteľa z faktúry Shell (napr. SK00123456).",
      },
      {
        kluc: "account_number",
        nazov: "Account number",
        typ: "text",
        povinne: false,
        tajne: false,
        pomoc: "Len ak chcete načítať iba jeden účet platiteľa. Prázdne = všetky účty.",
      },
      {
        kluc: "colco_code",
        nazov: "ColCo kód",
        typ: "text",
        povinne: false,
        tajne: false,
        pomoc:
          "Kód spoločnosti Shell, ktorá kartu vydala. Vyplňte, len ak ho Shell uviedol pri vydaní prístupu.",
      },
      {
        kluc: "dodavatel_ico",
        nazov: "IČO dodávateľa na faktúre",
        typ: "text",
        povinne: false,
        tajne: false,
        pomoc: "IČO spoločnosti Shell z hlavičky faktúry — prijaté faktúry ho dostanú do adresára.",
      },
      {
        kluc: "prostredie",
        nazov: "Prostredie",
        typ: "vyber",
        povinne: true,
        tajne: false,
        predvolene: "produkcia",
        moznosti: [
          { hodnota: "produkcia", nazov: "Ostré (api.shell.com)" },
          { hodnota: "test", nazov: "Testovacie (api-test.shell.com)" },
        ],
      },
    ],
  },
  {
    id: "dkv",
    nazov: "DKV Mobility",
    web: "https://www.dkv-mobility.com",
    dokumentacia: "https://api-portal.dkv-mobility.com/",
    dostupne: false,
    faktury: false,
    pristup:
      "DKV má API portál (Azure API Management) s rozhraniami Transaction Service (vyúčtované aj nevyúčtované transakcie), Masterdata Service (karty, boxy) a Toll Service. Zákazník sa zaregistruje na api-portal.dkv-mobility.com, požiada o odber produktu Transaction Service a DKV ho priradí k svojmu zákazníckemu číslu. Faktúry cez API nie sú — prichádzajú e-mailom (PDF/e-faktúra) a spracujú sa ako prijaté doklady.",
    polia: [],
  },
  {
    id: "eurowag",
    nazov: "Eurowag",
    web: "https://www.eurowag.com",
    dokumentacia: "https://www.eurowag.com/",
    dostupne: false,
    faktury: false,
    pristup:
      "Eurowag dáva dáta o transakciách v klientskej zóne a na požiadanie cez API — prístup treba vyžiadať u obchodníka Eurowag.",
    polia: [],
  },
  {
    id: "omv",
    nazov: "OMV / Routex",
    web: "https://www.omv.sk",
    dokumentacia: "https://www.routex.com/",
    dostupne: false,
    faktury: false,
    pristup:
      "Karty OMV patria do siete Routex; transakcie sú v portáli OMV eSolutions, export dát cez API alebo súbor treba vyžiadať u OMV.",
    polia: [],
  },
];

export function poskytovatel(id: string): KartaPoskytovatel | null {
  return POSKYTOVATELIA.find((p) => p.id === id) ?? null;
}
