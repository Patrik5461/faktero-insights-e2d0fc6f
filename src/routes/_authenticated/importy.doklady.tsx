import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { createImportUploadUrl } from "@/lib/faktero/import-superfaktura.functions";
import {
  nahladImportuPrijatychFn,
  spustiImportPrijatychFn,
  stavImportuPrijatychFn,
} from "@/lib/faktero/import-prijatych.functions";
import { CheckCircle2, FileArchive, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/importy/doklady")({
  head: () => ({ meta: [{ title: "Import prijatých dokladov — Faktero" }] }),
  component: ImportDokladovPage,
});

/** 200 MB na súbor — ZIP so skenmi za rok býva veľký. */
const MAX_SUBOR = 200 * 1024 * 1024;

const ZDROJE = ["Doklado", "Pohoda", "Money S3", "iná aplikácia"];

type Nahlad = {
  faktury: number;
  blocky: number;
  duplicity: number;
  skenyPriradene: number;
  skenyBezParu: number;
  poznamky: string[];
  ukazka: {
    typ: "faktura" | "blocek";
    cislo: string | null;
    dodavatel: string | null;
    vystavenie: string | null;
    spolu: number | null;
    mena: string;
    duplicita: boolean;
    sken: string | null;
  }[];
};

const cakaj = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ImportDokladovPage() {
  const uploadFn = useServerFn(createImportUploadUrl);
  const nahladFn = useServerFn(nahladImportuPrijatychFn);
  const spustiFn = useServerFn(spustiImportPrijatychFn);
  const stavFn = useServerFn(stavImportuPrijatychFn);
  const cid = getActiveCompanyId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [subory, setSubory] = useState<File[]>([]);
  const [nahrate, setNahrate] = useState<{ path: string; meno: string }[]>([]);
  const [nahlad, setNahlad] = useState<Nahlad | null>(null);
  const [pracujem, setPracujem] = useState<string | null>(null);
  const [zdroj, setZdroj] = useState("Doklado");
  const [stav, setStav] = useState<"new" | "processed" | "exported">("exported");
  const [doPokladne, setDoPokladne] = useState(false);
  const [citatSkeny, setCitatSkeny] = useState(true);
  const [priebeh, setPriebeh] = useState<{
    stav: string;
    celkom: number;
    hotovo: number;
    vysledok: any;
    chyba: string | null;
  } | null>(null);

  function pridaj(zoznam: FileList | File[]) {
    const ok = Array.from(zoznam).filter((f) => {
      if (f.size > MAX_SUBOR) {
        toast.error(`${f.name}: najviac 200 MB na súbor. Väčší archív rozdeľte.`);
        return false;
      }
      return true;
    });
    setSubory((s) => [...s, ...ok].slice(0, 20));
    setNahlad(null);
    setNahrate([]);
  }

  async function nahrajAPozri() {
    if (!cid || !subory.length) return;
    setPracujem("Nahrávam súbory…");
    try {
      const cesty: { path: string; meno: string }[] = [];
      for (const f of subory) {
        const { signedUrl, path } = await uploadFn({ data: { companyId: cid, fileName: f.name } });
        const r = await fetch(signedUrl, {
          method: "PUT",
          body: f,
          headers: { "Content-Type": f.type || "application/octet-stream" },
        });
        if (!r.ok) throw new Error(`${f.name}: nahratie zlyhalo (${r.status})`);
        cesty.push({ path, meno: f.name });
      }
      setNahrate(cesty);
      setPracujem("Čítam doklady…");
      setNahlad((await nahladFn({ data: { companyId: cid, subory: cesty } })) as Nahlad);
    } catch (e: any) {
      toast.error(e?.message ?? "Súbory sa nepodarilo prečítať.");
    } finally {
      setPracujem(null);
    }
  }

  async function spusti() {
    if (!cid || !nahrate.length) return;
    setPracujem("Spúšťam import…");
    try {
      const { jobId, celkom } = await spustiFn({
        data: { companyId: cid, subory: nahrate, stav, doPokladne, citatSkeny, zdrojAplikacie: zdroj },
      });
      setPracujem(null);
      setPriebeh({ stav: "running", celkom, hotovo: 0, vysledok: null, chyba: null });
      // Import beží na serveri; pýtame sa naň, kým neskončí.
      for (;;) {
        await cakaj(2500);
        const j: any = await stavFn({ data: { companyId: cid, jobId } });
        setPriebeh({
          stav: j.status,
          celkom: j.total_rows,
          hotovo: j.processed_rows,
          vysledok: j.result,
          chyba: j.error_message,
        });
        if (j.status !== "running") break;
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Import sa nepodarilo spustiť.");
      setPracujem(null);
    }
  }

  const bezi = priebeh?.stav === "running";
  const hotovy = priebeh && priebeh.stav !== "running";

  return (
    <>
      <PageHeader
        title="Import prijatých dokladov"
        description="Prechod z Doklado alebo inej aplikácie: prijaté faktúry, bločky a skeny dokladov."
        action={
          <Link to="/importy" className="text-sm text-primary hover:underline">
            História importov
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div className="min-w-0 space-y-6">
            {/* 1. Súbory */}
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">1. Nahrajte export</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                XML pre Pohodu, CSV/XLSX alebo ZIP so skenmi (PDF, fotky) — aj viac súborov naraz.
                Najlepšie je nahrať XML a k nemu ZIP s PDF: údaje sa vezmú presne z XML a skeny sa
                priradia k dokladom.
              </p>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pridaj(e.dataTransfer.files);
                }}
                className="mt-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 text-center text-sm"
              >
                <FileArchive className="mb-2 h-7 w-7 text-muted-foreground" />
                Pretiahnite súbory sem alebo
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={Boolean(pracujem) || bezi}
                  className="mt-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/70 disabled:opacity-50"
                >
                  Vybrať súbory
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".xml,.csv,.txt,.xlsx,.xls,.zip,.pdf,.jpg,.jpeg,.png,.webp,.heic"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) pridaj(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              {subory.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {subory.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {(f.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      {!nahrate.length && (
                        <button
                          onClick={() => setSubory((s) => s.filter((_, j) => j !== i))}
                          aria-label={`Odobrať ${f.name}`}
                          className="rounded p-1 hover:bg-secondary"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!nahlad && (
                <button
                  onClick={nahrajAPozri}
                  disabled={!subory.length || Boolean(pracujem)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {pracujem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {pracujem ?? "Nahrať a pozrieť"}
                </button>
              )}
            </section>

            {/* 2. Náhľad a voľby */}
            {nahlad && (
              <section className="rounded-2xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold">2. Čo sa naimportuje</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Cislo popis="Prijaté faktúry" hodnota={nahlad.faktury} />
                  <Cislo popis="Bločky" hodnota={nahlad.blocky} />
                  <Cislo popis="Skeny priradené" hodnota={nahlad.skenyPriradene} />
                  <Cislo popis="Skeny na prečítanie AI" hodnota={nahlad.skenyBezParu} />
                </div>
                {nahlad.duplicity > 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {nahlad.duplicity} dokladov už vo Fakteri je — preskočia sa, import sa dá pustiť
                    aj opakovane.
                  </p>
                )}
                {nahlad.ukazka.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Typ</th>
                          <th className="px-3 py-2 text-left">Číslo</th>
                          <th className="px-3 py-2 text-left">Dodávateľ</th>
                          <th className="px-3 py-2 text-left">Dátum</th>
                          <th className="px-3 py-2 text-right">Suma</th>
                          <th className="px-3 py-2 text-left">Sken</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nahlad.ukazka.map((r, i) => (
                          <tr key={i} className={`border-t border-border ${r.duplicita ? "opacity-50" : ""}`}>
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              {r.typ === "faktura" ? "Faktúra" : "Bloček"}
                              {r.duplicita && " (už je)"}
                            </td>
                            <td className="px-3 py-1.5">{r.cislo ?? "—"}</td>
                            <td className="px-3 py-1.5">{r.dodavatel ?? "—"}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{r.vystavenie ?? "—"}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                              {r.spolu != null ? `${r.spolu.toFixed(2)} ${r.mena}` : "—"}
                            </td>
                            <td className="max-w-[10rem] truncate px-3 py-1.5 text-xs text-muted-foreground">
                              {r.sken ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {nahlad.poznamky.length > 0 && (
                  <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {nahlad.poznamky.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground">Odkiaľ doklady sú</span>
                    <select
                      value={zdroj}
                      onChange={(e) => setZdroj(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      {ZDROJE.map((z) => (
                        <option key={z}>{z}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground">Stav po importe</span>
                    <select
                      value={stav}
                      onChange={(e) => setStav(e.target.value as typeof stav)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="exported">Odovzdané účtovníkovi (už zaúčtované)</option>
                      <option value="processed">Spracované</option>
                      <option value="new">Nespracované — účtovník ich ešte prejde</option>
                    </select>
                  </label>
                </div>
                <label className="mt-4 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={citatSkeny}
                    onChange={(e) => setCitatSkeny(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    Skeny bez páru prečítať cez AI a založiť z nich doklady
                    <span className="block text-xs text-muted-foreground">
                      Najprv sa skúsia priradiť k dokladom z XML podľa sumy, dátumu a dodávateľa.
                      Listy, predpisy a exekúcie pôjdu do Ostatných dokladov.
                    </span>
                  </span>
                </label>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={doPokladne}
                    onChange={(e) => setDoPokladne(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    Hotovostné bločky započítať do pokladne
                    <span className="block text-xs text-muted-foreground">
                      Pri presune starých dokladov nechajte vypnuté — inak by pokladňa za minulé
                      mesiace nesedela.
                    </span>
                  </span>
                </label>
                {!priebeh && (
                  <button
                    onClick={spusti}
                    disabled={Boolean(pracujem)}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {pracujem ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {pracujem ?? "Spustiť import"}
                  </button>
                )}
              </section>
            )}

            {/* 3. Priebeh a výsledok */}
            {priebeh && (
              <section className="rounded-2xl border border-border bg-card p-5" role="status">
                <h2 className="text-sm font-semibold">3. {bezi ? "Importujem…" : "Hotovo"}</h2>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${priebeh.celkom ? Math.min(100, (priebeh.hotovo / priebeh.celkom) * 100) : bezi ? 5 : 100}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {priebeh.hotovo} z {priebeh.celkom}
                  {bezi && " — môžete odísť, import dobehne aj bez tejto stránky."}
                </p>
                {priebeh.vysledok && (
                  <ul className="mt-3 space-y-1 text-sm">
                    <li>Prijaté faktúry: {priebeh.vysledok.faktury}</li>
                    <li>Bločky: {priebeh.vysledok.blocky}</li>
                    <li>Ostatné doklady: {priebeh.vysledok.ostatne}</li>
                    <li>Priradené skeny: {priebeh.vysledok.skenyPriradene}</li>
                    <li>Preskočené (už boli vo Fakteri): {priebeh.vysledok.preskocene}</li>
                  </ul>
                )}
                {priebeh.chyba && <p className="mt-2 text-sm text-destructive">{priebeh.chyba}</p>}
                {priebeh.vysledok?.chyby?.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-amber-700 dark:text-amber-400">
                      {priebeh.vysledok.chyby.length} dokladov sa nepodarilo naimportovať
                    </summary>
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                      {priebeh.vysledok.chyby.map((c: string, i: number) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {hotovy && (
                  <div className="mt-4 flex flex-wrap gap-2 text-sm">
                    <Link to="/prijate-faktury" className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
                      Prijaté faktúry
                    </Link>
                    <Link to="/doklady" search={{ stav: "vsetky" }} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
                      Doklady
                    </Link>
                    <Link to="/ostatne-doklady" search={{ stav: "vsetky" }} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
                      Ostatné doklady
                    </Link>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="min-w-0 rounded-2xl border border-border bg-card p-5 text-sm">
            <h2 className="font-semibold">Ako vyviezť doklady z Doklado</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>
                V Doklado označte doklady (prijaté faktúry, bločky) a zvoľte <strong>Export</strong>.
              </li>
              <li>
                Vyberte formát <strong>XML (Pohoda) SK</strong> — údaje v ňom sú najpresnejšie. Ide
                aj <strong>CSV / XLSX detailný</strong>.
              </li>
              <li>
                Zvlášť vyexportujte <strong>PDF</strong> (ZIP so skenom každého dokladu).
              </li>
              <li>Oba súbory nahrajte sem naraz.</li>
            </ol>
            <p className="mt-4 text-muted-foreground">
              Máte len PDF? Nahrajte ZIP a AI každý doklad prečíta sama. Rovnako poslúži export z
              Pohody alebo tabuľka od účtovníčky.
            </p>
          </aside>
        </div>
      </PageBody>
    </>
  );
}

function Cislo({ popis, hodnota }: { popis: string; hodnota: number }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-xs text-muted-foreground">{popis}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{hodnota}</div>
    </div>
  );
}
