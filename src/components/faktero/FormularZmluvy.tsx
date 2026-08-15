import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ulozZmluvuFn } from "@/lib/faktero/financovanie.functions";
import { kalendar, suhrn } from "@/lib/faktero/financovanie";
import { formatujSumu } from "@/lib/faktero/zostatky";
import { SK_VAT_RATES } from "@/lib/faktero/vat-rates";

/**
 * Formulár zmluvy o financovaní — spoločný pre založenie aj úpravu.
 *
 * Náhľad sa počíta **tou istou funkciou, akú použije server**, takže človek
 * vidí presne to, čo mu vznikne, a vie to porovnať so zmluvou ešte pred
 * uložením. Bez toho by musel uložiť a až potom zisťovať, že sa nezhoduje.
 *
 * Pri úprave sa prepočítajú len nezaplatené splátky — o to sa stará server.
 */

export type ZmluvaNaUpravu = {
  id: string;
  kind: "leasing" | "uver";
  name: string;
  provider_name: string | null;
  contract_number: string | null;
  variable_symbol: string | null;
  principal: number | string;
  interest_rate: number | string;
  term_months: number;
  first_due_date: string;
  payment_amount: number | string | null;
  vat_rate: number | string;
  down_payment: number | string;
  residual_value: number | string;
  day_count: string | null;
  interest_from: string | null;
  note: string | null;
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
  onUlozene,
  onZrusit,
}: {
  companyId: string;
  /** Bez nej sa zakladá nová. */
  zmluva?: ZmluvaNaUpravu | null;
  onUlozene: (id: string, splatok: number) => void;
  onZrusit?: () => void;
}) {
  const uloz = useServerFn(ulozZmluvuFn);

  const [kind, setKind] = useState<"leasing" | "uver">(zmluva?.kind ?? "leasing");
  const [name, setName] = useState(text(zmluva?.name));
  const [provider, setProvider] = useState(text(zmluva?.provider_name));
  const [contractNumber, setContractNumber] = useState(text(zmluva?.contract_number));
  const [vs, setVs] = useState(text(zmluva?.variable_symbol));
  const [principal, setPrincipal] = useState(text(zmluva?.principal));
  const [rate, setRate] = useState(zmluva ? text(zmluva.interest_rate) : "");
  const [months, setMonths] = useState(zmluva ? String(zmluva.term_months) : "60");
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

  const nahlad = useMemo(() => {
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
    if (z.principal <= 0 || z.term_months <= 0) return null;
    const riadky = kalendar(z);
    return { riadky, suhrn: suhrn(riadky, z) };
  }, [principal, rate, months, firstDue, payment, vat, residual, dayCount, interestFrom]);

  async function odosli() {
    if (!name.trim()) {
      toast.error("Zmluva potrebuje názov — nech ju v zozname spoznáte.");
      return;
    }
    if (cislo(principal) <= 0) {
      toast.error("Zadajte financovanú sumu.");
      return;
    }
    setUkladam(true);
    try {
      const r = await uloz({
        data: {
          id: zmluva?.id ?? null,
          company_id: companyId,
          kind,
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
        <div>
          <span className={popis}>Druh</span>
          <div className="flex gap-2">
            {(
              [
                ["leasing", "Leasing"],
                ["uver", "Úver"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  // Úver splátku bez DPH; leasingová ju spravidla obsahuje.
                  if (k === "uver") setVat(0);
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
          <div>
            <label className={popis}>Variabilný symbol splátok</label>
            <input className={pole} value={vs} onChange={(e) => setVs(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              Podľa neho sa platba spozná v banke. Bez neho sa páruje podľa mena protistrany a
              sporné prípady necháme na vás.
            </p>
          </div>
        </div>

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
            <select className={pole} value={vat} onChange={(e) => setVat(Number(e.target.value))}>
              <option value={0}>bez DPH</option>
              {SK_VAT_RATES.filter((r) => r > 0).map((r) => (
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
              Zaplatená na začiatku — do kalendára nevstupuje, financovanú sumu zadajte už bez nej.
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
          {ukladam ? "Ukladám…" : "Uložiť a vytvoriť kalendár"}
        </button>
      </div>

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
          Kalendár je anuitný — splátka je rovnaká, ale mení sa jej zloženie. Ak sa čísla nezhodujú
          so zmluvou, vyplňte <strong>Splátku zo zmluvy</strong>; kalendár sa dopočíta z nej a bude
          sedieť na cent. Už zaplatené splátky sa prepočtom nemenia.
        </p>
      </div>
    </div>
  );
}
