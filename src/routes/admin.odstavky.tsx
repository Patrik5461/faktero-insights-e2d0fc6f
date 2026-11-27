/**
 * Admin → Odstávky inštitúcií (FAK-523, 26. 11. 2026).
 *
 * Plánované odstávky Finančnej správy, slovensko.sk, Sociálnej poisťovne
 * a zdravotných poisťovní (tabuľka `odstavky_institucii`). Automaticky stiahnuté
 * oznamy prichádzajú ako návrhy — používatelia uvidia len schválené (pás
 * v aplikácii). Admin ich tu schváli, zamietne, opraví alebo zadá ručne.
 * Všetky časy sú v pásme Europe/Bratislava.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ListPagination, useStoredPageSize } from "@/components/faktero/ListControls";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import {
  INSTITUCIE,
  jeAktualna,
  koniecOdstavky,
  kolizia,
  type ZdrojOdstavky,
} from "@/lib/faktero/odstavky";
import {
  adminOdstavkaPridajFn,
  adminOdstavkaStavFn,
  adminOdstavkaUpravFn,
  adminOdstavkaZmazFn,
  adminOdstavkyZoznamFn,
} from "@/lib/faktero/odstavky-admin.functions";

export const Route = createFileRoute("/admin/odstavky")({
  head: () => ({ meta: [{ title: "Admin · Odstávky inštitúcií — Faktero" }] }),
  component: AdminOdstavkyPage,
});

type Riadok = Awaited<ReturnType<typeof adminOdstavkyZoznamFn>>[number];

const PASMO = "Europe/Bratislava";
/** Poradie inštitúcií vo výbere — „Iná inštitúcia“ na konci. */
const ZDROJE: ZdrojOdstavky[] = ["fs", "upvs", "sp", "vszp", "dovera", "union", "rucne"];

// ── Čas v Bratislave ───────────────────────────────────────────────────

