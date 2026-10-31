import { useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, FileUp, Fuel, Save } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu } from "@/lib/faktero/mena";
import { nahladVypisuKartyFn, ulozVypisKartyFn } from "@/lib/faktero/palivove-karty.functions";
import {
  NAZVY_POLI,
  POLIA_VYPISU,
  type Mapovanie,
  type PoleVypisu,
} from "@/lib/faktero/palivove-karty/vypis-karty";

/*
  Nahratie výpisu alebo faktúry palivovej karty bez API (Up Déjeuner).
  Súbor → náhľad (riadky, súčty, vozidlá, duplicity) → uloženie. Keď si
  rozpoznanie stĺpcov nie je isté, človek ich priradí sám.
*/

const STROP = 10 * 1024 * 1024;
const POLE = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const TLACIDLO =
  "inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50";

type Nahlad = Awaited<ReturnType<typeof nahladVypisuKartyFn>>;

async function naBase64(f: File): Promise<string> {
  const url: string = await new Promise((hotovo, chyba) => {
    const r = new FileReader();
    r.onload = () => hotovo(String(r.result));
    r.onerror = () => chyba(new Error("Súbor sa nepodarilo načítať."));
    r.readAsDataURL(f);
  });
  return url.slice(url.indexOf(",") + 1);
}

