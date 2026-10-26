import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Bot, CheckCheck, Loader2, Wand2 } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import {
  naKontroluFn,
  navrhniNezauctovaneFn,
  potvrdNavrhyFn,
  type RiadokNaKontrolu,
} from "@/lib/faktero/auto-uctovanie.functions";
import {
  TEXTY_BLOKATOROV,
  type Blokator,
  type NavrhZauctovania,
} from "@/lib/faktero/auto-uctovanie";
import { useZdrojText } from "@/components/faktero/AutoZauctovanieOdznak";
import { AutopilotKarta } from "@/components/faktero/AutopilotKarta";

export const Route = createFileRoute("/_authenticated/uctovnictvo/na-kontrolu")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Zaúčtovanie na kontrolu — Faktero") }],
  }),
  component: NaKontroluPage,
});

type Filter = "vsetky" | "blokovane" | "navrh" | "bez_navrhu";
const TYPY: { kod: "" | RiadokNaKontrolu["typ"]; nazov: string }[] = [
  { kod: "", nazov: "Všetky doklady" },
  { kod: "prijata", nazov: "Prijaté faktúry" },
  { kod: "blocek", nazov: "Bločky" },
  { kod: "vystavena", nazov: "Vystavené faktúry" },
];
const NAZOV_TYPU: Record<RiadokNaKontrolu["typ"], string> = {
  prijata: "Prijatá faktúra",
  blocek: "Bloček",
  vystavena: "Vystavená faktúra",
};
const kluc = (r: { typ: string; id: string }) => `${r.typ}:${r.id}`;

