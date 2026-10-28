import { useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CreditCard,
  ListChecks,
  MessageSquare,
  NotebookPen,
  Tag,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { hromadneDokladyFn } from "@/lib/faktero/doklady-hromadne.functions";
import {
  typyPlatby,
  triedaFarby,
  type AgendaDokladu,
  type AkciaHromadna,
} from "@/lib/faktero/doklady-hromadne";
import { KV_CLENENIA, KV_PRIJATE } from "@/lib/faktero/kv-clenenie";
import { zoradPodlaDokladu } from "@/lib/faktero/predkontacie";
import { useCiselnikyDokladov } from "@/hooks/useCiselnikyDokladov";
import { potvrd, zadaj } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { ZoznamMoznosti, moznostiKodov } from "./VyberVRiadku";

type Akcia = AkciaHromadna;

const KV_VYSTAVENE = KV_CLENENIA.filter((k) => ["A1", "A2", "C1", "D2", "X"].includes(k.kod));

/**
 * „Hromadná akcia" nad označenými dokladmi — účtovná položka, typ platby,
 * členenia, poznámky, vlastný stav, štítky a úhrada jedným volaním servera.
 * Odovzdané a zamknuté doklady server preskočí a toast povie, koľko.
 * Export do PDF a mazanie ostávajú na zozname (`pdfZip`, `zmazat`), menu ich
 * len ponúkne na jednom mieste.
 */
export function HromadnaAkciaDokladov({
  companyId,
  agenda,
  ids,
  onHotovo,
  pdfZip,
  pdfZipNazov,
  zmazat,
}: {
  companyId: string;
  agenda: AgendaDokladu;
  ids: string[];
  onHotovo: () => void;
  pdfZip?: () => void;
  pdfZipNazov?: string;
  zmazat?: () => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [okno, setOkno] = useState<null | "predkontacia" | "clenenie">(null);
  const uctovne = agenda !== "ostatny";
  const c = useCiselnikyDokladov(
    companyId,
    agenda === "ostatny" ? null : agenda,
    // Kódy sa ťahajú, až keď je čo meniť — zoznam bez výberu ich nepotrebuje.
    uctovne && ids.length > 0,
  );

  async function spusti(akcia: Akcia) {
    if (!ids.length) return;
    setBusy(true);
    try {
      const r = await hromadneDokladyFn({ data: { company_id: companyId, agenda, ids, akcia } });
      if (r.zmenenych) toast.success(t("Zmenené doklady: {n}", { n: r.zmenenych }));
      else if (!r.preskocene.length) toast(t("Nebolo čo meniť"));
      if (r.preskocene.length)
        toast.warning(t("Preskočené: {n}", { n: r.preskocene.length }), {
          description: r.preskocene.slice(0, 5).join("\n") + (r.preskocene.length > 5 ? "\n…" : ""),
        });
      if (akcia.typ === "stitok" && akcia.pridat) c.pridajStitok(akcia.pridat.trim());
      onHotovo();
    } catch (e: any) {
      toast.error(e?.message ?? t("Hromadná úprava sa nepodarila"));
    } finally {
      setBusy(false);
    }
  }

  async function text(typ: "uctovnaPoznamka" | "komentar") {
    const v = await zadaj(
      typ === "komentar"
        ? t("Komentár pre {n} dokladov (do účtovníctva sa neprenáša). Prázdne = zmazať.", {
            n: ids.length,
          })
        : t("Účtovná poznámka pre {n} dokladov (ide do účtovníctva). Prázdne = zmazať.", {
            n: ids.length,
          }),
      { povolitPrazdne: true },
      { potvrdit: t("Uložiť") },
    );
    if (v === null) return;
    await spusti({ typ, text: v });
  }

  async function pridajStitok() {
    const v = await zadaj(t("Štítok, ktorý sa pridá {n} dokladom", { n: ids.length }), {
      moznosti: c.stitky,
      placeholder: t("napr. projekt X"),
    });
    if (v?.trim()) await spusti({ typ: "stitok", pridat: v.trim() });
  }
  async function odoberStitok() {
    const v = await zadaj(t("Štítok, ktorý sa odoberie {n} dokladom", { n: ids.length }), {
      moznosti: c.stitky,
    });
    if (v?.trim()) await spusti({ typ: "stitok", odobrat: v.trim() });
  }

  async function uhrada(uhradene: boolean) {
    if (uhradene) {
      const d = await zadaj(
        t("Dátum úhrady"),
        { predvolene: new Date().toISOString().slice(0, 10), typ: "date" },
        { potvrdit: t("Označiť ako uhradené") },
      );
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      await spusti({ typ: "uhrada", uhradene: true, datum: d });
    } else {
      if (
        !(await potvrd(t("Označiť {n} dokladov ako neuhradené?", { n: ids.length }), {
          potvrdit: t("Označiť"),
        }))
      )
        return;
      await spusti({ typ: "uhrada", uhradene: false });
    }
  }

  const kv = agenda === "vystavena" ? KV_VYSTAVENE : KV_PRIJATE;
  const navrhy = c.navrhy;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy || !ids.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            <ListChecks className="h-4 w-4" /> {t("Hromadná akcia")} ({ids.length})
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {uctovne ? (
            <>
              <DropdownMenuItem onSelect={() => setOkno("predkontacia")}>
                <BookOpen className="h-4 w-4" /> {t("Účtovná položka (predkontácia)…")}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CreditCard className="h-4 w-4" /> {t("Typ platby")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {typyPlatby(agenda).map((p) => (
                    <DropdownMenuItem
                      key={p.kod}
                      onSelect={() => void spusti({ typ: "platba", kod: p.kod })}
                    >
                      {t(p.nazov)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={() => setOkno("clenenie")}>
                <BookOpen className="h-4 w-4" /> {t("Členenie DPH…")}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <BookOpen className="h-4 w-4" /> {t("Členenie KV DPH")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-w-xs">
                  <DropdownMenuItem onSelect={() => void spusti({ typ: "kv", kod: "auto" })}>
                    {t("automaticky")}
                  </DropdownMenuItem>
                  {kv.map((k) => (
                    <DropdownMenuItem
                      key={k.kod}
                      onSelect={() => void spusti({ typ: "kv", kod: k.kod })}
                    >
                      {t(k.nazov)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={() => void text("uctovnaPoznamka")}>
                <NotebookPen className="h-4 w-4" /> {t("Účtovná poznámka…")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void text("komentar")}>
                <MessageSquare className="h-4 w-4" /> {t("Komentár…")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CircleDashed className="h-4 w-4" /> {t("Stav dokladu")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-w-xs">
                  {c.stavy
                    .filter((s) => s.aktivne)
                    .map((s) => (
                      <DropdownMenuItem
                        key={s.id}
                        onSelect={() => void spusti({ typ: "stav", stavId: s.id })}
                      >
                        <span className={`rounded px-1.5 py-0.5 text-xs ${triedaFarby(s.farba)}`}>
                          {s.nazov}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  {c.stavy.length ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem onSelect={() => void spusti({ typ: "stav", stavId: null })}>
                    {t("Bez stavu")}
                  </DropdownMenuItem>
                  {!c.stavy.length ? (
                    <DropdownMenuItem disabled>
                      {t("Stavy si nastavíte v Účtovníctvo → Predkontácie")}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          ) : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Tag className="h-4 w-4" /> {t("Štítky")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-w-xs">
              {c.stitky.slice(0, 12).map((s) => (
                <DropdownMenuItem
                  key={s}
                  onSelect={() => void spusti({ typ: "stitok", pridat: s })}
                >
                  + {s}
                </DropdownMenuItem>
              ))}
              {c.stitky.length ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem onSelect={() => void pridajStitok()}>
                {t("Pridať štítok…")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void odoberStitok()}>
                {t("Odobrať štítok…")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {agenda === "prijata" || agenda === "vystavena" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void uhrada(true)}>
                <CheckCircle2 className="h-4 w-4" /> {t("Označiť ako uhradené")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void uhrada(false)}>
                <CircleDashed className="h-4 w-4" /> {t("Označiť ako neuhradené")}
              </DropdownMenuItem>
            </>
          ) : null}
          {pdfZip || zmazat ? <DropdownMenuSeparator /> : null}
          {pdfZip ? (
            <DropdownMenuItem onSelect={() => pdfZip()}>
              <Archive className="h-4 w-4" /> {pdfZipNazov ?? t("Exportovať do PDF (ZIP)")}
            </DropdownMenuItem>
          ) : null}
          {zmazat ? (
            <DropdownMenuItem
              onSelect={() => zmazat()}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> {t("Zmazať")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={okno !== null} onOpenChange={(o) => !o && setOkno(null)}>
        <DialogContent className="max-w-md gap-3 p-4">
          <DialogTitle className="text-base">
            {okno === "clenenie" ? t("Členenie DPH") : t("Účtovná položka (predkontácia)")}
          </DialogTitle>
          <DialogDescription>
            {t("Nastaví sa {n} označeným dokladom; odovzdané a zamknuté sa preskočia.", {
              n: ids.length,
            })}
          </DialogDescription>
          {navrhy ? (
            <div className="rounded-md border border-border">
              <ZoznamMoznosti
                moznosti={moznostiKodov(
                  okno === "clenenie"
                    ? navrhy.clenenia
                    : zoradPodlaDokladu(navrhy.predkontacie, {
                        typ: agenda === "doklad" ? "blocek" : "faktura",
                      }),
                )}
                prazdne={t("Nedefinované (vymazať)")}
                onVyber={(v) => {
                  const typ = okno === "clenenie" ? "clenenie" : "predkontacia";
                  setOkno(null);
                  void spusti({ typ, kod: v || null });
                }}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Načítavam…")}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
