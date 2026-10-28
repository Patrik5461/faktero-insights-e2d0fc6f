import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  JAZYKY_SABLON,
  NAZVY_JAZYKOV_SABLON,
  NAZVY_TYPOV_SABLON,
  PREMENNE_SABLON,
  TYPY_SABLON,
  doplnPremenne,
  ukazkoveHodnoty,
  type EmailSablona,
  type JazykSablony,
  type TypSablony,
} from "@/lib/faktero/email-sablony";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

type Uprava = Omit<EmailSablona, "id"> & { id: string | null };

const NOVA: Uprava = {
  id: null,
  nazov: "",
  typ_dokladu: "vsetky",
  jazyk: "vsetky",
  predmet: "[TYP_FAKTURY] [CISLO_FAKTURY]",
  text: "Dobrý deň,\n\nv prílohe Vám posielame [TYP_FAKTURY] [CISLO_FAKTURY] na sumu [SUMA] so splatnosťou [SPLATNOST].\nVariabilný symbol: [VS]\n\nS pozdravom\n[FIRMA]",
};

/**
 * Šablóny e-mailov podľa typu dokladu a jazyka. Pri odoslaní sa vyberie
 * najvhodnejšia (presný typ > všetky faktúry, presný jazyk > všetky jazyky);
 * v okne odoslania sa dá zmeniť.
 */
export function EmailSablonyDokladov() {
  const { t } = useT();
  const companyId = getActiveCompanyId();
  const [zoznam, setZoznam] = useState<EmailSablona[] | null>(null);
  const [uprava, setUprava] = useState<Uprava | null>(null);
  const [busy, setBusy] = useState(false);
  const [firma, setFirma] = useState("");

  async function obnov() {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("email_sablony")
      .select("id, nazov, typ_dokladu, jazyk, predmet, text")
      .eq("company_id", companyId)
      .order("typ_dokladu")
      .order("jazyk")
      .order("nazov")
      .limit(500);
    if (error) toast.error(t(error.message));
    setZoznam((data ?? []) as EmailSablona[]);
  }
  useEffect(() => {
    void obnov();
    if (companyId)
      supabase
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .maybeSingle()
        .then(({ data }) => setFirma(data?.name ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const ukazka = useMemo(
    () => (uprava ? ukazkoveHodnoty(uprava.jazyk, uprava.typ_dokladu, firma) : {}),
    [uprava?.jazyk, uprava?.typ_dokladu, firma],
  );

  async function uloz() {
    if (!companyId || !uprava) return;
    if (!uprava.nazov.trim() || !uprava.predmet.trim() || !uprava.text.trim()) {
      toast.error(t("Vyplňte názov, predmet aj text šablóny."));
      return;
    }
    setBusy(true);
    const riadok = {
      nazov: uprava.nazov.trim().slice(0, 120),
      typ_dokladu: uprava.typ_dokladu,
      jazyk: uprava.jazyk,
      predmet: uprava.predmet.trim().slice(0, 500),
      text: uprava.text.slice(0, 20000),
      updated_at: new Date().toISOString(),
    };
    const { error } = uprava.id
      ? await supabase.from("email_sablony").update(riadok).eq("id", uprava.id)
      : await supabase.from("email_sablony").insert({ ...riadok, company_id: companyId });
    setBusy(false);
    if (error) {
      toast.error(t(error.message));
      return;
    }
    toast.success(t("Šablóna uložená"));
    setUprava(null);
    await obnov();
  }

  async function zmaz(s: EmailSablona) {
    if (!(await potvrd(t("Zmazať šablónu „{nazov}“?", { nazov: s.nazov }), { nebezpecne: true })))
      return;
    const { error } = await supabase.from("email_sablony").delete().eq("id", s.id);
    if (error) toast.error(t(error.message));
    await obnov();
  }

  const vstup = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">{t("Šablóny pre odosielanie dokladov")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "Vlastný predmet a text podľa typu dokladu a jazyka. Pri odoslaní sa vyberie šablóna, ktorá na doklad sedí najlepšie — v okne odoslania ju môžete zmeniť. Bez vhodnej šablóny platí text nižšie.",
        )}
      </p>

      {zoznam === null ? (
        <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted-foreground" />
      ) : zoznam.length > 0 ? (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {zoznam.map((s) => (
            <li key={s.id} className="flex min-w-0 flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{s.nazov}</div>
                <div className="text-xs text-muted-foreground">
                  {t(NAZVY_TYPOV_SABLON[s.typ_dokladu as TypSablony] ?? s.typ_dokladu)} ·{" "}
                  {t(NAZVY_JAZYKOV_SABLON[s.jazyk as JazykSablony] ?? s.jazyk)} ·{" "}
                  <span className="break-words">{s.predmet}</span>
                </div>
              </div>
              <button
                type="button"
                aria-label={t("Upraviť")}
                onClick={() => setUprava({ ...s })}
                className="rounded p-1 text-muted-foreground hover:bg-secondary"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t("Zmazať")}
                onClick={() => zmaz(s)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {uprava ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm sm:col-span-3">
              <span className="font-medium">{t("Názov")}</span>
              <input
                value={uprava.nazov}
                onChange={(e) => setUprava({ ...uprava, nazov: e.target.value })}
                placeholder={t("napr. Faktúra po nemecky")}
                maxLength={120}
                className={vstup}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">{t("Typ dokladu")}</span>
              <select
                value={uprava.typ_dokladu}
                onChange={(e) => setUprava({ ...uprava, typ_dokladu: e.target.value })}
                className={vstup}
              >
                {TYPY_SABLON.map((x) => (
                  <option key={x} value={x}>
                    {t(NAZVY_TYPOV_SABLON[x])}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("Jazyk")}</span>
              <select
                value={uprava.jazyk}
                onChange={(e) => setUprava({ ...uprava, jazyk: e.target.value })}
                className={vstup}
              >
                {JAZYKY_SABLON.map((x) => (
                  <option key={x} value={x}>
                    {t(NAZVY_JAZYKOV_SABLON[x])}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium">{t("Predmet")}</span>
            <input
              value={uprava.predmet}
              onChange={(e) => setUprava({ ...uprava, predmet: e.target.value })}
              maxLength={500}
              className={vstup}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("Správa")}</span>
            <textarea
              rows={8}
              value={uprava.text}
              onChange={(e) => setUprava({ ...uprava, text: e.target.value })}
              className={`${vstup} font-mono`}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PREMENNE_SABLON.map((p) => (
              <button
                key={p.kod}
                type="button"
                title={t(p.popis)}
                onClick={() => setUprava({ ...uprava, text: `${uprava.text}${p.kod}` })}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-secondary"
              >
                {p.kod}
              </button>
            ))}
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-xs">
            <div className="mb-1 font-medium text-muted-foreground">{t("Ukážka")}</div>
            <div className="font-medium">{doplnPremenne(uprava.predmet, ukazka)}</div>
            <div className="mt-1 whitespace-pre-wrap break-words">
              {doplnPremenne(uprava.text, ukazka)}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setUprava(null)}
              className="h-9 rounded-md border border-border px-3 text-sm hover:bg-secondary"
            >
              {t("Zrušiť")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={uloz}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("Uložiť šablónu")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setUprava({ ...NOVA })}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
        >
          <Plus className="h-4 w-4" />
          {t("Pridať šablónu")}
        </button>
      )}
    </div>
  );
}
