import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Star } from "lucide-react";
import { PREDVOLENE } from "@/lib/faktero/predkontacie";
import { ulozPredvoleneFn } from "@/lib/faktero/predkontacie.functions";
import { KV_PREDVOLENE, type DruhKvPredvoleneho } from "@/lib/faktero/kv-clenenie";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

/**
 * Predvolené kódy priamo pri účtovaní dokladu: čo účtovník práve vyplnil,
 * uloží jedným klikom ako predvolené pre tento druh dokladu (Predkontácie →
 * Predvolené) — a odkaz na pridanie novej predkontácie do číselníka.
 */
export function NastavitPredvolene({
  companyId,
  kluc,
  hodnoty,
  predvolene,
  onUlozene,
}: {
  companyId: string;
  /** Kľúč druhu dokladu z `PREDVOLENE` (prijata, doklady, faktura, zaloha, dobropis). */
  kluc: string;
  hodnoty: { predkontacia?: string; clenenie?: string; kv?: string };
  /** Aktuálne predvolené — keď sa zhodujú, tlačidlo netreba. */
  predvolene?: { predkontacia?: string | null; clenenie?: string | null; kv?: string | null };
  onUlozene?: () => void;
}) {
  const { t } = useT();
  const uloz = useServerFn(ulozPredvoleneFn);
  const [busy, setBusy] = useState(false);
  const p = PREDVOLENE.find((x) => x.kluc === kluc);
  if (!p) return null;

  const kvPovolene =
    p.kv && kluc in KV_PREDVOLENE ? KV_PREDVOLENE[kluc as DruhKvPredvoleneho].kody : [];
  const zmena: Record<string, string> = {};
  const pk = hodnoty.predkontacia?.trim();
  const cl = hodnoty.clenenie?.trim();
  const kv = hodnoty.kv?.trim();
  if (p.predkontacia && pk && pk !== (predvolene?.predkontacia ?? "")) zmena[p.predkontacia] = pk;
  if (p.clenenie && cl && cl !== (predvolene?.clenenie ?? "")) zmena[p.clenenie] = cl;
  if (p.kv && kv && kvPovolene.includes(kv) && kv !== (predvolene?.kv ?? "")) zmena[p.kv] = kv;
  const nieJeCo = Object.keys(zmena).length === 0;

  async function nastav() {
    const popis = [
      p!.predkontacia && zmena[p!.predkontacia],
      p!.clenenie && zmena[p!.clenenie],
      p!.kv && zmena[p!.kv] ? `KV ${zmena[p!.kv]}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (
      !(await potvrd(
        t(
          "Nastaviť {kody} ako predvolené pre druh dokladu „{doklad}“? Použije sa pri každom ďalšom doklade tohto druhu bez vlastného zaúčtovania.",
          {
            kody: popis,
            doklad: t(p!.nazov),
          },
        ),
      ))
    )
      return;
    setBusy(true);
    try {
      await uloz({ data: { company_id: companyId, hodnoty: zmena } });
      toast.success(t("Nastavené ako predvolené"));
      onUlozene?.();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa uložiť"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => void nastav()}
        disabled={busy || nieJeCo}
        title={
          nieJeCo
            ? t("Vyplnené kódy sú už predvolené (alebo nie je čo nastaviť).")
            : t("Uloží vyplnené kódy ako predvolené pre tento druh dokladu.")
        }
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-secondary disabled:opacity-50"
      >
        <Star className="h-3.5 w-3.5" /> {t("Nastaviť ako predvolené")}
      </button>
      <Link
        to="/uctovnictvo/predkontacie"
        search={{ pridat: "1" }}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-secondary"
      >
        <Plus className="h-3.5 w-3.5" /> {t("Pridať predkontáciu")}
      </Link>
    </div>
  );
}
