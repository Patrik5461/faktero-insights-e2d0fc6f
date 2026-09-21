import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  detailOstatnehoFn,
  nastavStavOstatnychFn,
  odkazPrilohyOstatnehoFn,
  odoberPrilohuOstatnehoFn,
  spustiRozpoznanieOstatnehoFn,
  stavRozpoznaniaOstatnehoFn,
  ulozOstatnyFn,
} from "@/lib/faktero/ostatne-doklady.functions";
import {
  DRUHY_OSTATNYCH,
  MAX_VELKOST_PRILOHY,
  POVOLENE_TYPY_PRILOH,
  bezpecneMeno,
  jeRozpoznaniePouzitelne,
  nazovDruhu,
  type DruhOstatneho,
  type RozpoznanyOstatny,
} from "@/lib/faktero/ostatne-doklady";
import { STAV_DOKLADU_NAZOV } from "@/lib/faktero/doklad-stav";
import { MENY } from "@/lib/faktero/mena";
import { CheckCircle2, Loader2, Paperclip, Save, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ostatne-doklady/novy")({
  head: () => ({ meta: [{ title: "Ostatný doklad — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s.id === "string" && s.id ? { id: s.id } : {},
  component: OstatnyDokladPage,
});

type Form = {
  kind: DruhOstatneho;
  sender: string;
  subject: string;
  received_date: string;
  amount: string;
  currency: string;
  due_date: string;
  note: string;
};

const PRAZDNY: Form = {
  kind: "ine",
  sender: "",
  subject: "",
  received_date: new Date().toISOString().slice(0, 10),
  amount: "",
  currency: "EUR",
  due_date: "",
  note: "",
};

function velkost(b: number | null | undefined): string {
  if (!b) return "";
  return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} kB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/** Súbor ako data URL — tak ho berie čítanie na serveri. */
function naDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Súbor sa nepodarilo načítať."));
    r.readAsDataURL(f);
  });
}

const cakaj = (ms: number) => new Promise((r) => setTimeout(r, ms));

function OstatnyDokladPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const detailFn = useServerFn(detailOstatnehoFn);
  const ulozFn = useServerFn(ulozOstatnyFn);
  const stavFn = useServerFn(nastavStavOstatnychFn);
  const odkazFn = useServerFn(odkazPrilohyOstatnehoFn);
  const odoberFn = useServerFn(odoberPrilohuOstatnehoFn);
  const citajFn = useServerFn(spustiRozpoznanieOstatnehoFn);
  const stavCitaniaFn = useServerFn(stavRozpoznaniaOstatnehoFn);
  /** Čítanie prílohy cez AI: čo práve beží a čím skončilo. */
  const [citanie, setCitanie] = useState<
    | { stav: "bezi"; subor: string }
    | { stav: "hotovo"; subor: string; doplnene: string[] }
    | { stav: "chyba"; subor: string; chyba: string }
    | null
  >(null);
  const formRef = useRef<Form>(PRAZDNY);
  const cid = getActiveCompanyId();

  /*
    Id nového dokladu vzniká hneď v prehliadači: prílohy sa nahrávajú do
    priečinka `firma/doklad/` a server overí, že tam naozaj ležia.
  */
  const [id] = useState<string>(() => search.id ?? crypto.randomUUID());
  const novy = !search.id;
  const [form, setForm] = useState<Form>(PRAZDNY);
  const [stav, setStav] = useState<string | null>(null);
  const [ulozene, setUlozene] = useState<any[]>([]);
  const [nove, setNove] = useState<File[]>([]);
  const [nacitavam, setNacitavam] = useState(!novy);
  const [ukladam, setUkladam] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (novy) return;
    (async () => {
      try {
        const d: any = await detailFn({ data: { id } });
        setForm({
          kind: d.kind,
          sender: d.sender ?? "",
          subject: d.subject ?? "",
          received_date: d.received_date,
          amount: d.amount != null ? String(d.amount) : "",
          currency: d.currency ?? "EUR",
          due_date: d.due_date ?? "",
          note: d.note ?? "",
        });
        setStav(d.status);
        setUlozene(
          [...(d.other_document_files ?? [])].sort((a: any, b: any) => a.position - b.position),
        );
      } catch (e: any) {
        toast.error(e?.message ?? "Doklad sa nepodarilo načítať.");
      } finally {
        setNacitavam(false);
      }
    })();
    // eslint-disable-next-line
  }, [id]);

  function nastav<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  formRef.current = form;

  /*
    Vyplní z prílohy len prázdne polia. Čo človek medzitým napísal, sa
    neprepisuje — čítanie trvá pár sekúnd a formulár ostáva otvorený.
  */
  function doplnZRozpoznania(r: RozpoznanyOstatny): string[] {
    const f = formRef.current;
    const zmeny: Partial<Form> = {};
    const doplnene: string[] = [];
    if (f.kind === "ine" && r.kind !== "ine") {
      zmeny.kind = r.kind;
      doplnene.push(`druh (${nazovDruhu(r.kind)})`);
    }
    if (!f.sender.trim() && r.sender) {
      zmeny.sender = r.sender;
      doplnene.push("odosielateľ");
    }
    if (!f.subject.trim() && r.subject) {
      zmeny.subject = r.subject;
      doplnene.push("predmet");
    }
    if (!f.amount.trim() && r.amount != null) {
      zmeny.amount = String(r.amount);
      if (r.currency) zmeny.currency = r.currency;
      doplnene.push("suma");
    }
    if (!f.due_date && r.due_date) {
      zmeny.due_date = r.due_date;
      doplnene.push("lehota");
    }
    if (!f.note.trim() && r.summary) {
      zmeny.note = r.summary;
      doplnene.push("poznámka");
    }
    setForm((x) => ({ ...x, ...zmeny }));
    return doplnene;
  }

  async function precitaj(f: File) {
    if (!cid) return;
    setCitanie({ stav: "bezi", subor: f.name });
    try {
      const { kluc } = await citajFn({
        data: { company_id: cid, document_id: id, subor: await naDataUrl(f) },
      });
      // Čítanie trvá zvyčajne 5–20 sekúnd; po dvoch minútach to vzdáme.
      for (let i = 0; i < 60; i++) {
        await cakaj(2000);
        const v: any = await stavCitaniaFn({ data: { company_id: cid, document_id: id, kluc } });
        if (!v.hotovo) continue;
        if (!v.ok) throw new Error(v.chyba);
        if (!jeRozpoznaniePouzitelne(v.rozpoznanie)) {
          throw new Error("V dokumente sa nenašiel odosielateľ ani predmet.");
        }
        setCitanie({ stav: "hotovo", subor: f.name, doplnene: doplnZRozpoznania(v.rozpoznanie) });
        return;
      }
      throw new Error("Čítanie trvá príliš dlho.");
    } catch (e: any) {
      setCitanie({ stav: "chyba", subor: f.name, chyba: e?.message ?? "Dokument sa nepodarilo prečítať." });
    }
  }

  function pridajSubory(zoznam: FileList | File[]) {
    const ok: File[] = [];
    for (const f of Array.from(zoznam)) {
      if (!POVOLENE_TYPY_PRILOH.includes(f.type)) {
        toast.error(`${f.name}: podporované sú PDF a obrázky (JPG, PNG, WEBP, HEIC).`);
        continue;
      }
      if (f.size > MAX_VELKOST_PRILOHY) {
        toast.error(`${f.name}: súbor môže mať najviac 20 MB.`);
        continue;
      }
      ok.push(f);
    }
    if (ok.length) {
      setNove((n) => [...n, ...ok]);
      // Prvú prílohu prečíta AI sama, kým sú údaje prázdne — nech človek
      // nemusí prepisovať odosielateľa a predmet z papiera.
      const f = formRef.current;
      if (!f.sender.trim() && !f.subject.trim() && citanie?.stav !== "bezi") void precitaj(ok[0]);
    }
  }

  async function otvor(fileId: string) {
    try {
      const { url } = await odkazFn({ data: { id: fileId } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Prílohu sa nepodarilo otvoriť.");
    }
  }

  async function odober(fileId: string) {
    if (!confirm("Odstrániť prílohu?")) return;
    try {
      await odoberFn({ data: { id: fileId } });
      setUlozene((u) => u.filter((p) => p.id !== fileId));
    } catch (e: any) {
      toast.error(e?.message ?? "Prílohu sa nepodarilo odstrániť.");
    }
  }

  async function uloz(spracovat: boolean) {
    if (!cid) {
      toast.error("Vyberte firmu");
      return;
    }
    if (!form.received_date) {
      toast.error("Vyplňte dátum doručenia.");
      return;
    }
    const suma = form.amount.trim() ? Number(form.amount.replace(",", ".")) : null;
    if (suma != null && !Number.isFinite(suma)) {
      toast.error("Suma nie je číslo.");
      return;
    }
    setUkladam(true);
    const nahrate: { path: string; name: string; mime: string; size: number }[] = [];
    try {
      for (const [i, f] of nove.entries()) {
        const path = `${cid}/${id}/${Date.now()}-${i}-${bezpecneMeno(f.name)}`;
        const { error } = await supabase.storage
          .from("other-docs")
          .upload(path, f, { contentType: f.type, upsert: false });
        if (error) throw new Error(`${f.name}: ${error.message}`);
        nahrate.push({ path, name: f.name, mime: f.type, size: f.size });
      }
      await ulozFn({
        data: {
          company_id: cid,
          id,
          novy,
          udaje: {
            kind: form.kind,
            sender: form.sender || null,
            subject: form.subject || null,
            received_date: form.received_date,
            amount: suma,
            currency: form.currency,
            due_date: form.due_date || null,
            note: form.note || null,
          },
          prilohy: nahrate,
        },
      });
      let vysledok = novy ? "new" : stav;
      if (spracovat) {
        const v = await stavFn({ data: { company_id: cid, ids: [id], stav: "processed" } });
        if (v.zmenene) vysledok = "processed";
      }
      toast.success(
        vysledok === "processed" && spracovat
          ? "Doklad uložený a spracovaný"
          : novy
            ? "Doklad uložený medzi nespracované"
            : "Doklad uložený",
      );
      navigate({
        to: "/ostatne-doklady",
        search: {
          stav:
            vysledok === "processed" ? "spracovane" : vysledok === "exported" ? "odovzdane" : "nespracovane",
        },
      });
    } catch (e: any) {
      // Súbory, ku ktorým sa nezapísal doklad, by v úložisku ostali visieť.
      if (nahrate.length) {
        await supabase.storage
          .from("other-docs")
          .remove(nahrate.map((n) => n.path))
          .catch(() => {});
      }
      toast.error(e?.message ?? "Uloženie zlyhalo.");
    } finally {
      setUkladam(false);
    }
  }

  const pole = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

  return (
    <>
      <PageHeader
        title={novy ? "Pridať ostatný doklad" : "Ostatný doklad"}
        description="List, predpis, exekúcia, zmluva alebo iný podklad pre účtovníka."
      />
      <PageBody>
        {nacitavam ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Načítavam…</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <div className="min-w-0 rounded-2xl border border-border bg-card p-5">
              {stav && (
                <div className="mb-4 text-sm">
                  Stav: <strong>{STAV_DOKLADU_NAZOV[stav as keyof typeof STAV_DOKLADU_NAZOV]}</strong>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">Druh dokladu</span>
                  <select
                    value={form.kind}
                    onChange={(e) => nastav("kind", e.target.value as DruhOstatneho)}
                    className={pole}
                  >
                    {DRUHY_OSTATNYCH.map((d) => (
                      <option key={d.kluc} value={d.kluc}>
                        {d.nazov}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">Dátum doručenia</span>
                  <input
                    type="date"
                    value={form.received_date}
                    onChange={(e) => nastav("received_date", e.target.value)}
                    className={pole}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs text-muted-foreground">Odosielateľ</span>
                  <input
                    value={form.sender}
                    onChange={(e) => nastav("sender", e.target.value)}
                    placeholder="napr. Exekútorský úrad, Allianz, Daňový úrad Bratislava"
                    className={pole}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs text-muted-foreground">Predmet</span>
                  <input
                    value={form.subject}
                    onChange={(e) => nastav("subject", e.target.value)}
                    placeholder="napr. Exekučný príkaz — zrážky zo mzdy, predpis poistného na rok 2027"
                    className={pole}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">Suma (nepovinné)</span>
                  <div className="flex gap-2">
                    <input
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(e) => nastav("amount", e.target.value)}
                      className={`${pole} min-w-0`}
                    />
                    <select
                      value={form.currency}
                      onChange={(e) => nastav("currency", e.target.value)}
                      aria-label="Mena"
                      className="rounded-md border border-border bg-background px-2 text-sm"
                    >
                      {MENY.map((m) => (
                        <option key={m.code} value={m.code}>
                          {m.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">
                    Lehota / splatnosť (nepovinné)
                  </span>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => nastav("due_date", e.target.value)}
                    className={pole}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs text-muted-foreground">Poznámka pre účtovníka</span>
                  <textarea
                    value={form.note}
                    onChange={(e) => nastav("note", e.target.value)}
                    rows={3}
                    className={pole}
                  />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => navigate({ to: "/ostatne-doklady" })}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
                >
                  Zrušiť
                </button>
                {(novy || stav === "new") && (
                  <button
                    onClick={() => uloz(true)}
                    disabled={ukladam}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-600/20 disabled:opacity-50 dark:text-emerald-400"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Uložiť a spracovať
                  </button>
                )}
                <button
                  onClick={() => uloz(false)}
                  disabled={ukladam}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {ukladam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Uložiť
                </button>
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Prílohy</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF alebo fotky, aj viac strán naraz. Najviac 20 MB na súbor. Prvú prílohu
                prečíta AI a vyplní druh, odosielateľa, predmet, sumu a lehotu.
              </p>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  pridajSubory(e.dataTransfer.files);
                }}
                className={`mt-3 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center text-sm ${
                  dragOver ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                Pretiahnite súbory sem alebo
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/70"
                >
                  Vybrať súbory
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={POVOLENE_TYPY_PRILOH.join(",")}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) pridajSubory(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              {citanie && (
                <div
                  role="status"
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                    citanie.stav === "chyba"
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-primary/30 bg-primary/5"
                  }`}
                >
                  {citanie.stav === "bezi" && (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Čítam {citanie.subor}…
                    </span>
                  )}
                  {citanie.stav === "hotovo" &&
                    (citanie.doplnene.length
                      ? `Z prílohy som doplnil: ${citanie.doplnene.join(", ")}. Skontrolujte to.`
                      : "Príloha je prečítaná, všetky polia už boli vyplnené.")}
                  {citanie.stav === "chyba" && `Prílohu sa nepodarilo prečítať: ${citanie.chyba} Vyplňte údaje ručne.`}
                </div>
              )}

              {(ulozene.length > 0 || nove.length > 0) && (
                <ul className="mt-4 space-y-2">
                  {ulozene.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <button
                        onClick={() => otvor(p.id)}
                        className="min-w-0 flex-1 truncate text-left hover:underline"
                        title={p.name}
                      >
                        {p.name}
                      </button>
                      <span className="shrink-0 text-xs text-muted-foreground">{velkost(p.size)}</span>
                      <button
                        onClick={() => odober(p.id)}
                        aria-label={`Odstrániť ${p.name}`}
                        className="rounded p-1 hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </li>
                  ))}
                  {nove.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm">
                      <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate" title={f.name}>
                        {f.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {velkost(f.size)} · nahrá sa pri uložení
                      </span>
                      <button
                        onClick={() => precitaj(f)}
                        disabled={citanie?.stav === "bezi"}
                        title="Vyplniť údaje z tejto prílohy"
                        aria-label={`Prečítať ${f.name}`}
                        className="rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-40"
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setNove((n) => n.filter((_, j) => j !== i))}
                        aria-label={`Nepridávať ${f.name}`}
                        className="rounded p-1 hover:bg-secondary"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
