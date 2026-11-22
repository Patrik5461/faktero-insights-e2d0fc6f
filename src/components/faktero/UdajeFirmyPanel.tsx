import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, Save } from "lucide-react";
import { udajeFirmyFn, ulozKonatelaFn, type UdajeFirmy } from "@/lib/faktero/firma-udaje.functions";
import { useT } from "@/lib/i18n/useT";

/**
 * Rozbalené údaje firmy v Správe firiem (šípka pri firme): adresa, IČO, DIČ,
 * IČ DPH, bankové účty, kontakty, zápis v registri, konateľ a majiteľ účtu.
 * Každý údaj sa dá skopírovať; konateľa doplní správca firmy.
 */
export function UdajeFirmyPanel({ companyId }: { companyId: string }) {
  const { t } = useT();
  const nacitaj = useServerFn(udajeFirmyFn);
  const uloz = useServerFn(ulozKonatelaFn);
  const [d, setD] = useState<UdajeFirmy | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [k, setK] = useState({ meno: "", telefon: "", email: "" });
  const [ukladam, setUkladam] = useState(false);

  useEffect(() => {
    let zrusene = false;
    nacitaj({ data: { companyId } })
      .then((r) => {
        if (zrusene) return;
        setD(r);
        setK({
          meno: r.konatel.meno ?? (r.konateliaZRegistra[0]?.split(" — ")[0] ?? ""),
          telefon: r.konatel.telefon ?? "",
          email: r.konatel.email ?? "",
        });
      })
      .catch((e: any) => !zrusene && setChyba(e?.message ?? t("Údaje sa nepodarilo načítať")));
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  if (chyba) return <div className="p-4 text-sm text-destructive">{chyba}</div>;
  if (!d)
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
      </div>
    );

  const adresa = [d.ulica, [d.psc, d.mesto].filter(Boolean).join(" "), d.krajina].filter(Boolean).join(", ");

  async function ulozKonatela() {
    setUkladam(true);
    try {
      await uloz({
        data: {
          companyId,
          meno: k.meno.trim() || null,
          telefon: k.telefon.trim() || null,
          email: k.email.trim() || null,
        },
      });
      toast.success(t("Konateľ uložený."));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa uložiť"));
    } finally {
      setUkladam(false);
    }
  }

  const vstup =
    "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div
      className="grid gap-x-8 gap-y-4 p-4 text-sm sm:grid-cols-2 xl:grid-cols-3"
      onClick={(e) => e.stopPropagation()}
    >
      <Sekcia nazov={t("Firma")}>
        <Udaj nazov={t("Adresa")} hodnota={adresa} />
        <Udaj nazov={t("IČO")} hodnota={d.ico} />
        <Udaj nazov={t("DIČ")} hodnota={d.dic} />
        <Udaj nazov={t("IČ DPH")} hodnota={d.icDph} />
        <Udaj nazov={t("Zápis v registri")} hodnota={d.registracia} />
      </Sekcia>
      <Sekcia nazov={t("Kontakt a bankové účty")}>
        <Udaj nazov={t("E-mail")} hodnota={d.email} />
        <Udaj nazov={t("Telefón")} hodnota={d.telefon} />
        <Udaj nazov={t("Web")} hodnota={d.web} />
        {d.ucty.length ? (
          d.ucty.map((u, i) => (
            <Udaj
              key={i}
              nazov={[t("IBAN"), u.nazov, u.mena].filter(Boolean).join(" · ")}
              hodnota={u.iban}
              doplnok={u.swift ? `SWIFT ${u.swift}` : undefined}
            />
          ))
        ) : (
          <Udaj nazov={t("IBAN")} hodnota={null} />
        )}
      </Sekcia>
      <Sekcia nazov={t("Konateľ")}>
        {d.smieUpravit ? (
          <div className="space-y-2">
            <input
              value={k.meno}
              onChange={(e) => setK({ ...k, meno: e.target.value })}
              placeholder={t("Meno konateľa")}
              aria-label={t("Meno konateľa")}
              className={vstup}
            />
            <input
              value={k.telefon}
              onChange={(e) => setK({ ...k, telefon: e.target.value })}
              placeholder={t("Telefón")}
              aria-label={t("Telefón konateľa")}
              className={vstup}
            />
            <input
              value={k.email}
              onChange={(e) => setK({ ...k, email: e.target.value })}
              placeholder={t("E-mail")}
              aria-label={t("E-mail konateľa")}
              className={vstup}
            />
            {!d.konatel.meno && d.konateliaZRegistra.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Z obchodného registra:")} {d.konateliaZRegistra.join(", ")}
              </p>
            )}
            <button
              type="button"
              onClick={() => void ulozKonatela()}
              disabled={ukladam}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            >
              {ukladam ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {t("Uložiť konateľa")}
            </button>
          </div>
        ) : (
          <>
            <Udaj nazov={t("Meno")} hodnota={d.konatel.meno ?? d.konateliaZRegistra[0] ?? null} />
            <Udaj nazov={t("Telefón")} hodnota={d.konatel.telefon} />
            <Udaj nazov={t("E-mail")} hodnota={d.konatel.email} />
          </>
        )}
        {d.majitelia.length > 0 && (
          <div className="pt-2">
            <div className="text-xs text-muted-foreground">{t("Majiteľ účtu vo Fakteri")}</div>
            {d.majitelia.map((m, i) => (
              <div key={i} className="min-w-0 truncate">
                {[m.meno, m.email].filter(Boolean).join(" · ")}
              </div>
            ))}
          </div>
        )}
      </Sekcia>
    </div>
  );
}

function Sekcia({ nazov, children }: { nazov: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nazov}</div>
      {children}
    </div>
  );
}

function Udaj({ nazov, hodnota, doplnok }: { nazov: string; hodnota: string | null; doplnok?: string }) {
  const { t } = useT();
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{nazov}</div>
        <div className="break-words">{hodnota || "—"}</div>
        {doplnok ? <div className="text-xs text-muted-foreground">{doplnok}</div> : null}
      </div>
      {hodnota ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard
              .writeText(hodnota)
              .then(() => toast.success(t("Skopírované")))
              .catch(() => toast.error(t("Kopírovanie zlyhalo.")));
          }}
          aria-label={t("Kopírovať {co}", { co: nazov })}
          title={t("Kopírovať")}
          className="mt-3 shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
