import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";

type Zaznam = { id: string; pole: string; pred: unknown; po: unknown; kto: string | null; kedy: string };

const POLIA: Record<string, string> = {
  _vytvoreny: "Doklad vytvorený",
  invoice_number: "Číslo",
  document_number: "Číslo",
  supplier_name: "Dodávateľ",
  supplier_ico: "IČO",
  supplier_iban: "IBAN",
  issue_date: "Dátum vystavenia",
  delivery_date: "Dátum dodania",
  due_date: "Splatnosť",
  amount_without_vat: "Základ",
  net_amount: "Základ",
  vat_amount: "DPH",
  amount_total: "Suma",
  total_amount: "Suma",
  currency: "Mena",
  variable_symbol: "VS",
  payment_method: "Spôsob úhrady",
  status: "Stav",
  pohoda_predkontacia: "Predkontácia",
  pohoda_clenenie_dph: "Členenie DPH",
  kv_clenenie: "Členenie KV",
  stredisko: "Stredisko",
  cinnost: "Činnosť",
  job_id: "Zákazka",
  category: "Kategória",
  note: "Poznámka",
  zauctovane_at: "Zaúčtovanie",
  exported_at: "Odovzdanie do účtovníctva",
  locked_at: "Zámok",
  deleted_at: "Zmazanie",
  stitky: "Štítky",
};

function hodnota(pole: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (pole.endsWith("_at")) return new Date(String(v)).toLocaleString("sk-SK", { dateStyle: "short", timeStyle: "short" });
  if (pole === "job_id") return "zmenená";
  return String(v);
}

/** Kto, kedy a čo na doklade zmenil — zapisuje spúšťač v databáze. */
export function HistoriaDokladu({ companyId, agenda, id }: { companyId: string; agenda: "prijata" | "doklad"; id: string }) {
  const nacitajMena = useServerFn(menaClenovFirmy);
  const [zaznamy, setZaznamy] = useState<Zaznam[] | null>(null);
  const [mena, setMena] = useState<Record<string, string>>({});
  const [vsetko, setVsetko] = useState(false);

  useEffect(() => {
    supabase
      .from("historia_dokladov" as any)
      .select("id, pole, pred, po, kto, kedy")
      .eq("agenda", agenda)
      .eq("doklad_id", id)
      .order("kedy", { ascending: false })
      .limit(200)
      .then(({ data }) => setZaznamy((data ?? []) as any));
    nacitajMena({ data: { company_id: companyId } })
      .then((m) => setMena(m as Record<string, string>))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, agenda, id]);

  if (!zaznamy?.length) return null;
  const zobraz = vsetko ? zaznamy : zaznamy.slice(0, 8);
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <History className="h-3.5 w-3.5" /> História zmien
      </div>
      <ul className="mt-3 space-y-2">
        {zobraz.map((z) => (
          <li key={z.id} className="text-xs">
            <div className="text-muted-foreground">
              {new Date(z.kedy).toLocaleString("sk-SK", { dateStyle: "short", timeStyle: "short" })} ·{" "}
              {z.kto ? (mena[z.kto] ?? "kolega") : "systém"}
            </div>
            <div>
              <span className="font-medium">{POLIA[z.pole] ?? z.pole}</span>
              {z.pole !== "_vytvoreny" ? (
                <>
                  : <span className="text-muted-foreground line-through">{hodnota(z.pole, z.pred)}</span> →{" "}
                  {hodnota(z.pole, z.po)}
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {zaznamy.length > 8 ? (
        <button type="button" onClick={() => setVsetko(!vsetko)} className="mt-2 text-xs text-primary hover:underline">
          {vsetko ? "Skryť staršie" : `Zobraziť všetko (${zaznamy.length})`}
        </button>
      ) : null}
    </div>
  );
}
