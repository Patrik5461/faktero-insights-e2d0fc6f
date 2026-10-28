import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Undo2, XCircle } from "lucide-react";
import {
  detailSchvalovaniaFn,
  priraditCestuFn,
  rozhodnutieFn,
} from "@/lib/faktero/schvalovanie.functions";
import {
  NAZVY_STAVOV,
  type AgendaSchvalovania,
  type StavSchvalovania,
} from "@/lib/faktero/schvalovanie";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";

const AKCIE: Record<string, string> = {
  schvalil: "schválil",
  zamietol: "zamietol",
  vratil: "vrátil na opravu",
  zrusil: "zrušil rozhodnutie",
  pridelil: "pridelil schvaľovaciu cestu",
  automaticky: "schválené automaticky",
};

const FARBY: Record<string, string> = {
  caka: "bg-amber-100 text-amber-800",
  schvaleny: "bg-emerald-100 text-emerald-800",
  zamietnuty: "bg-red-100 text-red-800",
  vrateny: "bg-sky-100 text-sky-800",
};

/** Schvaľovanie na detaile dokladu — stav, úrovne, história a tlačidlá. */
export function SchvalovaniePanel({
  companyId,
  agenda,
  id,
  onZmena,
}: {
  companyId: string;
  agenda: AgendaSchvalovania;
  id: string;
  onZmena?: () => void;
}) {
  const { t, jazyk } = useT();
  const nacitaj = useServerFn(detailSchvalovaniaFn);
  const rozhodni = useServerFn(rozhodnutieFn);
  const prirad = useServerFn(priraditCestuFn);
  const [d, setD] = useState<any>(null);
  const [poznamka, setPoznamka] = useState("");
  const [busy, setBusy] = useState(false);

  const obnov = () =>
    nacitaj({ data: { company_id: companyId, agenda, id } })
      .then(setD)
      .catch(() => setD({ zapnute: false }));
  useEffect(() => {
    void obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, agenda, id]);

  if (!d?.zapnute) return null;

  async function akcia(a: "schvalit" | "zamietnut" | "vratit" | "zrusit") {
    if ((a === "zamietnut" || a === "vratit") && !poznamka.trim()) {
      toast.error(t("Napíšte dôvod — dostane ho ten, kto doklad nahral."));
      return;
    }
    setBusy(true);
    try {
      const r = await rozhodni({
        data: { company_id: companyId, agenda, ids: [id], akcia: a, poznamka },
      });
      if (!r.hotovo) toast.error(t("Na toto nemáte oprávnenie."));
      else toast.success(t("Uložené"));
      setPoznamka("");
      await obnov();
      onZmena?.();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  const z = d.zaznam;
  // Staršia odpoveď servera nemala povolenia zvlášť — vtedy platí „kto schvaľuje, aj vráti".
  const mozemVratit: boolean = d.mozemVratit ?? d.mozem;
  const mozemZamietnut: boolean = d.mozemZamietnut ?? d.mozem;
  const nieco = d.mozem || mozemVratit || mozemZamietnut;
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("Schvaľovanie")}
        </div>
        {z ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FARBY[z.stav] ?? ""}`}>
            {t(NAZVY_STAVOV[z.stav as StavSchvalovania] ?? z.stav)} · {z.odznak}
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t("Doklad je spred zapnutia schvaľovania")}
          </span>
        )}
      </div>

      {z && (
        <>
          {z.urovne.length ? (
            <ol className="mt-3 space-y-1">
              {z.urovne.map((l: string[], i: number) => (
                <li key={i} className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                      z.stav === "schvaleny" || i < z.schvalenaUroven
                        ? "bg-emerald-600 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {l.join(", ")}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Jednoduché schvaľovanie — schváli majiteľ, správca alebo účtovník.")}
            </p>
          )}

          {(nieco || d.mozemZrusit) && (
            <div className="mt-3 space-y-2">
              {nieco && (
                <input
                  value={poznamka}
                  onChange={(e) => setPoznamka(e.target.value)}
                  placeholder={t("Poznámka (pri zamietnutí a vrátení povinná)")}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              )}
              <div className="flex flex-wrap gap-2">
                {nieco && (
                  <>
                    {d.mozem && (
                      <button
                        onClick={() => akcia("schvalit")}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {t("Schváliť")}
                      </button>
                    )}
                    {mozemVratit && (
                      <button
                        onClick={() => akcia("vratit")}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
                      >
                        <Undo2 className="h-4 w-4" /> {t("Vrátiť na opravu")}
                      </button>
                    )}
                    {mozemZamietnut && (
                      <button
                        onClick={() => akcia("zamietnut")}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" /> {t("Zamietnuť")}
                      </button>
                    )}
                  </>
                )}
                {d.mozemZrusit && z.stav !== "caka" && (
                  <button
                    onClick={() => akcia("zrusit")}
                    disabled={busy}
                    className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
                  >
                    {t("Zrušiť rozhodnutie")}
                  </button>
                )}
              </div>
            </div>
          )}

          {d.historia?.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
              {d.historia.map((h: any, i: number) => (
                <li key={i}>
                  {new Date(h.created_at).toLocaleString(lokalJazyka(jazyk), {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}{" "}
                  · <span className="text-foreground">{h.meno}</span> {t(AKCIE[h.akcia] ?? h.akcia)}
                  {h.uroven ? ` ${t("(úroveň {n})", { n: h.uroven })}` : ""}
                  {h.poznamka ? ` — „${h.poznamka}“` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {d.mozemPriradit && d.cesty?.length > 0 && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {t("Schvaľovacia cesta")}
          <select
            value={z?.cestaId ?? ""}
            onChange={async (e) => {
              setBusy(true);
              try {
                await prirad({
                  data: { company_id: companyId, agenda, id, cesta_id: e.target.value || null },
                });
                toast.success(t("Cesta pridelená — schvaľovanie začína odznova"));
                await obnov();
                onZmena?.();
              } catch (err: any) {
                toast.error(t(err?.message ?? "Nepodarilo sa"));
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
          >
            <option value="">{t("jednoduché schvaľovanie")}</option>
            {d.cesty.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.nazov}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