export function NahratieVypisuKarty({
  companyId,
  pripojenieId,
  nazov,
  onZavri,
  onUlozene,
}: {
  companyId: string;
  pripojenieId: string;
  nazov: string;
  onZavri: () => void;
  onUlozene: () => void;
}) {
  const { t } = useT();
  const _nahlad = useServerFn(nahladVypisuKartyFn);
  const _uloz = useServerFn(ulozVypisKartyFn);
  const [subor, setSubor] = useState<{ nazov: string; base64: string } | null>(null);
  const [nahlad, setNahlad] = useState<Nahlad | null>(null);
  const [mapovanie, setMapovanie] = useState<Mapovanie>({});
  const [faktura, setFaktura] = useState({ cislo: "", datum: "", splatnost: "", spolu: "" });
  const [bezi, setBezi] = useState<"citam" | "ukladam" | null>(null);

  async function nacitaj(
    s: { nazov: string; base64: string },
    rucne?: { mapovanie: Mapovanie; hlavickaIndex: number },
  ) {
    setBezi("citam");
    try {
      const n = await _nahlad({
        data: {
          company_id: companyId,
          id: pripojenieId,
          nazov: s.nazov,
          base64: s.base64,
          mapovanie: rucne?.mapovanie ?? null,
          hlavicka_index: rucne?.hlavickaIndex ?? null,
        },
      });
      setNahlad(n);
      setMapovanie(n.mapovanie);
      setFaktura({
        cislo: n.faktura.cislo ?? "",
        datum: n.faktura.datum ?? "",
        splatnost: n.faktura.splatnost ?? "",
        spolu: n.faktura.spolu != null ? String(n.faktura.spolu) : "",
      });
    } catch (e: any) {
      toast.error(e?.message ?? t("Súbor sa nepodarilo prečítať"));
    } finally {
      setBezi(null);
    }
  }

  async function vyber(f: File | undefined) {
    if (!f) return;
    if (f.size > STROP) {
      toast.error(t("Súbor je väčší ako 10 MB."));
      return;
    }
    const s = { nazov: f.name, base64: await naBase64(f) };
    setSubor(s);
    setNahlad(null);
    await nacitaj(s);
  }

  const sumaFaktury = faktura.spolu.trim() ? Number(faktura.spolu.replace(",", ".")) : null;
  const naUlozenie = useMemo(() => (nahlad?.riadky ?? []).filter((r) => !r.podobny), [nahlad]);
  const rozdiel =
    nahlad && sumaFaktury != null && Number.isFinite(sumaFaktury)
      ? Math.round((sumaFaktury - nahlad.sucty.spolu) * 100) / 100
      : null;
  const mena = nahlad?.riadky[0]?.mena ?? nahlad?.faktura.mena ?? "EUR";

  async function uloz() {
    if (!nahlad || !subor) return;
    setBezi("ukladam");
    try {
      const r = await _uloz({
        data: {
          company_id: companyId,
          id: pripojenieId,
          nazov_suboru: subor.nazov,
          riadky: nahlad.riadky.map(
            ({ externeId, vehicle_id, uzNahraty, podobny, blocekId, tankovanieId, ...r }) => r,
          ),
          faktura: {
            cislo: faktura.cislo.trim() || null,
            datum: faktura.datum || null,
            splatnost: faktura.splatnost || null,
            spolu: sumaFaktury != null && Number.isFinite(sumaFaktury) ? sumaFaktury : null,
            dph: nahlad.faktura.dph,
            mena: nahlad.faktura.mena,
          },
        },
      });
      toast.success(r.sprava);
      onUlozene();
    } catch (e: any) {
      toast.error(e?.message ?? t("Uloženie zlyhalo"));
    } finally {
      setBezi(null);
    }
  }

  const pocty = nahlad
    ? {
        uz: nahlad.riadky.filter((r) => r.uzNahraty).length,
        podobne: nahlad.riadky.filter((r) => r.podobny).length,
        blocky: nahlad.riadky.filter((r) => r.blocekId).length,
        gps: nahlad.riadky.filter((r) => r.tankovanieId).length,
        bezVozidla: nahlad.riadky.filter((r) => !r.vehicle_id).length,
        odhad: nahlad.riadky.filter((r) => r.odhadDph).length,
      }
    : null;

  return (
    <section
      className="rounded-xl border border-primary/40 bg-card p-5"
      aria-label={t("Nahrať výpis karty")}
    >
      <h2 className="text-base font-semibold">
        {t("Nahrať výpis alebo faktúru — {nazov}", { nazov })}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(
          "CSV alebo XLSX s nákupmi, prípadne faktúru v PDF (prečíta ju AI). Pred uložením uvidíte náhľad. Opakované nahratie toho istého výpisu nič nezdvojí.",
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className={`${TLACIDLO} cursor-pointer`}>
          <FileUp className="h-4 w-4" />
          {subor ? t("Vybrať iný súbor") : t("Vybrať súbor")}
          <input
            type="file"
            className="sr-only"
            accept=".csv,.txt,.xlsx,.xls,.ods,.pdf,text/csv,application/pdf"
            data-testid="vypis-karty-subor"
            onChange={(e) => void vyber(e.target.files?.[0])}
          />
        </label>
        {subor && <span className="min-w-0 truncate text-sm">{subor.nazov}</span>}
        {bezi === "citam" && (
          <span className="text-xs text-muted-foreground">{t("Čítam súbor…")}</span>
        )}
        <button type="button" className={TLACIDLO} onClick={onZavri}>
          {t("Zavrieť")}
        </button>
      </div>

      {nahlad && nahlad.druh !== "pdf" && (!nahlad.iste || nahlad.riadky.length === 0) && (
        <div className="mt-4 rounded-lg border border-amber-300 p-3 dark:border-amber-700">
          <p className="text-sm font-medium">{t("Priraďte stĺpce")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              "Stĺpce sa nepodarilo s istotou rozpoznať. Vyberte aspoň dátum, sumu a produkt alebo množstvo.",
            )}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {nahlad.hlavicka.map((h, i) => {
              const pole = (Object.entries(mapovanie).find(([, idx]) => idx === i)?.[0] ?? "") as
                PoleVypisu | "";
              return (
                <label key={i} className="min-w-0 text-sm">
                  <span className="mb-1 block truncate text-muted-foreground">
                    {h || t("Stĺpec {n}", { n: i + 1 })}
                    {nahlad.ukazka[0]?.[i] ? ` · ${nahlad.ukazka[0][i]}` : ""}
                  </span>
                  <select
                    className={POLE}
                    value={pole}
                    onChange={(e) => {
                      const m: Mapovanie = {};
                      for (const [k, v] of Object.entries(mapovanie))
                        if (v !== i && k !== e.target.value) m[k as PoleVypisu] = v;
                      if (e.target.value) m[e.target.value as PoleVypisu] = i;
                      setMapovanie(m);
                    }}
                  >
                    <option value="">{t("— nepoužiť —")}</option>
                    {POLIA_VYPISU.map((p) => (
                      <option key={p} value={p}>
                        {t(NAZVY_POLI[p])}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            className={`${TLACIDLO} mt-3`}
            disabled={!subor || bezi !== null}
            onClick={() =>
              subor && void nacitaj(subor, { mapovanie, hlavickaIndex: nahlad.hlavickaIndex })
            }
          >
            {t("Použiť priradenie")}
          </button>
        </div>
      )}

      {nahlad && nahlad.riadky.length > 0 && pocty && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Sucet nazov={t("Nákupov")} hodnota={String(nahlad.sucty.riadkov)} />
            <Sucet
              nazov={t("Palivo")}
              hodnota={`${nahlad.sucty.litre.toLocaleString("sk-SK")} l`}
            />
            <Sucet nazov={t("Bez DPH")} hodnota={formatujMenu(nahlad.sucty.zaklad, mena)} />
            <Sucet nazov={t("Spolu s DPH")} hodnota={formatujMenu(nahlad.sucty.spolu, mena)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-muted-foreground">{t("Číslo faktúry")}</span>
              <input
                className={POLE}
                value={faktura.cislo}
                maxLength={40}
                onChange={(e) => setFaktura({ ...faktura, cislo: e.target.value })}
              />
            </label>
            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-muted-foreground">{t("Dátum vystavenia")}</span>
              <input
                type="date"
                className={POLE}
                value={faktura.datum}
                onChange={(e) => setFaktura({ ...faktura, datum: e.target.value })}
              />
            </label>
            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-muted-foreground">{t("Splatnosť")}</span>
              <input
                type="date"
                className={POLE}
                value={faktura.splatnost}
                onChange={(e) => setFaktura({ ...faktura, splatnost: e.target.value })}
              />
            </label>
            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-muted-foreground">{t("Suma faktúry s DPH")}</span>
              <input
                className={POLE}
                inputMode="decimal"
                value={faktura.spolu}
                onChange={(e) => setFaktura({ ...faktura, spolu: e.target.value })}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {faktura.cislo.trim()
              ? t(
                  "Nákupy pôjdu do jednej prijatej faktúry s rozpisom. Ak už faktúra s týmto číslom od vydavateľa karty vo Fakteri je, nová sa nezaloží — nákupy sa k nej len prepoja.",
                )
              : t(
                  "Bez čísla faktúry sa uložia len nákupy a tankovania. Prijatá faktúra vznikne, keď nahráte faktúru alebo doplníte jej číslo.",
                )}
          </p>

          <ul className="space-y-1 text-sm">
            {rozdiel != null && Math.abs(rozdiel) >= 0.01 && (
              <Upozornenie>
                {t(
                  "Súčet nákupov sa od sumy faktúry líši o {suma}. Rozdiel (poplatky, zaokrúhlenie) sa na faktúre doplní dorovnávacím riadkom — skontrolujte ho.",
                  { suma: formatujMenu(rozdiel, mena) },
                )}
              </Upozornenie>
            )}
            {nahlad.existujucaFaktura && (
              <Upozornenie>
                {t("Faktúra {cislo} už vo Fakteri je ({suma}) — nová sa nezaloží.", {
                  cislo: faktura.cislo,
                  suma: formatujMenu(nahlad.existujucaFaktura.amount_total, mena),
                })}
              </Upozornenie>
            )}
            {pocty.uz > 0 && (
              <Upozornenie>
                {t("{n} nákupov je už nahratých z tohto súboru — nezdvoja sa.", { n: pocty.uz })}
              </Upozornenie>
            )}
            {pocty.podobne > 0 && (
              <Upozornenie>
                {t(
                  "{n} nákupov už je nahratých z iného súboru (rovnaký deň, suma a množstvo) — preskočia sa.",
                  { n: pocty.podobne },
                )}
              </Upozornenie>
            )}
            {pocty.blocky > 0 && (
              <Upozornenie>
                {t(
                  "Pri {n} nákupoch je vo Fakteri aj bloček z pumpy — označí sa, nezaúčtujte ho.",
                  { n: pocty.blocky },
                )}
              </Upozornenie>
            )}
            {pocty.gps > 0 && (
              <li className="text-xs text-muted-foreground">
                {t(
                  "{n} tankovaní už je zapísaných (GPS jednotka alebo ručne) — nové sa nezaložia, len sa prepoja.",
                  { n: pocty.gps },
                )}
              </li>
            )}
            {pocty.odhad > 0 && (
              <Upozornenie>
                {t(
                  "Pri {n} riadkoch výpis nemá DPH — dopočítala sa základnou sadzbou. Skontrolujte s faktúrou.",
                  { n: pocty.odhad },
                )}
              </Upozornenie>
            )}
            {nahlad.preskocene.length > 0 && (
              <li className="text-xs text-muted-foreground">
                {t("Preskočené riadky bez dátumu alebo sumy: {n}", {
                  n: nahlad.preskocene.length,
                })}
              </li>
            )}
            <li className="text-xs text-muted-foreground">
              {nahlad.vozidla.length
                ? t("Vozidlá: {zoznam}", {
                    zoznam: nahlad.vozidla.map((v) => `${v.nazov} (${v.riadkov})`).join(", "),
                  })
                : t("Žiadny nákup sa nepodarilo priradiť k vozidlu.")}
              {pocty.bezVozidla > 0 &&
                ` · ${t("bez vozidla: {n} — kartu priraďte v časti Karty a vozidlá", { n: pocty.bezVozidla })}`}
            </li>
          </ul>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">{t("Dátum")}</th>
                  <th className="py-1 pr-2">{t("Karta / ŠPZ")}</th>
                  <th className="py-1 pr-2">{t("Nákup")}</th>
                  <th className="py-1 pr-2 text-right">{t("Množstvo")}</th>
                  <th className="py-1 pr-2 text-right">{t("Suma")}</th>
                  <th className="py-1">{t("Stav")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {nahlad.riadky.slice(0, 300).map((r) => (
                  <tr key={r.externeId} className={r.podobny ? "opacity-50" : ""}>
                    <td className="whitespace-nowrap py-1.5 pr-2">{datumNaDoklade(r.datum)}</td>
                    <td className="py-1.5 pr-2">{r.spz || r.karta || "—"}</td>
                    <td className="py-1.5 pr-2">
                      <span className="inline-flex items-center gap-1">
                        {r.jePalivo && <Fuel className="h-3.5 w-3.5 text-muted-foreground" />}
                        {r.produkt ?? "—"}
                      </span>
                      {r.miesto && (
                        <span className="block text-xs text-muted-foreground">{r.miesto}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {r.mnozstvo != null ? r.mnozstvo.toLocaleString("sk-SK") : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {formatujMenu(r.spolu, r.mena)}
                    </td>
                    <td className="py-1.5 text-xs text-muted-foreground">
                      {[
                        r.uzNahraty && t("už nahraté"),
                        r.podobny && t("preskočí sa"),
                        r.blocekId && t("aj bloček"),
                        r.tankovanieId && t("tankovanie už je"),
                        !r.vehicle_id && t("bez vozidla"),
                        r.krajinaDph && r.krajinaDph !== "SK" && r.krajinaDph !== "CZ"
                          ? t("DPH {krajina} do nákladu", { krajina: r.krajinaDph })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {nahlad.riadky.length > 300 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Zobrazených je prvých 300 riadkov z {n}.", { n: nahlad.riadky.length })}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={bezi !== null || (!naUlozenie.length && !faktura.cislo.trim())}
            onClick={() => void uloz()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {bezi === "ukladam" ? t("Ukladám…") : t("Uložiť {n} nákupov", { n: naUlozenie.length })}
          </button>
        </div>
      )}

      {nahlad && nahlad.iste && nahlad.riadky.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("V súbore sa nenašiel ani jeden nákup s dátumom a sumou.")}
        </p>
      )}
    </section>
  );
}

function Sucet({ nazov, hodnota }: { nazov: string; hodnota: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{nazov}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{hodnota}</div>
    </div>
  );
}

function Upozornenie({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}
