import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Split, Trash2 } from "lucide-react";
import { ulozRozuctovanieFn } from "@/lib/faktero/zauctovanie.functions";
import {
  bezPrazdnychRiadkov,
  chybaRozuctovania,
  dorovnaj,
  dphZoZakladu,
  nacitajRozuctovanie,
  zaciatokRozuctovania,
  zostava,
  type RiadokRozuctovania,
  type RozpisSadzby,
} from "@/lib/faktero/rozuctovanie";
import { KodPohody } from "./KodPohody";
import {
  BunkaPolozky,
  PodriadokPolozky,
  POLE_POLOZKY,
  PolozkyHlavicka,
  PolozkyKontajner,
  RiadokPolozky,
  VYBER_POLOZKY,
} from "./PolozkyResponzivne";
import { KV_PRIJATE } from "@/lib/faktero/kv-clenenie";
import type { Navrhy } from "./ZauctovaniePanel";
import { formatujCislo } from "@/lib/faktero/mena";
import { useT } from "@/lib/i18n/useT";
import { zoradSadzby } from "@/lib/faktero/vat-rates";

const f2 = (n: number) => formatujCislo(n, 2);

/**
 * Rozúčtovanie dokladu na viac riadkov — každý s vlastnou predkontáciou,
 * členením DPH a sumou. Do Pohody ide ako položky s vlastným zaúčtovaním,
 * hlavička dostane „Rozúčtovať". Pri vystavenej faktúre má riadok aj
 * stredisko a činnosť (`sStrediskom`).
 */
