import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, GitCompare, Loader2, SendHorizontal, ShieldCheck } from "lucide-react";
import {
  rozdielyOprotiPohodeFn,
  zastaveneDokladyFn,
} from "@/lib/faktero/pohoda-kontrola.functions";
import { NAZVY_POLI } from "@/lib/faktero/pohoda-rozdiely";
import { usePoslatOpravuDoPohody, type DruhOpravy } from "./PoslatOpravuDoPohody";
import { tvarNeodovzdanych } from "./NeodovzdaneDoklady";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";

type Zastaveny = { druh: DruhOpravy; id: string; cislo: string; dovod: string };
type Rozdiel = {
  druh: DruhOpravy;
  id: string;
  cislo: string;
  partner: string | null;
  odoslane: string | null;
  zmazany: boolean;
  dovod: string | null;
  rozdiely: { pole: string; vPohode: string; teraz: string }[];
};

const DRUH: Record<DruhOpravy, string> = {
  faktura: "Vydaná faktúra",
  prijata: "Prijatá faktúra",
  doklad: "Bloček",
};

/** Odkaz na detail dokladu podľa druhu. */
function OdkazDokladu({
  druh,
  id,
  children,
}: {
  druh: DruhOpravy;
  id: string;
  children: React.ReactNode;
}) {
  const trieda = "font-medium text-primary hover:underline";
  if (druh === "faktura")
    return (
      <Link to="/faktury/$id" params={{ id }} className={trieda}>
        {children}
      </Link>
    );
  if (druh === "prijata")
    return (
      <Link to="/prijate-faktury/$id" params={{ id }} className={trieda}>
        {children}
      </Link>
    );
  return (
    <Link to="/doklady/novy" search={{ id } as any} className={trieda}>
      {children}
    </Link>
  );
}

/**
 * Exporty → kontrola pred odovzdaním a rozdiely oproti Pohode.
 *
 * Kontrola ukáže doklady, ktoré ručný export, balík ani konektor do Pohody
 * nepustia (s dôvodom a cestou k náprave). Rozdiely porovnajú posledné
 * odoslané XML s dnešným a pri zmenenom doklade ponúknu „Poslať opravu“.
 */