/** Časti dátumu a času tak, ako ich ukazujú hodiny v Bratislave. */
function castiVBratislave(ms: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: PASMO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(ms))
      .map((c) => [c.type, c.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

/** Posun Bratislavy voči UTC v danom okamihu (ms). */
function posun(ms: number): number {
  const c = castiVBratislave(ms);
  return Date.UTC(c.y, c.m - 1, c.d, c.h, c.mi) - Math.floor(ms / 60_000) * 60_000;
}

/** Hodnota <input type="datetime-local"> (čas v Bratislave) → ISO, alebo null. */
function zVstupu(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const naslepo = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Dva kroky, aby sedel aj deň prechodu na letný/zimný čas.
  let ms = naslepo - posun(naslepo);
  ms = naslepo - posun(ms);
  return new Date(ms).toISOString();
}

/** ISO → hodnota <input type="datetime-local"> v Bratislave. */
function doVstupu(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const c = castiVBratislave(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${c.y}-${p(c.m)}-${p(c.d)}T${p(c.h)}:${p(c.mi)}`;
}

const FORMAT_DATUM = new Intl.DateTimeFormat("sk-SK", {
  timeZone: PASMO,
  day: "numeric",
  month: "numeric",
  year: "numeric",
});
const FORMAT_CAS = new Intl.DateTimeFormat("sk-SK", {
  timeZone: PASMO,
  hour: "2-digit",
  minute: "2-digit",
});

function datumCas(iso: string): string {
  const d = new Date(iso);
  return `${FORMAT_DATUM.format(d)} ${FORMAT_CAS.format(d)}`;
}

/** „26. 11. 2026 20:00 – 23:00“, cez viac dní celé oba konce. */
function rozsah(o: Pick<Riadok, "zaciatok" | "koniec">): string {
  if (!o.zaciatok) return "—";
  if (!o.koniec) return `${datumCas(o.zaciatok)} – ?`;
  const od = new Date(o.zaciatok);
  const doo = new Date(o.koniec);
  if (FORMAT_DATUM.format(od) === FORMAT_DATUM.format(doo))
    return `${datumCas(o.zaciatok)} – ${FORMAT_CAS.format(doo)}`;
  return `${datumCas(o.zaciatok)} – ${datumCas(o.koniec)}`;
}

// ── Formulár ──────────────────────────────────────────────────────────

type Formular = {
  zdroj: ZdrojOdstavky;
  institucia: string;
  sluzba: string;
  nazov: string;
  zaciatok: string;
  koniec: string;
  url: string;
  popis: string;
};

const PRAZDNY: Formular = {
  zdroj: "fs",
  institucia: INSTITUCIE.fs,
  sluzba: "",
  nazov: "",
  zaciatok: "",
  koniec: "",
  url: "",
  popis: "",
};

function zRiadku(o: Riadok): Formular {
  return {
    zdroj: o.zdroj,
    institucia: o.institucia,
    sluzba: o.sluzba ?? "",
    nazov: o.nazov,
    zaciatok: doVstupu(o.zaciatok),
    koniec: doVstupu(o.koniec),
    url: o.url ?? "",
    popis: o.popis ?? "",
  };
}

/** Formulár → údaje pre server; chyba sa vráti ako text na zobrazenie. */
function naOdoslanie(f: Formular, t: (s: string) => string) {
  const zaciatok = zVstupu(f.zaciatok);
  if (!zaciatok) throw new Error(t("Zadajte začiatok odstávky."));
  const koniec = f.koniec ? zVstupu(f.koniec) : null;
  if (f.koniec && !koniec) throw new Error(t("Neplatný koniec odstávky."));
  if (koniec && Date.parse(koniec) < Date.parse(zaciatok))
    throw new Error(t("Koniec nesmie byť pred začiatkom."));
  if (!f.nazov.trim()) throw new Error(t("Zadajte názov."));
  return {
    institucia: f.institucia.trim() || INSTITUCIE[f.zdroj],
    sluzba: f.sluzba.trim() || null,
    nazov: f.nazov.trim(),
    popis: f.popis.trim() || null,
    url: f.url.trim() || null,
    zaciatok,
    koniec,
  };
}

const vstup = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const tlacidlo =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60";

function PoliaOdstavky({
  f,
  zmen,
  vyberZdroja,
}: {
  f: Formular;
  zmen: (z: Partial<Formular>) => void;
  /** Pri pridaní sa vyberá inštitúcia zo zoznamu, pri úprave sa zdroj nemení. */
  vyberZdroja: boolean;
}) {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {vyberZdroja ? (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">{t("Inštitúcia")}</span>
            <select
              className={vstup}
              value={f.zdroj}
              onChange={(e) => {
                const zdroj = e.target.value as ZdrojOdstavky;
                zmen({ zdroj, institucia: zdroj === "rucne" ? "" : INSTITUCIE[zdroj] });
              }}
            >
              {ZDROJE.map((z) => (
                <option key={z} value={z}>
                  {t(INSTITUCIE[z])}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {(!vyberZdroja || f.zdroj === "rucne") && (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">{t("Názov inštitúcie")}</span>
            <input
              className={vstup}
              maxLength={120}
              required
              value={f.institucia}
              onChange={(e) => zmen({ institucia: e.target.value })}
            />
          </label>
        )}
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("Služba")}</span>
          <input
            className={vstup}
            maxLength={200}
            placeholder={t("napr. eKasa, eDane, ePN")}
            value={f.sluzba}
            onChange={(e) => zmen({ sluzba: e.target.value })}
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">{t("Názov")}</span>
        <input
          className={vstup}
          maxLength={300}
          required
          value={f.nazov}
          onChange={(e) => zmen({ nazov: e.target.value })}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("Od (čas v Bratislave)")}</span>
          <input
            type="datetime-local"
            className={vstup}
            required
            value={f.zaciatok}
            onChange={(e) => zmen({ zaciatok: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("Do (čas v Bratislave)")}</span>
          <input
            type="datetime-local"
            className={vstup}
            min={f.zaciatok || undefined}
            value={f.koniec}
            onChange={(e) => zmen({ koniec: e.target.value })}
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">{t("Odkaz na pôvodný oznam")}</span>
        <input
          type="url"
          className={vstup}
          maxLength={1000}
          placeholder="https://"
          value={f.url}
          onChange={(e) => zmen({ url: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">{t("Popis")}</span>
        <textarea
          className={`${vstup} min-h-[4.5rem]`}
          maxLength={4000}
          value={f.popis}
          onChange={(e) => zmen({ popis: e.target.value })}
        />
      </label>
    </div>
  );
}

// ── Stránka ───────────────────────────────────────────────────────────

function AdminOdstavkyPage() {
  const { t } = useT();
  const zoznamFn = useServerFn(adminOdstavkyZoznamFn);
  const stavFn = useServerFn(adminOdstavkaStavFn);
  const upravFn = useServerFn(adminOdstavkaUpravFn);
  const pridajFn = useServerFn(adminOdstavkaPridajFn);
  const zmazFn = useServerFn(adminOdstavkaZmazFn);

  const [riadky, setRiadky] = useState<Riadok[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState<string | null>(null);
  const [upravovana, setUpravovana] = useState<{ id: string; f: Formular } | null>(null);
  const [novy, setNovy] = useState<Formular>(PRAZDNY);
  const [strana, setStrana] = useState(1);
  const [pageSize, setPageSize] = useStoredPageSize("admin-odstavky");

  const nacitaj = useCallback(() => {
    setChyba(null);
    zoznamFn()
      .then(setRiadky)
      .catch((e) => setChyba(e?.message ?? "Chyba"));
  }, [zoznamFn]);

  useEffect(() => {
    nacitaj();
  }, [nacitaj]);

  /** Spoločný obal akcie: zamkne tlačidlá riadku, ukáže výsledok, obnoví zoznam. */
  async function akcia(id: string, beh: () => Promise<unknown>, ok: string) {
    setPracuje(id);
    try {
      await beh();
      toast.success(ok);
      nacitaj();
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
      return false;
    } finally {
      setPracuje(null);
    }
  }

  const schval = (o: Riadok) =>
    akcia(o.id, () => stavFn({ data: { id: o.id, stav: "schvalene" } }), t("Odstávka schválená"));
  const zamietni = (o: Riadok) =>
    akcia(o.id, () => stavFn({ data: { id: o.id, stav: "zamietnute" } }), t("Odstávka zamietnutá"));

  async function zmaz(o: Riadok) {
    const sprava = o.automaticky
      ? t(
          "Zmazať odstávku natrvalo? Automaticky stiahnutý oznam sa môže pri ďalšom sťahovaní objaviť znova — ak ho nechcete ukazovať, radšej ho zamietnite.",
        )
      : t("Zmazať odstávku natrvalo?");
    if (!(await potvrd(sprava))) return;
    await akcia(o.id, () => zmazFn({ data: { id: o.id } }), t("Odstávka zmazaná"));
  }

  async function ulozUpravu() {
    if (!upravovana) return;
    const { id, f } = upravovana;
    let odstavka;
    try {
      odstavka = naOdoslanie(f, t);
    } catch (e: any) {
      toast.error(e.message);
      return;
    }
    if (await akcia(id, () => upravFn({ data: { id, odstavka } }), t("Odstávka uložená")))
      setUpravovana(null);
  }

  async function pridaj() {
    let odstavka;
    try {
      odstavka = naOdoslanie(novy, t);
    } catch (e: any) {
      toast.error(e.message);
      return;
    }
    if (
      await akcia(
        "novy",
        () => pridajFn({ data: { zdroj: novy.zdroj, odstavka } }),
        t("Odstávka pridaná"),
      )
    )
      setNovy(PRAZDNY);
  }

  const teraz = Date.now();
  const navrhy = (riadky ?? []).filter((o) => o.stav === "navrh");
  const schvalene = (riadky ?? []).filter((o) => o.stav === "schvalene");
  const zamietnute = (riadky ?? []).filter((o) => o.stav === "zamietnute");

  /** Zdroj, inštitúcia, služba a odkaz na pôvodný oznam. */
  const povod = (o: Riadok) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/80">
        {o.institucia}
      </span>
      {o.sluzba && <span>{o.sluzba}</span>}
      <span>
        · {o.automaticky ? t("stiahnuté automaticky") : t("zadané ručne")} ({o.zdroj})
      </span>
      {o.url && (
        <a
          href={o.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        >
          {t("Pôvodný oznam")} <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );

  const formularUpravy = (o: Riadok) =>
    upravovana?.id === o.id && (
      <form
        className="mt-3 rounded-lg border border-dashed border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ulozUpravu();
        }}
      >
        <PoliaOdstavky
          f={upravovana.f}
          vyberZdroja={false}
          zmen={(z) => setUpravovana((u) => (u ? { ...u, f: { ...u.f, ...z } } : u))}
        />
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            disabled={pracuje === o.id}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {pracuje === o.id && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("Uložiť")}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={() => setUpravovana(null)}
          >
            {t("Zrušiť")}
          </button>
        </div>
      </form>
    );

  const tlacidloUpravit = (o: Riadok) => (
    <button
      type="button"
      className={tlacidlo}
      disabled={pracuje === o.id}
      onClick={() => setUpravovana(upravovana?.id === o.id ? null : { id: o.id, f: zRiadku(o) })}
    >
      <Pencil className="h-3.5 w-3.5" /> {t("Upraviť")}
    </button>
  );

  const tlacidloZmazat = (o: Riadok) => (
    <button
      type="button"
      className={`${tlacidlo} text-destructive hover:bg-destructive/10`}
      disabled={pracuje === o.id}
      onClick={() => void zmaz(o)}
    >
      <Trash2 className="h-3.5 w-3.5" /> {t("Zmazať")}
    </button>
  );

  return (
    <>
      <AdminPageHeader
        title={t("Odstávky inštitúcií")}
        description={t(
          "Plánované odstávky Finančnej správy, slovensko.sk, Sociálnej poisťovne a zdravotných poisťovní. Automaticky stiahnuté oznamy čakajú na schválenie — používatelia vidia len schválené, v pásme aplikácie od 3 dní pred začiatkom do konca. Časy sú v pásme Europe/Bratislava.",
        )}
      />
      <AdminPageBody>
        <div className="space-y-6">
          {chyba && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {t("Odstávky sa nedajú načítať:")} {chyba}
            </div>
          )}

          {/* Na schválenie */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              {t("Na schválenie")}{" "}
              {navrhy.length > 0 && (
                <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                  {navrhy.length}
                </span>
              )}
            </h2>
            {riadky == null && !chyba ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
              </div>
            ) : navrhy.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Žiadny návrh nečaká.")}</p>
            ) : (
              <ul className="space-y-3">
                {navrhy.map((o) => (
                  <li
                    key={o.id}
                    className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        {povod(o)}
                        <div className="font-medium">{o.nazov}</div>
                        <div className="text-sm">{rozsah(o)}</div>
                        {kolizia(o) === "dph" && (
                          <div className="text-xs text-amber-700 dark:text-amber-400">
                            {t("Pred lehotou podania DPH (25. deň v mesiaci).")}
                          </div>
                        )}
                        {o.popis && (
                          <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                            {o.popis}
                          </p>
                        )}
                        {!o.zaciatok && (
                          <p className="text-xs text-destructive">
                            {t("Chýba začiatok — pred schválením ho doplňte cez Upraviť.")}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={pracuje === o.id || !o.zaciatok}
                          onClick={() => void schval(o)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
                        >
                          {pracuje === o.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          {t("Schváliť")}
                        </button>
                        <button
                          type="button"
                          disabled={pracuje === o.id}
                          onClick={() => void zamietni(o)}
                          className={tlacidlo}
                        >
                          <X className="h-3.5 w-3.5" /> {t("Zamietnuť")}
                        </button>
                        {tlacidloUpravit(o)}
                      </div>
                    </div>
                    {formularUpravy(o)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Schválené */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t("Schválené")}</h2>
            {riadky != null && schvalene.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Zatiaľ žiadna schválená odstávka.")}</p>
            ) : (
              schvalene.length > 0 && (
                <>
                  <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                    {schvalene.slice((strana - 1) * pageSize, strana * pageSize).map((o) => {
                      const koniec = koniecOdstavky(o);
                      const minula = koniec != null && koniec < teraz;
                      const ukazuje = jeAktualna(o, teraz);
                      const prebieha =
                        ukazuje && o.zaciatok != null && Date.parse(o.zaciatok) <= teraz;
                      return (
                        <li
                          key={o.id}
                          className={`p-4 ${minula ? "opacity-60" : ukazuje ? "bg-primary/5" : ""}`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              {povod(o)}
                              <div className={minula ? "text-muted-foreground" : "font-medium"}>
                                {o.nazov}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span>{rozsah(o)}</span>
                                {prebieha ? (
                                  <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
                                    {t("prebieha")}
                                  </span>
                                ) : ukazuje ? (
                                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                                    {t("ukazuje sa používateľom")}
                                  </span>
                                ) : minula ? (
                                  <span className="text-xs text-muted-foreground">
                                    {t("skončená")}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {t("naplánovaná")}
                                  </span>
                                )}
                                {!minula && kolizia(o) === "dph" && (
                                  <span className="text-xs text-amber-700 dark:text-amber-400">
                                    {t("Pred lehotou podania DPH (25. deň v mesiaci).")}
                                  </span>
                                )}
                              </div>
                              {o.popis && !minula && (
                                <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                                  {o.popis}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {tlacidloUpravit(o)}
                              <button
                                type="button"
                                disabled={pracuje === o.id}
                                onClick={() => void zamietni(o)}
                                className={tlacidlo}
                                title={t("Skryť pred používateľmi")}
                              >
                                <X className="h-3.5 w-3.5" /> {t("Zamietnuť")}
                              </button>
                              {tlacidloZmazat(o)}
                            </div>
                          </div>
                          {formularUpravy(o)}
                        </li>
                      );
                    })}
                  </ul>
                  <ListPagination
                    page={strana}
                    pageSize={pageSize}
                    total={schvalene.length}
                    onPageChange={setStrana}
                    onPageSizeChange={(n) => {
                      setPageSize(n);
                      setStrana(1);
                    }}
                  />
                </>
              )
            )}
          </section>

          {/* Zamietnuté — zbalené, dajú sa vrátiť alebo zmazať */}
          {zamietnute.length > 0 && (
            <details className="rounded-xl border border-border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                {t("Zamietnuté ({n})", { n: zamietnute.length })}
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {zamietnute.map((o) => (
                  <li key={o.id} className="p-4 text-muted-foreground">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        {povod(o)}
                        <div className="line-through decoration-muted-foreground/50">{o.nazov}</div>
                        <div className="text-sm">{rozsah(o)}</div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={pracuje === o.id || !o.zaciatok}
                          onClick={() => void schval(o)}
                          className={tlacidlo}
                        >
                          <Check className="h-3.5 w-3.5" /> {t("Schváliť")}
                        </button>
                        {tlacidloUpravit(o)}
                        {tlacidloZmazat(o)}
                      </div>
                    </div>
                    {formularUpravy(o)}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Pridať ručne */}
          <form
            className="rounded-xl border border-border bg-card p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void pridaj();
            }}
          >
            <div className="mb-1 text-sm font-medium">{t("Pridať odstávku")}</div>
            <p className="mb-3 text-xs text-muted-foreground">
              {t("Ručne zadaná odstávka je rovno schválená a používatelia ju uvidia.")}
            </p>
            <PoliaOdstavky
              f={novy}
              vyberZdroja
              zmen={(z) => setNovy((f) => ({ ...f, ...z }))}
            />
            <button
              type="submit"
              disabled={pracuje === "novy"}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {pracuje === "novy" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t("Pridať odstávku")}
            </button>
          </form>
        </div>
      </AdminPageBody>
    </>
  );
}