export function RozuctovaniePanel({
  companyId,
  druh,
  id,
  rozpis,
  ulozene,
  navrhy,
  kody,
  zamknute,
  onZmena,
  kvMoznosti = KV_PRIJATE,
  sStrediskom,
  prekazka,
}: {
  companyId: string;
  druh: "prijata" | "doklad" | "vystavena";
  id: string;
  rozpis: RozpisSadzby[];
  ulozene: unknown;
  navrhy: Navrhy | null;
  /** Kódy dokladu — nimi sa predvyplní prvý riadok (stredisko a činnosť len ako nápoveda). */
  kody: {
    predkontacia: string | null;
    clenenie: string | null;
    stredisko?: string | null;
    cinnost?: string | null;
  };
  zamknute?: boolean;
  onZmena?: () => void;
  /** Členenia KV na výber (vystavená faktúra má vlastné). */
  kvMoznosti?: readonly { kod: string; nazov: string }[];
  /** Stĺpce Stredisko a Činnosť (vystavená faktúra). */
  sStrediskom?: boolean;
  /** Prečo sa doklad rozúčtovať sumou nedá — namiesto tlačidla sa ukáže dôvod. */
  prekazka?: string | null;
}) {
  const { t } = useT();
  const uloz = useServerFn(ulozRozuctovanieFn);
  const povodne = useMemo(() => nacitajRozuctovanie(ulozene), [ulozene]);
  const [riadky, setRiadky] = useState<RiadokRozuctovania[]>(povodne);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRiadky(povodne), [povodne]);

  const sadzby = useMemo(
    () => zoradSadzby([...new Set(rozpis.map((x) => Number(x.sadzba) || 0))]),
    [rozpis],
  );
  const zvysok = zostava(riadky, rozpis);
  // Nevyplnený riadok (bez predkontácie, s nulovou sumou) sa neuloží ani nekontroluje.
  const naUlozenie = bezPrazdnychRiadkov(riadky);
  const chyba = chybaRozuctovania(naUlozenie, rozpis);
  const zmenene = JSON.stringify(naUlozenie) !== JSON.stringify(povodne);

  if (!rozpis.length) return null;

  async function ulozit(nove: RiadokRozuctovania[]) {
    setBusy(true);
    try {
      await uloz({ data: { company_id: companyId, druh, id, riadky: nove as any } });
      toast.success(
        nove.length
          ? t("Rozúčtované na {n} riadky", { n: nove.length })
          : t("Rozúčtovanie zrušené"),
      );
      onZmena?.();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa uložiť"));
    } finally {
      setBusy(false);
    }
  }

  const zmen = (i: number, z: Partial<RiadokRozuctovania>) =>
    setRiadky((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const n = { ...r, ...z };
        // Zmena základu alebo sadzby prepočíta DPH; ručne zadaná DPH ostane.
        if (("zaklad" in z || "sadzba" in z) && !("dph" in z))
          n.dph = dphZoZakladu(n.zaklad, n.sadzba);
        return n;
      }),
    );

  function pridaj() {
    const z = zvysok.find((x) => Math.abs(x.zaklad) >= 0.005 || Math.abs(x.dph) >= 0.005);
    setRiadky((rs) => [
      ...rs,
      {
        predkontacia: "",
        clenenie: kody.clenenie ?? "",
        sadzba: z?.sadzba ?? sadzby[0] ?? 0,
        zaklad: z ? Math.max(z.zaklad, 0) : 0,
        dph: z ? Math.max(z.dph, 0) : 0,
        text: "",
      },
    ]);
  }

  if (!riadky.length && prekazka) {
    return (
      <p className="mt-3 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        <Split className="mr-1 inline h-3.5 w-3.5" />
        {t(prekazka)}
      </p>
    );
  }

  if (!riadky.length) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-border p-3 text-sm">
        <button
          type="button"
          disabled={zamknute}
          onClick={() =>
            setRiadky(
              zaciatokRozuctovania(rozpis, {
                predkontacia: kody.predkontacia,
                clenenie: kody.clenenie,
              }),
            )
          }
          className="inline-flex items-center gap-1.5 text-primary hover:underline disabled:opacity-50"
        >
          <Split className="h-4 w-4" /> {t("Rozúčtovať na viac predkontácií")}
        </button>
        <span className="ml-2 text-xs text-muted-foreground">
          {t(
            "napr. časť materiál, časť réžia — každý riadok s vlastnou predkontáciou a členením DPH",
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 min-w-0 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Split className="h-4 w-4" /> {t("Rozúčtovanie")}
        </div>
        <div className="min-w-0 text-xs text-muted-foreground">
          {t("Doklad:")}{" "}
          {rozpis
            .map((r) =>
              t("{sadzba} % — základ {zaklad}, DPH {dph}", {
                sadzba: r.sadzba,
                zaklad: f2(r.zaklad),
                dph: f2(r.dph),
              }),
            )
            .join(" · ")}
        </div>
      </div>
      {/*
        Úzky bočný panel (~360 px): riadok je karta — kódy, potom sadzba a sumy,
        potom KV, stredisko, činnosť, text a akcie. Široko (od 560 px kontajnera)
        je hlavný riadok Predkontácia | Členenie | Sadzba | Základ | DPH a pod ním
        ostatné polia s vlastnými popismi. Nič sa neposúva vodorovne.
      */}
      <PolozkyKontajner
        className="mt-2 text-sm"
        stlpce="minmax(0,1fr) minmax(0,1fr) 5.25rem 6.5rem 5.75rem"
      >
        <PolozkyHlavicka
          stlpce={[
            { text: t("Predkontácia") },
            { text: t("Členenie DPH") },
            { text: t("Sadzba") },
            { text: t("Základ"), vpravo: true },
            { text: t("DPH"), vpravo: true },
          ]}
        />
        {riadky.map((r, i) => (
          <RiadokPolozky key={i} className="items-start">
            <BunkaPolozky popis={t("Predkontácia")} uzky={6}>
              <KodPohody
                ariaLabel={t("Predkontácia riadku {n}", { n: i + 1 })}
                value={r.predkontacia ?? ""}
                onChange={(v) => zmen(i, { predkontacia: v })}
                moznosti={navrhy?.predkontacie ?? []}
                placeholder={kody.predkontacia ?? ""}
                className={POLE_POLOZKY}
                vyber
              />
            </BunkaPolozky>
            <BunkaPolozky popis={t("Členenie DPH")} uzky={6}>
              <KodPohody
                ariaLabel={t("Členenie DPH riadku {n}", { n: i + 1 })}
                value={r.clenenie ?? ""}
                onChange={(v) => zmen(i, { clenenie: v })}
                moznosti={navrhy?.clenenia ?? []}
                vyber
                placeholder={kody.clenenie ?? ""}
                className={POLE_POLOZKY}
              />
            </BunkaPolozky>
            <BunkaPolozky popis={t("Sadzba")} uzky={3}>
              <select
                value={r.sadzba}
                onChange={(e) => zmen(i, { sadzba: Number(e.target.value) })}
                className={VYBER_POLOZKY}
                aria-label={t("Sadzba riadku {n}", { n: i + 1 })}
              >
                {sadzby.map((s) => (
                  <option key={s} value={s}>
                    {s} %
                  </option>
                ))}
              </select>
            </BunkaPolozky>
            <BunkaPolozky popis={t("Základ")} uzky={5}>
              <input
                type="number"
                step="0.01"
                value={r.zaklad}
                onChange={(e) => zmen(i, { zaklad: Number(e.target.value) })}
                className={`${POLE_POLOZKY} text-right tabular-nums`}
                aria-label={t("Základ riadku {n}", { n: i + 1 })}
              />
            </BunkaPolozky>
            <BunkaPolozky popis={t("DPH")} uzky={4}>
              <input
                type="number"
                step="0.01"
                value={r.dph}
                onChange={(e) => zmen(i, { dph: Number(e.target.value) })}
                className={`${POLE_POLOZKY} text-right tabular-nums`}
                aria-label={t("DPH riadku {n}", { n: i + 1 })}
              />
            </BunkaPolozky>
            <PodriadokPolozky className="items-start">
              <BunkaPolozky
                popis={t("KV DPH")}
                uzky={sStrediskom ? 4 : 5}
                siroky={sStrediskom ? 2 : 3}
                vzdyPopis
              >
                <select
                  value={r.kv ?? ""}
                  onChange={(e) => zmen(i, { kv: e.target.value || null })}
                  className={VYBER_POLOZKY}
                  aria-label={t("Členenie KV riadku {n}", { n: i + 1 })}
                >
                  <option value="">{t("z dokladu")}</option>
                  {kvMoznosti.map((k) => (
                    <option key={k.kod} value={k.kod} title={t(k.nazov)}>
                      {k.kod === "X" ? t("nezahŕňať") : k.kod}
                    </option>
                  ))}
                </select>
              </BunkaPolozky>
              {sStrediskom ? (
                <>
                  <BunkaPolozky popis={t("Stredisko")} uzky={4} siroky={2} vzdyPopis>
                    <KodPohody
                      ariaLabel={t("Stredisko riadku {n}", { n: i + 1 })}
                      value={r.stredisko ?? ""}
                      onChange={(v) => zmen(i, { stredisko: v })}
                      moznosti={navrhy?.strediska ?? []}
                      placeholder={kody.stredisko ?? ""}
                      className={POLE_POLOZKY}
                      vyber
                    />
                  </BunkaPolozky>
                  <BunkaPolozky popis={t("Činnosť")} uzky={4} siroky={2} vzdyPopis>
                    <KodPohody
                      ariaLabel={t("Činnosť riadku {n}", { n: i + 1 })}
                      value={r.cinnost ?? ""}
                      onChange={(v) => zmen(i, { cinnost: v })}
                      moznosti={navrhy?.cinnosti ?? []}
                      placeholder={kody.cinnost ?? ""}
                      className={POLE_POLOZKY}
                      vyber
                    />
                  </BunkaPolozky>
                </>
              ) : null}
              <BunkaPolozky
                popis={t("Text")}
                uzky={sStrediskom ? 12 : 7}
                siroky={sStrediskom ? 3 : 6}
                vzdyPopis
              >
                <input
                  value={r.text ?? ""}
                  onChange={(e) => zmen(i, { text: e.target.value })}
                  placeholder={t("nepovinné")}
                  className={POLE_POLOZKY}
                  aria-label={t("Text riadku {n}", { n: i + 1 })}
                />
              </BunkaPolozky>
              <BunkaPolozky
                popis={t("Akcie")}
                skrytyPopis
                uzky={12}
                siroky={3}
                className="flex-row items-center justify-end gap-1 self-end"
              >
                <button
                  type="button"
                  title={t("Doplniť sem zvyšok sadzby")}
                  onClick={() => setRiadky((rs) => dorovnaj(rs, rozpis, i))}
                  className="h-8 whitespace-nowrap rounded px-1.5 text-xs text-muted-foreground hover:bg-secondary"
                >
                  {t("= zvyšok")}
                </button>
                <button
                  type="button"
                  onClick={() => setRiadky((rs) => rs.filter((_, j) => j !== i))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-destructive"
                  aria-label={t("Zmazať riadok {n}", { n: i + 1 })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </BunkaPolozky>
            </PodriadokPolozky>
          </RiadokPolozky>
        ))}
      </PolozkyKontajner>
      <button
        type="button"
        onClick={pridaj}
        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> {t("Pridať riadok")}
      </button>

      <p className={`mt-2 text-xs font-medium ${chyba ? "dk-text-pozor" : "dk-text-uspech"}`}>
        {chyba
          ? t(chyba)
          : t(
              "Súčty sedia s dokladom. Do Pohody pôjde ako položky s vlastnou predkontáciou, hlavička „Rozúčtovať“.",
            )}
      </p>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {povodne.length > 0 && (
          <button
            type="button"
            disabled={busy || zamknute}
            onClick={() => ulozit([])}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {t("Zrušiť rozúčtovanie")}
          </button>
        )}
        {!povodne.length && (
          <button
            type="button"
            onClick={() => setRiadky([])}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            {t("Zrušiť")}
          </button>
        )}
        <button
          type="button"
          disabled={busy || zamknute || !!chyba || !zmenene}
          onClick={() => ulozit(naUlozenie)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("Uložiť rozúčtovanie")}
        </button>
      </div>
    </div>
  );
}
