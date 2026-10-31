import type { AppNotification } from "../notifications";
import { stavEfaktury, type RiadokDorucenia } from "./stav-efaktury";
import { TEXT_DOVODU, TEXT_ZAMIETNUTIA } from "./stav-efaktury-texty";

/*
  Zvonček: eFaktúra, ktorá neodišla (zlyhanie hlásené ePoštákom alebo naším
  odoslaním), alebo ju odberateľ zamietol. Počíta sa pri otvorení z doručení
  (`faktero-notifikacie-bez-ukladania`) — po úspešnom „Odoslať znova“ je
  posledné doručenie v poriadku a položka zmizne sama.

  Kľúč nesie čas posledného pokusu: nové zlyhanie po prečítaní je nový oznam.
*/

/** Doručenie z výberu `document_id, STLPCE_DORUCENIA`. */
export type DorucenieKDokladu = RiadokDorucenia & { document_id: string };

export type FakturaKDokladu = {
  /** id dokladu eFaktúry */
  id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  customer_name: string | null;
  /** Stornovaná či zmazaná faktúra sa nehlási. */
  status?: string | null;
  deleted_at?: string | null;
};

export function notifikacieZlyhanychEfaktur(
  dorucenia: DorucenieKDokladu[],
  doklady: FakturaKDokladu[],
): AppNotification[] {
  const podlaDokladu = new Map<string, DorucenieKDokladu[]>();
  for (const d of dorucenia) {
    podlaDokladu.set(d.document_id, [...(podlaDokladu.get(d.document_id) ?? []), d]);
  }
  const fakturaDokladu = new Map(doklady.map((d) => [d.id, d]));
  const out: AppNotification[] = [];
  for (const [docId, zoznam] of podlaDokladu) {
    const f = fakturaDokladu.get(docId);
    if (!f?.invoice_id || f.deleted_at || f.status === "cancelled") continue;
    const s = stavEfaktury(zoznam);
    if (!s || (s.stav !== "zlyhala" && s.stav !== "zamietnuta")) continue;
    const casy = zoznam.map((d) => d.created_at ?? d.sent_at ?? "").sort();
    const posledny = casy[casy.length - 1];
    const zamietnuta = s.stav === "zamietnuta";
    out.push({
      key: `efaktura_${zamietnuta ? "zamietnuta" : "zlyhala"}:${docId}:${posledny ?? ""}`,
      severity: zamietnuta ? "warning" : "danger",
      title: zamietnuta
        ? f.invoice_number
          ? "Odberateľ zamietol eFaktúru {cislo}"
          : "Odberateľ zamietol eFaktúru"
        : f.invoice_number
          ? "eFaktúra {cislo} neodišla"
          : "eFaktúra neodišla",
      detail: f.customer_name ? "{odberatel} · {dovod}" : "{dovod}",
      params: {
        cislo: f.invoice_number ?? "",
        odberatel: f.customer_name ?? "",
        dovod: zamietnuta ? TEXT_ZAMIETNUTIA : TEXT_DOVODU[s.dovod ?? "neznamy"],
      },
      to: `/faktury/${f.invoice_id}`,
      date: String(s.kedy ?? posledny ?? "").slice(0, 10),
    });
  }
  return out;
}