function NaKontroluPage() {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const cid = useMemo(() => getActiveCompanyId(), []);
  const nacitajFn = useServerFn(naKontroluFn);
  const potvrdFn = useServerFn(potvrdNavrhyFn);
  const navrhniFn = useServerFn(navrhniNezauctovaneFn);
  const zdrojText = useZdrojText();
  const [riadky, setRiadky] = useState<RiadokNaKontrolu[] | null>(null);
  const [skratene, setSkratene] = useState(false);
  const [typ, setTyp] = useState<"" | RiadokNaKontrolu["typ"]>("");
  const [filter, setFilter] = useState<Filter>("vsetky");
  const [zdroj, setZdroj] = useState("");
  const [hladaj, setHladaj] = useState("");
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [navrhujem, setNavrhujem] = useState<{ spracovanych: number; zostava: number } | null>(
    null,
  );

  const nacitaj = useCallback(async () => {
    if (!cid) return;
    try {
      const r = await nacitajFn({ data: { company_id: cid } });
      setRiadky(r.riadky);
      setSkratene(r.skratene);
    } catch (e) {
      toast.error((e as Error).message);
      setRiadky([]);
    }
  }, [cid, nacitajFn]);
  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  const zobrazene = useMemo(() => {
    const h = hladaj.trim().toLowerCase();
    return (riadky ?? []).filter((r) => {
      const n = r.navrh as NavrhZauctovania | null;
      if (typ && r.typ !== typ) return false;
      if (filter === "blokovane" && !n?.blokatory?.length) return false;
      if (filter === "navrh" && !(n?.predkontacia && !n.blokatory?.length)) return false;
      if (filter === "bez_navrhu" && n) return false;
      if (zdroj && (n?.zdroj ?? "") !== zdroj) return false;
      if (h && !`${r.cislo ?? ""} ${r.partner ?? ""}`.toLowerCase().includes(h)) return false;
      return true;
    });
  }, [riadky, typ, filter, zdroj, hladaj]);

  const vsetkyVybrane = zobrazene.length > 0 && zobrazene.every((r) => vybrane.has(kluc(r)));
  const sNavrhom = (r: RiadokNaKontrolu) =>
    Boolean((r.navrh as NavrhZauctovania | null)?.predkontacia || r.predkontacia);

  async function potvrdit() {
    if (!cid) return;
    const polozky = zobrazene
      .filter((r) => vybrane.has(kluc(r)) && sNavrhom(r))
      .map((r) => ({ typ: r.typ, id: r.id }));
    if (!polozky.length) return toast.error(t("Vyberte doklady s návrhom."));
    setBusy(true);
    try {
      let spolu = 0;
      const chyby: string[] = [];
      for (let i = 0; i < polozky.length; i += 100) {
        const r = await potvrdFn({ data: { company_id: cid, polozky: polozky.slice(i, i + 100) } });
        spolu += r.zauctovanych;
        chyby.push(...r.preskocene);
      }
      if (spolu) toast.success(t("Zaúčtovaných: {n}", { n: spolu }));
      if (chyby.length) toast.warning(chyby.slice(0, 5).join(" · "));
      setVybrane(new Set());
      await nacitaj();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function navrhnut() {
    if (!cid) return;
    setNavrhujem({ spracovanych: 0, zostava: 0 });
    try {
      let spolu = 0;
      // Po dávkach (nginx strihá dlhé volania) — kým niečo zostáva a dávka niečo spravila.
      for (let i = 0; i < 40; i++) {
        const r = await navrhniFn({ data: { company_id: cid } });
        spolu += r.spracovanych;
        setNavrhujem({ spracovanych: spolu, zostava: r.zostava });
        if (!r.zostava || !r.spracovanych) break;
      }
      toast.success(
        t("Návrhy sú pripravené ({n}). Nič sa nezaúčtovalo — potvrďte ich.", { n: spolu }),
      );
      await nacitaj();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setNavrhujem(null);
    }
  }

  const odkaz = (r: RiadokNaKontrolu) =>
    r.typ === "prijata" ? (
      <Link
        to="/prijate-faktury/$id"
        params={{ id: r.id }}
        className="font-medium text-primary hover:underline"
      >
        {r.cislo || "—"}
      </Link>
    ) : r.typ === "vystavena" ? (
      <Link
        to="/faktury/$id"
        params={{ id: r.id }}
        className="font-medium text-primary hover:underline"
      >
        {r.cislo || "—"}
      </Link>
    ) : (
      <Link
        to="/doklady/novy"
        search={{ id: r.id } as any}
        className="font-medium text-primary hover:underline"
      >
        {r.cislo || t("bloček")}
      </Link>
    );

  return (
    <>
      <PageHeader
        title={t("Zaúčtovanie na kontrolu")}
        description={t(
          "Doklady, ktoré ešte nie sú zaúčtované — s návrhom od pravidla, zo zvyku alebo od AI, a s dôvodom, prečo ich autopilot nechal na vás.",
        )}
        action={
          <button
            onClick={() => void navrhnut()}
            disabled={!!navrhujem}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {navrhujem ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {navrhujem
              ? t("Navrhujem… {n}", { n: navrhujem.spracovanych })
              : t("Navrhnúť zaúčtovanie pre nezaúčtované")}
          </button>
        }
      />
      <PageBody>
        {cid && (
          <div className="mb-4">
            <AutopilotKarta companyId={cid} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            {t("Druh")}
            <select
              value={typ}
              onChange={(e) => setTyp(e.target.value as any)}
              className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {TYPY.map((x) => (
                <option key={x.kod} value={x.kod}>
                  {t(x.nazov)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            {t("Stav návrhu")}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="vsetky">{t("Všetky")}</option>
              <option value="navrh">{t("Návrh bez blokátora")}</option>
              <option value="blokovane">{t("S blokátorom")}</option>
              <option value="bez_navrhu">{t("Bez návrhu")}</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            {t("Zdroj")}
            <select
              value={zdroj}
              onChange={(e) => setZdroj(e.target.value)}
              className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{t("Všetky")}</option>
              <option value="pravidlo">{t("pravidlo")}</option>
              <option value="zvyk">{t("zvyk")}</option>
              <option value="ai">AI</option>
            </select>
          </label>
          <label className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t("Hľadať")}
            <input
              value={hladaj}
              onChange={(e) => setHladaj(e.target.value)}
              placeholder={t("Číslo alebo partner")}
              className="mt-1 block h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <button
            onClick={() => void potvrdit()}
            disabled={busy || !vybrane.size}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            {t("Potvrdiť návrhy ({n})", { n: vybrane.size })}
          </button>
        </div>

        {riadky === null ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
          </div>
        ) : zobrazene.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {riadky.length ? t("Filtru nezodpovedá žiadny doklad.") : t("Všetko je zaúčtované. 🎉")}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 p-3">
                    <input
                      type="checkbox"
                      aria-label={t("Vybrať všetky")}
                      checked={vsetkyVybrane}
                      onChange={() =>
                        setVybrane(vsetkyVybrane ? new Set() : new Set(zobrazene.map(kluc)))
                      }
                    />
                  </th>
                  <th className="p-3">{t("Doklad")}</th>
                  <th className="p-3">{t("Partner")}</th>
                  <th className="p-3">{t("Dátum")}</th>
                  <th className="p-3 text-right">{t("Suma")}</th>
                  <th className="p-3">{t("Návrh")}</th>
                  <th className="p-3">{t("Prečo čaká")}</th>
                </tr>
              </thead>
              <tbody>
                {zobrazene.map((r) => {
                  const n = r.navrh as NavrhZauctovania | null;
                  const kody = [
                    n?.predkontacia ?? r.predkontacia,
                    n?.clenenieDph ?? r.clenenie,
                    n?.kvClenenie ? `KV ${n.kvClenenie}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <tr key={kluc(r)} className="border-b border-border last:border-0 align-top">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          aria-label={t("Vybrať {cislo}", { cislo: r.cislo ?? "" })}
                          checked={vybrane.has(kluc(r))}
                          onChange={() => {
                            const s = new Set(vybrane);
                            if (s.has(kluc(r))) s.delete(kluc(r));
                            else s.add(kluc(r));
                            setVybrane(s);
                          }}
                        />
                      </td>
                      <td className="p-3">
                        <div className="text-[11px] uppercase text-muted-foreground">
                          {t(NAZOV_TYPU[r.typ])}
                        </div>
                        {odkaz(r)}
                      </td>
                      <td className="max-w-[16rem] truncate p-3" title={r.partner ?? ""}>
                        {r.partner || "—"}
                      </td>
                      <td className="whitespace-nowrap p-3">
                        {r.datum ? new Date(r.datum).toLocaleDateString(loc) : "—"}
                      </td>
                      <td className="whitespace-nowrap p-3 text-right tabular-nums">
                        {r.suma != null
                          ? r.suma.toLocaleString(loc, {
                              style: "currency",
                              currency: r.mena || "EUR",
                            })
                          : "—"}
                      </td>
                      <td className="p-3" title={n?.zdovodnenie || undefined}>
                        {kody ? (
                          <span className="font-medium">{kody}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {n?.zdroj && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Bot className="h-3 w-3" />{" "}
                            {zdrojText(n.zdroj, n.istota, n.pravidloNazov)}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {n?.blokatory?.length ? (
                          <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
                            {n.blokatory.map((b) => (
                              <li key={b} className="flex items-start gap-1">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                {t(TEXTY_BLOKATOROV[b as Blokator] ?? b)}
                              </li>
                            ))}
                          </ul>
                        ) : n ? (
                          <span className="text-xs text-muted-foreground">
                            {n.zdroj === "ai"
                              ? t("Návrh od AI čaká na potvrdenie")
                              : t("Istota pod prahom autopilota")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t("Zatiaľ bez návrhu")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {skratene && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Zobrazuje sa najviac 500 najnovších dokladov každého druhu.")}
          </p>
        )}
      </PageBody>
    </>
  );
}
