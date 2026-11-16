import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Clock, GitCompare, Loader2, PlugZap, SendHorizontal, ShieldCheck } from "lucide-react";
import {
  potvrdZmazanieVPohodeFn,
  rozdielyOprotiPohodeFn,
  zastaveneDokladyFn,
} from "@/lib/faktero/pohoda-kontrola.functions";
import { potvrd } from "@/lib/potvrdenie";
import { NAZVY_POLI } from "@/lib/faktero/pohoda-rozdiely";
import { usePoslatOpravuDoPohody, type DruhOpravy } from "./PoslatOpravuDoPohody";
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

/** Druhy položiek konektora (aj číselníky a pokladňa). */
const DRUH_KONEKTORA: Record<string, string> = {
  ...DRUH,
  pokladna: "Pokladničný doklad",
  adresar: "Adresár",
  sklad: "Skladová karta",
  zakazka: "Zákazka",
  pohyb: "Skladový pohyb",
  banka: "Bankový pohyb",
  storno: "Storno faktúry",
  storno_opravy: "Storno pôvodného dokladu",
};

type StavKonektora = {
  pouziva: boolean;
  cakajuce: { id: string; kedy: string; poloziek: number; vyprsana: boolean }[];
  odmietnute: { druh: string; id: string; cislo: string; chyba: string; kedy: string | null; vyprsane: boolean }[];
  opravy: {
    druh: "faktura" | "prijata" | "doklad" | "pokladna";
    id: string;
    cislo: string;
    verzia: number;
    dovod: string;
    povodneCislo: string | null;
    potvrditZmazanie: boolean;
  }[];
  opravyCakaju: string[];
  starsie: { od: string; faktur: number; prijatych: number; dokladov: number; pokladnicnych: number };
  banka?: { cakaju: number; naCeste: number; chyba: number; bezSkratky: string[] } | null;
};

/** Detail dokladu konektora — pokladňa a číselníky nemajú vlastný detail, len text. */
function DokladKonektora({ druh, id, cislo }: { druh: string; id: string; cislo: string }) {
  const { t } = useT();
  if (druh === "faktura" || druh === "prijata" || druh === "doklad")
    return (
      <OdkazDokladu druh={druh} id={id}>
        {cislo || t("bez čísla")}
      </OdkazDokladu>
    );
  return <span className="cislo-dokladu font-medium">{cislo || t("bez čísla")}</span>;
}

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
  const trieda = "cislo-dokladu font-medium text-primary hover:underline";
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
 * Kontrola ukáže doklady so závažnou chybou (s dôvodom a cestou k náprave):
 * konektor ich do Pohody nepustí, ručný export a balík na ne upozornia a po
 * potvrdení ich pustia (Patrik 13. 11. 2026). Rozdiely porovnajú posledné
 * odoslané XML s dnešným a pri zmenenom doklade ponúknu „Poslať opravu“.
 */
