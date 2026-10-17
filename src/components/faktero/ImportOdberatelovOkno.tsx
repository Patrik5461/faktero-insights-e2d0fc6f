import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import { vsetkyRiadky } from "@/lib/faktero/strankovanie";
import {
  naplanuj,
  POLIA,
  rozparsujSubor,
  vycistiOdberatela,
  zTabulky,
  type Odberatel,
  type Pole,
  type Vysledok,
} from "@/lib/faktero/import-odberatelov";

const STLPCE =
  "id, name, ico, dic, ic_dph, street, city, zip, country, email, phone, contact_person, external_id, iban, odberatel, dodavatel";

/**
 * Import odberateľov z Pohody, Money S3 a CSV/Excelu z ostatných systémov.
 * Existujúcich neprepisuje — na požiadanie im len doplní prázdne údaje.
 */
export function ImportOdberatelovOkno({
  rola = "odberatel",
  companyId,
  onClose,
  onHotovo,
}: {
  rola?: "odberatel" | "dodavatel";
  companyId: string;
  onClose: () => void;
  onHotovo: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const [subor, setSubor] = useState<File | null>(null);
  const [vysledok, setVysledok] = useState<Vysledok | null>(null);
  const [mapovanie, setMapovanie] = useState<Record<number, Pole>>({});
  const [existujuci, setExistujuci] = useState<any[] | null>(null);
  const [doplnit, setDoplnit] = useState(false);
  const [citam, setCitam] = useState(false);
  const [importujem, setImportujem] = useState(false);

  useEffect(() => {
    vsetkyRiadky((od, po) =>
      supabase
        .from("customers")
        .select(STLPCE)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("id")
        .range(od, po),
    )
      .then(setExistujuci)
      .catch((e) =>
        toast.error(
          t("Existujúcich odberateľov sa nepodarilo načítať: {chyba}", { chyba: e.message }),
        ),
      );
  }, [companyId]);

  async function nacitaj(f: File) {
    setSubor(f);
    setCitam(true);
    try {
      const r = await rozparsujSubor(f);
      setVysledok(r);
      if (r.druh === "tabulka") setMapovanie(r.mapovanie);
    } catch (e) {
      setVysledok(null);
      toast.error(t("Súbor sa nepodarilo prečítať: {chyba}", { chyba: (e as Error).message }));
    } finally {
      setCitam(false);
    }
  }

  const odberatelia: Odberatel[] = useMemo(() => {
    if (!vysledok) return [];
    return vysledok.druh === "xml" ? vysledok.odberatelia : zTabulky(vysledok.riadky, mapovanie);
  }, [vysledok, mapovanie]);

  const plan = useMemo(
    () => (existujuci ? naplanuj(odberatelia, existujuci, doplnit, rola) : null),
    [odberatelia, existujuci, doplnit, rola],
  );
  const dod = rola === "dodavatel";

  /*
    Dodávatelia z prijatých faktúr: kto chodí s faktúrami, toho netreba písať
    znova. Berie sa posledný doklad od každého, takže adresa a IBAN sú čerstvé.
  */
  async function zPrijatychFaktur() {
    setCitam(true);
    setSubor(null);
    try {
      const riadky = await vsetkyRiadky((od, po) =>
        supabase
          .from("purchase_invoices")
          .select(
            "id, issue_date, supplier_name, supplier_ico, supplier_dic, supplier_ic_dph, supplier_iban, supplier_street, supplier_city, supplier_zip, supplier_country, supplier_email",
          )
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("id")
          .range(od, po),
      );
      riadky.sort((a: any, b: any) =>
        String(b.issue_date ?? "").localeCompare(String(a.issue_date ?? "")),
      );
      const zoznam = riadky
        .map((r: any) =>
          vycistiOdberatela({
            name: r.supplier_name,
            ico: r.supplier_ico,
            dic: r.supplier_dic,
            ic_dph: r.supplier_ic_dph,
            iban: r.supplier_iban,
            street: r.supplier_street,
            city: r.supplier_city,
            zip: r.supplier_zip,
            country: r.supplier_country,
            email: r.supplier_email,
          }),
        )
        .filter((x): x is Odberatel => Boolean(x));
      setVysledok({ druh: "xml", zdroj: "Prijaté faktúry vo Fakteri", odberatelia: zoznam });
    } catch (e) {
      toast.error(
        t("Prijaté faktúry sa nepodarilo načítať: {chyba}", { chyba: (e as Error).message }),
      );
    } finally {
      setCitam(false);
    }
  }

  const chybaNazov = vysledok?.druh === "tabulka" && !Object.values(mapovanie).includes("name");

  async function importuj() {
    if (!plan) return;
    setImportujem(true);
    let zalozenych = 0;
    let doplnenych = 0;
    try {
      for (let i = 0; i < plan.novi.length; i += 500) {
        const davka = plan.novi.slice(i, i + 500).map((o) => ({
          ...o,
          country: o.country ?? "SK",
          company_id: companyId,
          odberatel: rola === "odberatel",
          dodavatel: rola === "dodavatel",
        }));
        const { error } = await supabase.from("customers").insert(davka as any);
        if (error) throw new Error(error.message);
        zalozenych += davka.length;
      }
      for (const d of plan.doplnit) {
        const { error } = await supabase
          .from("customers")
          .update(d.zmena as any)
          .eq("id", d.id)
          .eq("company_id", companyId);
        if (error) throw new Error(`${d.name}: ${error.message}`);
        doplnenych += 1;
      }
      toast.success(
        doplnenych
          ? t(
              dod
                ? "Import hotový: {n} nových dodávateľov, doplnené údaje u {d}."
                : "Import hotový: {n} nových odberateľov, doplnené údaje u {d}.",
              { n: zalozenych, d: doplnenych },
            )
          : t(
              dod
                ? "Import hotový: {n} nových dodávateľov."
                : "Import hotový: {n} nových odberateľov.",
              { n: zalozenych },
            ),
      );
      onHotovo();
      onClose();
    } catch (e) {
      toast.error(
        t("Import sa zastavil: {chyba}", { chyba: (e as Error).message }) +
          (zalozenych || doplnenych
            ? " " +
              t(
                "Dovtedy sa založilo {z} a doplnilo {d} — opätovný import ich už nezaloží druhýkrát.",
                { z: zalozenych, d: doplnenych },
              )
            : ""),
        { duration: 12000 },
      );
      onHotovo();
    } finally {
      setImportujem(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(dod ? "Import dodávateľov" : "Import odberateľov")}
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border p-4">
          <h2 className="flex-1 text-lg font-semibold">
            {t(dod ? "Import dodávateľov" : "Import odberateľov")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("Zavrieť")}
            className="rounded-md p-1 hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 text-sm">
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90">
              <Upload className="h-4 w-4" /> {subor ? t("Vybrať iný súbor") : t("Vybrať súbor")}
              <input
                type="file"
                accept=".xml,.csv,.txt,.tsv,.xlsx,.xls,.ods"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) nacitaj(f);
                  e.target.value = "";
                }}
              />
            </label>
            {rola === "dodavatel" && (
              <button
                type="button"
                onClick={zPrijatychFaktur}
                className="ml-2 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 hover:bg-secondary"
              >
                {t("Načítať z prijatých faktúr")}
              </button>
            )}
            {subor && <span className="ml-3 text-muted-foreground">{subor.name}</span>}
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>
                <strong>Pohoda:</strong>{" "}
                {t(
                  dod
                    ? "adresár cez Súbor → Dátová komunikácia → XML export (Adresár), alebo XML export faktúr — dodávatelia sa vyberú z nich. Funguje aj tabuľka adresára uložená do Excelu."
                    : "adresár cez Súbor → Dátová komunikácia → XML export (Adresár), alebo XML export faktúr — odberatelia sa vyberú z nich. Funguje aj tabuľka adresára uložená do Excelu.",
                )}
              </li>
              <li>
                <strong>Money S3:</strong> {t("XML export adresára.")}
              </li>
              <li>
                <strong>{t("SuperFaktúra, iDoklad, Fakturoid, KROS, Omega a ďalšie:")}</strong>{" "}
                {t(
                  "export klientov do CSV alebo Excelu. Stĺpce sa rozpoznajú podľa hlavičky a dajú sa upraviť.",
                )}
              </li>
            </ul>
          </div>

          {citam && <p className="text-muted-foreground">{t("Čítam súbor…")}</p>}

          {vysledok?.druh === "tabulka" && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 font-medium">
                {t("Stĺpce ({zdroj})", { zdroj: vysledok.zdroj })}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {vysledok.hlavicka.map((h, i) => (
                  <label key={i} className="flex min-w-0 items-center gap-2">
                    <span className="w-1/2 truncate text-muted-foreground" title={h}>
                      {h || t("Stĺpec {n}", { n: i + 1 })}
                    </span>
                    <select
                      value={mapovanie[i] ?? ""}
                      onChange={(e) => {
                        const m = { ...mapovanie };
                        const p = e.target.value as Pole | "";
                        // Jedno pole len z jedného stĺpca.
                        for (const k of Object.keys(m)) if (m[Number(k)] === p) delete m[Number(k)];
                        if (p) m[i] = p;
                        else delete m[i];
                        setMapovanie(m);
                      }}
                      className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1"
                    >
                      <option value="">{t("— neimportovať —")}</option>
                      {POLIA.map((p) => (
                        <option key={p.pole} value={p.pole}>
                          {t(p.nazov)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {chybaNazov && (
                <p className="mt-2 text-xs text-destructive">{t("Vyberte stĺpec s názvom.")}</p>
              )}
            </div>
          )}

          {vysledok && !citam && odberatelia.length === 0 && !chybaNazov && (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-muted-foreground">
              {t(
                dod
                  ? vysledok.druh === "xml"
                    ? "V súbore sme nenašli žiadnych dodávateľov — je to export adresára alebo faktúr z Pohody či Money S3?"
                    : "V súbore sme nenašli žiadnych dodávateľov."
                  : vysledok.druh === "xml"
                    ? "V súbore sme nenašli žiadnych odberateľov — je to export adresára alebo faktúr z Pohody či Money S3?"
                    : "V súbore sme nenašli žiadnych odberateľov.",
              )}
            </p>
          )}

          {plan && odberatelia.length > 0 && (
            <>
              <div className="rounded-lg bg-muted/40 p-3">
                <div>
                  {t("Zdroj:")} <strong>{t(vysledok?.zdroj ?? "")}</strong> ·{" "}
                  {t("v súbore {n}", { n: odberatelia.length })}
                  {plan.duplicityVSubore
                    ? " " + t("(z toho {n} opakovaní)", { n: plan.duplicityVSubore })
                    : ""}
                </div>
                <div className="mt-1">
                  {t("Založí sa {n} nových. Už ich máte {e}", {
                    n: plan.novi.length,
                    e: plan.existujuci,
                  })}
                  {doplnit
                    ? " — " + t("údaje sa doplnia u {n}", { n: plan.doplnit.length })
                    : plan.pridanaRola
                      ? " — " +
                        t(
                          dod
                            ? "{n} z nich sú zatiaľ len odberatelia, označia sa aj ako dodávatelia"
                            : "{n} z nich sú zatiaľ len dodávatelia, označia sa aj ako odberatelia",
                          { n: plan.pridanaRola },
                        )
                      : " — " + t("tých sa import nedotkne")}
                  .
                </div>
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={doplnit}
                    onChange={(e) => setDoplnit(e.target.checked)}
                  />
                  <span>
                    {t(
                      dod
                        ? "Existujúcim dodávateľom doplniť chýbajúce údaje"
                        : "Existujúcim odberateľom doplniť chýbajúce údaje",
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {t(
                        "Vyplnené údaje sa neprepíšu, doplnia sa len prázdne (napr. e-mail, IČ DPH).",
                      )}
                    </span>
                  </span>
                </label>
              </div>

              {plan.novi.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[36rem] text-xs">
                    <thead className="bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="p-2">{t("Názov")}</th>
                        <th className="p-2">{t("IČO")}</th>
                        <th className="p-2">{t("IČ DPH")}</th>
                        <th className="p-2">{t("Adresa")}</th>
                        <th className="p-2">{t("E-mail")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.novi.slice(0, 50).map((o, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2 font-medium">{o.name}</td>
                          <td className="p-2">{o.ico ?? "—"}</td>
                          <td className="p-2">{o.ic_dph ?? "—"}</td>
                          <td className="p-2">
                            {[o.street, [o.zip, o.city].filter(Boolean).join(" "), o.country]
                              .filter(Boolean)
                              .join(", ") || "—"}
                          </td>
                          <td className="p-2">{o.email ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.novi.length > 50 && (
                    <p className="p-2 text-xs text-muted-foreground">
                      {t("… a ďalších {n}.", { n: plan.novi.length - 50 })}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            {t("Zrušiť")}
          </button>
          <button
            onClick={importuj}
            disabled={
              importujem ||
              !plan ||
              chybaNazov ||
              (plan.novi.length === 0 && plan.doplnit.length === 0)
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {importujem
              ? t("Importujem…")
              : plan && (plan.novi.length || plan.doplnit.length)
                ? plan.doplnit.length
                  ? t("Importovať ({n} nových, {d} doplniť)", {
                      n: plan.novi.length,
                      d: plan.doplnit.length,
                    })
                  : t("Importovať ({n} nových)", { n: plan.novi.length })
                : t("Importovať")}
          </button>
        </div>
      </div>
    </div>
  );
}
