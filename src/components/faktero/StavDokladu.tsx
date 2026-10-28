import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { triedaFarby, type StavDokladu } from "@/lib/faktero/doklady-hromadne";
import { useT } from "@/lib/i18n/useT";

type Tabulka = "purchase_invoices" | "expense_documents" | "invoices";

/** Farebný odznak vlastného stavu dokladu (číselník firmy). */
export function StavDokladuOdznak({ stav }: { stav: StavDokladu | null | undefined }) {
  if (!stav) return null;
  return (
    <span
      className={`inline-flex max-w-[12rem] truncate rounded-md px-1.5 py-0.5 text-xs font-medium ${triedaFarby(stav.farba)}`}
      title={stav.nazov}
    >
      {stav.nazov}
    </span>
  );
}

/**
 * Výber vlastného stavu dokladu („Čaká na doklad od klienta", „Skontrolovať"…).
 * Mení sa aj na odovzdanom doklade — do účtovníctva nejde.
 */
export function VyberStavuDokladu({
  tabulka,
  id,
  stavId,
  stavy,
  onZmena,
  kompaktny,
}: {
  tabulka: Tabulka;
  id: string;
  stavId: string | null | undefined;
  stavy: StavDokladu[];
  onZmena?: (stavId: string | null) => void;
  kompaktny?: boolean;
}) {
  const { t } = useT();
  const [hodnota, setHodnota] = useState(stavId ?? "");
  useEffect(() => setHodnota(stavId ?? ""), [stavId]);
  if (!stavy.length) return null;
  const vybrany = stavy.find((s) => s.id === hodnota);

  async function zmen(v: string) {
    const pred = hodnota;
    setHodnota(v);
    const { error } = await supabase
      .from(tabulka)
      .update({ stav_id: v || null } as any)
      .eq("id", id);
    if (error) {
      setHodnota(pred);
      return toast.error(error.message);
    }
    onZmena?.(v || null);
  }

  return (
    <select
      aria-label={t("Stav dokladu")}
      value={hodnota}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => void zmen(e.target.value)}
      className={`${kompaktny ? "max-w-[11rem] px-1.5 py-1 text-xs" : "h-9 w-full min-w-0 px-2 text-sm"} rounded-md border border-input ${
        vybrany ? triedaFarby(vybrany.farba) : "bg-background text-muted-foreground"
      }`}
    >
      <option value="">{t("Bez stavu")}</option>
      {stavy
        .filter((s) => s.aktivne || s.id === hodnota)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.nazov}
          </option>
        ))}
    </select>
  );
}

/**
 * Komentár k dokladu — pre ľudí vo firme, do účtovníctva sa neprenáša
 * (na rozdiel od účtovnej poznámky). Uloží sa pri opustení políčka.
 */
export function KomentarDokladu({
  tabulka,
  id,
  komentar,
  onZmena,
}: {
  tabulka: Tabulka;
  id: string;
  komentar: string | null | undefined;
  onZmena?: (k: string | null) => void;
}) {
  const { t } = useT();
  const [text, setText] = useState(komentar ?? "");
  const [ulozeny, setUlozeny] = useState(komentar ?? "");
  useEffect(() => {
    setText(komentar ?? "");
    setUlozeny(komentar ?? "");
  }, [komentar, id]);

  async function uloz() {
    if (text.trim() === ulozeny.trim()) return;
    const { error } = await supabase
      .from(tabulka)
      .update({ komentar: text.trim() || null } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    setUlozeny(text);
    onZmena?.(text.trim() || null);
    toast.success(t("Komentár uložený"));
  }

  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-sm font-medium">{t("Komentár")}</span>
      <textarea
        rows={2}
        maxLength={1000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void uloz()}
        placeholder={t("Komentár (do účtovníctva sa neprenáša)")}
        className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <span className="block text-right text-[11px] text-muted-foreground">{text.length}/1000</span>
    </label>
  );
}
