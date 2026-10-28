import { PreddefinovanaPoznamka } from "./PreddefinovanaPoznamka";
import { UpozornenieObjednavky } from "./PovinnaObjednavka";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PolozkyNespracovaneho } from "./PolozkyNespracovaneho";
import { JobPicker } from "./JobPicker";
import { VozidloPicker } from "./VozidloPicker";
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { NahladPdf } from "./NahladPdf";
import { PrepinacZvyraznenia, type ZvyraznenieNahladu } from "./ZvyraznenieVytazenych";
import { poleZPrvku } from "./NahladSVyberom";
import type { KlucPola } from "@/lib/faktero/vyber-z-dokladu";
import { PoliaZauctovania, type Navrhy } from "./ZauctovaniePanel";
import { NauceneZDodavatela } from "./NauceneZDodavatela";
import { NavrhAiNespracovaneho } from "./NavrhAi";
import { oznaceniaZUdajov } from "@/lib/faktero/ai-predkontacia";
import {
  DRUHY_NESPRACOVANYCH,
  NAZVY_POLI,
  type DruhNespracovaneho,
  type UdajeNespracovaneho,
} from "@/lib/faktero/nespracovane";
import { DRUHY_OSTATNYCH } from "@/lib/faktero/ostatne-doklady";
import { upravIban } from "@/lib/faktero/platobny-ucet";
import { useT } from "@/lib/i18n/useT";
import { NastavitPredvolene } from "./NastavitPredvolene";

/*
  Rozloženie nespracovaného dokladu kompaktné: veľký náhľad s
  nástrojmi, úzky panel s kompaktnými poľami (popis v rámčeku), zelená fajka
  pri sedieacich súčtoch a platnom IBAN-e, výkričník pri chýbajúcom poli a
  tlačidlá Uložiť zmeny / Vytvoriť stále na spodku panelu. Logika je tá istá
  ako v klasickom rozložení — mení sa len vzhľad.
*/

const ramik =
  "h-10 w-full rounded-lg border bg-background px-3 pt-1 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

function Pole({
  popis,
  chyba,
  ok,
  children,
}: {
  popis: string;
  chyba?: boolean;
  ok?: boolean;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute -top-2 left-2.5 z-10 bg-card px-1 text-[11px] leading-none text-muted-foreground">
        {t(popis)}
      </span>
      {children}
      {chyba ? (
        <AlertCircle className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 fill-red-500 text-white" />
      ) : ok ? (
        <Check className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-emerald-600" />
      ) : null}
    </label>
  );
}

