import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ulozPravaSchvalovaniaFn } from "@/lib/faktero/schvalovanie.functions";
import {
  PRAVA_SCHVALOVANIA,
  nacitajPrava,
  type PravaSchvalovania,
} from "@/lib/faktero/schvalovanie";
import { useT } from "@/lib/i18n/useT";

type Clovek = { id: string; rola: string; meno: string; prava: Record<string, boolean> | null };

const ROLY: Record<string, string> = {
  owner: "Majiteľ",
  admin: "Administrátor",
  accountant: "Účtovník",
  employee: "Používateľ",
  custom: "Vlastný prístup",
};

/**
 * Predvolené zaškrtnutie — to isté, čo platí, kým sa nič neuloží: majiteľ,
 * správca a účtovník schvaľujú vždy, ostatní len vo svojej úrovni cesty.
 */
function predvolene(rola: string, vCeste: boolean): PravaSchvalovania {
  const schvalovatel = vCeste || ["owner", "admin", "accountant"].includes(rola);
  return {
    schvalit: schvalovatel,
    zrusit: schvalovatel,
    vratit: schvalovatel,
    zamietnut: schvalovatel,
  };
}

/**
 * Povolenia na schvaľovanie po používateľoch: Schvaľovanie, Zrušenie
 * schválenia, Vrátenie, Zamietnutie. Majiteľ má vždy všetko. Kto je v
 * schvaľovacej ceste, smie len to, čo má tu zaškrtnuté.
 */
export function PravaSchvalovaniaTabulka({
  companyId,
  ludia,
  vCeste,
  spravca,
  onUlozene,
}: {
  companyId: string;
  ludia: Clovek[];
  /** Kto je aspoň v jednej schvaľovacej ceste. */
  vCeste: Set<string>;
  spravca: boolean;
  onUlozene: () => void | Promise<void>;
}) {
  const { t } = useT();
  const uloz = useServerFn(ulozPravaSchvalovaniaFn);
  const [prava, setPrava] = useState<Record<string, PravaSchvalovania>>({});
  const [zmenene, setZmenene] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPrava(
      Object.fromEntries(
        ludia.map((l) => [l.id, nacitajPrava(l.prava) ?? predvolene(l.rola, vCeste.has(l.id))]),
      ),
    );
    setZmenene(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ludia]);

  async function ulozit() {
    setBusy(true);
    try {
      await uloz({
        data: {
          company_id: companyId,
          prava: [...zmenene].map((id) => ({ user_id: id, prava: prava[id] ?? null })),
        },
      });
      toast.success(t("Povolenia uložené"));
      await onUlozene();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  if (!ludia.length) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("Povolenia používateľov")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(
          "Čo smie ktorý používateľ so schvaľovaným dokladom urobiť. Majiteľ má vždy všetko. Kto je v schvaľovacej ceste, smie len zaškrtnuté; bez cesty schvaľuje každý, kto má zaškrtnuté Schvaľovanie.",
        )}
      </p>
      <div className="mt-3 overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-2">{t("Používateľ")}</th>
              {PRAVA_SCHVALOVANIA.map((p) => (
                <th key={p.kluc} className="p-2 text-center">
                  {t(p.nazov)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ludia.map((l) => {
              const majitel = l.rola === "owner";
              const p = prava[l.id] ?? predvolene(l.rola, vCeste.has(l.id));
              return (
                <tr key={l.id}>
                  <td className="p-2">
                    <div className="min-w-0 break-words">{l.meno}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(ROLY[l.rola] ?? l.rola)}
                      {!majitel && !l.prava && !zmenene.has(l.id) ? ` · ${t("podľa roly")}` : ""}
                    </div>
                  </td>
                  {PRAVA_SCHVALOVANIA.map((k) => (
                    <td key={k.kluc} className="p-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${t(k.nazov)} — ${l.meno}`}
                        checked={majitel || p[k.kluc]}
                        disabled={!spravca || majitel || busy}
                        onChange={(e) => {
                          setPrava({ ...prava, [l.id]: { ...p, [k.kluc]: e.target.checked } });
                          setZmenene(new Set(zmenene).add(l.id));
                        }}
                        className="h-4 w-4"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {spravca && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={ulozit}
            disabled={busy || !zmenene.size}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("Uložiť povolenia")}
          </button>
        </div>
      )}
    </section>
  );
}
