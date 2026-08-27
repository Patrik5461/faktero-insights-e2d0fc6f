import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, User, UserPlus } from "lucide-react";
import { useOperacia } from "@/lib/mobile/server-most";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { sadzbyKrajiny } from "@/lib/faktero/vat-rates";
import { friendlyError } from "@/lib/faktero/plan-error";
import { MobilObrazovka, Pracujem, HlavneTlacidlo } from "./MobilChrome";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import {
  RiadokPolozky,
  NovyOdberatel,
  prazdnyRiadok,
  cislo,
  suma,
  dnes,
  oDni,
  type Riadok,
  type Odberatel,
} from "./NovaFaktura";

/**
 * Nová cenová ponuka v telefóne.
 *
 * Položky sa editujú **tým istým komponentom ako na faktúre** (`RiadokPolozky`)
 * — keby mala ponuka vlastný, obe by sa časom rozišli v zaokrúhľovaní aj v
 * ponuke sadzieb.
 *
 * Ponuka je oproti faktúre jednoduchšia zámerne: nie je to daňový doklad, tak
 * nemá splatnosť ani spôsob úhrady a nedá sa odložiť na neskôr bez signálu —
 * číslo vydáva server. Namiesto splatnosti má platnosť do.
 */

type Podkladove = {
  firma: { id: string; name: string; platcaDph: boolean; mena: string };
  odberatelia: Odberatel[];
};

