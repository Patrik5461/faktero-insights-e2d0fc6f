import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Car,
  FilePlus2,
  FileText,
  Receipt,
  TriangleAlert,
} from "lucide-react";
import { useOperacia } from "@/lib/mobile/server-most";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { beziacaJazda } from "@/lib/mobile/auto-jazdy-sync";
import {
  Card,
  ListCard,
  ListRow,
  PrazdnyStav,
  QuickAction,
  SectionHeader,
  ScreenHeader,
  StatCard,
  suma,
  type Ton,
} from "./ui";
import { PrebiehaJazda } from "./PrebiehaJazda";

/**
 * Úvodná obrazovka appky.
 *
 * Odpovedá na tri otázky v poradí, v akom si ich človek kladie: koľko mi
 * dlhujú, čo mám urobiť, a čo sa naposledy stalo. Až pod tým sú agendy —
 * tie sú v spodnej lište a netreba na ne dlaždice.
 *
 * Nič sa tu nepočíta na serveri navyše: sumy aj počty vznikajú zo zoznamu
 * faktúr a dokladov, ktoré si appka aj tak ťahá. Keď zlyhá sieť, obrazovka
 * ostane prázdna a nepovie nepravdu — nula neuhradených a „nič nečaká"
 * vyzerajú rovnako a to je horšie než prázdno.
 */

type Faktura = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  total: number | string;
  currency: string | null;
  issue_date: string;
  due_date: string;
  status: string;
  type: string;
};

type Doklad = {
  id: string;
  supplier_name: string | null;
  total_amount: number | string | null;
  currency: string | null;
  created_at: string;
};

type Riadok = {
  id: string;
  nazov: string;
  popis: string;
  suma: string;
  ton: Ton;
  kedy: string;
  cas: string;
};

const DNES = () => new Date().toISOString().slice(0, 10);

/** Zálohová faktúra nie je pohľadávka — je to výzva na platbu. */
function jeRiadnaPohladavka(f: Faktura): boolean {
  return f.type !== "proforma" && f.status !== "cancelled" && f.status !== "draft";
}

