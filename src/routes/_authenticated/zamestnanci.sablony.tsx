import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listSablon, obnovSablonu, ulozSablonu } from "@/lib/faktero/zamestnanci.functions";
import { TOKENY, type KlucSablony } from "@/lib/faktero/zamestnanci";
import { ChybaModulu, pole, popis, tlacidlo, tlacidloObrys } from "@/components/faktero/zamestnanci/ui";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/zamestnanci/sablony")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Šablóny dokumentov — Faktero") }],
  }),
  component: SablonyPage,
});

type Sablona = { key: KlucSablony; title: string; body: string; upravena: boolean };

function SablonyPage() {
  const { t } = useT();
  const nacitajSablony = useServerFn(listSablon);
  const uloz = useServerFn(ulozSablonu);
  const obnov = useServerFn(obnovSablonu);
  const [sablony, setSablony] = useState<Sablona[]>([]);
  const [vybrana, setVybrana] = useState<KlucSablony>("pracovna_zmluva");
  const [nazov, setNazov] = useState("");
  const [text, setText] = useState("");
  const [chyba, setChyba] = useState<string | null>(null);
  const cid = getActiveCompanyId();

  const nacitaj = useCallback(
    (kluc?: KlucSablony) => {
      if (!cid) return;
      nacitajSablony({ data: { company_id: cid } })
        .then((d: any) => {
          setSablony(d);
          const s = (d as Sablona[]).find((x) => x.key === (kluc ?? vybrana));
          if (s) {
            setNazov(s.title);
            setText(s.body);
          }
        })
        .catch((e: any) => setChyba(e?.message ?? t("Šablóny sa nepodarilo načítať.")));
    },
    [nacitajSablony, cid, vybrana],
  );
  useEffect(() => nacitaj(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function vyber(kluc: KlucSablony) {
    setVybrana(kluc);
    const s = sablony.find((x) => x.key === kluc);
    if (s) {
      setNazov(s.title);
      setText(s.body);
    }
  }

  const aktualna = sablony.find((s) => s.key === vybrana);

  return (
    <>
      <PageHeader
        title={t("Šablóny dokumentov")}
        description={t(
          "Texty zmlúv a potvrdení pre vašu firmu. Tokeny v dvojitých zátvorkách sa pri výrobe PDF nahradia údajmi.",
        )}
        action={
          <Link to="/zamestnanci" className={tlacidloObrys}>
            <ArrowLeft className="h-4 w-4" /> {t("Zamestnanci")}
          </Link>
        }
      />
      <PageBody>
        {chyba ? (
          <ChybaModulu sprava={chyba} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap gap-1">
                {sablony.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={vybrana === s.key}
                    onClick={() => vyber(s.key)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      vybrana === s.key ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground"
                    }`}
                  >
                    {s.title}
                    {s.upravena ? " •" : ""}
                  </button>
                ))}
              </div>
              <div>
                <label className={popis} htmlFor="s-nazov">
                  {t("Názov")}
                </label>
                <input id="s-nazov" className={pole} value={nazov} onChange={(e) => setNazov(e.target.value)} />
              </div>
              <div>
                <label className={popis} htmlFor="s-text">
                  {t("Text (riadok začínajúci „# “ je nadpis)")}
                </label>
                {/* Výška podľa počtu riadkov — pri pevných 22 bol spodný riadok odrezaný. */}
                <textarea
                  id="s-text"
                  rows={Math.max(22, text.split("\n").length + 2)}
                  className={`${pole} min-h-[24rem] resize-y font-mono text-xs leading-5`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={tlacidlo}
                  onClick={async () => {
                    if (!cid) return;
                    try {
                      await uloz({ data: { company_id: cid, key: vybrana, title: nazov, body: text } });
                      toast.success(t("Šablóna je uložená pre vašu firmu."));
                      nacitaj(vybrana);
                    } catch (err: any) {
                      toast.error(err?.message ?? t("Šablónu sa nepodarilo uložiť."));
                    }
                  }}
                >
                  {t("Uložiť šablónu")}
                </button>
                {aktualna?.upravena && (
                  <button
                    type="button"
                    className={tlacidloObrys}
                    onClick={async () => {
                      if (!cid || !(await potvrd(t("Vrátiť predvolený text? Vaše úpravy sa stratia."))))
                        return;
                      try {
                        await obnov({ data: { company_id: cid, key: vybrana } });
                        toast.success(t("Obnovený predvolený text."));
                        nacitaj(vybrana);
                      } catch (err: any) {
                        toast.error(err?.message ?? t("Nepodarilo sa obnoviť."));
                      }
                    }}
                  >
                    {t("Vrátiť predvolený text")}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Predvolené texty sú vzory, nie právna rada. Pred prvým použitím si ich dajte skontrolovať.",
                )}
              </p>
            </div>
            <aside className="rounded-xl border border-border bg-card p-4 text-xs">
              <div className="mb-2 text-sm font-semibold">{t("Tokeny")}</div>
              <ul className="space-y-1.5">
                {TOKENY.map((tok) => (
                  <li key={tok.token}>
                    <button
                      type="button"
                      className="font-mono text-primary hover:underline"
                      title={t("Vložiť na koniec textu")}
                      onClick={() => setText((x) => `${x}{{${tok.token}}}`)}
                    >
                      {`{{${tok.token}}}`}
                    </button>
                    <div className="text-muted-foreground">{t(tok.popis)}</div>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        )}
      </PageBody>
    </>
  );
}
