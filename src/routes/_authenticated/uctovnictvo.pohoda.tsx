import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { KonektorPohody } from "@/components/faktero/KonektorPohody";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";

/**
 * Nastavenie účtovania v Pohode a vydanie konektora.
 *
 * Bolo to zapadnuté v strede stránky Firma medzi číslovaním faktúr a pätičkou,
 * kde to nikto nehľadal. Zostali tu skratky pokladne, banky a skladu, e-mail
 * účtovníčky a konektor. Čo sa do Pohody posiela je v Nastaveniach exportu na
 * stránke Predkontácie, správa pokladní na /uctovnictvo/pokladne. Stĺpce
 * zostávajú na `companies`, takže presun je len o mieste v rozhraní.
 */
export const Route = createFileRoute("/_authenticated/uctovnictvo/pohoda")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Prepojenie s Pohodou — Faktero") }],
  }),
  component: Stranka,
});

/**
 * Ukladá sa len to, čo je na tejto stránke — inak by sa prepísala celá firma.
 * `pohoda_posielat_*` sem nepatria: ukladajú sa v Nastaveniach exportu
 * (Predkontácie), tu by ich prepísala stará hodnota.
 */
const POLIA = [
  "uctovnik_email",
  "odovzdanie_automaticky",
  "pohoda_pokladna",
  "pohoda_banka",
  "pohoda_sklad",
  "pohoda_odkaz_na_pdf",
  "pohoda_ico_z_mena",
] as const;