export function KontrolaPohody({ companyId }: { companyId: string }) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const nacitajZastavene = useServerFn(zastaveneDokladyFn);
  const nacitajRozdiely = useServerFn(rozdielyOprotiPohodeFn);
  const poslatOpravu = usePoslatOpravuDoPohody();
  const potvrdZmazanie = useServerFn(potvrdZmazanieVPohodeFn);
  const [konektor, setKonektor] = useState<StavKonektora | null>(null);
  const [zastavene, setZastavene] = useState<Zastaveny[] | null>(null);
  const [varovania, setVarovania] = useState<Zastaveny[]>([]);
  const [rozdiely, setRozdiely] = useState<{
    doklady: Rozdiel[];
    skontrolovanych: number;
    bezXml: number;
  } | null>(null);
  const [busy, setBusy] = useState<"" | "kontrola" | "rozdiely">("");

  async function skontroluj(): Promise<void> {
    setBusy("kontrola");
    try {
      const r = await nacitajZastavene({ data: { company_id: companyId } });
      setZastavene(r.doklady as Zastaveny[]);
      setVarovania(((r as any).varovania ?? []) as Zastaveny[]);
      setKonektor(((r as any).konektor ?? null) as StavKonektora | null);
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

  async function zmazaneVPohode(o: StavKonektora["opravy"][number]) {
    const ok = await potvrd(
      o.povodneCislo
        ? t("Pôvodný doklad č. {cislo} ste v POHODE naozaj zmazali? Konektor potom pošle opravu ako nový doklad — keby tam pôvodný ostal, bude v POHODE dvakrát.", { cislo: o.povodneCislo })
        : t("Pôvodný doklad ste v POHODE naozaj zmazali? Konektor potom pošle opravu ako nový doklad — keby tam pôvodný ostal, bude v POHODE dvakrát."),
      { potvrdit: t("Áno, je zmazaný"), zrusit: t("Zrušiť"), nebezpecne: false },
    );
    if (!ok) return;
    try {
      await potvrdZmazanie({ data: { company_id: companyId, druh: o.druh, id: o.id } });
      toast.success(t("Konektor opravu pošle pri najbližšom behu."));
      void skontroluj();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    }
  }

  const starsieSpolu = konektor
    ? konektor.starsie.faktur + konektor.starsie.prijatych + konektor.starsie.dokladov + konektor.starsie.pokladnicnych
    : 0;
  const konektorMaCoUkazat =
    !!konektor &&
    konektor.pouziva &&
    (konektor.cakajuce.length > 0 ||
      konektor.odmietnute.length > 0 ||
      konektor.opravy.length > 0 ||
      konektor.opravyCakaju.length > 0 ||
      starsieSpolu > 0 ||
      !!konektor.banka?.cakaju ||
      !!konektor.banka?.naCeste ||
      !!konektor.banka?.bezSkratky.length);

  const pokladna = zastavene?.some((z) => z.dovod.includes("bez pokladne"));
  const clenenie = zastavene?.some((z) => z.dovod.includes("Predkontácie"));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" />{" "}
            {t("Kontrola pred odovzdaním do Pohody")}
          </h2>
          <button
            onClick={skontroluj}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            {busy === "kontrola" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("Skontrolovať")}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Doklady, ktoré by Pohoda mohla zaúčtovať zle. Ručný export a balík vás na ne upozornia a po potvrdení ich pustia; automatický konektor ich nepošle, kým ich neopravíte.",
          )}
        </p>
        {zastavene && !zastavene.length && (
          <p className="mt-3 text-sm font-medium text-primary">
            {t("Všetko neodovzdané prejde kontrolou.")}
          </p>
        )}
        {varovania.length > 0 && (
          <div className="mt-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
              {t("Odíde, ale skontrolujte v Pohode: {n}", { n: varovania.length })}
            </p>
            <ul className="mt-2 max-h-60 divide-y divide-border overflow-y-auto text-sm">
              {varovania.map((z) => (
                <li key={`v-${z.druh}-${z.id}`} className="py-2">
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
          </div>
        )}
        {zastavene && zastavene.length > 0 && (
          <>
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t("So závažnou chybou: {n}", { n: zastavene.length })}
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
                  className="rounded-md border border-input bg-background px-3 py-1.5 font-medium hover:bg-secondary"
                >
                  {t("Nastaviť pokladňu pre Pohodu")}
                </Link>
              )}
              {clenenie && (
                <Link
                  to="/uctovnictvo/predkontacie"
                  className="rounded-md border border-input bg-background px-3 py-1.5 font-medium hover:bg-secondary"
                >
                  {t("Nastaviť členenie pre prenesenie")}
                </Link>
              )}
            </div>
          </>
        )}
        {konektor?.pouziva && !konektorMaCoUkazat && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <PlugZap className="h-4 w-4 shrink-0 text-primary" />
            {t("Konektor: všetko odoslané POHODA potvrdila.")}
          </p>
        )}
        {konektorMaCoUkazat && konektor && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <PlugZap className="h-4 w-4 shrink-0 text-primary" /> {t("Konektor do Pohody")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "Doklad je odovzdaný až vtedy, keď jeho import POHODA potvrdí. Čo POHODA odmietla alebo nepotvrdila, ostáva vo Fakteri neodovzdané a konektor to pošle znova.",
              )}
            </p>
            {konektor.cakajuce.map((c) => (
              <p
                key={c.id}
                className={`mt-2 flex items-center gap-1.5 text-sm ${c.vyprsana ? "text-warning" : "text-foreground"}`}
              >
                <Clock className="h-4 w-4 shrink-0" />
                {c.vyprsana
                  ? t("Dávka z {kedy} ({n} položiek) — POHODA ju nepotvrdila; pri ďalšom behu konektora pôjde znova.", {
                      kedy: new Date(c.kedy).toLocaleString(loc),
                      n: c.poloziek,
                    })
                  : t("Dávka z {kedy} ({n} položiek) čaká na odpoveď POHODY.", {
                      kedy: new Date(c.kedy).toLocaleString(loc),
                      n: c.poloziek,
                    })}
              </p>
            ))}
            {konektor.opravy.length > 0 && (
              <div className="mt-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {t("Opravy, ktoré konektor drží: {n}", { n: konektor.opravy.length })}
                </p>
                <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto text-sm">
                  {konektor.opravy.map((o) => (
                    <li key={`o-${o.druh}-${o.id}`} className="py-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs text-muted-foreground">{t(DRUH_KONEKTORA[o.druh] ?? o.druh)}</span>
                        <DokladKonektora druh={o.druh} id={o.id} cislo={o.cislo} />
                        {o.potvrditZmazanie && (
                          <button
                            onClick={() => void zmazaneVPohode(o)}
                            className="ml-auto inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-secondary"
                          >
                            {t("Pôvodný je v POHODE zmazaný")}
                          </button>
                        )}
                      </div>
                      <div className="min-w-0 break-words text-muted-foreground">
                        {o.dovod.split(" — ").slice(1).join(" — ") || o.dovod}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {konektor.opravyCakaju.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {konektor.opravyCakaju.map((v) => (
                  <li key={v} className="min-w-0 break-words">
                    {v}
                  </li>
                ))}
              </ul>
            )}
            {konektor.odmietnute.length > 0 && (
              <div className="mt-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {t("POHODA neprijala: {n}", { n: konektor.odmietnute.length })}
                </p>
                <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto text-sm">
                  {konektor.odmietnute.map((o) => (
                    <li key={`r-${o.druh}-${o.id}`} className="py-2">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-xs text-muted-foreground">
                          {t(DRUH_KONEKTORA[o.druh] ?? o.druh)}
                        </span>
                        <DokladKonektora druh={o.druh} id={o.id} cislo={o.cislo} />
                        {o.kedy && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(o.kedy).toLocaleDateString(loc)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 break-words text-muted-foreground">
                        {o.vyprsane ? t("Nepotvrdené") + " — " : ""}
                        {o.chyba}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {konektor.banka && (konektor.banka.cakaju > 0 || konektor.banka.naCeste > 0 || konektor.banka.chyba > 0) && (
              <p className="mt-3 text-sm text-foreground">
                {t("Bankové pohyby: {c} čaká na odoslanie, {n} na ceste, {e} POHODA neprijala.", {
                  c: konektor.banka.cakaju,
                  n: konektor.banka.naCeste,
                  e: konektor.banka.chyba,
                })}
              </p>
            )}
            {konektor.banka?.bezSkratky.map((h) => (
              <p key={h} className="mt-2 flex items-start gap-1.5 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  {t(
                    "Účet {u} nemá skratku v Pohode — jeho pohyby konektor ani balík neposielajú. Doplňte ju vo Firma → Bankové účty.",
                    { u: h },
                  )}
                </span>
              </p>
            ))}
            {starsieSpolu > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t(
                  "Neodovzdané doklady s dátumom pred {od}: {n} (faktúry {f}, prijaté {p}, bločky {d}, pokladňa {k}). Konektor ich neposiela — sú staršie ako jeho spustenie; odovzdajte ich balíkom alebo ručným exportom.",
                  {
                    od: new Date(konektor.starsie.od).toLocaleDateString(loc),
                    n: starsieSpolu,
                    f: konektor.starsie.faktur,
                    p: konektor.starsie.prijatych,
                    d: konektor.starsie.dokladov,
                    k: konektor.starsie.pokladnicnych,
                  },
                )}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <GitCompare className="h-4 w-4 text-primary" /> {t("Rozdiely oproti Pohode")}
          </h2>
          <button
            onClick={porovnaj}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
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
          <p className="mt-2 text-sm font-medium text-primary">
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
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-secondary"
                    >
                      <SendHorizontal className="h-3.5 w-3.5" /> {t("Poslať opravu")}
                    </button>
                  )}
                </div>
                {d.zmazany && (
                  <div className="mt-1 text-warning">
                    {t("Vo Fakteri je zmazaný, v Pohode ostal — zmažte ho aj tam.")}
                  </div>
                )}
                {d.dovod && (
                  <div className="mt-1 text-warning">
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