function Sekcia({ nadpis, ok, children }: { nadpis: string; ok?: boolean; children: ReactNode }) {
  const { t } = useT();
  return (
    <section className="border-b border-border px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">{t(nadpis)}</h2>
        {ok ? <Check className="h-5 w-5 text-emerald-600" /> : null}
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

function Rozsirene({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [otvorene, setOtvorene] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOtvorene((o) => !o)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs text-muted-foreground hover:bg-secondary"
      >
        {t("Rozšírené položky")}{" "}
        {otvorene ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {otvorene ? <div className="space-y-3.5">{children}</div> : null}
    </>
  );
}

export function NespracovanyKompaktny({
  subor,
  stav,
  chybaCitania,
  varovania = [],
  druh,
  setDruh,
  u,
  setU,
  navrhy,
  stavNavrhuAi,
  chyby,
  sucty,
  sadzby,
  busy,
  onVytvor,
  onUloz,
  onZmaz,
  companyId,
  pravidlo,
  pravidloZDokladu,
  rozdielVyrovna = null,
  upozornenie,
  zvyraznenie,
  onPrepniZvyraznenie,
}: {
  subor: { url: string | null; nazov: string | null; mime: string | null };
  stav: string;
  chybaCitania: string | null;
  varovania?: string[];
  druh: DruhNespracovaneho | "";
  setDruh: (d: DruhNespracovaneho) => void;
  u: UdajeNespracovaneho;
  setU: (u: UdajeNespracovaneho) => void;
  navrhy: Navrhy | null;
  /** Stav návrhu zaúčtovania (AI) — „bez_ciselnika" ukáže odkaz na číselník. */
  stavNavrhuAi?: string | null;
  chyby: string[];
  sucty: { zaklad: number; dph: number; celkom: number };
  sadzby: number[];
  busy: boolean;
  onVytvor: () => void;
  onUloz: () => void;
  onZmaz: () => void;
  companyId?: string;
  /** Pravidlo účtovania (výber a hviezdička) — v sekcii Zaúčtovanie. */
  pravidlo?: ReactNode;
  /** „Vytvoriť pravidlo z tohto dokladu" — pod tlačidlom Vytvoriť. */
  pravidloZDokladu?: ReactNode;
  /** Rozdiel položiek v tolerancii, ktorý doplní vyrovnávacia položka. */
  rozdielVyrovna?: number | null;
  /** Výrazné upozornenie nad údajmi (napr. vlastná vystavená faktúra podľa IBAN-u). */
  upozornenie?: ReactNode;
  /** Zvýraznenie vyťažených údajov v náhľade PDF; aktívne pole určí kurzor v paneli. */
  zvyraznenie?: Omit<ZvyraznenieNahladu, "aktivne">;
  onPrepniZvyraznenie?: () => void;
}) {
  const { t } = useT();
  const [otocenie, setOtocenie] = useState(0);
  const [zvacsenie, setZvacsenie] = useState(1);
  // Pole s kurzorom — jeho miesto sa v náhľade zvýrazní a náhľad sa naň posunie.
  const [aktivnePole, setAktivnePole] = useState<KlucPola | null>(null);
  const blocek = druh === "blocek";
  const faktura = druh === "faktura" || druh === "zalohova" || druh === "dobropis";
  const zle = (k: string) => chyby.includes(k);
  const ram = (k: string) => `${ramik} ${zle(k) ? "border-red-500" : "border-input"}`;
  const set = (z: Partial<UdajeNespracovaneho>) => setU({ ...u, ...z });
  const setDod = (z: Partial<UdajeNespracovaneho["dodavatel"]>) =>
    setU({ ...u, dodavatel: { ...u.dodavatel, ...z } });
  const setRozpis = (i: number, z: Partial<UdajeNespracovaneho["rozpis"][number]>) =>
    set({ rozpis: u.rozpis.map((r, j) => (j === i ? { ...r, ...z } : r)), celkom: null });
  const sumaSedi = sucty.celkom > 0 && Math.abs(sucty.zaklad + sucty.dph - sucty.celkom) < 0.015;
  const ibanOk = Boolean(u.dodavatel.iban && upravIban(u.dodavatel.iban));
  const pdf = String(subor.mime ?? "").includes("pdf");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Náhľad s nástrojmi */}
      <div className="min-w-0 rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
          <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
            {t("Náhľad")}
          </span>
          <div className="flex items-center gap-1 text-muted-foreground">
            {[
              { ikona: RotateCcw, popis: "Otočiť doľava", akcia: () => setOtocenie((o) => o - 90) },
              { ikona: RotateCw, popis: "Otočiť doprava", akcia: () => setOtocenie((o) => o + 90) },
              {
                ikona: ZoomIn,
                popis: "Priblížiť",
                akcia: () => setZvacsenie((z) => Math.min(3, z + 0.25)),
              },
              {
                ikona: ZoomOut,
                popis: "Oddialiť",
                akcia: () => setZvacsenie((z) => Math.max(0.5, z - 0.25)),
              },
            ].map(({ ikona: I, popis, akcia }) => (
              <button
                key={popis}
                type="button"
                title={t(popis)}
                aria-label={t(popis)}
                onClick={akcia}
                className="rounded-md p-2 hover:bg-secondary"
              >
                <I className="h-4 w-4" />
              </button>
            ))}
            {pdf && zvyraznenie && onPrepniZvyraznenie ? (
              <PrepinacZvyraznenia zap={zvyraznenie.zobrazit} onPrepni={onPrepniZvyraznenie} />
            ) : null}
            {subor.url ? (
              <a
                href={subor.url}
                target="_blank"
                rel="noreferrer"
                title={t("Stiahnuť")}
                aria-label={t("Stiahnuť")}
                className="rounded-md p-2 hover:bg-secondary"
              >
                <Download className="h-4 w-4" />
              </a>
            ) : null}
            <button
              type="button"
              title={t("Zmazať do koša")}
              aria-label={t("Zmazať do koša")}
              onClick={onZmaz}
              disabled={busy}
              className="rounded-md p-2 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-auto p-4 lg:max-h-[calc(100vh-11rem)]">
          {subor.url ? (
            <div
              style={{
                transform: `rotate(${otocenie}deg) scale(${zvacsenie})`,
                transformOrigin: "top center",
              }}
              className="transition-transform"
            >
              {pdf ? (
                <NahladPdf
                  url={subor.url}
                  zvyraznenie={zvyraznenie ? { ...zvyraznenie, aktivne: aktivnePole } : undefined}
                />
              ) : (
                <img
                  src={subor.url}
                  alt={subor.nazov ?? t("Doklad")}
                  className="mx-auto max-w-full rounded-md"
                />
              )}
            </div>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">{t("Doklad nemá súbor.")}</p>
          )}
        </div>
      </div>

      {/* Panel s údajmi */}
      <div
        onFocusCapture={(e) => setAktivnePole(poleZPrvku(e.target))}
        className="flex min-w-0 flex-col rounded-2xl border border-border bg-card lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]"
      >
        <div className="min-h-0 flex-1 overflow-auto">
          {upozornenie ? <div className="m-4">{upozornenie}</div> : null}
          {stav === "cita" && (
            <div className="m-4 flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("Čítam doklad…")}
            </div>
          )}
          {chybaCitania && (
            <div className="m-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {t(chybaCitania)}
            </div>
          )}
          {varovania.map((v) => (
            <div
              key={v}
              role="alert"
              className="m-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {t(v)}
            </div>
          ))}

          <Sekcia nadpis="Základné údaje">
            <Pole popis="Typ dokladu" chyba={zle("druh")}>
              <select
                aria-label={t("Druh dokladu")}
                value={druh}
                onChange={(e) => setDruh(e.target.value as DruhNespracovaneho)}
                className={ram("druh")}
              >
                <option value="">{t("— vyberte —")}</option>
                {DRUHY_NESPRACOVANYCH.map((x) => (
                  <option key={x.kluc} value={x.kluc}>
                    {t(x.nazov)}
                  </option>
                ))}
              </select>
            </Pole>
            {druh && druh !== "ostatny" ? (
              <>
                <Pole popis={faktura ? "Číslo faktúry" : "Číslo dokladu"} chyba={zle("cislo")}>
                  <input
                    aria-label={t("Číslo dokladu")}
                    value={u.cislo}
                    onChange={(e) => set({ cislo: e.target.value })}
                    className={ram("cislo")}
                  />
                </Pole>
                <div className="grid grid-cols-2 gap-3">
                  <Pole popis="Dátum vydania" chyba={zle("datumVystavenia")}>
                    <input
                      type="date"
                      aria-label={t("Dátum vystavenia")}
                      value={u.datumVystavenia}
                      onChange={(e) => set({ datumVystavenia: e.target.value })}
                      className={ram("datumVystavenia")}
                    />
                  </Pole>
                  {faktura ? (
                    <Pole popis="Dátum splatnosti" chyba={zle("splatnost")}>
                      <input
                        type="date"
                        aria-label={t("Splatnosť")}
                        value={u.splatnost}
                        onChange={(e) => set({ splatnost: e.target.value })}
                        className={ram("splatnost")}
                      />
                    </Pole>
                  ) : (
                    <Pole popis="Spôsob úhrady" chyba={zle("platba")}>
                      <select
                        aria-label={t("Spôsob úhrady")}
                        value={u.platba}
                        onChange={(e) => set({ platba: e.target.value })}
                        className={ram("platba")}
                      >
                        <option value="">{t("— vyberte —")}</option>
                        <option value="hotovost">{t("Hotovosť")}</option>
                        <option value="karta">{t("Karta")}</option>
                        <option value="prevod">{t("Prevod")}</option>
                      </select>
                    </Pole>
                  )}
                </div>
                {faktura ? (
                  <Pole popis="Popis plnenia (text faktúry)">
                    <input
                      value={u.popis ?? ""}
                      onChange={(e) => set({ popis: e.target.value })}
                      className={ram("")}
                    />
                  </Pole>
                ) : null}
                {faktura ? (
                  <Pole popis="Dátum dodania (DUZP)">
                    <input
                      type="date"
                      value={u.datumDodania}
                      onChange={(e) => set({ datumDodania: e.target.value })}
                      className={ram("")}
                    />
                  </Pole>
                ) : null}
                {druh === "dobropis" ? (
                  <Pole popis="Opravuje faktúru č." chyba={zle("opravuje")}>
                    <input
                      value={u.opravuje}
                      onChange={(e) => set({ opravuje: e.target.value })}
                      className={ram("opravuje")}
                    />
                  </Pole>
                ) : null}
              </>
            ) : null}
            {druh === "ostatny" ? (
              <>
                <Pole popis="Druh">
                  <select
                    value={u.ostatny.druh}
                    onChange={(e) => set({ ostatny: { ...u.ostatny, druh: e.target.value } })}
                    className={ram("")}
                  >
                    {DRUHY_OSTATNYCH.map((x) => (
                      <option key={x.kluc} value={x.kluc}>
                        {t(x.nazov)}
                      </option>
                    ))}
                  </select>
                </Pole>
                <Pole popis="Predmet">
                  <input
                    value={u.ostatny.predmet}
                    onChange={(e) => set({ ostatny: { ...u.ostatny, predmet: e.target.value } })}
                    className={ram("")}
                  />
                </Pole>
                <Pole popis="Lehota">
                  <input
                    type="date"
                    value={u.ostatny.lehota}
                    onChange={(e) => set({ ostatny: { ...u.ostatny, lehota: e.target.value } })}
                    className={ram("")}
                  />
                </Pole>
              </>
            ) : null}
          </Sekcia>

          {druh ? (
            <Sekcia nadpis={druh === "ostatny" ? "Odosielateľ" : "Dodávateľ"}>
              <Pole popis="Názov" chyba={zle("dodavatel")}>
                <input
                  aria-label={t("Dodávateľ")}
                  value={u.dodavatel.nazov}
                  onChange={(e) => setDod({ nazov: e.target.value })}
                  className={ram("dodavatel")}
                />
              </Pole>
              {druh !== "ostatny" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Pole popis="IČO">
                    <input
                      value={u.dodavatel.ico}
                      onChange={(e) => setDod({ ico: e.target.value })}
                      className={ram("")}
                    />
                  </Pole>
                  <Pole popis="IČ DPH">
                    <input
                      value={u.dodavatel.icDph}
                      onChange={(e) => setDod({ icDph: e.target.value })}
                      className={ram("")}
                    />
                  </Pole>
                </div>
              ) : null}
              {faktura ? (
                <>
                  <Pole popis="Ulica a číslo">
                    <input
                      value={u.dodavatel.ulica}
                      onChange={(e) => setDod({ ulica: e.target.value })}
                      className={ram("")}
                    />
                  </Pole>
                  <div className="grid grid-cols-[2fr_1fr] gap-3">
                    <Pole popis="Mesto">
                      <input
                        value={u.dodavatel.mesto}
                        onChange={(e) => setDod({ mesto: e.target.value })}
                        className={ram("")}
                      />
                    </Pole>
                    <Pole popis="PSČ">
                      <input
                        value={u.dodavatel.psc}
                        onChange={(e) => setDod({ psc: e.target.value })}
                        className={ram("")}
                      />
                    </Pole>
                  </div>
                  <Rozsirene>
                    <Pole popis="DIČ">
                      <input
                        value={u.dodavatel.dic}
                        onChange={(e) => setDod({ dic: e.target.value })}
                        className={ram("")}
                      />
                    </Pole>
                  </Rozsirene>
                </>
              ) : null}
            </Sekcia>
          ) : null}

          {druh && druh !== "ostatny" ? (
            <Sekcia nadpis="Čiastka a DPH" ok={sumaSedi}>
              <div className="grid grid-cols-2 gap-3">
                <Pole popis="Celková suma" chyba={zle("celkom")}>
                  <input
                    aria-label={t("Suma spolu")}
                    inputMode="decimal"
                    value={u.celkom ?? sucty.celkom}
                    onChange={(e) => set({ celkom: Number(e.target.value.replace(",", ".")) || 0 })}
                    className={ram("celkom")}
                  />
                </Pole>
                <Pole popis="Mena">
                  <input
                    value={u.mena}
                    maxLength={3}
                    onChange={(e) => set({ mena: e.target.value.toUpperCase() })}
                    className={ram("")}
                  />
                </Pole>
              </div>
              {u.rozpis.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-3">
                  <Pole popis={t("Základ dane {sadzba} %", { sadzba: r.sadzba })}>
                    <input
                      inputMode="decimal"
                      value={String(r.zaklad)}
                      onChange={(e) => {
                        const z = Number(e.target.value.replace(",", ".")) || 0;
                        setRozpis(i, { zaklad: z, dph: Math.round(z * Number(r.sadzba)) / 100 });
                      }}
                      className={ram("")}
                    />
                  </Pole>
                  <Pole popis={t("Daň {sadzba} %", { sadzba: r.sadzba })}>
                    <input
                      inputMode="decimal"
                      value={String(r.dph)}
                      onChange={(e) =>
                        setRozpis(i, { dph: Number(e.target.value.replace(",", ".")) || 0 })
                      }
                      className={ram("")}
                    />
                  </Pole>
                  <select
                    aria-label={t("Sadzba")}
                    value={String(r.sadzba)}
                    onChange={(e) => setRozpis(i, { sadzba: Number(e.target.value) })}
                    className="h-10 rounded-lg border border-input bg-background px-1 text-xs"
                  >
                    {[...new Set([...sadzby, 0, Number(r.sadzba)])].map((x) => (
                      <option key={x} value={x}>
                        {x} %
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() =>
                    set({
                      rozpis: [...u.rozpis, { sadzba: sadzby[0] ?? 23, zaklad: 0, dph: 0 }],
                      celkom: null,
                    })
                  }
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> {t("Pridať sadzbu")}
                </button>
                {u.rozpis.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => set({ rozpis: u.rozpis.slice(0, -1), celkom: null })}
                    className="text-muted-foreground hover:underline"
                  >
                    {t("Odobrať poslednú")}
                  </button>
                ) : null}
              </div>
              {druh === "dobropis" ? (
                <p className="text-xs text-muted-foreground">
                  {t("Sumy zadajte kladne — dobropis ich odpočíta sám.")}
                </p>
              ) : null}
            </Sekcia>
          ) : null}

          {faktura ? (
            <Sekcia nadpis="Platobné údaje">
              <Pole popis="Variabilný symbol">
                <input
                  value={u.vs}
                  onChange={(e) => set({ vs: e.target.value })}
                  className={ram("")}
                />
              </Pole>
              <Pole popis="Konštantný symbol">
                <input
                  maxLength={4}
                  value={u.ks ?? ""}
                  onChange={(e) => set({ ks: e.target.value })}
                  className={ram("")}
                />
              </Pole>
              <Pole popis="Špecifický symbol">
                <input
                  maxLength={10}
                  value={u.ss ?? ""}
                  onChange={(e) => set({ ss: e.target.value })}
                  className={ram("")}
                />
              </Pole>
              <Pole popis="Číslo objednávky">
                <input
                  value={u.objednavka ?? ""}
                  onChange={(e) => set({ objednavka: e.target.value })}
                  className={ram("")}
                />
                <UpozornenieObjednavky
                  companyId={companyId ?? getActiveCompanyId()}
                  ico={u.dodavatel.ico}
                  cisloObjednavky={u.objednavka}
                />
              </Pole>
              <Pole popis="Číslo dodacieho listu">
                <input
                  value={u.dodaciList ?? ""}
                  onChange={(e) => set({ dodaciList: e.target.value })}
                  className={ram("")}
                />
              </Pole>
              <Pole popis="IBAN" ok={ibanOk}>
                <input
                  value={u.dodavatel.iban}
                  onChange={(e) => setDod({ iban: e.target.value })}
                  className={ram("")}
                />
              </Pole>
              <Pole popis="Spôsob úhrady">
                <select
                  value={u.platba}
                  onChange={(e) => set({ platba: e.target.value })}
                  className={ram("")}
                >
                  <option value="">{t("Prevod (predvolené)")}</option>
                  <option value="prevod">{t("Prevod")}</option>
                  <option value="inkaso">{t("Inkaso")}</option>
                  <option value="hotovost">{t("Hotovosť")}</option>
                  <option value="karta">{t("Karta")}</option>
                </select>
              </Pole>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(u.uhradene)}
                  onChange={(e) => set({ uhradene: e.target.checked || undefined })}
                />
                {t("Faktúra je už uhradená")}
              </label>
            </Sekcia>
          ) : null}

          {druh && druh !== "ostatny" ? (
            <Sekcia nadpis="Zaúčtovanie">
              <PoliaZauctovania
                navrhy={navrhy}
                oznacenia={oznaceniaZUdajov(u)}
                doklad={{ typ: druh === "blocek" ? "blocek" : "faktura", platba: u.platba }}
                hodnoty={{
                  predkontacia: u.kody.predkontacia,
                  clenenie: u.kody.clenenie,
                  kategoria: u.kategoria,
                  kv: u.kody.kv,
                  stredisko: u.kody.stredisko,
                  cinnost: u.kody.cinnost,
                  rad: u.kody.rad,
                }}
                setHodnoty={(h: any) =>
                  setU({
                    ...u,
                    kategoria: h.kategoria ?? "",
                    kody: {
                      ...u.kody,
                      predkontacia: h.predkontacia ?? "",
                      clenenie: h.clenenie ?? "",
                      kv: h.kv ?? "",
                      stredisko: h.stredisko ?? "",
                      cinnost: h.cinnost ?? "",
                      rad: h.rad ?? "",
                    },
                  })
                }
              />
              <JobPicker
                value={u.jobId}
                onChange={(v) => set({ jobId: v })}
                companyId={companyId}
                className={zle("zakazka") ? "[&_select]:border-red-500" : ""}
              />
              <VozidloPicker
                value={u.vehicleId ?? ""}
                onChange={(v) => set({ vehicleId: v })}
                companyId={companyId}
              />
              {pravidlo}
              <NauceneZDodavatela u={u} />
              <NavrhAiNespracovaneho u={u} setU={setU} stav={stavNavrhuAi} />
              <p className="text-xs text-muted-foreground">
                {t("Prázdne = predvolené z")}{" "}
                <Link to="/uctovnictvo/predkontacie" className="underline">
                  {t("nastavení predkontácií")}
                </Link>
                .
              </p>
              {companyId && (druh === "blocek" || druh === "faktura") ? (
                <NastavitPredvolene
                  companyId={companyId}
                  kluc={druh === "blocek" ? "doklady" : "prijata"}
                  hodnoty={u.kody}
                  predvolene={{
                    predkontacia: navrhy?.predvolenaPredkontacia,
                    clenenie: navrhy?.predvoleneClenenie,
                    kv: navrhy?.predvoleneKv,
                  }}
                />
              ) : null}
            </Sekcia>
          ) : null}

          {druh ? (
            <Sekcia nadpis="Poznámka">
              {druh !== "ostatny" ? (
                <div>
                  <textarea
                    rows={2}
                    maxLength={200}
                    placeholder={t("Účtovná poznámka (ide do účtovníctva)")}
                    value={u.kody.intPoznamka}
                    onChange={(e) => set({ kody: { ...u.kody, intPoznamka: e.target.value } })}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="text-right text-[11px] text-muted-foreground">
                    {u.kody.intPoznamka.length}/200
                  </div>
                  {/* Poznámka dokladu (aj zhrnutie od AI) ide do účtovníctva — musí byť vidieť. */}
                  <textarea
                    rows={2}
                    maxLength={1000}
                    placeholder={t("Poznámka k dokladu (ide do účtovníctva)")}
                    value={u.poznamka}
                    onChange={(e) => set({ poznamka: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              ) : null}
              <div>
                <textarea
                  rows={2}
                  maxLength={1000}
                  placeholder={
                    druh === "ostatny"
                      ? t("Poznámka")
                      : t("Komentár (do účtovníctva sa neprenáša)")
                  }
                  value={druh === "ostatny" ? u.poznamka : (u.komentar ?? "")}
                  onChange={(e) =>
                    set(druh === "ostatny" ? { poznamka: e.target.value } : { komentar: e.target.value })
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="text-right text-[11px] text-muted-foreground">
                  {(druh === "ostatny" ? u.poznamka : (u.komentar ?? "")).length}/1000
                </div>
                <PreddefinovanaPoznamka
                  companyId={getActiveCompanyId()}
                  agenda="nespracovane"
                  onVyber={(text) =>
                    set({ poznamka: u.poznamka ? `${u.poznamka}\n${text}` : text })
                  }
                />
              </div>
            </Sekcia>
          ) : null}

          {druh && druh !== "ostatny" ? (
            <Sekcia nadpis="Položky">
              <PolozkyNespracovaneho u={u} setU={setU} sadzby={sadzby} />
            </Sekcia>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-border p-4">
          {chyby.length > 0 && druh ? (
            <p className="text-xs text-red-600">
              {t("Chýba: {polia}", { polia: chyby.map((k) => t(NAZVY_POLI[k] ?? k)).join(", ") })}
            </p>
          ) : rozdielVyrovna != null && druh ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t("Položky nesedia so sumou o {rozdiel} — doplní sa vyrovnávacia položka.", {
                rozdiel: rozdielVyrovna.toFixed(2),
              })}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onUloz}
            className="w-full rounded-lg border border-primary/40 bg-primary/5 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
          >
            {t("Uložiť zmeny")}
          </button>
          <button
            type="button"
            disabled={busy || stav === "cita"}
            onClick={onVytvor}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t("Vytvoriť")}
          </button>
          {pravidloZDokladu ? <div className="flex justify-center">{pravidloZDokladu}</div> : null}
        </div>
      </div>
    </div>
  );
}