export function NovaPonuka({
  firma,
  onSpat,
  onHotovo,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
  onHotovo: () => void;
}) {
  const { t } = usePreklad();
  const nacitajPodklady = useOperacia("faktura-podklady");
  const vystav = useOperacia("ponuka-vystav");
  const krajina = useKrajinaDane();

  const [podklady, setPodklady] = useState<Podkladove | null>(null);
  const [odberatel, setOdberatel] = useState<Odberatel | null>(null);
  const [hladanie, setHladanie] = useState("");
  const [riadky, setRiadky] = useState<Riadok[]>([]);
  const [vystavena, setVystavena] = useState(dnes());
  const [platiDo, setPlatiDo] = useState(oDni(dnes(), 30));
  const [poznamka, setPoznamka] = useState("");
  const [ukladam, setUkladam] = useState(false);
  const [pridavam, setPridavam] = useState(false);

  const platca = podklady?.firma.platcaDph ?? false;
  const mena = podklady?.firma.mena ?? "EUR";
  const zakladnaSadzba = platca ? sadzbyKrajiny(krajina)[0] : 0;

  useEffect(() => {
    nacitajPodklady({ data: { company_id: firma.id } })
      .then((r: any) => {
        setPodklady(r);
        setRiadky([prazdnyRiadok(r?.firma?.platcaDph ? sadzbyKrajiny(krajina)[0] : 0)]);
      })
      .catch((e) => toast.error((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma.id]);

  const sucty = useMemo(() => {
    let zaklad = 0;
    let dan = 0;
    for (const r of riadky) {
      const s = +(cislo(r.quantity) * cislo(r.unit_price)).toFixed(2);
      zaklad += s;
      dan += +((s * r.vat_rate) / 100).toFixed(2);
    }
    return { zaklad: +zaklad.toFixed(2), dan: +dan.toFixed(2), spolu: +(zaklad + dan).toFixed(2) };
  }, [riadky]);

  /*
    Bez napísaného textu sa nikto nevypisuje. Zoznam „prvých pár" nič nehovorí
    — kto má odberateľov desiatky, aj tak hľadá, a komu sa náhodou trafí, ten
    si vyberie zle. Ponuka sa robí u zákazníka, ktorého meno človek pozná.
  */
  const najdene = useMemo(() => {
    const q = hladanie.trim().toLowerCase();
    if (!q) return [];
    const zoznam = podklady?.odberatelia ?? [];
    return zoznam.filter((o) => `${o.name} ${o.ico ?? ""}`.toLowerCase().includes(q)).slice(0, 8);
  }, [hladanie, podklady]);

  async function uloz() {
    if (!odberatel) return toast.error(t("ponuky.vyberteOdberatela"));
    const pouzitelne = riadky.filter((r) => r.name.trim() && cislo(r.quantity) > 0);
    if (!pouzitelne.length) return toast.error(t("ponuky.doplntePolozku"));
    // Platnosť pred vystavením je preklep — ponuka by bola neplatná hneď.
    if (platiDo && platiDo < vystavena) return toast.error(t("ponuky.platnostPredVystavenim"));

    setUkladam(true);
    try {
      const r: any = await vystav({
        data: {
          company_id: firma.id,
          customer_id: odberatel.id,
          issue_date: vystavena,
          valid_until: platiDo || null,
          currency: mena,
          notes: poznamka.trim() || null,
          items: pouzitelne.map((x) => ({
            name: x.name.trim(),
            quantity: cislo(x.quantity),
            unit: x.unit || "ks",
            unit_price: cislo(x.unit_price),
            vat_rate: platca ? x.vat_rate : 0,
            product_id: x.product_id,
          })),
        },
      });
      toast.success(t("ponuky.vytvorena", { cislo: r.quote_number }));
      onHotovo();
    } catch (e) {
      toast.error(friendlyError(e, t("ponuky.nepodariloVytvorit")));
    } finally {
      setUkladam(false);
    }
  }

  if (!podklady) return <Pracujem text={t("nf.nacitavamOdberatelov")} />;
  if (ukladam) return <Pracujem text={t("ponuky.vytvaram")} />;

  /* Ten istý formulár ako pri faktúre — vrátane dohľadania podľa IČO. */
  if (pridavam) {
    return (
      <NovyOdberatel
        companyId={firma.id}
        predvyplneneMeno={hladanie.trim()}
        onSpat={() => setPridavam(false)}
        onPridany={(o) => {
          setPodklady((p) => (p ? { ...p, odberatelia: [o, ...p.odberatelia] } : p));
          setOdberatel(o);
          setPridavam(false);
        }}
      />
    );
  }

  return (
    <MobilObrazovka
      title={t("ponuky.novaDlha")}
      subtitle={firma.name}
      onBack={onSpat}
      footer={
        <HlavneTlacidlo onClick={() => void uloz()}>
          {t("ponuky.vytvoritSuma", { suma: suma(sucty.spolu, mena) })}
        </HlavneTlacidlo>
      }
    >
      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("ponuky.odberatel")}
        </h2>
        {odberatel ? (
          <button
            onClick={() => setOdberatel(null)}
            className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-left active:scale-[0.99]"
          >
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{odberatel.name}</span>
            <span className="text-xs text-muted-foreground">{t("ponuky.zmenit")}</span>
          </button>
        ) : (
          <>
            <input
              value={hladanie}
              onChange={(e) => setHladanie(e.target.value)}
              placeholder={t("ponuky.hladatOdberatela")}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
            />
            {najdene.length > 0 && (
              <ul className="space-y-1">
                {najdene.map((o) => (
                  <li key={o.id}>
                    <button
                      onClick={() => setOdberatel(o)}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-left text-sm active:bg-secondary"
                    >
                      <span className="font-medium">{o.name}</span>
                      {o.ico && <span className="ml-2 text-xs text-muted-foreground">{o.ico}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hladanie.trim() && najdene.length === 0 && (
              <p className="px-1 py-1 text-xs text-muted-foreground">{t("ponuky.nikNenajdeny")}</p>
            )}
            <button
              onClick={() => setPridavam(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-sm font-medium text-primary active:bg-primary/10"
            >
              <UserPlus className="h-4 w-4" /> {t("ponuky.novyOdberatel")}
            </button>
          </>
        )}
      </section>

      <section className="mt-5 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("ponuky.polozky")}
        </h2>
        {riadky.map((r, i) => (
          <RiadokPolozky
            key={r.key}
            riadok={r}
            platca={platca}
            mena={mena}
            jediny={riadky.length === 1}
            onZmen={(patch) =>
              setRiadky((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
            }
            onZmaz={() => setRiadky((xs) => xs.filter((_, j) => j !== i))}
          />
        ))}
        <button
          onClick={() => setRiadky((xs) => [...xs, prazdnyRiadok(zakladnaSadzba)])}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm active:bg-secondary"
        >
          <Plus className="h-4 w-4" /> {t("ponuky.pridajPolozku")}
        </button>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted-foreground">{t("ponuky.vystavena")}</span>
          <input
            type="date"
            value={vystavena}
            onChange={(e) => setVystavena(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted-foreground">{t("ponuky.platiDo")}</span>
          <input
            type="date"
            value={platiDo}
            onChange={(e) => setPlatiDo(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
          />
        </label>
      </section>

      <label className="mt-4 block">
        <span className="mb-1 block text-[12px] text-muted-foreground">{t("ponuky.poznamka")}</span>
        <textarea
          rows={3}
          value={poznamka}
          onChange={(e) => setPoznamka(e.target.value)}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[16px]"
        />
      </label>

      <div className="mt-5 rounded-2xl border border-border bg-card p-3 text-sm">
        <Riadok k={t("ponuky.zaklad")} v={suma(sucty.zaklad, mena)} />
        {platca && <Riadok k={t("ponuky.dph")} v={suma(sucty.dan, mena)} />}
        <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold">
          <span>{t("jazdy.spolu")}</span>
          <span className="tabular-nums">{suma(sucty.spolu, mena)}</span>
        </div>
      </div>
    </MobilObrazovka>
  );
}

function Riadok({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}
