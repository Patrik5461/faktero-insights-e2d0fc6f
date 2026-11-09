import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileDown, Settings2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KodPohody } from "./KodPohody";
import { navrhyKodovFn } from "@/lib/faktero/zauctovanie.functions";
import {
  exportSplatokDoPohodyFn,
  ulozZauctovanieKalendaraFn,
  ulozZauctovanieSplatokFn,
} from "@/lib/faktero/financovanie-pohoda.functions";
import { KV_PRIJATE } from "@/lib/faktero/kv-clenenie";
import { moznostiKv } from "@/lib/faktero/ciselnik-obrazok";
import { stiahniBajty } from "@/lib/faktero/cennik-data";
import type { MoznostKodu } from "@/lib/faktero/predkontacie";

type Navrhy = {
  predkontacie: MoznostKodu[];
  clenenia: MoznostKodu[];
  kv?: { kod: string; nazov: string }[];
};

type Kody = { predkontacia: string; clenenie: string; kv: string };

const VSTUP = "mt-1 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";

/** Tri polia kódov Pohody; prázdne pole ukáže, čo platí namiesto neho. */
function PoliaKodov({
  navrhy,
  hodnoty,
  setHodnoty,
  zaloha,
}: {
  navrhy: Navrhy | null;
  hodnoty: Kody;
  setHodnoty: (k: Kody) => void;
  /** Hodnoty kalendára — pri splátke sa ukážu ako „ako kalendár: …“. */
  zaloha?: Kody;
}) {
  const { t } = useT();
  const kvPonuka = moznostiKv(navrhy?.kv, KV_PRIJATE, hodnoty.kv);
  const ako = (v?: string) => (zaloha ? (v ? t("ako kalendár: {kod}", { kod: v }) : t("ako kalendár")) : undefined);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
      <label className="block">
        <span className="text-xs text-muted-foreground">{t("Predkontácia (Pohoda)")}</span>
        <KodPohody
          ariaLabel="Predkontácia"
          odkazNaCiselnik
          value={hodnoty.predkontacia}
          placeholder={ako(zaloha?.predkontacia) ?? t("napr. 1Lz")}
          onChange={(v) => setHodnoty({ ...hodnoty, predkontacia: v })}
          moznosti={navrhy?.predkontacie ?? []}
          className={VSTUP}
          vyber
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">{t("Členenie DPH (plnenie)")}</span>
        <KodPohody
          ariaLabel="Členenie DPH"
          value={hodnoty.clenenie}
          placeholder={ako(zaloha?.clenenie) ?? t("napr. PN")}
          onChange={(v) => setHodnoty({ ...hodnoty, clenenie: v })}
          moznosti={navrhy?.clenenia ?? []}
          className={VSTUP}
          vyber
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">{t("Členenie KV DPH")}</span>
        <select
          aria-label={t("Členenie KV DPH")}
          value={hodnoty.kv}
          onChange={(e) => setHodnoty({ ...hodnoty, kv: e.target.value })}
          className={VSTUP}
        >
          <option value="">{ako(zaloha?.kv) ?? t("bez členenia KV")}</option>
          {kvPonuka.map((k) => (
            <option key={k.kod} value={k.kod}>
              {k.kod} — {t(k.nazov)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

const z = (v: unknown) => String(v ?? "");

type Zlozka = "istina" | "urok" | "poistenie" | "poplatky";
type Rozuct = Record<Zlozka, { predkontacia: string; clenenie: string; kv: string }>;
const ZLOZKY: { kluc: Zlozka; nazov: string }[] = [
  { kluc: "istina", nazov: "Istina" },
  { kluc: "urok", nazov: "Úrok" },
  { kluc: "poistenie", nazov: "Poistenie" },
  { kluc: "poplatky", nazov: "Poplatky (zvyšok splátky)" },
];
function rozuctZoZmluvy(r: any): Rozuct {
  const o = {} as Rozuct;
  for (const { kluc } of ZLOZKY)
    o[kluc] = { predkontacia: z(r?.[kluc]?.predkontacia), clenenie: z(r?.[kluc]?.clenenie), kv: z(r?.[kluc]?.kv) };
  return o;
}
const PRAZDNE_ROZUCT = rozuctZoZmluvy(null);

/**
 * Rozúčtovanie splátky: každá zložka (istina, úrok, poistenie, poplatky) môže
 * mať vlastnú predkontáciu, členenie DPH a členenie KV. Prázdne pole = kód
 * kalendára (pri splátke zložka kalendára, inak kód kalendára).
 */
function RozuctovanieZloziek({
  navrhy,
  hodnoty,
  setHodnoty,
  kalendar,
  zlozkyKalendara,
}: {
  navrhy: Navrhy | null;
  hodnoty: Rozuct;
  setHodnoty: (r: Rozuct) => void;
  kalendar: Kody;
  /** Pri vybraných splátkach: rozúčtovanie kalendára ako nápoveda v prázdnom poli. */
  zlozkyKalendara?: Rozuct;
}) {
  const { t } = useT();
  const ako = (zlozka: Zlozka, pole: "predkontacia" | "clenenie" | "kv") => {
    const v = zlozkyKalendara?.[zlozka][pole] || kalendar[pole];
    return v ? t("ako kalendár: {kod}", { kod: v }) : t("ako kalendár");
  };
  return (
    <div className="mt-4 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold">{t("Rozúčtovanie splátky")}</h3>
      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
        {t(
          "Istina, úrok, poistenie a poplatky idú do Pohody ako samostatné položky záväzku — každá môže mať vlastnú predkontáciu, členenie DPH a členenie KV. Prázdne pole = ako kalendár.",
        )}
      </p>
      <div className="space-y-2">
        {ZLOZKY.map(({ kluc, nazov }) => (
          <div key={kluc} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[9rem_1fr_1fr_1fr] [&>*]:min-w-0">
            <span className="text-sm font-medium sm:pb-2">{t(nazov)}</span>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t("Predkontácia (Pohoda)")}</span>
              <KodPohody
                ariaLabel={`${t(nazov)} – ${t("Predkontácia (Pohoda)")}`}
                value={hodnoty[kluc].predkontacia}
                placeholder={ako(kluc, "predkontacia")}
                onChange={(v) => setHodnoty({ ...hodnoty, [kluc]: { ...hodnoty[kluc], predkontacia: v } })}
                moznosti={navrhy?.predkontacie ?? []}
                className={VSTUP}
                vyber
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t("Členenie DPH (plnenie)")}</span>
              <KodPohody
                ariaLabel={`${t(nazov)} – ${t("Členenie DPH (plnenie)")}`}
                value={hodnoty[kluc].clenenie}
                placeholder={ako(kluc, "clenenie")}
                onChange={(v) => setHodnoty({ ...hodnoty, [kluc]: { ...hodnoty[kluc], clenenie: v } })}
                moznosti={navrhy?.clenenia ?? []}
                className={VSTUP}
                vyber
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t("Členenie KV DPH")}</span>
              <select
                aria-label={`${t(nazov)} – ${t("Členenie KV DPH")}`}
                value={hodnoty[kluc].kv}
                onChange={(e) => setHodnoty({ ...hodnoty, [kluc]: { ...hodnoty[kluc], kv: e.target.value } })}
                className={VSTUP}
              >
                <option value="">{ako(kluc, "kv")}</option>
                {moznostiKv(navrhy?.kv, KV_PRIJATE, hodnoty[kluc].kv).map((k) => (
                  <option key={k.kod} value={k.kod}>
                    {k.kod} — {t(k.nazov)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Zaúčtovanie splátkového kalendára do Pohody (Ostatné záväzky).
 *
 * Kódy sa nastavia raz pre celý kalendár; vybrané splátky ich môžu prepísať.
 * Export ide za celý kalendár alebo za vybrané splátky.
 */
export function SplatkyDoPohody({
  cid,
  zmluva,
  vybrane,
  pocetSplatok,
  onZmena,
}: {
  cid: string;
  zmluva: any;
  /** Id vybraných splátok v tabuľke. */
  vybrane: string[];
  pocetSplatok: number;
  onZmena: () => Promise<void> | void;
}) {
  const { t } = useT();
  const nacitajNavrhy = useServerFn(navrhyKodovFn);
  const ulozKalendar = useServerFn(ulozZauctovanieKalendaraFn);
  const ulozSplatky = useServerFn(ulozZauctovanieSplatokFn);
  const exportuj = useServerFn(exportSplatokDoPohodyFn);

  const kalendar: Kody = {
    predkontacia: z(zmluva.pohoda_predkontacia),
    clenenie: z(zmluva.pohoda_clenenie_dph),
    kv: z(zmluva.kv_clenenie),
  };
  const [navrhy, setNavrhy] = useState<Navrhy | null>(null);
  const [kody, setKody] = useState<Kody>(kalendar);
  const [rad, setRad] = useState(z(zmluva.pohoda_rad));
  const rozuctKalendara = rozuctZoZmluvy(zmluva.pohoda_rozuctovanie);
  const [rozuct, setRozuct] = useState<Rozuct>(rozuctKalendara);
  const [busy, setBusy] = useState(false);
  const [oznacit, setOznacit] = useState(true);
  const [okno, setOkno] = useState(false);
  const [kodySplatok, setKodySplatok] = useState<Kody>({ predkontacia: "", clenenie: "", kv: "" });
  const [rozuctSplatok, setRozuctSplatok] = useState<Rozuct>(PRAZDNE_ROZUCT);

  useEffect(() => {
    let zive = true;
    // „doklad“ ponúka aj agendu Ostatné záväzky (commitment).
    nacitajNavrhy({ data: { company_id: cid, pre: "doklad" } })
      .then((n) => zive && setNavrhy(n as any))
      // Návrhy sú len ponuka — kódy sa dajú zadať aj ručne.
      .catch((e) => console.warn("Návrhy kódov pre splátky sa nenačítali", e));
    return () => {
      zive = false;
    };
  }, [cid, nacitajNavrhy]);

  const zmenene =
    kody.predkontacia !== kalendar.predkontacia ||
    kody.clenenie !== kalendar.clenenie ||
    kody.kv !== kalendar.kv ||
    rad !== z(zmluva.pohoda_rad) ||
    JSON.stringify(rozuct) !== JSON.stringify(rozuctKalendara);

  async function urob(praca: () => Promise<unknown>) {
    setBusy(true);
    try {
      await praca();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(false);
    }
  }

  const ulozKody = () =>
    urob(async () => {
      await ulozKalendar({
        data: { company_id: cid, contract_id: zmluva.id, ...kody, rad, rozuctovanie: rozuct },
      });
      toast.success(t("Zaúčtovanie kalendára uložené — platí pre všetky splátky bez vlastných kódov."));
      await onZmena();
    });

  const stiahni = (lenVybrane: boolean) =>
    urob(async () => {
      const r = await exportuj({
        data: {
          company_id: cid,
          contract_id: zmluva.id,
          ...(lenVybrane ? { installment_ids: vybrane } : {}),
          oznacit,
        },
      });
      stiahniBajty(r.nazov, r.xml, "application/xml;charset=utf-8");
      toast.success(
        r.oznacene
          ? t("Ostatné záväzky stiahnuté (splátok: {n}) a označené ako exportované.", { n: r.pocet })
          : t("Ostatné záväzky stiahnuté (splátok: {n}).", { n: r.pocet }),
      );
      for (const v of r.vyhrady) toast.warning(v);
      if (r.oznacene) await onZmena();
    });

  const ulozVybranym = () =>
    urob(async () => {
      const r = await ulozSplatky({
        data: {
          company_id: cid,
          contract_id: zmluva.id,
          installment_ids: vybrane,
          ...kodySplatok,
          rozuctovanie: rozuctSplatok,
        },
      });
      toast.success(t("Vlastné kódy uložené (splátok: {n}).", { n: r.zmenene }));
      setOkno(false);
      await onZmena();
    });

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">{t("Zaúčtovanie do Pohody")}</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
        {t(
          "Každá splátka ide do agendy Ostatné záväzky ako samostatný záväzok s položkami istina, úrok, poistenie a DPH. Kódy nastavte raz pre celý kalendár; jednotlivé splátky ich môžu prepísať.",
        )}
      </p>
      <PoliaKodov navrhy={navrhy} hodnoty={kody} setHodnoty={setKody} />
      <RozuctovanieZloziek navrhy={navrhy} hodnoty={rozuct} setHodnoty={setRozuct} kalendar={kody} />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block w-40">
          <span className="text-xs text-muted-foreground">{t("Číselný rad v Pohode")}</span>
          <input
            value={rad}
            onChange={(e) => setRad(e.target.value)}
            maxLength={10}
            placeholder={t("predvolený")}
            className={VSTUP}
          />
        </label>
        <Button variant="outline" onClick={() => void ulozKody()} disabled={busy || !zmenene}>
          {t("Uložiť pre celý kalendár")}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button onClick={() => void stiahni(false)} disabled={busy || pocetSplatok === 0}>
          <FileDown className="h-4 w-4" /> {t("Export celého kalendára")}
        </Button>
        <Button variant="outline" onClick={() => void stiahni(true)} disabled={busy || vybrane.length === 0}>
          <FileDown className="h-4 w-4" />{" "}
          {vybrane.length
            ? t("Export vybraných ({n})", { n: vybrane.length })
            : t("Export vybraných")}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setKodySplatok({ predkontacia: "", clenenie: "", kv: "" });
            setRozuctSplatok(PRAZDNE_ROZUCT);
            setOkno(true);
          }}
          disabled={busy || vybrane.length === 0}
        >
          <Settings2 className="h-4 w-4" /> {t("Vlastné kódy vybraným")}
        </Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={oznacit} onChange={(e) => setOznacit(e.target.checked)} />
          {t("Označiť ako exportované")}
        </label>
      </div>
      {zmenene && (
        <p className="mt-2 text-xs text-warning">
          {t("Kódy kalendára nie sú uložené — export použije uložené hodnoty.")}
        </p>
      )}

      <Dialog open={okno} onOpenChange={setOkno}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("Vlastné kódy vybraných splátok ({n})", { n: vybrane.length })}</DialogTitle>
            <DialogDescription>
              {t("Prázdne pole = ako kalendár. Uložením sa prepíšu doterajšie vlastné kódy vybraných splátok.")}
            </DialogDescription>
          </DialogHeader>
          <PoliaKodov navrhy={navrhy} hodnoty={kodySplatok} setHodnoty={setKodySplatok} zaloha={kalendar} />
          <RozuctovanieZloziek
            navrhy={navrhy}
            hodnoty={rozuctSplatok}
            setHodnoty={setRozuctSplatok}
            kalendar={kalendar}
            zlozkyKalendara={rozuctKalendara}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOkno(false)}>
              {t("Zrušiť")}
            </Button>
            <Button onClick={() => void ulozVybranym()} disabled={busy}>
              {t("Uložiť")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
