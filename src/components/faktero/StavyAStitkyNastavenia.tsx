import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  FARBY_STAVU,
  NAVRHY_STAVOV,
  triedaFarby,
  type StavDokladu,
} from "@/lib/faktero/doklady-hromadne";
import { zabudniCiselnikyFirmy } from "@/hooks/useCiselnikyDokladov";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

type Stitok = { id: string; nazov: string; farba: string };

/**
 * Nastavenie vlastných stavov dokladov a štítkov firmy (Účtovníctvo →
 * Predkontácie). Stav je pracovná značka kancelárie („Čaká na doklad od
 * klienta"); štítky triedia doklady naprieč agendami. Do účtovníctva nejde ani jedno.
 */
export function StavyAStitkyNastavenia({ companyId }: { companyId: string }) {
  const { t } = useT();
  const [stavy, setStavy] = useState<StavDokladu[] | null>(null);
  const [stitky, setStitky] = useState<Stitok[]>([]);
  const [novyStav, setNovyStav] = useState("");
  const [novaFarba, setNovaFarba] = useState("siva");
  const [novyStitok, setNovyStitok] = useState("");

  const obnov = useCallback(async () => {
    const [s, st] = await Promise.all([
      supabase
        .from("stavy_dokladov")
        .select("id, nazov, farba, poradie, aktivne")
        .eq("company_id", companyId)
        .order("poradie")
        .order("nazov"),
      supabase
        .from("stitky_firmy")
        .select("id, nazov, farba")
        .eq("company_id", companyId)
        .order("nazov"),
    ]);
    if (s.error) toast.error(s.error.message);
    setStavy((s.data ?? []) as StavDokladu[]);
    setStitky((st.data ?? []) as Stitok[]);
    zabudniCiselnikyFirmy(companyId);
  }, [companyId]);

  useEffect(() => {
    void obnov();
  }, [obnov]);

  async function pridajStav(nazov: string, farba: string) {
    const n = nazov.trim();
    if (!n) return;
    const { error } = await supabase.from("stavy_dokladov").insert({
      company_id: companyId,
      nazov: n.slice(0, 60),
      farba,
      poradie: (stavy?.length ?? 0) + 1,
    });
    if (error) return toast.error(error.code === "23505" ? t("Taký stav už máte") : error.message);
    setNovyStav("");
    await obnov();
  }

  async function upravStav(id: string, zmena: Partial<StavDokladu>) {
    const { error } = await supabase.from("stavy_dokladov").update(zmena).eq("id", id);
    if (error) return toast.error(error.message);
    await obnov();
  }

  async function zmazStav(s: StavDokladu) {
    if (
      !(await potvrd(
        t("Zmazať stav „{nazov}“? Doklady s ním ostanú bez stavu.", { nazov: s.nazov }),
      ))
    )
      return;
    const { error } = await supabase.from("stavy_dokladov").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    await obnov();
  }

  async function pridajStitok() {
    const n = novyStitok.trim();
    if (!n) return;
    const { error } = await supabase
      .from("stitky_firmy")
      .insert({ company_id: companyId, nazov: n.slice(0, 40) });
    if (error)
      return toast.error(error.code === "23505" ? t("Taký štítok už máte") : error.message);
    setNovyStitok("");
    await obnov();
  }

  async function zmazStitok(s: Stitok) {
    if (
      !(await potvrd(
        t("Odstrániť štítok „{nazov}“ z ponuky? Na dokladoch ostane.", { nazov: s.nazov }),
      ))
    )
      return;
    const { error } = await supabase.from("stitky_firmy").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    await obnov();
  }

  const vstup = "h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm";
  const chybajuceNavrhy = NAVRHY_STAVOV.filter(
    (n) => !(stavy ?? []).some((s) => s.nazov === n.nazov),
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("Stavy dokladov a štítky")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "Vlastný stav dokladu (napr. „Čaká na doklad od klienta“) a štítky sa nastavujú v detaile dokladu alebo hromadne v zozname a dá sa podľa nich filtrovať. Do účtovníctva sa neprenášajú a dajú sa meniť aj na odovzdanom doklade.",
        )}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div>
          <h3 className="text-sm font-medium">{t("Stavy dokladov")}</h3>
          {stavy === null ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("Načítavam…")}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {stavy.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={t("Názov stavu")}
                    defaultValue={s.nazov}
                    maxLength={60}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== s.nazov) void upravStav(s.id, { nazov: v });
                    }}
                    className={`${vstup} flex-1 ${triedaFarby(s.farba)}`}
                  />
                  <select
                    aria-label={t("Farba stavu")}
                    value={s.farba}
                    onChange={(e) => void upravStav(s.id, { farba: e.target.value })}
                    className={vstup}
                  >
                    {FARBY_STAVU.map((f) => (
                      <option key={f.kod} value={f.kod}>
                        {t(f.nazov)}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={s.aktivne}
                      onChange={(e) => void upravStav(s.id, { aktivne: e.target.checked })}
                    />
                    {t("ponúkať")}
                  </label>
                  <button
                    type="button"
                    onClick={() => void zmazStav(s)}
                    aria-label={t("Zmazať stav {nazov}", { nazov: s.nazov })}
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void pridajStav(novyStav, novaFarba);
            }}
          >
            <input
              aria-label={t("Nový stav")}
              value={novyStav}
              onChange={(e) => setNovyStav(e.target.value)}
              maxLength={60}
              placeholder={t("Nový stav, napr. Skontrolovať")}
              className={`${vstup} flex-1`}
            />
            <select
              aria-label={t("Farba nového stavu")}
              value={novaFarba}
              onChange={(e) => setNovaFarba(e.target.value)}
              className={vstup}
            >
              {FARBY_STAVU.map((f) => (
                <option key={f.kod} value={f.kod}>
                  {t(f.nazov)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!novyStav.trim()}
              className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> {t("Pridať")}
            </button>
          </form>
          {chybajuceNavrhy.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {t("Rýchlo pridať:")}
              {chybajuceNavrhy.map((n) => (
                <button
                  key={n.nazov}
                  type="button"
                  onClick={() => void pridajStav(t(n.nazov), n.farba)}
                  className={`rounded-md px-1.5 py-0.5 ${triedaFarby(n.farba)} hover:opacity-80`}
                >
                  + {t(n.nazov)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <h3 className="text-sm font-medium">{t("Štítky")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Ponúkajú sa pri dokladoch, faktúrach aj iných dokladoch. Štítok napísaný pri doklade sa sem pridá sám.",
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stitky.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
              >
                {s.nazov}
                <button
                  type="button"
                  onClick={() => void zmazStitok(s)}
                  aria-label={t("Odstrániť štítok {stitok}", { stitok: s.nazov })}
                  className="hover:text-destructive"
                >
                  ×
                </button>
              </span>
            ))}
            {!stitky.length ? (
              <span className="text-xs text-muted-foreground">{t("Zatiaľ žiadne.")}</span>
            ) : null}
          </div>
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void pridajStitok();
            }}
          >
            <input
              aria-label={t("Nový štítok")}
              value={novyStitok}
              onChange={(e) => setNovyStitok(e.target.value)}
              maxLength={40}
              placeholder={t("napr. projekt X")}
              className={`${vstup} flex-1`}
            />
            <button
              type="submit"
              disabled={!novyStitok.trim()}
              className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> {t("Pridať")}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
