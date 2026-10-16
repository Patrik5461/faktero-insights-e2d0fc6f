import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ulozZmluvuFn } from "@/lib/faktero/financovanie.functions";
import { uctyPreKontokorentFn } from "@/lib/faktero/kontokorent.functions";
import {
  DRUHY_FINANCOVANIA,
  OBDOBIA_UROCENIA,
  normIban,
  uctPodlaIban,
  type DruhFinancovania,
  type ObdobieUrocenia,
} from "@/lib/faktero/kontokorent";
import { kalendar, suhrn, type Zmluva } from "@/lib/faktero/financovanie";
import { formatujSumu } from "@/lib/faktero/zostatky";
import { sadzbyKrajiny } from "@/lib/faktero/vat-rates";

import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formulár zmluvy o financovaní — spoločný pre založenie aj úpravu.
 *
 * Náhľad sa počíta **tou istou funkciou, akú použije server**, takže človek
 * vidí presne to, čo mu vznikne, a vie to porovnať so zmluvou ešte pred
 * uložením. Bez toho by musel uložiť a až potom zisťovať, že sa nezhoduje.
 *
 * Pri úprave sa prepočítajú len nezaplatené splátky — o to sa stará server.
 *
 * Kontokorentný úver je iný: nemá splátkový kalendár, ale úverový rámec na
 * účte. Pri ňom sa polia kalendára skryjú a ukáže sa limit, účet, sadzba,
 * poplatok za rámec, platnosť a obdobie úročenia.
 */

export type ZmluvaNaUpravu = {
  id: string;
  kind: DruhFinancovania;
  name: string;
  provider_name: string | null;
  contract_number: string | null;
  variable_symbol: string | null;
  principal: number | string | null;
  interest_rate: number | string;
  term_months: number | null;
  first_due_date: string | null;
  payment_amount: number | string | null;
  vat_rate: number | string;
  down_payment: number | string;
  residual_value: number | string;
  day_count: string | null;
  interest_from: string | null;
  note: string | null;
  /** 'zmluva' = kalendár je prečítaný z dokumentu a neprepočítava sa. */
  schedule_source?: string | null;
  currency?: string | null;
  /* Kontokorent */
  credit_limit?: number | string | null;
  bank_account_id?: string | null;
  account_iban?: string | null;
  limit_fee_yearly?: number | string | null;
  valid_until?: string | null;
  interest_period?: string | null;
};

type UcetFirmy = {
  id: string;
  account_name: string | null;
  iban: string | null;
  currency: string;
};

/** Kalendár prečítaný z nahratého dokumentu — riadok po riadku tak, ako je. */
export type SplatkaZoZmluvy = {
  number: number;
  due_date: string;
  amount: number;
  principal_part: number;
  interest_part: number;
  vat_amount: number;
  remaining_principal: number;
};

