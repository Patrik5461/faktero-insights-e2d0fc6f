import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { formatujIban } from "@/lib/faktero/platobny-ucet";
import { formatovacMeny } from "@/lib/faktero/mena";
import {
  datumUhrady,
  pripravPlatby,
  zostavPain001,
  type FakturaNaUhradu,
} from "@/lib/faktero/hromadny-prikaz";

type Ucet = {
  id: string;
  name: string | null;
  iban: string;
  swift: string | null;
  is_default: boolean;
};

const eur = formatovacMeny("EUR", "sk-SK");
const dnes = () => new Date().toLocaleDateString("sv-SE");

/**
 * Hromadný príkaz na úhradu z vybraných prijatých faktúr. Súbor sa stiahne a
 * nahrá do internetbankingu; faktúry sa tu za zaplatené neoznačujú — platba
 * ešte môže zlyhať. Zaplatenými ich spraví až párovanie s pohybom z účtu.
 */
export function HromadnyPrikaz({
  companyId,
  faktury,
  onClose,
}: {
  companyId: string;
  faktury: FakturaNaUhradu[];
  onClose: () => void;
}) {
  useZatvorNaEscape(onClose);
  const [ucty, setUcty] = useState<Ucet[] | null>(null);
  const [meno, setMeno] = useState("");
  const [ucetId, setUcetId] = useState("");
  const [datum, setDatum] = useState(dnes());
  const [podlaSplatnosti, setPodlaSplatnosti] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [{ data: u }, { data: firma }] = await Promise.all([
        supabase
          .from("company_bank_accounts")
          .select("id, name, iban, swift, is_default")
          .eq("company_id", companyId)
          .order("position", { ascending: true }),
        supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
      ]);
      const zoznam = ((u ?? []) as Ucet[]).filter((x) => x.iban);
      setUcty(zoznam);
      setUcetId((zoznam.find((x) => x.is_default) ?? zoznam[0])?.id ?? "");
      setMeno((firma as any)?.name ?? "");
    })();
  }, [companyId]);

  /*
    Čo je z faktúr už zaplatené: odchádzajúce platby spárované z banky
    (čiastočná úhrada) a zaplatená prijatá zálohová faktúra, ktorú faktúra
    vyúčtováva. Kým sa to nenačíta, príkaz sa nedá stiahnuť.
  */
  const [uhrady, setUhrady] = useState<Record<string, { uhradene: number; zaloha: number }> | null>(
    null,
  );
  useEffect(() => {
    void (async () => {
      const ids = faktury.map((f) => f.id);
      const zalohoveIds = [
        ...new Set(faktury.map((f: any) => f.advance_invoice_id).filter(Boolean) as string[]),
      ];
      const [{ data: pohyby }, { data: zalohove }] = await Promise.all([
        ids.length
          ? supabase
              .from("bank_transactions")
              .select("matched_purchase_invoice_id, amount")
              .eq("company_id", companyId)
              .in("matched_purchase_invoice_id", ids)
          : Promise.resolve({ data: [] as any[] }),
        zalohoveIds.length
          ? supabase
              .from("purchase_invoices")
              .select("id, amount_total, status")
              .eq("company_id", companyId)
              .in("id", zalohoveIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const out: Record<string, { uhradene: number; zaloha: number }> = {};
      for (const p of (pohyby ?? []) as any[]) {
        // Úhrada dodávateľovi je odchádzajúca platba (záporná suma).
        if (!(Number(p.amount) < 0)) continue;
        const k = String(p.matched_purchase_invoice_id);
        out[k] = out[k] ?? { uhradene: 0, zaloha: 0 };
        out[k].uhradene += Math.abs(Number(p.amount));
      }
      const zaplateneZalohy = new Map(
        ((zalohove ?? []) as any[])
          .filter((z) => z.status === "paid")
          .map((z) => [String(z.id), Number(z.amount_total ?? 0)]),
      );
      for (const f of faktury as any[]) {
        const z = f.advance_invoice_id
          ? zaplateneZalohy.get(String(f.advance_invoice_id))
          : undefined;
        if (!z) continue;
        out[f.id] = out[f.id] ?? { uhradene: 0, zaloha: 0 };
        out[f.id].zaloha = z;
      }
      setUhrady(out);
    })();
  }, [faktury, companyId]);

  const { platby, preskocene } = useMemo(
    () =>
      pripravPlatby(
        faktury.map((f) => ({
          ...f,
          uhradene: uhrady?.[f.id]?.uhradene ?? 0,
          zaloha: uhrady?.[f.id]?.zaloha ?? 0,
        })),
      ),
    [faktury, uhrady],
  );
  const spolu = platby.reduce((s, p) => s + Math.round(p.suma * 100), 0) / 100;
  const dni = new Set(platby.map((p) => datumUhrady(p, { datum, podlaSplatnosti }))).size;

  function stiahni() {
    const ucet = ucty?.find((u) => u.id === ucetId);
    if (!ucet) return;
    setBusy(true);
    try {
      const xml = zostavPain001(platby, {
        platitel: { meno, iban: ucet.iban, bic: ucet.swift },
        datum,
        podlaSplatnosti,
      });
      const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `hromadny-prikaz-${datum}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        `Príkaz na ${platby.length} ${platby.length === 1 ? "platbu" : platby.length >= 2 && platby.length <= 4 ? "platby" : "platieb"} stiahnutý. Nahrajte ho v internetbankingu.`,
      );
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hromadný príkaz na úhradu"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Hromadný príkaz na úhradu</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Súbor SEPA XML, ktorý nahráte do internetbankingu ako hromadný príkaz. Prijme ho každá
          slovenská aj česká banka.
        </p>

        <div className="mt-4 rounded-md bg-secondary/50 p-3 text-sm">
          <span className="font-medium">
            {platby.length}{" "}
            {platby.length === 1
              ? "platba"
              : platby.length >= 2 && platby.length <= 4
                ? "platby"
                : "platieb"}
          </span>{" "}
          spolu <span className="font-semibold tabular-nums">{eur(spolu)}</span>
        </div>

        {platby.some((p) => p.odpocitane > 0) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Platí sa len zvyšok (už uhradené z banky alebo zálohou):{" "}
            {platby
              .filter((p) => p.odpocitane > 0)
              .map((p) => `${p.cisloFaktury} −${eur(p.odpocitane)}`)
              .join(", ")}
            .
          </p>
        )}

        {platby.some((p) => !p.vs) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Bez variabilného symbolu pôjde{" "}
            {platby
              .filter((p) => !p.vs)
              .map((p) => p.cisloFaktury)
              .join(", ")}{" "}
            — dodávateľ platbu spozná len podľa čísla faktúry v správe pre príjemcu. Symbol doplníte
            v detaile faktúry.
          </p>
        )}

        {preskocene.length > 0 && (
          <div className="mt-3 flex gap-2 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Do príkazu nepôjde {preskocene.length}:</div>
              <ul className="mt-1 space-y-0.5">
                {preskocene.map((p) => (
                  <li key={p.id}>
                    {p.cisloFaktury} — {p.dovod}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {platby.length > 0 && (
          <div className="mt-4 space-y-3 text-sm">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Platiť z účtu</span>
              {ucty === null ? (
                <div className="mt-1 text-muted-foreground">Načítavam účty…</div>
              ) : ucty.length === 0 ? (
                <div className="mt-1 text-destructive">
                  Firma nemá zadaný bankový účet — doplňte ho v nastaveniach firmy.
                </div>
              ) : (
                <select
                  value={ucetId}
                  onChange={(e) => setUcetId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2"
                >
                  {ucty.map((u) => (
                    <option key={u.id} value={u.id}>
                      {(u.name ? `${u.name} · ` : "") + formatujIban(u.iban)}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Dátum úhrady</span>
              <input
                type="date"
                value={datum}
                min={dnes()}
                onChange={(e) => setDatum(e.target.value || dnes())}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2"
              />
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={podlaSplatnosti}
                onChange={(e) => setPodlaSplatnosti(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Každú faktúru zaplatiť až v deň splatnosti
                <span className="block text-xs text-muted-foreground">
                  Faktúry po splatnosti pôjdu v zvolený dátum.
                  {podlaSplatnosti && dni > 1 && ` Banka dostane ${dni} dávky podľa dátumu.`}
                </span>
              </span>
            </label>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            Zavrieť
          </button>
          {platby.length > 0 && (
            <button
              onClick={stiahni}
              disabled={busy || !ucetId || uhrady === null}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Stiahnuť XML
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