export function Prehlad({
  firma,
  onNovaFaktura,
  onSkener,
  onJazda,
  onFaktury,
  onDoklady,
}: {
  firma: { id: string; name: string };
  onNovaFaktura: () => void;
  onSkener: () => void;
  onJazda: () => void;
  onFaktury: () => void;
  onDoklady: () => void;
}) {
  const { t, mnozne, locale: loc } = usePreklad();
  const nacitajFaktury = useOperacia("faktury-zoznam");
  const nacitajDoklady = useOperacia("vydavky-zoznam");
  const [faktury, setFaktury] = useState<Faktura[] | null>(null);
  const [doklady, setDoklady] = useState<Doklad[] | null>(null);
  const [jazdaBezi, setJazdaBezi] = useState(false);

  useEffect(() => {
    let zrusene = false;
    /*
      Obe volania naraz a každé si nesie vlastný pád. Keby boli v jednom
      `try`, chyba pri dokladoch by zmazala aj faktúry — a práve tie sú
      dôvod, prečo sem človek ide.
    */
    void (async () => {
      try {
        const z = (await nacitajFaktury({ data: { company_id: firma.id } })) as Faktura[];
        if (!zrusene) setFaktury(z);
      } catch {
        if (!zrusene) setFaktury([]);
      }
    })();
    void (async () => {
      try {
        const z = (await nacitajDoklady({ data: { company_id: firma.id } })) as Doklad[];
        if (!zrusene) setDoklady(z);
      } catch {
        if (!zrusene) setDoklady([]);
      }
    })();
    void beziacaJazda()
      .then((j) => !zrusene && setJazdaBezi(!!j))
      .catch(() => {});
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma.id]);

  const mena = faktury?.[0]?.currency ?? "EUR";

  const neuhradene = useMemo(() => {
    const zoznam = (faktury ?? []).filter((f) => jeRiadnaPohladavka(f) && f.status !== "paid");
    return {
      pocet: zoznam.length,
      spolu: zoznam.reduce((s, f) => s + Number(f.total || 0), 0),
    };
  }, [faktury]);

  const poSplatnosti = useMemo(() => {
    const den = DNES();
    const zoznam = (faktury ?? []).filter(
      (f) => jeRiadnaPohladavka(f) && f.status !== "paid" && f.due_date < den,
    );
    return {
      pocet: zoznam.length,
      spolu: zoznam.reduce((s, f) => s + Number(f.total || 0), 0),
    };
  }, [faktury]);

  /* Doklad bez dodávateľa alebo bez sumy sa neprečítal celý — patrí na oči. */
  const naKontrolu = useMemo(
    () => (doklady ?? []).filter((d) => !d.supplier_name || d.total_amount == null).length,
    [doklady],
  );

  const aktivita = useMemo<Riadok[]>(() => {
    const zFaktur = (faktury ?? []).slice(0, 8).map((f) => ({
      id: `f:${f.id}`,
      nazov: f.customer_name ?? "—",
      popis: t("ph.fakturaCislo", { cislo: f.invoice_number }),
      suma: `+${suma(f.total, f.currency, loc)}`,
      ton: "zelena" as Ton,
      kedy: f.issue_date,
      cas: "",
    }));
    const zDokladov = (doklady ?? []).slice(0, 8).map((d) => ({
      id: `d:${d.id}`,
      nazov: d.supplier_name ?? "—",
      popis: t("ph.doklad"),
      suma: `−${suma(d.total_amount, d.currency, loc)}`,
      ton: "neutral" as Ton,
      kedy: (d.created_at ?? "").slice(0, 10),
      cas: "",
    }));
    return [...zFaktur, ...zDokladov]
      .sort((a, b) => b.kedy.localeCompare(a.kedy))
      .slice(0, 5)
      .map((r) => ({ ...r, cas: kedySlovom(r.kedy, loc, t) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faktury, doklady, loc]);

  /* Tvar slova „faktúra" rieši pravidlo jazyka, nie táto obrazovka. */
  const pocetFaktur = (pocet: number) =>
    `${pocet} ${mnozne(pocet, {
      one: t("spolocne.faktura1"),
      few: t("spolocne.faktura2"),
      other: t("spolocne.faktura5"),
    })}`;

  const nacitava = faktury === null || doklady === null;
  const maCoVybavit = poSplatnosti.pocet > 0 || naKontrolu > 0 || jazdaBezi;

  return (
    <div className="flex flex-1 flex-col bg-app-pozadie">
      <div className="px-4">
        <ScreenHeader title={t("ph.nazov")} subtitle={dnesSlovom(loc)} />
      </div>

      <main className="flex-1 space-y-6 px-4 pb-6">
        <PrebiehaJazda onOtvor={onJazda} />

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={t("ph.neuhradene")}
            value={nacitava ? "—" : suma(neuhradene.spolu, mena, loc)}
            hint={nacitava ? undefined : pocetFaktur(neuhradene.pocet)}
            ton="zelena"
            onClick={onFaktury}
          />
          <StatCard
            label={t("ph.poSplatnosti")}
            value={nacitava ? "—" : suma(poSplatnosti.spolu, mena, loc)}
            hint={nacitava ? undefined : pocetFaktur(poSplatnosti.pocet)}
            ton={poSplatnosti.pocet > 0 ? "cervena" : "neutral"}
            onClick={onFaktury}
          />
        </div>

        <section>
          <SectionHeader title={t("ph.rychleAkcie")} />
          <div className="flex gap-3">
            <QuickAction icon={FilePlus2} label={t("ph.faktura")} onClick={onNovaFaktura} />
            <QuickAction icon={Camera} label={t("ph.skenovat")} onClick={onSkener} />
            <QuickAction icon={Car} label={t("ph.zacatJazdu")} onClick={onJazda} />
          </div>
        </section>

        <section>
          <SectionHeader title={t("ph.naVybavenie")} />
          {maCoVybavit ? (
            <ListCard>
              {poSplatnosti.pocet > 0 && (
                <ListRow
                  icon={TriangleAlert}
                  ikonaTon="cervena"
                  title={t("ph.fakturyPoSplatnosti", { pocet: poSplatnosti.pocet })}
                  chevron
                  onClick={onFaktury}
                />
              )}
              {naKontrolu > 0 && (
                <ListRow
                  icon={Receipt}
                  title={t("ph.dokladyNaKontrolu", { pocet: naKontrolu })}
                  chevron
                  onClick={onDoklady}
                />
              )}
              {jazdaBezi && (
                <ListRow icon={Car} title={t("ph.jazdaNeukoncena")} chevron onClick={onJazda} />
              )}
            </ListCard>
          ) : (
            <Card className="px-4 py-5">
              <p className="text-[15px] font-semibold text-app-text">{t("ph.vsetkoVybavene")}</p>
              <p className="mt-1 text-[13px] text-app-text-2">{t("ph.vsetkoVybavenePopis")}</p>
            </Card>
          )}
        </section>

        <section>
          <SectionHeader title={t("ph.poslednaAktivita")} />
          {aktivita.length > 0 ? (
            <ListCard>
              {aktivita.map((r) => (
                <ListRow
                  key={r.id}
                  title={r.nazov}
                  subtitle={r.popis}
                  right={r.suma}
                  rightTon={r.ton}
                  rightSub={<span className="text-[12px] text-app-text-3">{r.cas}</span>}
                  onClick={r.id.startsWith("f:") ? onFaktury : onDoklady}
                />
              ))}
            </ListCard>
          ) : (
            <PrazdnyStav
              icon={FileText}
              title={t("ph.ziadnaAktivita")}
              popis={t("ph.ziadnaAktivitaPopis")}
            />
          )}
        </section>

        {!nacitava && faktury?.length === 0 && doklady?.length === 0 && (
          <p className="flex items-center justify-center gap-2 text-[12px] text-app-text-3">
            <AlertTriangle className="h-3.5 w-3.5" />
            {firma.name}
          </p>
        )}
      </main>
    </div>
  );
}

/** „Streda, 27. augusta" — dátum do podnadpisu, nie do tabuľky. */
function dnesSlovom(loc: string): string {
  const d = new Date();
  const veta = d.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" });
  return veta.charAt(0).toUpperCase() + veta.slice(1);
}

/** Dnes, včera, inak dátum — v zozname aktivity nikto nečíta celý dátum. */
function kedySlovom(den: string, loc: string, t: (k: "ph.dnes" | "ph.vcera") => string): string {
  if (!den) return "";
  const dnes = DNES();
  if (den === dnes) return t("ph.dnes");
  const v = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (den === v) return t("ph.vcera");
  const d = new Date(den);
  return Number.isNaN(d.getTime()) ? den : d.toLocaleDateString(loc, { day: "numeric", month: "numeric" });
}