export function KontrolaPohody({ companyId }: { companyId: string }) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const nacitajZastavene = useServerFn(zastaveneDokladyFn);
  const nacitajRozdiely = useServerFn(rozdielyOprotiPohodeFn);
  const poslatOpravu = usePoslatOpravuDoPohody();
  const [zastavene, setZastavene] = useState<Zastaveny[] | null>(null);
  const [rozdiely, setRozdiely] = useState<{
    doklady: Rozdiel[];
    skontrolovanych: number;
    bezXml: number;
  } | null>(null);
  const [busy, setBusy] = useState<"" | "kontrola" | "rozdiely">("");

  async function skontroluj() {
    setBusy("kontrola");
    try {
      const r = await nacitajZastavene({ data: { company_id: companyId } });
      setZastavene(r.doklady as Zastaveny[]);
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy("");
    }
  }
  async function porovnaj() {
    setBusy("rozdiely");
    try {
      const r = await nacitajRozdiely({ data: { company_id: companyId } });
      setRozdiely(r as any);
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy("");
    }
  }

  const pokladna = zastavene?.some((z) => z.dovod.includes("bez pokladne"));
  const clenenie = zastavene?.some((z) => z.dovod.includes("Predkontácie"));

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      <section className="min-w-0 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" />{" "}
            {t("Kontrola pred odovzdaním do Pohody")}
          </h2>
          <button
            onClick={skontroluj}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {busy === "kontrola" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("Skontrolovať")}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Doklady, ktoré by Pohoda zaúčtovala zle, export, balík ani konektor nepošlú — kým ich neopravíte, ostanú neodovzdané.",
          )}
        </p>
        {zastavene && !zastavene.length && (
          <p className="mt-3 text-sm text-emerald-700">
            {t("Všetko neodovzdané prejde kontrolou.")}
          </p>
        )}
        {zastavene && zastavene.length > 0 && (
          <>
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              {t(tvarNeodovzdanych(zastavene.length), { n: zastavene.length })}
            </p>
            <ul className="mt-2 max-h-80 divide-y divide-border overflow-y-auto text-sm">
              {zastavene.map((z) => (
                <li key={`${z.druh}-${z.id}`} className="py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs text-muted-foreground">{t(DRUH[z.druh])}</span>
                    <OdkazDokladu druh={z.druh} id={z.id}>
                      {z.cislo || t("bez čísla")}
                    </OdkazDokladu>
                  </div>
                  <div className="min-w-0 break-words text-muted-foreground">
                    {z.dovod.split(" — ").slice(1).join(" — ") || z.dovod}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {pokladna && (
                <Link
                  to="/uctovnictvo/pohoda"
                  className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
                >
                  {t("Nastaviť pokladňu pre Pohodu")}
                </Link>
              )}
              {clenenie && (
                <Link
                  to="/uctovnictvo/predkontacie"
                  className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
                >
                  {t("Nastaviť členenie pre prenesenie")}
                </Link>
              )}
            </div>
          </>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <GitCompare className="h-4 w-4 text-primary" /> {t("Rozdiely oproti Pohode")}
          </h2>
          <button
            onClick={porovnaj}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {busy === "rozdiely" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("Porovnať")}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Porovná posledné odoslané XML odovzdaných dokladov s tým, čo by z nich odišlo dnes. Zmenený doklad pošlite znova cez „Poslať opravu“.",
          )}
        </p>
        {rozdiely && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("Porovnaných: {n}", { n: rozdiely.skontrolovanych })}
            {rozdiely.bezXml ? ` · ${t("bez uloženého XML: {n}", { n: rozdiely.bezXml })}` : ""}
          </p>
        )}
        {rozdiely && !rozdiely.doklady.length && (
          <p className="mt-2 text-sm text-emerald-700">
            {t("V Pohode je to isté, čo vo Fakteri.")}
          </p>
        )}
        {rozdiely && rozdiely.doklady.length > 0 && (
          <ul className="mt-2 max-h-96 divide-y divide-border overflow-y-auto text-sm">
            {rozdiely.doklady.map((d) => (
              <li key={`${d.druh}-${d.id}`} className="py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs text-muted-foreground">{t(DRUH[d.druh])}</span>
                  <OdkazDokladu druh={d.druh} id={d.id}>
                    {d.cislo || t("bez čísla")}
                  </OdkazDokladu>
                  <span className="min-w-0 truncate text-muted-foreground">{d.partner ?? ""}</span>
                  {d.odoslane ? (
                    <span className="text-xs text-muted-foreground">
                      {t("odoslané {kedy}", {
                        kedy: new Date(d.odoslane).toLocaleDateString(loc),
                      })}
                    </span>
                  ) : null}
                  {!d.zmazany && (
                    <button
                      onClick={async () => {
                        if (await poslatOpravu(d.druh, companyId, d.id)) void porovnaj();
                      }}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                    >
                      <SendHorizontal className="h-3.5 w-3.5" /> {t("Poslať opravu")}
                    </button>
                  )}
                </div>
                {d.zmazany && (
                  <div className="mt-1 text-amber-800">
                    {t("Vo Fakteri je zmazaný, v Pohode ostal — zmažte ho aj tam.")}
                  </div>
                )}
                {d.dovod && (
                  <div className="mt-1 text-amber-800">
                    {t("Dnes by do Pohody neprešiel:")} {d.dovod.split(" — ").slice(1).join(" — ")}
                  </div>
                )}
                {d.rozdiely.length > 0 && (
                  <div className="mt-1 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left text-muted-foreground">
                        <tr>
                          <th className="py-0.5 pr-3 font-normal">{t("Pole")}</th>
                          <th className="py-0.5 pr-3 font-normal">{t("V Pohode")}</th>
                          <th className="py-0.5 font-normal">{t("Teraz")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.rozdiely.map((r) => (
                          <tr key={r.pole}>
                            <td className="py-0.5 pr-3">{t(NAZVY_POLI[r.pole] ?? r.pole)}</td>
                            <td className="py-0.5 pr-3 tabular-nums">{r.vPohode || "—"}</td>
                            <td className="py-0.5 tabular-nums">{r.teraz || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