function Stranka() {
  const { t } = useT();
  const [c, setC] = useState<any>(null);
  const [uklada, setUklada] = useState(false);

  useEffect(() => {
    const id = getActiveCompanyId();
    if (!id) return;
    supabase
      .from("companies")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => setC(data));
  }, []);

  if (!c)
    return (
      <>
        <PageHeader title={t("Prepojenie s Pohodou")} />
        <PageBody>
          <NacitavanieStav text="Načítavam…" />
        </PageBody>
      </>
    );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setUklada(true);
    // Vyprázdnené pole musí ísť ako NULL, nie ako "". Prázdny reťazec by sa
    // pri zostavovaní XML tváril ako vyplnená skratka a Pohoda by dostala
    // prázdny element namiesto vynechaného.
    const patch = Object.fromEntries(
      POLIA.map((k) => {
        const v = c[k];
        return [k, typeof v === "string" ? v.trim() || null : (v ?? null)];
      }),
    );
    const { error } = await supabase
      .from("companies")
      .update(patch as never)
      .eq("id", c.id);
    setUklada(false);
    if (error) return toast.error(error.message);
    toast.success(t("Uložené"));
  }

  const f = (k: string) => (v: string) => setC({ ...c, [k]: v });

  return (
    <>
      <PageHeader
        title={t("Prepojenie s Pohodou")}
        description={t(
          "Skratky pokladne, banky a skladu z Pohody, e-mail účtovníčky a konektor.",
        )}
        popisDalej={
          <>
            {t("Do Pohody sa dá dostať tromi cestami — mesačným balíkom mailom, XML z")}{" "}
            <Link to="/exporty" className="text-primary underline">
              {t("účtovných exportov")}
            </Link>{" "}
            {t("alebo konektorom dole na tejto stránke. Celé je to popísané v")}{" "}
            <Link to="/pomoc/pohoda" className="text-primary underline">
              {t("manuáli")}
            </Link>
            .
          </>
        }
      />
      <PageBody>
        <form
          onSubmit={save}
          className="mx-auto grid max-w-5xl gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5"
        >
          <div className="sm:col-span-2">
            <h3 className="mb-1 text-base font-semibold text-foreground">{t("Účtovníčka")}</h3>
          </div>
          <In
            label={t("E-mail účtovníčky")}
            value={c.uctovnik_email ?? ""}
            onChange={f("uctovnik_email")}
            placeholder={t("kam chodí mesačné odovzdanie")}
          />
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3 hover:bg-muted/40">
            <input
              type="checkbox"
              checked={!!c.odovzdanie_automaticky}
              onChange={(e) => setC({ ...c, odovzdanie_automaticky: e.target.checked })}
              className="mt-0.5 h-4 w-4"
            />
            <span className="min-w-0 text-sm font-medium">
              {t("Posielať automaticky")}
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {t(
                  "Podklady za minulý mesiac odídu 5. v mesiaci samy. Posiela sa len to, čo ešte neodišlo.",
                )}
              </span>
            </span>
          </label>

          <div className="sm:col-span-2 mt-2 border-t border-border pt-4">
            <h3 className="mb-1 text-base font-semibold text-foreground">{t("Účtovanie")}</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {t("Skratky pokladne, bankového účtu a skladu z Pohody vašej účtovníčky.")}{" "}
              <strong>{t("Predkontácie a členenia DPH")}</strong>{" "}
              {t("— aj ich načítanie z Pohody — sú na stránke")}{" "}
              <Link to="/uctovnictvo/predkontacie" className="text-primary underline">
                {t("Predkontácie")}
              </Link>
              .
            </p>
          </div>
          <div>
            <In
              label={t("Pokladňa v Pohode")}
              value={c.pohoda_pokladna ?? ""}
              onChange={f("pohoda_pokladna")}
              placeholder={t("napr. {x}", { x: "HOT" })}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("Použije sa, keď predvolená pokladňa nemá vlastnú skratku.")}{" "}
              {t("Viac pokladní (napr. HP EUR, HP CZK) a ich skratky pridáte na stránke")}{" "}
              <Link to="/uctovnictvo/pokladne" className="text-primary underline">
                {t("Pokladne")}
              </Link>
              .
            </span>
          </div>
          <div>
            <In
              label={t("Bankový účet v Pohode")}
              value={c.pohoda_banka ?? ""}
              onChange={f("pohoda_banka")}
              placeholder={t("napr. {x}", { x: "TB" })}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("Pri viacerých účtoch zadajte skratku pri každom účte vo")}{" "}
              <Link to="/firma" className="text-primary underline">
                {t("Firma → Bankové účty")}
              </Link>
              {t(" — faktúra pôjde so skratkou svojho účtu.")}
            </span>
          </div>
          <In
            label={t("Členenie skladu v Pohode")}
            value={c.pohoda_sklad ?? ""}
            onChange={f("pohoda_sklad")}
            placeholder={t("napr. {x}", { x: "TOVAR" })}
          />

          <div className="sm:col-span-2 mt-2 border-t border-border pt-4">
            <h3 className="mb-1 text-base font-semibold text-foreground">
              {t("Doklady a partneri v Pohode")}
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {t("Čo sa do Pohody posiela (adresár, skladové karty a pohyby, zákazky) nastavíte v")}{" "}
              <Link
                to="/uctovnictvo/predkontacie"
                hash="nastavenia-exportu"
                className="text-primary underline"
              >
                {t("Predkontácie a členenie DPH/KV → Nastavenia exportu")}
              </Link>
              .
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3 hover:bg-muted/40 sm:col-span-2">
            <input
              type="checkbox"
              checked={c.pohoda_odkaz_na_pdf !== false}
              onChange={(e) => setC({ ...c, pohoda_odkaz_na_pdf: e.target.checked })}
              className="mt-0.5 h-4 w-4"
            />
            <span className="min-w-0 text-sm font-medium">
              {t("Prikladať odkaz na PDF faktúry")}
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {t(
                  "Doklad má v Pohode v záložke Dokumenty odkaz, ktorým sa otvorí PDF. Odkaz je dlhý náhodný reťazec a otvorí ho každý, kto ho má — rovnako ako faktúra poslaná mailom.",
                )}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3 hover:bg-muted/40 sm:col-span-2">
            <input
              type="checkbox"
              checked={!!c.pohoda_ico_z_mena}
              onChange={(e) => setC({ ...c, pohoda_ico_z_mena: e.target.checked })}
              className="mt-0.5 h-4 w-4"
            />
            <span className="min-w-0 text-sm font-medium">
              {t("Generovať IČO z mena pre partnerov bez IČO")}
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {t(
                  "Zahraničná firma alebo fyzická osoba dostane v Pohode stabilný náhradný identifikátor (napr. FK3A9F12C0) odvodený z mena a krajiny, takže sa v adresári vždy spáruje s tou istou kartou a nezakladá nové. Partnera so skutočným IČO sa to netýka.",
                )}
              </span>
            </span>
          </label>

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={uklada}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {uklada ? t("Ukladám…") : t("Uložiť")}
            </button>
          </div>
        </form>

        {/*
          Viac pokladní podľa skratiek z Pohody (každá s vlastnou menou) sa
          spravuje na /uctovnictvo/pokladne. Bloček v hotovosti dostane
          pokladňu v svojej mene (inak predvolenú) a jej skratka ide do XML
          ako vch:cashAccount.
        */}
        <p className="mx-auto mt-4 max-w-5xl rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground sm:p-5">
          {t(
            "Viac pokladní s vlastnou menou a skratkou pre Pohodu (napr. HP EUR, HP CZK) spravujete na stránke",
          )}{" "}
          <Link to="/uctovnictvo/pokladne" className="text-primary underline">
            {t("Pokladne")}
          </Link>
          .
        </p>

        <div className="mx-auto max-w-5xl rounded-xl border border-border bg-card p-4 sm:p-5">
          <KonektorPohody companyId={c.id} />
        </div>
      </PageBody>
    </>
  );
}

function In({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
