import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, Download, Loader2, Trash2 } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  stiahniZalohuFn,
  vytvorZalohuFn,
  zalohyFirmyFn,
  zmazZalohuFn,
} from "@/lib/faktero/zalohy-firmy.functions";
import { POCET_ZALOH, velkostSlovom } from "@/lib/faktero/zalohy-firmy";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/nastavenia/zalohy")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Zálohy dokladov — Faktero") }],
  }),
  component: ZalohyStranka,
});

type Zaloha = Awaited<ReturnType<typeof zalohyFirmyFn>>[number];

function ZalohyStranka() {
  const { t, jazyk } = useT();
  const companyId = getActiveCompanyId();
  const nacitaj = useServerFn(zalohyFirmyFn);
  const vytvor = useServerFn(vytvorZalohuFn);
  const stiahni = useServerFn(stiahniZalohuFn);
  const zmaz = useServerFn(zmazZalohuFn);
  const [zoznam, setZoznam] = useState<Zaloha[] | null>(null);
  const [pracuje, setPracuje] = useState<string | null>(null);

  const obnov = useCallback(async () => {
    if (!companyId) return;
    try {
      setZoznam(await nacitaj({ data: { company_id: companyId } }));
    } catch (e: any) {
      toast.error(t(e?.message ?? "Zálohy sa nepodarilo načítať."));
      setZoznam([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    void obnov();
  }, [obnov]);

  // Kým záloha beží, doptáva sa každých 5 s.
  const bezi = (zoznam ?? []).some((z) => z.stav === "bezi");
  useEffect(() => {
    if (!bezi) return;
    const id = setInterval(() => void obnov(), 5000);
    return () => clearInterval(id);
  }, [bezi, obnov]);

  async function spusti() {
    if (!companyId) return;
    setPracuje("nova");
    try {
      await vytvor({ data: { company_id: companyId } });
      toast.success(t("Záloha sa vytvára. Môžete odísť — dobehne aj bez vás."));
      await obnov();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Zálohu sa nepodarilo spustiť."));
    } finally {
      setPracuje(null);
    }
  }

  async function naStiahnutie(z: Zaloha) {
    if (!companyId) return;
    setPracuje(z.id);
    try {
      const { url } = await stiahni({ data: { company_id: companyId, id: z.id } });
      window.open(url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(t(e?.message ?? "Zálohu sa nepodarilo stiahnuť."));
    } finally {
      setPracuje(null);
    }
  }

  async function odstran(z: Zaloha) {
    if (!companyId) return;
    if (!(await potvrd(t("Zmazať zálohu? Súbor sa nedá obnoviť."), { nebezpecne: true }))) return;
    setPracuje(z.id);
    try {
      await zmaz({ data: { company_id: companyId, id: z.id } });
      await obnov();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Zálohu sa nepodarilo zmazať."));
    } finally {
      setPracuje(null);
    }
  }

  const datum = (s: string) => new Date(s).toLocaleString(lokalJazyka(jazyk));
  const STAV: Record<string, string> = { bezi: "Vytvára sa…", hotovo: "Hotová", chyba: "Zlyhala" };

  return (
    <>
      <PageHeader
        title={t("Zálohy dokladov")}
        description={t(
          "Celý archív firmy v jednom ZIP súbore — faktúry, prijaté faktúry, bločky, banka, pokladňa a adresár v CSV, k tomu PDF faktúr a skeny dokladov.",
        )}
        action={
          <button
            type="button"
            onClick={spusti}
            disabled={pracuje === "nova" || bezi}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pracuje === "nova" || bezi ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {t("Vytvoriť zálohu")}
          </button>
        }
      />
      <PageBody>
        <div className="max-w-3xl space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(
              "Záloha sa vytvára na pozadí a pri väčšej firme môže trvať niekoľko minút. Ponecháva sa posledných {n} záloh, staršie sa zmažú samy. Vytvoriť, stiahnuť a zmazať zálohu môže majiteľ alebo admin firmy.",
              { n: POCET_ZALOH },
            )}
          </p>
          {zoznam === null ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : zoznam.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("Zatiaľ žiadna záloha.")}
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {zoznam.map((z) => (
                <li key={z.id} className="flex min-w-0 flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{datum(z.created_at)}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(STAV[z.stav] ?? z.stav)}
                      {z.stav === "hotovo" && ` · ${velkostSlovom(z.velkost)}`}
                      {z.stav === "hotovo" &&
                        z.pocty?.["faktúry"] != null &&
                        ` · ${t("faktúr: {n}", { n: z.pocty["faktúry"] })}`}
                    </div>
                    {z.stav === "chyba" && z.chyba && (
                      <div className="mt-1 break-words text-xs text-destructive">{t(z.chyba)}</div>
                    )}
                  </div>
                  {z.stav === "bezi" && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {z.stav === "hotovo" && (
                    <button
                      type="button"
                      onClick={() => naStiahnutie(z)}
                      disabled={pracuje === z.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      {t("Stiahnuť")}
                    </button>
                  )}
                  {z.stav !== "bezi" && (
                    <button
                      type="button"
                      aria-label={t("Zmazať zálohu")}
                      onClick={() => odstran(z)}
                      disabled={pracuje === z.id}
                      className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageBody>
    </>
  );
}
