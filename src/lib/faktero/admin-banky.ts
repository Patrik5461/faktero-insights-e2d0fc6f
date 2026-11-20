/*
  Admin → Banky: prehľad bankových pripojení naprieč firmami pre podporu.

  Len čítanie. Zo `bank_connections` sa berú výhradne bežné stĺpce — `metadata`
  nesie súkromné kľúče (Wise, Revolut, Wallester) a tokeny sú šifrované, takže
  do prehliadača nesmie ísť ani jedno. Stav súhlasu banka neposiela vopred
  (dátum vypršania sa nikde neukladá); pozná sa až z chyby pri sťahovaní
  pohybov (`pohyby_chyba_suhlas`, SCA_EXPIRED/CONSENT_*).
*/
import { jeChybaSuhlasu, pohybyZastarane } from "./bank-stav-pohybov";

export type PripojenieVstup = {
  id: string;
  company_id: string;
  provider: string;
  status: string;
  last_synced_at: string | null;
  created_at: string | null;
  /** Pri prepojení cez bankové notifikácie (provider „email“) názov banky z metadata. */
  banka?: string | null;
};

export type UcetVstup = {
  bank_connection_id: string;
  iban: string | null;
  last_synced_at: string | null;
  pohyby_ok_at: string | null;
  pohyby_chyba: string | null;
  pohyby_chyba_suhlas: string | null;
  unavailable_since: string | null;
  unavailable_reason: string | null;
};

export type FirmaVstup = { id: string; name: string | null; ico: string | null; testovacia_pre: string | null };

export type StavBanky = "suhlas" | "chyba" | "ok" | "caka" | "odpojene";
export type FilterBanky = "vsetky" | "suhlas" | "chyba" | "ok";

export type RiadokBanky = {
  id: string;
  companyId: string;
  firma: string;
  ico: string | null;
  testovacia: boolean;
  provider: string;
  banka: string;
  status: string;
  stav: StavBanky;
  uctov: number;
  /** Najstaršie posledné úspešné stiahnutie pohybov spomedzi účtov — tam sa to zasekne najskôr. */
  poslednePohyby: string | null;
  poslednaSync: string | null;
  vytvorene: string | null;
  chyby: string[];
};

const NAZVY: Record<string, string> = {
  tatrabanka: "Tatra banka",
  wise: "Wise",
  revolut: "Revolut",
  wallester: "Wallester",
  fio: "Fio banka",
  email: "Bankové notifikácie (e-mail)",
};

export function nazovBanky(provider: string, banka?: string | null): string {
  const zaklad = NAZVY[provider] ?? provider;
  return provider === "email" && banka ? `${zaklad} · ${banka}` : zaklad;
}

function max(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function stavPripojenia(
  p: Pick<PripojenieVstup, "status">,
  ucty: UcetVstup[],
  teraz: Date = new Date(),
): StavBanky {
  if (p.status === "disconnected") return "odpojene";
  if (p.status === "pending" || p.status === "pending_authorization") return "caka";
  if (ucty.some((u) => !!u.pohyby_chyba_suhlas || (!!u.pohyby_chyba && jeChybaSuhlasu(u.pohyby_chyba))))
    return "suhlas";
  if (
    p.status === "error" ||
    ucty.some((u) => !!u.unavailable_since || pohybyZastarane(u, teraz))
  )
    return "chyba";
  return "ok";
}

export function zostavPrehladBank(
  pripojenia: PripojenieVstup[],
  ucty: UcetVstup[],
  firmy: FirmaVstup[],
  teraz: Date = new Date(),
): RiadokBanky[] {
  const podlaPripojenia = new Map<string, UcetVstup[]>();
  for (const u of ucty) {
    const z = podlaPripojenia.get(u.bank_connection_id) ?? [];
    z.push(u);
    podlaPripojenia.set(u.bank_connection_id, z);
  }
  const firmaMapa = new Map(firmy.map((f) => [f.id, f]));

  return pripojenia.map((p) => {
    const u = podlaPripojenia.get(p.id) ?? [];
    const f = firmaMapa.get(p.company_id);
    const pohyby = u.map((x) => x.pohyby_ok_at).filter((x): x is string => !!x).sort();
    let sync = p.last_synced_at;
    for (const x of u) sync = max(sync, x.last_synced_at);
    const chyby = Array.from(
      new Set(
        u.flatMap((x) => [x.pohyby_chyba, x.unavailable_reason]).filter((x): x is string => !!x),
      ),
    );
    return {
      id: p.id,
      companyId: p.company_id,
      firma: f?.name ?? "—",
      ico: f?.ico ?? null,
      testovacia: !!f?.testovacia_pre,
      provider: p.provider,
      banka: nazovBanky(p.provider, p.banka),
      status: p.status,
      stav: stavPripojenia(p, u, teraz),
      uctov: u.length,
      // Účet, ktorý pohyby ešte nikdy nestiahol, je najstarší zo všetkých.
      poslednePohyby: u.length && pohyby.length < u.length ? null : (pohyby[0] ?? null),
      poslednaSync: sync,
      vytvorene: p.created_at,
      chyby,
    };
  });
}

/** Filter a zoradenie: najstaršie pohyby hore (bez pohybov úplne hore). */
export function filtrujBanky(
  riadky: RiadokBanky[],
  o: { filter: FilterBanky; sTestovacimi: boolean },
): RiadokBanky[] {
  return riadky
    .filter((r) => o.sTestovacimi || !r.testovacia)
    .filter((r) => o.filter === "vsetky" || r.stav === o.filter)
    .sort((a, b) => {
      const x = a.poslednePohyby ?? "";
      const y = b.poslednePohyby ?? "";
      if (x !== y) return x < y ? -1 : 1;
      return a.firma.localeCompare(b.firma, "sk");
    });
}

export function poctyStavov(riadky: RiadokBanky[]): Record<StavBanky, number> {
  const p: Record<StavBanky, number> = { suhlas: 0, chyba: 0, ok: 0, caka: 0, odpojene: 0 };
  for (const r of riadky) p[r.stav]++;
  return p;
}
