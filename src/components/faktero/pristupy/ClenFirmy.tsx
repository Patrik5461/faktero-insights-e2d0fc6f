import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DNI_PODPORY,
  NAZVY_ROZSAHU,
  stavPristupu,
  type RozsahPodpory,
} from "@/lib/faktero/podpora-pristup";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";

type Clen = {
  user_id: string;
  cislo_zamestnanca: string | null;
  telefon: string | null;
  predvolena_zakazka_id: string | null;
  zakazka_nazov: string | null;
  podpora_do: string | null;
};

type Zakazka = { id: string; job_number: string | null; name: string };

const vstup = "w-full rounded-md border border-input bg-background px-2 py-1 text-sm";

/** Otvorené zákazky firmy na výber predvolenej zákazky člena. */
function useZakazky(companyId: string, aktivne: boolean) {
  const [zakazky, setZakazky] = useState<Zakazka[] | null>(null);
  useEffect(() => {
    if (!aktivne || zakazky) return;
    supabase
      .from("jobs")
      .select("id, job_number, name")
      .eq("company_id", companyId)
      .neq("status", "closed")
      .order("name")
      .limit(1000)
      .then(({ data }) => setZakazky((data ?? []) as Zakazka[]));
  }, [companyId, aktivne, zakazky]);
  return zakazky;
}

/**
 * Telefón, číslo zamestnanca a predvolená zákazka (projekt) člena firmy —
 * bunka v zozname používateľov s úpravou na mieste.
 */
