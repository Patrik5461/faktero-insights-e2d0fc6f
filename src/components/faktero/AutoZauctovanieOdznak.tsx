import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Bot, Loader2, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import {
  potvrdNavrhyFn,
  prepocitajNavrhFn,
  zrusAutoZauctovanieFn,
} from "@/lib/faktero/auto-uctovanie.functions";
import {
  TEXTY_BLOKATOROV,
  popisZdroja,
  type Blokator,
  type NavrhZauctovania,
} from "@/lib/faktero/auto-uctovanie";

type Typ = "prijata" | "blocek" | "vystavena";

/** Text zdroja na štítok, preložený („pravidlo X“, „zvyk 98 %“, „AI 91 %“). */
export function useZdrojText() {
  const { t } = useT();
  return (
    zdroj: string | null | undefined,
    istota: number | null | undefined,
    pravidlo?: string | null,
  ) => {
    if (zdroj === "pravidlo")
      return pravidlo ? t("pravidlo {nazov}", { nazov: pravidlo }) : t("pravidlo");
    if (zdroj === "zvyk") return t("zvyk {n} %", { n: istota ?? 0 });
    if (zdroj === "ai") return t("AI {n} %", { n: istota ?? 0 });
    return popisZdroja(zdroj, istota, pravidlo);
  };
}

/**
 * Štítok automatického zaúčtovania na detaile dokladu:
 * - zaúčtované automatom → „Zaúčtované automaticky · …“ + Zmeniť,
 * - nezaúčtované s návrhom → návrh, blokátory a Potvrdiť.
 */
export function AutoZauctovanieOdznak({
  typ,
  row,
  onZmena,
}: {
  typ: Typ;
  row: any;
  onZmena: () => void;
}) {
  const { t } = useT();
  const zdrojText = useZdrojText();
  const zrus = useServerFn(zrusAutoZauctovanieFn);
  const potvrd = useServerFn(potvrdNavrhyFn);
  const prepocitaj = useServerFn(prepocitajNavrhFn);
  const [busy, setBusy] = useState(false);
  const navrh = (row.auto_uctovanie_navrh ?? null) as NavrhZauctovania | null;
  const auto = ["pravidlo", "zvyk", "ai"].includes(String(row.zauctovanie_zdroj ?? ""));

  async function akcia(f: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await f();
      if (ok) toast.success(ok);
      onZmena();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (row.exported_at) return null;

  if (row.zauctovane_at && auto) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <Bot className="h-4 w-4 shrink-0" />
        <span title={navrh?.zdovodnenie || undefined} className="min-w-0 flex-1">
          {t("Zaúčtované automaticky")} ·{" "}
          {zdrojText(row.zauctovanie_zdroj, row.zauctovanie_istota, navrh?.pravidloNazov)}
          {navrh?.zdovodnenie && (
            <span className="block text-xs opacity-80">{navrh.zdovodnenie}</span>
          )}
        </span>
        <button
          onClick={() =>
            void akcia(
              () => zrus({ data: { company_id: row.company_id, typ, id: row.id } }),
              t("Zaúčtovanie je zrušené — kódy upravte a zaúčtujte znova."),
            )
          }
          disabled={busy}
          className="rounded-md border border-emerald-300 bg-white/70 px-2 py-1 text-xs font-medium hover:bg-white disabled:opacity-50 dark:border-emerald-800 dark:bg-transparent"
        >
          {t("Zmeniť")}
        </button>
      </div>
    );
  }

  if (row.zauctovane_at) return null;

  if (!navrh) {
    return (
      <div className="mt-3">
        <button
          onClick={() =>
            void akcia(() => prepocitaj({ data: { company_id: row.company_id, typ, id: row.id } }))
          }
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Bot className="h-3.5 w-3.5" />
          )}
          {t("Navrhnúť zaúčtovanie")}
        </button>
      </div>
    );
  }

  const kody = [
    navrh.predkontacia,
    navrh.clenenieDph,
    navrh.kvClenenie ? `KV ${navrh.kvClenenie}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1" title={navrh.zdovodnenie || undefined}>
          {t("Návrh zaúčtovania")}: <strong>{kody || "—"}</strong>
          {navrh.zdroj && (
            <span className="text-muted-foreground">
              {" "}
              ({zdrojText(navrh.zdroj, navrh.istota, navrh.pravidloNazov)})
            </span>
          )}
          {navrh.zdovodnenie && (
            <span className="block text-xs text-muted-foreground">{navrh.zdovodnenie}</span>
          )}
        </span>
        <button
          onClick={() =>
            void akcia(() => prepocitaj({ data: { company_id: row.company_id, typ, id: row.id } }))
          }
          disabled={busy}
          aria-label={t("Navrhnúť znova")}
          title={t("Navrhnúť znova")}
          className="rounded-md border border-border p-1.5 hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        {navrh.predkontacia && (
          <button
            onClick={() =>
              void akcia(async () => {
                const r = await potvrd({
                  data: { company_id: row.company_id, polozky: [{ typ, id: row.id }] },
                });
                if (!r.zauctovanych)
                  throw new Error(r.preskocene[0] ?? t("Doklad sa nepodarilo zaúčtovať."));
              }, t("Zaúčtované"))
            }
            disabled={busy}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {t("Potvrdiť návrh")}
          </button>
        )}
      </div>
      {navrh.blokatory?.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
          {navrh.blokatory.map((b) => (
            <li key={b} className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" />{" "}
              {t(TEXTY_BLOKATOROV[b as Blokator] ?? b)}
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/uctovnictvo/na-kontrolu"
        className="mt-1 inline-block text-xs text-primary hover:underline"
      >
        {t("Všetky doklady na kontrolu")}
      </Link>
    </div>
  );
}

/** Ponuka „Vytvoriť pravidlo?“ po druhej rovnakej oprave automatu. */
export function ponukaPravidlaToast(
  p:
    | {
        nazov: string;
        ico: string | null;
        text: string | null;
        druh: string;
        predkontacia: string;
        clenenie: string | null;
        kv: string | null;
      }
    | null
    | undefined,
  t: (k: string, v?: Record<string, string | number>) => string,
  navigate: (o: any) => void,
) {
  if (!p) return;
  toast(t("Rovnakú opravu ste urobili už druhýkrát. Vytvoriť pravidlo?"), {
    duration: 12000,
    action: {
      label: t("Vytvoriť pravidlo"),
      onClick: () =>
        navigate({
          to: "/uctovnictvo/pravidla",
          search: {
            novy: p.druh,
            nazov: p.text ?? p.nazov,
            ico: p.ico ?? undefined,
            predkontacia: p.predkontacia,
            clenenie: p.clenenie ?? undefined,
            kv: p.kv ?? undefined,
          },
        }),
    },
  });
}
