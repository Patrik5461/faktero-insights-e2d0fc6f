/**
 * Spoločné prvky obrazoviek modulu Zamestnanci.
 */
import { IdCard } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { ChybovyStav } from "@/components/faktero/web/StavyObsahu";

export const pole =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
export const popis = "mb-1.5 block text-xs font-semibold text-muted-foreground";
export const tlacidlo =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60";
export const tlacidloObrys =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-card px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60";

/** Chyba zo servera — pri vypnutom module ju zobrazíme ako vysvetlenie, nie ako poruchu. */
export function ChybaModulu({ sprava }: { sprava: string }) {
  const { t } = useT();
  const vypnuty = /nie je pre túto firmu zapnutý/.test(sprava);
  if (!vypnuty)
    return (
      <div className="rounded-xl border border-border bg-card">
        <ChybovyStav nadpis="Niečo sa nepodarilo" popis={t(sprava)} />
      </div>
    );
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm">
        <IdCard className="h-5 w-5" />
      </div>
      <div className="mt-4 text-[15px] font-semibold">{t("Modul Zamestnanci nie je zapnutý")}</div>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {t(
          "Evidencia zamestnancov sa zapína pre každú firmu zvlášť. Ak ju chcete používať, napíšte na servis@faktero.sk.",
        )}
      </p>
    </div>
  );
}

export function stiahni(nazov: string, obsah: Blob) {
  const url = URL.createObjectURL(obsah);
  const a = document.createElement("a");
  a.href = url;
  a.download = nazov;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function base64NaBlob(b64: string, typ: string): Blob {
  const bin = atob(b64);
  const bajty = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i);
  return new Blob([bajty], { type: typ });
}

export type UdajeZamestnanca = {
  first_name: string;
  last_name: string;
  title_before: string;
  title_after: string;
  birth_date: string;
  birth_place: string;
  nationality: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  zip: string;
  iban: string;
  health_insurer: string;
  position: string;
  department: string;
  start_date: string;
  end_date: string;
  status: "active" | "ended";
  sp_registered_at: string;
  zp_registered_at: string;
  medical_check_due: string;
  bozp_training_due: string;
  note: string;
};

export function prazdneUdaje(): UdajeZamestnanca {
  return {
    first_name: "",
    last_name: "",
    title_before: "",
    title_after: "",
    birth_date: "",
    birth_place: "",
    nationality: "SK",
    email: "",
    phone: "",
    street: "",
    city: "",
    zip: "",
    iban: "",
    health_insurer: "",
    position: "",
    department: "",
    start_date: "",
    end_date: "",
    status: "active",
    sp_registered_at: "",
    zp_registered_at: "",
    medical_check_due: "",
    bozp_training_due: "",
    note: "",
  };
}

/** Riadok z databázy → hodnoty formulára (null na prázdny reťazec). */
export function naFormular(z: Record<string, any>): UdajeZamestnanca {
  const vysledok = prazdneUdaje();
  for (const k of Object.keys(vysledok) as (keyof UdajeZamestnanca)[]) {
    const v = z[k];
    (vysledok as any)[k] =
      v == null
        ? ""
        : String(v).slice(
            0,
            k.endsWith("_date") || k.endsWith("_at") || k.endsWith("_due") ? 10 : undefined,
          );
  }
  return vysledok;
}

const ZDRAVOTNE_POISTOVNE = ["VšZP", "Dôvera", "Union"];

export function FormularZamestnanca({
  udaje,
  zmen,
}: {
  udaje: UdajeZamestnanca;
  zmen: (u: UdajeZamestnanca) => void;
}) {
  const { t } = useT();
  const nastav = (k: keyof UdajeZamestnanca) => (e: { target: { value: string } }) =>
    zmen({ ...udaje, [k]: e.target.value });
  const vstup = (
    k: keyof UdajeZamestnanca,
    nazov: string,
    typ = "text",
    extra: Record<string, unknown> = {},
  ) => (
    <div>
      <label className={popis} htmlFor={`zam-${k}`}>
        {t(nazov)}
      </label>
      <input
        id={`zam-${k}`}
        type={typ}
        className={pole}
        value={udaje[k] as string}
        onChange={nastav(k)}
        {...extra}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold">{t("Osobné údaje")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {vstup("first_name", "Meno *", "text", { autoComplete: "off" })}
          {vstup("last_name", "Priezvisko *", "text", { autoComplete: "off" })}
          {vstup("title_before", "Titul pred menom")}
          {vstup("title_after", "Titul za menom")}
          {vstup("birth_date", "Dátum narodenia", "date")}
          {vstup("birth_place", "Miesto narodenia")}
          {vstup("nationality", "Štátna príslušnosť")}
          <div>
            <label className={popis} htmlFor="zam-health_insurer">
              {t("Zdravotná poisťovňa")}
            </label>
            <input
              id="zam-health_insurer"
              list="zam-poistovne"
              className={pole}
              value={udaje.health_insurer}
              onChange={nastav("health_insurer")}
            />
            <datalist id="zam-poistovne">
              {ZDRAVOTNE_POISTOVNE.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold">{t("Kontakt a adresa")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {vstup("email", "E-mail", "email")}
          {vstup("phone", "Telefón", "tel")}
          {vstup("street", "Ulica a číslo")}
          {vstup("city", "Mesto")}
          {vstup("zip", "PSČ")}
          {vstup("iban", "IBAN na výplatu")}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold">{t("Pracovný pomer")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {vstup("position", "Pracovná pozícia")}
          {vstup("department", "Oddelenie")}
          {vstup("start_date", "Deň nástupu", "date")}
          {vstup("end_date", "Deň ukončenia", "date")}
          <div>
            <label className={popis} htmlFor="zam-status">
              {t("Stav")}
            </label>
            <select
              id="zam-status"
              className={pole}
              value={udaje.status}
              onChange={nastav("status")}
            >
              <option value="active">{t("Aktívny")}</option>
              <option value="ended">{t("Ukončený")}</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h3 className="mb-1 text-sm font-semibold">{t("Povinnosti zamestnávateľa")}</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("Podľa týchto dátumov Faktero pripomína prihlášky a termíny v zvončeku aj e-mailom.")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {vstup("sp_registered_at", "Prihláška do Sociálnej poisťovne podaná", "date")}
          {vstup("zp_registered_at", "Oznámenie zdravotnej poisťovni podané", "date")}
          {vstup("medical_check_due", "Najbližšia lekárska prehliadka", "date")}
          {vstup("bozp_training_due", "Najbližšie školenie BOZP", "date")}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <label className={popis} htmlFor="zam-note">
          {t("Poznámka")}
        </label>
        <textarea
          id="zam-note"
          rows={3}
          className={pole}
          value={udaje.note}
          onChange={nastav("note")}
        />
      </section>
    </div>
  );
}