export function UdajeClena({
  companyId,
  clen,
  onUlozene,
}: {
  companyId: string;
  clen: Clen;
  onUlozene: () => void;
}) {
  const { t } = useT();
  const [uprava, setUprava] = useState(false);
  const [f, setF] = useState({ cislo: "", telefon: "", zakazka: "" });
  const [busy, setBusy] = useState(false);
  const zakazky = useZakazky(companyId, uprava);

  if (clen.podpora_do) return <span className="text-xs text-muted-foreground">—</span>;

  if (!uprava)
    return (
      <div className="min-w-0 text-xs">
        <div>
          <span className="text-muted-foreground">{t("Telefón")}:</span> {clen.telefon || "—"}
        </div>
        <div>
          <span className="text-muted-foreground">{t("Číslo zamestnanca")}:</span>{" "}
          {clen.cislo_zamestnanca || "—"}
        </div>
        <div className="break-words">
          <span className="text-muted-foreground">{t("Projekt")}:</span> {clen.zakazka_nazov || "—"}
        </div>
        <button
          type="button"
          onClick={() => {
            setF({
              cislo: clen.cislo_zamestnanca ?? "",
              telefon: clen.telefon ?? "",
              zakazka: clen.predvolena_zakazka_id ?? "",
            });
            setUprava(true);
          }}
          className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <Pencil className="h-3 w-3" /> {t("Upraviť")}
        </button>
      </div>
    );

  async function uloz() {
    setBusy(true);
    try {
      const { upravUdajeClenaFn } = await import("@/lib/faktero/invitations.functions");
      await upravUdajeClenaFn({
        data: {
          company_id: companyId,
          user_id: clen.user_id,
          cislo_zamestnanca: f.cislo.trim() || null,
          telefon: f.telefon.trim() || null,
          predvolena_zakazka_id: f.zakazka || null,
        },
      });
      toast.success(t("Uložené"));
      setUprava(false);
      onUlozene();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-w-[14rem] gap-1.5 text-xs">
      <label>
        <span className="text-muted-foreground">{t("Telefón")}</span>
        <input
          value={f.telefon}
          maxLength={40}
          inputMode="tel"
          onChange={(e) => setF({ ...f, telefon: e.target.value })}
          className={vstup}
        />
      </label>
      <label>
        <span className="text-muted-foreground">{t("Číslo zamestnanca")}</span>
        <input
          value={f.cislo}
          maxLength={40}
          onChange={(e) => setF({ ...f, cislo: e.target.value })}
          className={vstup}
        />
      </label>
      <label>
        <span className="text-muted-foreground">
          {t("Projekt (predvolená zákazka jeho dokladov)")}
        </span>
        <select
          value={f.zakazka}
          onChange={(e) => setF({ ...f, zakazka: e.target.value })}
          className={vstup}
        >
          <option value="">{t("bez zákazky")}</option>
          {/* Uzavretá zákazka, ktorá je už nastavená, sa v zozname neukáže — ostane, kým ju niekto nezmení. */}
          {clen.predvolena_zakazka_id &&
            !zakazky?.some((z) => z.id === clen.predvolena_zakazka_id) && (
              <option value={clen.predvolena_zakazka_id}>
                {clen.zakazka_nazov ?? t("zákazka")}
              </option>
            )}
          {(zakazky ?? []).map((z) => (
            <option key={z.id} value={z.id}>
              {[z.job_number, z.name].filter(Boolean).join(" · ")}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={uloz}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />} {t("Uložiť")}
        </button>
        <button
          type="button"
          onClick={() => setUprava(false)}
          className="rounded-md border border-border px-2.5 py-1"
        >
          {t("Zrušiť")}
        </button>
      </div>
    </div>
  );
}

type Pristup = {
  id: string;
  rozsah: RozsahPodpory;
  platne_do: string;
  stav: string;
  dovod: string | null;
  created_at: string;
  ukoncene_at: string | null;
  udelil_meno: string | null;
  ukoncil_meno: string | null;
};

const STAVY: Record<string, string> = {
  aktivny: "Aktívny",
  odobraty: "Odobratý",
  vyprsal: "Vypršal",
};

/**
 * „Pridať technickú podporu" — majiteľ dá podpore Faktero dočasný prístup
 * k firme, vidí ho tu a môže ho kedykoľvek odobrať. Po uplynutí zmizne sám.
 */
export function TechnickaPodpora({
  companyId,
  onZmena,
}: {
  companyId: string;
  onZmena: () => void;
}) {
  const { t, jazyk } = useT();
  const [d, setD] = useState<{ mozemUdelit: boolean; pristupy: Pristup[] } | null>(null);
  const [rozsah, setRozsah] = useState<RozsahPodpory>("citanie");
  const [dni, setDni] = useState<number>(7);
  const [dovod, setDovod] = useState("");
  const [busy, setBusy] = useState(false);
  const kedy = (s: string) =>
    new Date(s).toLocaleString(lokalJazyka(jazyk), { dateStyle: "medium", timeStyle: "short" });

  async function nacitaj() {
    try {
      const { pristupyPodporyFn } = await import("@/lib/faktero/podpora-pristup.functions");
      setD((await pristupyPodporyFn({ data: { company_id: companyId } })) as any);
    } catch {
      setD(null);
    }
  }
  useEffect(() => {
    void nacitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  if (!d) return null;
  const aktivny = d.pristupy.find((p) => stavPristupu(p) === "aktivny");

  async function udel() {
    const text =
      rozsah === "plny"
        ? t(
            "Technická podpora Faktero bude {dni} dní vidieť a upravovať doklady tejto firmy. Pokračovať?",
            { dni },
          )
        : t(
            "Technická podpora Faktero bude {dni} dní vidieť doklady tejto firmy (bez úprav). Pokračovať?",
            { dni },
          );
    if (!(await potvrd(text))) return;
    setBusy(true);
    try {
      const { udelPristupPodporeFn } = await import("@/lib/faktero/podpora-pristup.functions");
      await udelPristupPodporeFn({
        data: { company_id: companyId, rozsah, dni, dovod: dovod.trim() || null },
      });
      toast.success(t("Prístup pre technickú podporu je udelený"));
      setDovod("");
      await nacitaj();
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  async function odober(id: string) {
    if (!(await potvrd(t("Odobrať technickej podpore prístup k firme?")))) return;
    setBusy(true);
    try {
      const { odoberPristupPodporyFn } = await import("@/lib/faktero/podpora-pristup.functions");
      await odoberPristupPodporyFn({ data: { company_id: companyId, id } });
      toast.success(t("Prístup odobratý"));
      await nacitaj();
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-md border border-border p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <LifeBuoy className="h-4 w-4 text-primary" /> {t("Technická podpora")}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(
          "Keď potrebujete, aby sa podpora Faktero pozrela priamo do vašej firmy, udeľte jej dočasný prístup. Bez vášho súhlasu do firmy nevidí. K zamestnancom, banke, API ani používateľom sa nedostane nikdy; po uplynutí sa prístup zruší sám.",
        )}
      </p>

      {aktivny ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="min-w-0">
            {t("Podpora má prístup ({rozsah}) do {datum}.", {
              rozsah: t(NAZVY_ROZSAHU[aktivny.rozsah]).toLowerCase(),
              datum: kedy(aktivny.platne_do),
            })}
          </span>
          <button
            type="button"
            onClick={() => odober(aktivny.id)}
            disabled={busy}
            className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
          >
            {t("Odobrať prístup")}
          </button>
        </div>
      ) : d.mozemUdelit ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">{t("Rozsah")}</span>
            <select
              value={rozsah}
              onChange={(e) => setRozsah(e.target.value as RozsahPodpory)}
              className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              {(Object.keys(NAZVY_ROZSAHU) as RozsahPodpory[]).map((r) => (
                <option key={r} value={r}>
                  {t(NAZVY_ROZSAHU[r])}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">{t("Na koľko dní")}</span>
            <select
              value={dni}
              onChange={(e) => setDni(Number(e.target.value))}
              className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              {DNI_PODPORY.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 flex-1 text-sm">
            <span className="text-xs text-muted-foreground">{t("Prečo (nepovinné)")}</span>
            <input
              value={dovod}
              maxLength={500}
              onChange={(e) => setDovod(e.target.value)}
              placeholder={t("napr. číslo požiadavky P-0123")}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={udel}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("Pridať technickú podporu")}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("Prístup technickej podpore udeľuje majiteľ firmy.")}
        </p>
      )}

      {d.pristupy.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {t("História prístupov podpory")}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {d.pristupy.map((p) => (
              <li key={p.id} className="min-w-0 break-words">
                <span className="font-medium">{t(STAVY[stavPristupu(p)] ?? p.stav)}</span> ·{" "}
                {t(NAZVY_ROZSAHU[p.rozsah] ?? p.rozsah)} ·{" "}
                {t("udelil {kto} {kedy}, platí do {do}", {
                  kto: p.udelil_meno ?? t("bývalý člen"),
                  kedy: kedy(p.created_at),
                  do: kedy(p.platne_do),
                })}
                {p.stav === "odobraty" && p.ukoncene_at
                  ? ` · ${t("odobral {kto} {kedy}", { kto: p.ukoncil_meno ?? t("bývalý člen"), kedy: kedy(p.ukoncene_at) })}`
                  : ""}
                {p.dovod ? ` — „${p.dovod}“` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
