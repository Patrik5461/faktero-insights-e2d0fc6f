import { CudziaFakturaZnak } from "@/components/faktero/CudziaFaktura";
import { obnovPoctyMenu } from "@/lib/faktero/pocty-menu";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ZdrojovyMailTlacidlo } from "@/components/faktero/ZdrojovyMail";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload, AlertTriangle, FileText, Landmark } from "lucide-react";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  blocekDoNespracovanychFn,
  hromadneNespracovaneFn,
  nahrajNespracovaneFn,
  nespracovaneFn,
  nespracovaneNaUhraduFn,
  zmazNespracovaneFn,
} from "@/lib/faktero/nespracovane.functions";
import { HromadnyPrikaz } from "@/components/faktero/HromadnyPrikaz";
import { SuctovaListaVyberu } from "@/components/faktero/SuctovaListaVyberu";
import { polozkaNespracovaneho } from "@/lib/faktero/suhrn-vyberu";
import type { FakturaNaUhradu, Preskocena } from "@/lib/faktero/hromadny-prikaz";
import { JobPicker } from "@/components/faktero/JobPicker";
import { potvrd } from "@/lib/potvrdenie";
import { DRUHY_NESPRACOVANYCH } from "@/lib/faktero/nespracovane";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { usePoslednyOtvoreny } from "@/hooks/usePoslednyOtvoreny";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { nahralDokladu } from "@/lib/faktero/spracoval";
import { DocumentListToolbar } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";

export const Route = createFileRoute("/_authenticated/nespracovane/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Nespracované doklady — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: Stranka,
});

const ZDROJ: Record<string, string> = {
  mail: "e-mail",
  nahratie: "nahraté",
  skener: "skener",
  apka: "appka",
  api: "API",
  efaktura: "eFaktúra",
  photo: "fotka",
  qr: "eKasa QR",
  upload: "nahraté",
  web: "ručne zapísaný",
};

function naBase64(f: File): Promise<string> {
  return new Promise((ok, zle) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => zle(r.error);
    r.readAsDataURL(f);
  });
}

/**
 * Nespracované doklady (ako v Doklado): všetko, čo príde e-mailom alebo sa
 * nahrá, čaká tu. Kliknutím sa doklad otvorí — človek určí druh, skontroluje
 * údaje, zaúčtuje a vytvorí.
 */