function cislo(v: string): number {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function FormularZmluvy({
  companyId,
  zmluva,
  zoZmluvy,
  onUlozene,
  onZrusit,
}: {
  companyId: string;
  /** Bez nej sa zakladá nová. */
  zmluva?: ZmluvaNaUpravu | null;
  /** Čo sa prečítalo z nahratého dokumentu. Kalendár odtiaľ má prednosť. */
  zoZmluvy?: {
    document_path: string | null;
    splatky: SplatkaZoZmluvy[];
    vyhrady: string[];
  } | null;
  onUlozene: (id: string, splatok: number) => void;
  onZrusit?: () => void;
}) {
  const uloz = useServerFn(ulozZmluvuFn);

  /* Sadzby DPH vyplývajú z krajiny registrácie firmy, nenastavujú sa ručne. */

  const krajina = useKrajinaDane();

  const nacitajUcty = useServerFn(uctyPreKontokorentFn);
  const [kind, setKind] = useState<DruhFinancovania>(zmluva?.kind ?? "leasing");
  const kontokorent = kind === "kontokorent";
  const [name, setName] = useState(text(zmluva?.name));
  const [provider, setProvider] = useState(text(zmluva?.provider_name));
  const [contractNumber, setContractNumber] = useState(text(zmluva?.contract_number));
  const [vs, setVs] = useState(text(zmluva?.variable_symbol));
  const [principal, setPrincipal] = useState(text(zmluva?.principal));
  const [rate, setRate] = useState(zmluva ? text(zmluva.interest_rate) : "");
  const [months, setMonths] = useState(zmluva?.term_months ? String(zmluva.term_months) : "60");
  const [firstDue, setFirstDue] = useState(
    zmluva?.first_due_date ?? new Date().toISOString().slice(0, 10),
  );
  const [payment, setPayment] = useState(text(zmluva?.payment_amount));
  const [vat, setVat] = useState(Number(zmluva?.vat_rate ?? 0));
  const [downPayment, setDownPayment] = useState(text(zmluva?.down_payment));
  const [residual, setResidual] = useState(text(zmluva?.residual_value));
  const [dayCount, setDayCount] = useState<"ACT/365" | "ACT/360" | "30E/360">(
    (zmluva?.day_count as "ACT/365") ?? "ACT/365",
  );
  const [interestFrom, setInterestFrom] = useState(text(zmluva?.interest_from));
  const [note, setNote] = useState(text(zmluva?.note));
  const [ukladam, setUkladam] = useState(false);

  /* Kontokorent */
  const [limit, setLimit] = useState(text(zmluva?.credit_limit));
  const [ucetId, setUcetId] = useState(text(zmluva?.bank_account_id));
  const [iban, setIban] = useState(text(zmluva?.account_iban));
  const [poplatokRocne, setPoplatokRocne] = useState(text(zmluva?.limit_fee_yearly));
  const [platnostDo, setPlatnostDo] = useState(text(zmluva?.valid_until));
  const [obdobie, setObdobie] = useState<ObdobieUrocenia>(
    zmluva?.interest_period === "stvrtrocne" ? "stvrtrocne" : "mesacne",
  );
  const [ucty, setUcty] = useState<UcetFirmy[] | null>(null);

  // Účty sa načítajú až pri kontokorente — leasing ani úver ich nepotrebujú.
  useEffect(() => {
    if (!kontokorent || ucty !== null) return;
    nacitajUcty({ data: { company_id: companyId } })
      .then((r) => {
        setUcty(r.ucty);
        // IBAN prečítaný zo zmluvy priradí napojený účet sám.
        if (!ucetId && iban) {
          const u = uctPodlaIban(iban, r.ucty);
          if (u) setUcetId(u.id);
        }
      })
      .catch(() => setUcty([]));
  }, [kontokorent, ucty, nacitajUcty, companyId, ucetId, iban]);

  /*
   * Kalendár z dokumentu sa nikdy neprepočítava — sú to sumy, ktoré banka
   * naozaj stiahne, a vlastný výpočet sa od nich o pár centov líši.
   * `drziKalendarZoZmluvy` platí aj pri úprave zmluvy, ktorá už taký kalendár
   * má; inak by úprava názvu prepísala predpis dopočítanými číslami.
   */
  const riadkyZoZmluvy = zoZmluvy?.splatky ?? [];
  const drziKalendarZoZmluvy = riadkyZoZmluvy.length > 0 || zmluva?.schedule_source === "zmluva";

  const nahlad = useMemo(() => {
    if (kontokorent) return null;
    if (riadkyZoZmluvy.length > 0) {
      const z = { principal: cislo(principal) } as Zmluva;
      return { riadky: riadkyZoZmluvy, suhrn: suhrn(riadkyZoZmluvy, z) };
    }
    const z = {
      principal: cislo(principal),
      interest_rate: cislo(rate),
      term_months: Math.floor(cislo(months)),
      first_due_date: firstDue,
      payment_amount: payment ? cislo(payment) : null,
      vat_rate: vat,
      residual_value: cislo(residual),
      day_count: dayCount,
      interest_from: interestFrom || null,
    };
    // Bez platnej prvej splatnosti sa kalendár nedá postaviť — radšej žiadny
    // náhľad než riadky s vymysleným dátumom.
    if (z.principal <= 0 || z.term_months <= 0 || !DATUM.test(firstDue)) return null;
    const riadky = kalendar(z);
    return { riadky, suhrn: suhrn(riadky, z) };
  }, [
    principal,
    rate,
    months,
    firstDue,
    payment,
    vat,
    residual,
    dayCount,
    interestFrom,
    riadkyZoZmluvy,
    kontokorent,
  ]);

  async function odosliKontokorent() {
    if (cislo(limit) <= 0) {
      toast.error("Zadajte úverový rámec (limit).");
      return;
    }
    setUkladam(true);
    try {
      const r = await uloz({
        data: {
          id: zmluva?.id ?? null,
          company_id: companyId,
          kind: "kontokorent",
          name: name.trim(),
          provider_name: provider.trim() || null,
          contract_number: contractNumber.trim() || null,
          counterparty_hint: provider.trim() || null,
          currency: ucty?.find((u) => u.id === ucetId)?.currency ?? zmluva?.currency ?? "EUR",
          interest_rate: cislo(rate),
          credit_limit: cislo(limit),
          bank_account_id: ucetId || null,
          account_iban: iban.trim() ? normIban(iban) : null,
          limit_fee_yearly: poplatokRocne.trim() ? cislo(poplatokRocne) : null,
          valid_until: DATUM.test(platnostDo) ? platnostDo : null,
          interest_period: obdobie,
          note: note.trim() || null,
          ...(zoZmluvy?.document_path ? { document_path: zoZmluvy.document_path } : {}),
        },
      });
      onUlozene(r.id, 0);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Zmluvu sa nepodarilo uložiť.");
    } finally {
      setUkladam(false);
    }
  }

  async function odosli() {
    if (!name.trim()) {
      toast.error("Zmluva potrebuje názov — nech ju v zozname spoznáte.");
      return;
    }
    if (kontokorent) {
      await odosliKontokorent();
      return;
    }
    if (cislo(principal) <= 0) {
      toast.error("Zadajte financovanú sumu.");
      return;
    }
    if (!DATUM.test(firstDue)) {
      toast.error("Doplňte splatnosť prvej splátky — bez nej sa kalendár nedá zapísať.");
      return;
    }
    setUkladam(true);
    try {
      const r = await uloz({
        data: {
          id: zmluva?.id ?? null,
          company_id: companyId,
          kind: kind as "leasing" | "uver",
          name: name.trim(),
          provider_name: provider.trim() || null,
          contract_number: contractNumber.trim() || null,
          variable_symbol: vs.trim() || null,
          counterparty_hint: provider.trim() || null,
          currency: "EUR",
          principal: cislo(principal),
          interest_rate: cislo(rate),
          term_months: Math.floor(cislo(months)),
          first_due_date: firstDue,
          payment_amount: payment ? cislo(payment) : null,
          vat_rate: vat,
          down_payment: cislo(downPayment),
          residual_value: cislo(residual),
          day_count: dayCount,
          interest_from: interestFrom || null,
          note: note.trim() || null,
          ...(zoZmluvy?.document_path ? { document_path: zoZmluvy.document_path } : {}),
          ...(riadkyZoZmluvy.length ? { splatky: riadkyZoZmluvy } : {}),
        },
      });
      onUlozene(r.id, r.splatok);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Zmluvu sa nepodarilo uložiť.");
    } finally {
      setUkladam(false);
    }
  }

  const pole = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
  const popis = "mb-1 block text-sm font-medium";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-5 rounded-xl border bg-card p-5">
        {drziKalendarZoZmluvy && !kontokorent && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
            <p className="font-medium">Kalendár je z dokumentu.</p>
            <p className="mt-1 text-muted-foreground">
              {riadkyZoZmluvy.length > 0
                ? `Prečítalo sa ${riadkyZoZmluvy.length} splátok a uložia sa presne tak, ako sú v zmluve — Faktero ich neprepočítava.`
                : "Riadky prišli z nahratej zmluvy. Úprava údajov nižšie ich neprepíše — kalendár ostáva taký, aký je v zmluve."}
            </p>
            {(zoZmluvy?.vyhrady ?? []).length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700 dark:text-amber-400">
                {zoZmluvy!.vyhrady.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <span className={popis}>Druh</span>
          <div className="flex flex-wrap gap-2">
            {DRUHY_FINANCOVANIA.map(({ kluc: k, nazov: l }) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  // Úver splátku bez DPH; leasingová ju spravidla obsahuje.
                  if (k !== "leasing") setVat(0);
                }}
                className={`rounded-lg border px-4 py-2 text-sm ${
                  kind === k ? "border-primary bg-primary/10 font-medium" : ""
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={popis}>Názov</label>
            <input
              className={pole}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Škoda Octavia"
            />
          </div>
          <div>
            <label className={popis}>Leasingovka alebo banka</label>
            <input
              className={pole}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="ČSOB Leasing"
            />
          </div>
          <div>
            <label className={popis}>Číslo zmluvy</label>
            <input
              className={pole}
              value={contractNumber}
              onChange={(e) => setContractNumber(e.target.value)}
            />
          </div>
          {!kontokorent && (
            <div>
              <label className={popis}>Variabilný symbol splátok</label>
              <input className={pole} value={vs} onChange={(e) => setVs(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                Podľa neho sa platba spozná v banke. Bez neho sa páruje podľa mena protistrany a
                sporné prípady necháme na vás.
              </p>
            </div>
          )}
        </div>

        {kontokorent && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={popis}>Úverový rámec (limit)</label>
              <input
                className={pole}
                inputMode="decimal"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="20000"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Do koľkých mínusov smie účet ísť.
              </p>
            </div>
            <div>
              <label className={popis}>Účet, na ktorom je rámec</label>
              <select
                className={pole}
                value={ucetId}
                onChange={(e) => {
                  setUcetId(e.target.value);
                  const u = ucty?.find((x) => x.id === e.target.value);
                  if (u?.iban) setIban(u.iban);
                }}
              >
                <option value="">— účet nie je napojený —</option>
                {(ucty ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {[u.account_name, u.iban].filter(Boolean).join(" · ") || u.id}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Z tohto účtu banka strhne úroky — podľa neho ich Faktero spozná.
              </p>
            </div>
            {!ucetId && (
              <div className="sm:col-span-2">
                <label className={popis}>IBAN účtu</label>
                <input
                  className={pole}
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="SK31 1200 0000 1987 4263 7541"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Keď účet napojíte neskôr, zmluva sa k nemu priradí pri ďalšom uložení podľa IBAN.
                </p>
              </div>
            )}
            <div>
              <label className={popis}>Úrok % p. a.</label>
              <input
                className={pole}
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="7,5"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Pri pohyblivej sadzbe (napr. 3M EURIBOR + marža) zadajte aktuálnu výslednú a
                zloženie si poznačte do poznámky.
              </p>
            </div>
            <div>
              <label className={popis}>Poplatok za rámec ročne</label>
              <input
                className={pole}
                inputMode="decimal"
                value={poplatokRocne}
                onChange={(e) => setPoplatokRocne(e.target.value)}
                placeholder="0"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Suma za rok. Keď ho banka účtuje mesačne, vynásobte dvanástimi.
              </p>
            </div>
            <div>
              <label className={popis}>Rámec platí do</label>
              <input
                type="date"
                className={pole}
                value={platnostDo}
                onChange={(e) => setPlatnostDo(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Prázdne = na dobu neurčitú alebo s automatickým predĺžením.
              </p>
            </div>
            <div>
              <label className={popis}>Úrok banka strhne</label>
              <select
                className={pole}
                value={obdobie}
                onChange={(e) => setObdobie(e.target.value as ObdobieUrocenia)}
              >
                {OBDOBIA_UROCENIA.map((o) => (
                  <option key={o.kluc} value={o.kluc}>
                    {o.nazov}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {!kontokorent && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={popis}>Financovaná suma (istina)</label>
                <input
                  className={pole}
                  inputMode="decimal"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  placeholder="20000"
                />
              </div>
              <div>
                <label className={popis}>Úrok % p. a.</label>
                <input
                  className={pole}
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="5"
                />
              </div>
              <div>
                <label className={popis}>Počet splátok</label>
                <input
                  className={pole}
                  inputMode="numeric"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                />
              </div>
              <div>
                <label className={popis}>Prvá splátka</label>
                <input
                  type="date"
                  className={pole}
                  value={firstDue}
                  onChange={(e) => setFirstDue(e.target.value)}
                />
              </div>
              <div>
                <label className={popis}>Deň čerpania</label>
                <input
                  type="date"
                  className={pole}
                  value={interestFrom}
                  onChange={(e) => setInterestFrom(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Odkedy banka počíta úrok. Keď ho necháte prázdny, ráta sa mesiac pred prvou
                  splátkou — a prvý riadok potom môže o pár eur ujsť.
                </p>
              </div>
              <div>
                <label className={popis}>Výpočet úroku</label>
                <select
                  className={pole}
                  value={dayCount}
                  onChange={(e) => setDayCount(e.target.value as "ACT/365")}
                >
                  <option value="ACT/365">ACT/365 – skutočné dni</option>
                  <option value="ACT/360">ACT/360 – skutočné dni</option>
                  <option value="30E/360">30E/360 – mesiac 30 dní</option>
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Slovenské banky bežne používajú ACT/365 — dlhší mesiac stojí viac na úroku.
                </p>
              </div>
              <div>
                <label className={popis}>Splátka zo zmluvy</label>
                <input
                  className={pole}
                  inputMode="decimal"
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                  placeholder="dopočíta sa"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Vyplňte, ak ju máte v zmluve — má prednosť pred výpočtom.
                </p>
              </div>
              <div>
                <label className={popis}>DPH v splátke</label>
                <select
                  className={pole}
                  value={vat}
                  onChange={(e) => setVat(Number(e.target.value))}
                >
                  <option value={0}>bez DPH</option>
                  {sadzbyKrajiny(krajina)
                    .filter((r) => r > 0)
                    .map((r) => (
                      <option key={r} value={r}>
                        {r} %
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={popis}>Akontácia</label>
                <input
                  className={pole}
                  inputMode="decimal"
                  value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)}
                  placeholder="0"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Zaplatená na začiatku — do kalendára nevstupuje, financovanú sumu zadajte už bez
                  nej.
                </p>
              </div>
              <div>
                <label className={popis}>Zostatková cena</label>
                <input
                  className={pole}
                  inputMode="decimal"
                  value={residual}
                  onChange={(e) => setResidual(e.target.value)}
                  placeholder="0"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Splatná na konci — pripočíta sa k poslednej splátke.
                </p>
              </div>
            </div>
          </>
        )}

        <div>
          <label className={popis}>Poznámka</label>
          <textarea
            className={pole}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <button
          onClick={odosli}
          disabled={ukladam}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {ukladam ? "Ukladám…" : kontokorent ? "Uložiť" : "Uložiť a vytvoriť kalendár"}
        </button>
      </div>

      {kontokorent ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-medium">Náhľad</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Úverový rámec</dt>
                <dd className="font-medium tabular-nums">{formatujSumu(cislo(limit), "EUR")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Úrok pri plnom čerpaní za mesiac</dt>
                <dd className="tabular-nums">
                  {formatujSumu(
                    Math.round(((cislo(limit) * cislo(rate)) / 100 / 12) * 100) / 100,
                    "EUR",
                  )}
                </dd>
              </div>
              {cislo(poplatokRocne) > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Poplatok za rámec mesačne</dt>
                  <dd className="tabular-nums">
                    {formatujSumu(Math.round((cislo(poplatokRocne) / 12) * 100) / 100, "EUR")}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            Kontokorent nemá splátkový kalendár. Istinu splácajú príjmy na účet; Faktero sleduje
            čerpanie podľa zostatku účtu a úroky a poplatky, ktoré banka z účtu strhne, si k zmluve
            páruje samo.
          </p>
          {(zoZmluvy?.vyhrady ?? []).length > 0 && (
            <ul className="list-disc space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 pl-8 text-xs text-amber-700 dark:text-amber-400">
              {zoZmluvy!.vyhrady.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-medium">Náhľad</h2>
            {!nahlad ? (
              <p className="text-sm text-muted-foreground">
                Zadajte financovanú sumu a počet splátok.
              </p>
            ) : (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Mesačná splátka</dt>
                  <dd className="font-medium tabular-nums">
                    {formatujSumu(nahlad.riadky[0].amount, "EUR")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Zaplatíte spolu</dt>
                  <dd className="tabular-nums">{formatujSumu(nahlad.suhrn.zaplatiSpolu, "EUR")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Z toho úrok</dt>
                  <dd className="tabular-nums">{formatujSumu(nahlad.suhrn.urokSpolu, "EUR")}</dd>
                </div>
                {nahlad.suhrn.dphSpolu > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Z toho DPH</dt>
                    <dd className="tabular-nums">{formatujSumu(nahlad.suhrn.dphSpolu, "EUR")}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <dt className="text-muted-foreground">Splátok</dt>
                  <dd className="tabular-nums">{nahlad.suhrn.splatok}</dd>
                </div>
              </dl>
            )}
          </div>

          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            {drziKalendarZoZmluvy ? (
              <>
                Riadky sú prevzaté z dokumentu, nie dopočítané — sedia s predpisom banky na cent.
                Údaje vyššie slúžia na párovanie platieb a na zaúčtovanie. Už zaplatené splátky sa
                nemenia.
              </>
            ) : (
              <>
                Kalendár je anuitný — splátka je rovnaká, ale mení sa jej zloženie. Ak sa čísla
                nezhodujú so zmluvou, vyplňte <strong>Splátku zo zmluvy</strong>; kalendár sa
                dopočíta z nej a bude sedieť na cent. Už zaplatené splátky sa prepočtom nemenia.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
