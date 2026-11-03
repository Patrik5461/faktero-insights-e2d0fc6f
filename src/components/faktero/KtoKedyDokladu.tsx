import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { UserCheck } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import {
  casUdalosti,
  ktoKedyDokladu,
  potrebujeMena,
  textKto,
  type AgendaKtoKedy,
  type Udalost,
} from "@/lib/faktero/kto-kedy";

/** Mená členov firmy (profily číta server po overení členstva) — len keď treba. */
export function useMenaClenov(companyId: string | null | undefined, treba = true) {
  const nacitaj = useServerFn(menaClenovFirmy);
  const [mena, setMena] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!companyId || !treba) return;
    nacitaj({ data: { company_id: companyId } })
      .then((m) => setMena(m as Record<string, string>))
      .catch(() => setMena({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, treba]);
  return mena;
}

/** „Jana Nováková, 2. 11. 2026 9:14“ — kto (meno, e-mail, automat) a kedy. */
export function UdalostText({
  u,
  mena,
  kompaktne = false,
}: {
  u: Udalost;
  mena: Record<string, string>;
  kompaktne?: boolean;
}) {
  const { t, jazyk } = useT();
  const k = textKto(u.kto, mena);
  const kto = [k.meno ?? (k.kluc ? t(k.kluc, k.premenne) : ""), k.pripona ? `(${t(k.pripona)})` : ""]
    .filter(Boolean)
    .join(" ");
  const kedy = casUdalosti(u.kedy, lokalJazyka(jazyk));
  if (kompaktne)
    return (
      <>
        {kto ? <span className="text-foreground/80">{kto} </span> : null}
        {kedy ? <span className="whitespace-nowrap text-muted-foreground">{kedy}</span> : null}
      </>
    );
  return (
    <>
      {kto ? <span className="font-medium text-foreground">{kto}</span> : null}
      {kedy ? <span className="whitespace-nowrap">{kto ? ", " : ""}{kedy}</span> : null}
    </>
  );
}

/**
 * Nenápadný riadok v detaile dokladu: kto ho nahral, uložil a zaúčtoval
 * a kedy. Bez údajov (starý ručne zapísaný doklad bez autora) sa neukáže.
 */
export function KtoKedyDokladu({
  companyId,
  agenda,
  row,
  bezRamu = false,
}: {
  companyId: string | null | undefined;
  agenda: AgendaKtoKedy;
  row: Record<string, any> | null | undefined;
  /** V kompaktnom detaile ako riadok sekcie, bez vlastného rámčeka. */
  bezRamu?: boolean;
}) {
  const { t } = useT();
  const k = ktoKedyDokladu(row, agenda);
  const mena = useMenaClenov(companyId, potrebujeMena(k));
  const vsetky: [string, Udalost | null][] = [
    [agenda === "faktura" ? "Vytvorené" : "Nahraté", k.nahrane],
    ["Uložené", k.ulozene],
    ["Zaúčtované", k.zauctovane],
  ];
  const casti = vsetky.filter((c): c is [string, Udalost] => c[1] != null);
  if (!casti.length) return null;
  return (
    <div
      className={
        bezRamu
          ? "flex items-start gap-2 text-xs text-muted-foreground"
          : "flex items-start gap-2 rounded-xl border border-border bg-card px-5 py-3 text-xs text-muted-foreground"
      }
      data-testid="kto-kedy-dokladu"
    >
      <UserCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      {/* Na úzkej obrazovke pod sebou, inak v riadku s bodkami. */}
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:gap-x-2">
        {casti.map(([popis, u], i) => (
          <span key={popis} className="min-w-0 break-words">
            {i > 0 ? (
              <span className="mr-2 hidden sm:inline" aria-hidden>
                ·
              </span>
            ) : null}
            {t(popis)}: <UdalostText u={u} mena={mena} />
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Bunka voliteľného stĺpca „Nahral / Zaúčtoval“ v zozname — dva riadky
 * (nahratie, zaúčtovanie; pri nezaúčtovanom uloženie, ak je).
 */
export function KtoKedyBunka({
  row,
  agenda,
  mena,
}: {
  row: Record<string, any>;
  agenda: AgendaKtoKedy;
  mena: Record<string, string>;
}) {
  const { t } = useT();
  const k = ktoKedyDokladu(row, agenda);
  const druhy = k.zauctovane
    ? (["Zaúčtované", k.zauctovane] as const)
    : k.ulozene && !k.ulozeneVytvorenim
      ? (["Uložené", k.ulozene] as const)
      : null;
  if (!k.nahrane && !druhy) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="block text-xs leading-snug">
      {k.nahrane ? (
        <span className="block">
          <span className="text-muted-foreground">{t("Nahraté")}: </span>
          <UdalostText u={k.nahrane} mena={mena} kompaktne />
        </span>
      ) : null}
      {druhy ? (
        <span className="block">
          <span className="text-muted-foreground">{t(druhy[0])}: </span>
          <UdalostText u={druhy[1]} mena={mena} kompaktne />
        </span>
      ) : null}
    </span>
  );
}