function Stranka() {
  const { t } = useT();
  const navigate = useNavigate();
  const nacitaj = useServerFn(nespracovaneFn);
  const nahraj = useServerFn(nahrajNespracovaneFn);
  const doNespracovanych = useServerFn(blocekDoNespracovanychFn);
  const [data, setData] = useState<Awaited<ReturnType<typeof nacitaj>> | null>(null);
  const [nahravam, setNahravam] = useState(0);
  const [nad, setNad] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const hromadne = useServerFn(hromadneNespracovaneFn);
  const zmaz = useServerFn(zmazNespracovaneFn);
  // Hromadné akcie — len doklady čakajúce v Nespracovaných (bločky zo skenu sa najprv otvoria).
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());
  const [zmena, setZmena] = useState({ druh: "", jobId: "", stredisko: "", cinnost: "", predkontacia: "", clenenie: "" });
  const [hromadneBusy, setHromadneBusy] = useState(false);
  // Hromadný príkaz na úhradu z označených — IBAN, symboly a suma z vyčítaných údajov.
  const naUhraduFn = useServerFn(nespracovaneNaUhraduFn);
  const [prikaz, setPrikaz] = useState<{ faktury: FakturaNaUhradu[]; vynechane: Preskocena[] } | null>(null);
  const [prikazBusy, setPrikazBusy] = useState(false);
  // Naposledy otvorený doklad — zvýraznený riadok po návrate z detailu.
  const posledny = usePoslednyOtvoreny("nespracovane");
  // Mená kolegov pre stĺpec „Nahral“ (profily číta server po overení členstva).
  const nacitajMena = useServerFn(menaClenovFirmy);
  const [mena, setMena] = useState<Record<string, string>>({});
  const lf = useListFilters();
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");

  async function obnov() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      setData(await nacitaj({ data: { company_id: cid } }));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa načítať"));
    }
  }
  useEffect(() => {
    void obnov();
    const cid = getActiveCompanyId();
    if (cid)
      nacitajMena({ data: { company_id: cid } })
        .then((m) => setMena(m as Record<string, string>))
        .catch(() => setMena({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kým sa niečo číta, zoznam sa obnovuje sám.
  const cita = data?.doklady.some((d: any) => d.stav === "cita");
  useEffect(() => {
    if (!cita) return;
    const casovac = setInterval(() => void obnov(), 4000);
    return () => clearInterval(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cita]);

  async function pridaj(subory: FileList | File[]) {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error(t("Vyberte firmu."));
    const zoznam = Array.from(subory);
    for (const f of zoznam) {
      if (f.size > 15 * 1024 * 1024) {
        toast.error(t("{subor}: súbor je väčší než 15 MB", { subor: f.name }));
        continue;
      }
      setNahravam((n) => n + 1);
      try {
        await nahraj({
          data: { company_id: cid, nazov: f.name, mime: f.type || "application/octet-stream", subor: await naBase64(f) },
        });
      } catch (e: any) {
        toast.error(`${f.name}: ${e?.message ?? t("nepodarilo sa nahrať")}`);
      } finally {
        setNahravam((n) => n - 1);
      }
    }
    obnovPoctyMenu();
    void obnov();
  }

  const riadky = [
    ...(data?.doklady ?? []).map((d: any) => ({ ...d, kluc: `n-${d.id}` })),
    // Druh bločka zo skenu nie je istý (aj faktúra sa dá naskenovať) — určí sa po otvorení.
    ...(data?.blocky ?? []).map((b: any) => ({ ...b, kluc: `b-${b.id}`, stav: "vytazene", druh: null, chyba: null, subor: t("zo skenu") })),
  ].sort((a, b) => String(b.vytvorene).localeCompare(String(a.vytvorene)));

  // Hľadanie a obdobie len prechádzajú načítané doklady.
  const hladane = lf.q.trim().toLowerCase();
  const zobrazene = riadky.filter((r) => {
    const den = r.datum ? String(r.datum).slice(0, 10) : "";
    if (obdobieOd && (!den || den < obdobieOd)) return false;
    if (obdobieDo && (!den || den > obdobieDo)) return false;
    if (!hladane) return true;
    return [r.dodavatel, r.cislo, r.subor]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(hladane));
  });

  // Zmena hľadania či obdobia zruší výber, aby hromadná akcia nezasiahla skrytý doklad.
  useEffect(() => setVybrane(new Set()), [hladane, obdobieOd, obdobieDo]);

  // „Vybrať všetky“ berie len zobrazené — skrytý doklad sa nesmie hromadne zmeniť ani zmazať.
  const vyberatelne = zobrazene.filter((r) => r.typ === "nespracovany" && r.stav !== "cita");
  // Lišta výberu — len zobrazené a vybrané nespracované doklady.
  const vybraneSuhrn = vyberatelne.filter((r) => vybrane.has(r.id)).map((r: any) => polozkaNespracovaneho(r));
  const naUhraduPocet = vybraneSuhrn.filter((p) => p.naUhradu).length;
  const prepniVyber = (id: string) =>
    setVybrane((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function pouziHromadne() {
    const cid = getActiveCompanyId();
    if (!cid || !vybrane.size) return;
    const z = Object.fromEntries(Object.entries(zmena).filter(([, v]) => v.trim())) as Record<string, string>;
    if (!Object.keys(z).length) return toast.error(t("Vyplňte aspoň jedno pole, ktoré sa má zmeniť."));
    setHromadneBusy(true);
    try {
      const r = await hromadne({ data: { company_id: cid, ids: [...vybrane], zmena: z as any } });
      toast.success(t("Zmenené doklady: {n}", { n: r.zmenene }));
      setVybrane(new Set());
      setZmena({ druh: "", jobId: "", stredisko: "", cinnost: "", predkontacia: "", clenenie: "" });
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setHromadneBusy(false);
    }
  }

  async function uhradVybrane() {
    const cid = getActiveCompanyId();
    if (!cid || !vybrane.size) return;
    setPrikazBusy(true);
    try {
      const doklady = await naUhraduFn({ data: { company_id: cid, ids: [...vybrane] } });
      const vynechane: Preskocena[] = [];
      const faktury: FakturaNaUhradu[] = [];
      for (const d of doklady) {
        const { dovod, ...f } = d;
        if (dovod) vynechane.push({ id: f.id, cisloFaktury: f.invoice_number || t("bez čísla"), dovod });
        else faktury.push(f);
      }
      setPrikaz({ faktury, vynechane });
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa načítať"));
    } finally {
      setPrikazBusy(false);
    }
  }

  async function zmazHromadne() {
    if (!vybrane.size) return;
    if (!(await potvrd(t("Presunúť vybrané doklady ({n}) do koša?", { n: vybrane.size })))) return;
    setHromadneBusy(true);
    let ok = 0;
    for (const id of vybrane) {
      try {
        await zmaz({ data: { id } });
        ok++;
      } catch (e: any) {
        toast.error(e?.message ?? t("Nepodarilo sa"));
      }
    }
    toast.success(t("V koši: {n}", { n: ok }));
    setVybrane(new Set());
    setHromadneBusy(false);
    if (ok) obnovPoctyMenu();
    await obnov();
  }

  async function otvor(r: any) {
    posledny.zapamataj(r.id);
    if (r.typ !== "blocek") return navigate({ to: "/nespracovane/$id", params: { id: r.id } });
    // Bloček zo skenu sa presunie medzi nespracované, aby sa dal zaradiť ako faktúra.
    try {
      const v = await doNespracovanych({ data: { id: r.id } });
      if (v.id) navigate({ to: "/nespracovane/$id", params: { id: v.id } });
      else navigate({ to: "/doklady/novy", search: { id: r.id } as any });
    } catch (e: any) {
      toast.error(e?.message ?? t("Doklad sa nepodarilo otvoriť"));
    }
  }

  const druhText = (r: any) =>
    r.druh ? (
      t(DRUHY_NESPRACOVANYCH.find((d) => d.kluc === r.druh)?.nazov ?? r.druh)
    ) : (
      <span className="text-muted-foreground">{t("Neurčený")}</span>
    );
  const sumaText = (r: any) => (r.suma != null ? formatujMenu(r.suma, r.mena) : "—");
  const datumText = (r: any) => (r.datum ? datumNaDoklade(r.datum) : "—");
  const zdrojText = (r: any) => (
    <span className="inline-flex items-center gap-1">
      {t(ZDROJ[r.zdroj] ?? r.zdroj)}
      {nahralDokladu(r.zdroj, r.nahral, mena) ? (
        <span className="text-foreground/80">· {nahralDokladu(r.zdroj, r.nahral, mena)}</span>
      ) : null}
      {r.typ === "nespracovany" ? (
        <ZdrojovyMailTlacidlo druh="nespracovany" id={r.id} inboxMessageId={r.inboxMessageId} ikona />
      ) : null}
    </span>
  );
  const stavText = (r: any) =>
    r.stav === "cita" ? (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Číta sa…")}
      </span>
    ) : r.stav === "chyba" ? (
      <span className="inline-flex items-center gap-1 text-amber-700" title={r.chyba ?? undefined}>
        <AlertTriangle className="h-3.5 w-3.5" /> {t("Doplniť ručne")}
      </span>
    ) : (
      <span className="text-emerald-700">{t("Vyťažené")}</span>
    );

  return (
    <>
      <PageHeader
        title={t("Nespracované doklady")}
        description={t("Všetko, čo príde e-mailom alebo nahráte, čaká tu. Otvorte doklad, určte druh, skontrolujte údaje, zaúčtujte a vytvorte.")}
        action={
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {nahravam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("Nahrať doklady")}
          </button>
        }
      />
      <PageBody>
        <input
          ref={input}
          type="file"
          multiple
          // ISDOC / XML faktúry sa čítajú priamo, bez AI (pozri doklad-xml.ts).
          accept="application/pdf,image/*,.isdoc,.xml,application/xml,text/xml"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void pridaj(e.target.files);
            e.target.value = "";
          }}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setNad(true);
          }}
          onDragLeave={() => setNad(false)}
          onDrop={(e) => {
            e.preventDefault();
            setNad(false);
            void pridaj(e.dataTransfer.files);
          }}
          className={`mb-4 rounded-xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground ${nad ? "border-primary bg-primary/5" : "border-border"}`}
        >
          {t("Pretiahnite sem faktúry, zálohové faktúry, bločky či iné doklady (PDF alebo fotky) — aj viac naraz. Faktero ich prečíta a počkajú tu na zaradenie.")}
        </div>

        <DocumentListToolbar
          lf={lf}
          searchPlaceholder="Hľadať dodávateľa alebo číslo"
          filters={[{ key: "obdobie", label: "Obdobie", type: "dateRange" }]}
        />

        {vybrane.size > 0 ? (
          <div
            role="region"
            aria-label={t("Hromadná úprava")}
            className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"
          >
            <span className="font-medium">{t("Vybrané: {n}", { n: vybrane.size })}</span>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t("Druh dokladu")}</span>
              <select
                value={zmena.druh}
                onChange={(e) => setZmena({ ...zmena, druh: e.target.value })}
                className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">{t("nemeniť")}</option>
                {DRUHY_NESPRACOVANYCH.map((x) => (
                  <option key={x.kluc} value={x.kluc}>
                    {t(x.nazov)}
                  </option>
                ))}
              </select>
            </label>
            <JobPicker value={zmena.jobId} onChange={(v) => setZmena({ ...zmena, jobId: v })} className="min-w-[12rem]" />
            {(
              [
                ["predkontacia", "Predkontácia"],
                ["clenenie", "Členenie DPH"],
                ["stredisko", "Stredisko"],
                ["cinnost", "Činnosť"],
              ] as const
            ).map(([k, n]) => (
              <label key={k} className="block">
                <span className="text-xs text-muted-foreground">{t(n)}</span>
                <input
                  value={zmena[k]}
                  maxLength={30}
                  placeholder={t("nemeniť")}
                  onChange={(e) => setZmena({ ...zmena, [k]: e.target.value })}
                  className="mt-1 block w-28 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
            ))}
            <button
              type="button"
              disabled={hromadneBusy}
              onClick={() => void pouziHromadne()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {hromadneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t("Zmeniť vybrané")}
            </button>
            <button
              type="button"
              disabled={hromadneBusy}
              onClick={() => void zmazHromadne()}
              className="rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
            >
              {t("Do koša")}
            </button>
            <button
              type="button"
              onClick={() => setVybrane(new Set())}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
            >
              {t("Zrušiť výber")}
            </button>
          </div>
        ) : null}

        <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 p-3">
                  <input
                    type="checkbox"
                    aria-label={t("Vybrať všetky")}
                    checked={vyberatelne.length > 0 && vyberatelne.every((r) => vybrane.has(r.id))}
                    onChange={(e) => setVybrane(e.target.checked ? new Set(vyberatelne.map((r) => r.id)) : new Set())}
                  />
                  <span className="sr-only">{t("Výber")}</span>
                </th>
                <th className="p-3">{t("Druh")}</th>
                <th className="p-3">{t("Dodávateľ")}</th>
                <th className="p-3">{t("Číslo")}</th>
                <th className="p-3">{t("Dátum")}</th>
                <th className="p-3 text-right">{t("Suma")}</th>
                <th className="p-3">{t("Nahral")}</th>
                <th className="p-3">{t("Stav")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {t("Načítavam…")}
                  </td>
                </tr>
              )}
              {data && riadky.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    {t("Všetko je spracované.")}
                  </td>
                </tr>
              )}
              {riadky.length > 0 && zobrazene.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {t("Nič nevyhovuje filtru.")}
                  </td>
                </tr>
              )}
              {zobrazene.map((r) => (
                <tr
                  key={r.kluc}
                  {...posledny.riadok(r.id)}
                  className={`cursor-pointer hover:bg-muted/30 ${posledny.riadok(r.id).className}`}
                  onClick={() => void otvor(r)}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    {r.typ === "nespracovany" && r.stav !== "cita" ? (
                      <input
                        type="checkbox"
                        aria-label={t("Vybrať doklad")}
                        checked={vybrane.has(r.id)}
                        onChange={() => prepniVyber(r.id)}
                      />
                    ) : null}
                  </td>
                  <td className="p-3">
                    {druhText(r)}
                    {r.subor ? <div className="max-w-[16rem] truncate text-xs text-muted-foreground">{r.subor}</div> : null}
                  </td>
                  <td className="p-3">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <CudziaFakturaZnak nesedi={r.odberatelNesedi} />
                      {r.dodavatel ?? <span className="text-muted-foreground">—</span>}
                    </span>
                  </td>
                  <td className="p-3">{r.cislo ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">{datumText(r)}</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">{sumaText(r)}</td>
                  <td className="p-3 text-xs text-muted-foreground">{zdrojText(r)}</td>
                  <td className="p-3 text-xs">{stavText(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Na mobile karty — tabuľka by ukázala len prvé tri stĺpce. */}
        <div className="space-y-2 md:hidden">
          {!data && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">{t("Načítavam…")}</div>
          )}
          {data && riadky.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {t("Všetko je spracované.")}
            </div>
          )}
          {riadky.length > 0 && zobrazene.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
              {t("Nič nevyhovuje filtru.")}
            </div>
          )}
          {zobrazene.map((r) => (
            <div
              key={r.kluc}
              {...posledny.karta(r.id)}
              /* Klik kamkoľvek na kartu otvorí doklad (myš, prst). Klávesnica a
                 čítačka idú cez tlačidlo s názvom — karta s role="button" by
                 obsahovala ďalší ovládací prvok (zaškrtávacie pole). */
              onClick={() => void otvor(r)}
              className={`block cursor-pointer rounded-xl border border-border p-3 hover:bg-muted/30 ${posledny.karta(r.id).className || "bg-card"}`}
            >
              <div className="flex items-start justify-between gap-2">
                {r.typ === "nespracovany" && r.stav !== "cita" ? (
                  <input
                    type="checkbox"
                    aria-label={t("Vybrať doklad")}
                    checked={vybrane.has(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => prepniVyber(r.id)}
                    className="mt-1 h-4 w-4 shrink-0"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void otvor(r);
                    }}
                    className="block rounded text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {druhText(r)}
                  </button>
                  {r.subor ? <div className="truncate text-xs text-muted-foreground">{r.subor}</div> : null}
                </div>
                <div className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{sumaText(r)}</div>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <CudziaFakturaZnak nesedi={r.odberatelNesedi} />
                  <span className="min-w-0 truncate">{r.dodavatel ?? <span className="text-muted-foreground">—</span>}</span>
                </span>
                <span className="whitespace-nowrap text-muted-foreground">
                  {r.cislo ? `${r.cislo} · ` : ""}
                  {datumText(r)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {zdrojText(r)}
                {stavText(r)}
              </div>
            </div>
          ))}
        </div>

        {/* Súčet označených + úhrada z výberu (lišta drží spodok obrazovky). */}
        <SuctovaListaVyberu
          polozky={vybraneSuhrn}
          exportNazov={t("Nezaúčtované:")}
          onZrusit={() => setVybrane(new Set())}
          akcie={
            <button
              type="button"
              onClick={() => void uhradVybrane()}
              disabled={prikazBusy || !naUhraduPocet}
              title={t("Pripraví hromadný príkaz na úhradu (SEPA XML) z označených dokladov. Doklad bez IBAN-u sa vynechá.")}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {prikazBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Landmark className="h-3.5 w-3.5" />}{" "}
              {t("Uhradiť ({n})", { n: naUhraduPocet })}
            </button>
          }
        />
        {prikaz && getActiveCompanyId() ? (
          <HromadnyPrikaz
            companyId={getActiveCompanyId()!}
            faktury={prikaz.faktury}
            vynechane={prikaz.vynechane}
            onClose={() => setPrikaz(null)}
          />
        ) : null}
      </PageBody>
    </>
  );
}
