/*
  Zrušenie zaúčtovania prijatých faktúr a bločkov (výdavkových dokladov).

  Spoločné pre detail bločku aj hromadnú akciu „Zrušiť zaúčtovanie“.
  Kódy (predkontácia, členenie DPH, KV, stredisko…) ostávajú — zmizne len
  príznak „zaúčtované“ (`zauctovane_at`, `zauctoval`), takže doklad sa dá
  upraviť a zaúčtovať znova.

  Nezruší sa:
  - odovzdaný doklad (`exported_at`) — v Pohode by sa rozišiel, najprv sa
    musí vrátiť z Pohody,
  - ručne zamknutý doklad (`locked_at`),
  - doklad v uzavretom období (`companies.locked_until`), ako ostatné
    účtovné údaje v hromadných úpravách (doklady-hromadne.ts).

  Autopilot (auto-uctovanie.server.ts) berie len doklady s prázdnym
  `auto_uctovanie_at`. Doklad zaúčtovaný ručne ho má prázdny — po zrušení by
  ho fronta o minútu zaúčtovala znova. Preto sa `auto_uctovanie_at` vyplní;
  do fronty ho vráti až zmena údajov (spúšťač faktero_auto_uctovanie_strazca).
*/
import { dovodZamku, NAZOV_ZAMKU, type DovodZamku } from "./doklady-hromadne";

type Klient = any;

export type AgendaZrusenia = "prijata" | "doklad";

const TABULKA: Record<AgendaZrusenia, string> = {
  prijata: "purchase_invoices",
  doklad: "expense_documents",
};

const STLPCE: Record<AgendaZrusenia, string> = {
  prijata: "id, invoice_number, status, exported_at, locked_at, issue_date, deleted_at, zauctovane_at",
  doklad: "id, document_number, supplier_name, status, exported_at, locked_at, issue_date, zauctovane_at",
};

/** Hláška pre jeden doklad (detail) — prečo sa zaúčtovanie nedá zrušiť. */
export function textNezrusenia(dovod: DovodZamku, agenda: AgendaZrusenia): string {
  if (dovod === "odovzdany")
    return agenda === "prijata"
      ? "Faktúra je už odovzdaná do Pohody — najprv ju vráťte z Pohody, potom zrušte zaúčtovanie."
      : "Doklad je už odovzdaný do Pohody — najprv ho vráťte z Pohody, potom zrušte zaúčtovanie.";
  if (dovod === "zamknuty")
    return "Doklad je zamknutý proti úpravám — najprv ho odomknite, potom zrušte zaúčtovanie.";
  return "Doklad je v uzamknutom období — zaúčtovanie sa už nedá zrušiť.";
}

export type VysledokZrusenia = {
  zrusenych: number;
  /** „číslo: dôvod“ pre hromadnú akciu. */
  preskocene: string[];
  /** Dôvod pri každom preskočenom doklade (pre detail). */
  dovody: Record<string, DovodZamku>;
};

export async function zrusZauctovanie(
  sb: Klient,
  args: { companyId: string; agenda: AgendaZrusenia; ids: string[] },
): Promise<VysledokZrusenia> {
  const tabulka = TABULKA[args.agenda];
  const [{ data: riadky, error }, { data: firma }] = await Promise.all([
    sb.from(tabulka).select(STLPCE[args.agenda]).eq("company_id", args.companyId).in("id", args.ids),
    sb.from("companies").select("locked_until").eq("id", args.companyId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);

  const preskocene: string[] = [];
  const dovody: Record<string, DovodZamku> = {};
  const ok: any[] = [];
  const meno = (r: any) => r.invoice_number || r.document_number || r.supplier_name || "doklad";
  for (const r of (riadky ?? []) as any[]) {
    if (r.deleted_at || !r.zauctovane_at) continue;
    const z = dovodZamku(r, firma?.locked_until ?? null);
    if (z) {
      dovody[r.id] = z;
      preskocene.push(`${meno(r)}: ${NAZOV_ZAMKU[z]}`);
      continue;
    }
    ok.push(r);
  }
  if (!ok.length) return { zrusenych: 0, preskocene, dovody };

  const ids = ok.map((r) => r.id);
  // Chybu spúšťača (zámok Pohody, uzávierka) treba ukázať tak, ako ju povie databáza.
  const { data: hotove, error: e2 } = await sb
    .from(tabulka)
    .update({
      zauctovane_at: null,
      zauctoval: null,
      auto_uctovanie_at: new Date().toISOString(),
    })
    .eq("company_id", args.companyId)
    .in("id", ids)
    .is("exported_at", null)
    .select("id");
  if (e2) throw new Error(e2.message);
  // Prijatá „zaúčtovaná“ sa vráti na „prijatú“; zaplatená ostáva zaplatená.
  if (args.agenda === "prijata") {
    const { error: e3 } = await sb
      .from(tabulka)
      .update({ status: "received" })
      .eq("company_id", args.companyId)
      .in("id", ids)
      .eq("status", "booked");
    if (e3) throw new Error(e3.message);
  }
  return { zrusenych: (hotove ?? []).length, preskocene, dovody };
}
