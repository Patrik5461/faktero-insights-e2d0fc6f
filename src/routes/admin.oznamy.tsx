/**
 * Oznamy o plánovanej aktualizácii (tabuľka `platformove_oznamy`).
 *
 * Prihlásený používateľ webu uvidí oznam 30 min pred začiatkom (okno, potom pás),
 * počas aktualizácie „Prebieha aktualizácia…“ a po nej „Faktero je
 * aktualizované“ s tlačidlom Obnoviť — logika v `oznam-aktualizacie.ts`.
 * Zapisovať smie len platformový admin (RLS), preto stačí klient prehliadača.
 * To isté z príkazového riadku: `node scripts/oznam-aktualizacie.mjs --o 5`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { potvrd } from "@/lib/potvrdenie";
import {
  casVBratislave,
  predvolenyText,
  stavOznamu,
  type PlatformovyOznam,
} from "@/lib/faktero/oznam-aktualizacie";

export const Route = createFileRoute("/admin/oznamy")({ component: Page });

type Riadok = PlatformovyOznam & { created_at: string; len_pre_user_id: string | null };

const NAZOV_FAZY: Record<string, string> = {
  pred: "ohlásená (okno/pás)",
  pocas: "prebieha",
  po: "hotovo, ponúka obnovenie",
  info: "zobrazuje sa",
};

/** Hodnota pre <input type="datetime-local"> v miestnom čase prehliadača. */
function doVstupu(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** O 15 minút, zaokrúhlené nahor na 5 minút. */
function predvolenyZaciatok(): number {
  const pat = 5 * 60_000;
  return Math.ceil((Date.now() + 15 * 60_000) / pat) * pat;
}

function datumCas(iso: string): string {
  const ms = Date.parse(iso);
  return `${new Date(ms).toLocaleDateString("sk-SK", { timeZone: "Europe/Bratislava" })} ${casVBratislave(ms)}`;
}

function Page() {
  const qc = useQueryClient();
  const {
    data: oznamy = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-oznamy"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platformove_oznamy")
        .select(
          "id, typ, text, zaciatok, trvanie_min, plati_do, aktivny, created_at, len_pre_user_id, nadpis, text_okno",
        )
        .order("zaciatok", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as Riadok[];
    },
    refetchInterval: 30_000,
  });
  const obnov = () => qc.invalidateQueries({ queryKey: ["admin-oznamy"] });

  const [typ, setTyp] = useState<"aktualizacia" | "info">("aktualizacia");
  const [zaciatok, setZaciatok] = useState(() => doVstupu(predvolenyZaciatok()));
  const [trvanie, setTrvanie] = useState(1);
  const [text, setText] = useState("");
  const [textUpraveny, setTextUpraveny] = useState(false);
  /** Len info: okno, ktoré sa každému ukáže raz (prázdny text = len pás). */
  const [nadpis, setNadpis] = useState("");
  const [textOkna, setTextOkna] = useState("");

  const zaciatokMs = Date.parse(zaciatok);
  const predvoleny =
    typ === "aktualizacia" && Number.isFinite(zaciatokMs)
      ? predvolenyText(zaciatokMs, trvanie)
      : "";

  // Kým admin text nezmenil, drží sa predvoleného (mení sa s časom a trvaním).
  useEffect(() => {
    if (!textUpraveny) setText(predvoleny);
  }, [predvoleny, textUpraveny]);

  const pridanie = useMutation({
    mutationFn: async () => {
      if (!Number.isFinite(zaciatokMs)) throw new Error("Zadajte začiatok.");
      const vlastny = text.trim();
      if (typ === "info" && !vlastny) throw new Error("Info oznam potrebuje text.");
      const { error } = await supabase.from("platformove_oznamy").insert({
        typ,
        zaciatok: new Date(zaciatokMs).toISOString(),
        // Info oznam (napr. údržba) môže visieť dlhšie — najviac týždeň.
        trvanie_min: Math.max(1, Math.min(typ === "info" ? 10080 : 240, Math.round(trvanie) || 1)),
        nadpis: typ === "info" ? nadpis.trim() || null : null,
        text_okno: typ === "info" ? textOkna.trim() || null : null,
        // Predvolený text sa neukladá — používateľ ho tak dostane vo svojom jazyku.
        text: typ === "aktualizacia" && vlastny === predvoleny ? null : vlastny || null,
        plati_do:
          typ === "info"
            ? new Date(zaciatokMs + Math.max(1, trvanie) * 60_000).toISOString()
            : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Oznam pridaný");
      setTextUpraveny(false);
      setNadpis("");
      setTextOkna("");
      setZaciatok(doVstupu(predvolenyZaciatok()));
      obnov();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Pridanie zlyhalo."),
  });

  const deaktivacia = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("platformove_oznamy")
        .update({ aktivny: false })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Oznam deaktivovaný");
      obnov();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Deaktivácia zlyhala."),
  });

  const vstup = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  const teraz = Date.now();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Oznamy o aktualizácii</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prihlásení používatelia webu uvidia oznam 30 minút pred začiatkom (raz okno, potom pás
          hore), počas aktualizácie „Prebieha aktualizácia…“ a po nej „Faktero je aktualizované“ s
          tlačidlom Obnoviť stránku (30 minút). Appka v telefóne oznam neukazuje. Z príkazového
          riadku: <code className="text-xs">node scripts/oznam-aktualizacie.mjs --o 5</code>.
        </p>
      </div>

      <form
        className="rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          pridanie.mutate();
        }}
      >
        <div className="mb-3 text-sm font-medium">Nový oznam</div>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr_8rem]">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Typ</span>
            <select
              className={vstup}
              value={typ}
              onChange={(e) => setTyp(e.target.value as "aktualizacia" | "info")}
            >
              <option value="aktualizacia">Aktualizácia</option>
              <option value="info">Informácia</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Začiatok (čas v Bratislave)</span>
            <input
              type="datetime-local"
              className={vstup}
              value={zaciatok}
              onChange={(e) => setZaciatok(e.target.value)}
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {typ === "info" ? "Zobrazovať (min)" : "Trvanie (min)"}
            </span>
            <input
              type="number"
              min={1}
              max={typ === "info" ? 10080 : 240}
              className={vstup}
              value={trvanie}
              onChange={(e) => setTrvanie(Number(e.target.value) || 1)}
              required
            />
          </label>
        </div>
        <label className="mt-3 block space-y-1 text-sm">
          <span className="text-muted-foreground">
            Text pásu{" "}
            {typ === "aktualizacia" &&
              "(nezmenený predvolený text sa neuloží a používateľ ho uvidí vo svojom jazyku)"}
          </span>
          <textarea
            className={`${vstup} min-h-[4.5rem]`}
            maxLength={500}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTextUpraveny(true);
            }}
          />
        </label>
        {typ === "info" && (
          <div className="mt-3 space-y-3 rounded-md border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">
              Vyskakovacie okno (nepovinné) — každému sa ukáže raz aj bez obnovenia stránky, potom
              ostane pás. Bez textu okna sa ukáže len pás.
            </p>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Nadpis okna</span>
              <input
                className={vstup}
                maxLength={120}
                placeholder="Oznam"
                value={nadpis}
                onChange={(e) => setNadpis(e.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Text okna (nový riadok = nový odsek)</span>
              <textarea
                className={`${vstup} min-h-[7rem]`}
                maxLength={2000}
                value={textOkna}
                onChange={(e) => setTextOkna(e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={pridanie.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {pridanie.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Pridať oznam
          </button>
          {textUpraveny && typ === "aktualizacia" && (
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setTextUpraveny(false)}
            >
              Vrátiť predvolený text
            </button>
          )}
        </div>
      </form>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          Oznamy sa nedajú načítať: {(error as Error).message}
        </p>
      ) : oznamy.length === 0 ? (
        <p className="text-sm text-muted-foreground">Zatiaľ žiadny oznam.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">Začiatok</th>
                <th className="px-3 py-2 font-medium">Typ</th>
                <th className="px-3 py-2 font-medium">Trvanie</th>
                <th className="px-3 py-2 font-medium">Text</th>
                <th className="px-3 py-2 font-medium">Stav</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {oznamy.map((o) => {
                const faza = stavOznamu(o, teraz, 0, true).faza;
                return (
                  <tr key={o.id} className="border-b border-border last:border-0 align-top">
                    <td className="whitespace-nowrap px-3 py-2">{datumCas(o.zaciatok)}</td>
                    <td className="px-3 py-2">
                      {o.typ === "info" ? "Informácia" : "Aktualizácia"}
                      {o.len_pre_user_id && (
                        <div className="text-xs text-muted-foreground">len jeden účet</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{o.trvanie_min} min</td>
                    <td className="min-w-[14rem] px-3 py-2 text-muted-foreground">
                      {o.text ?? <span className="italic">predvolený</span>}
                      {o.text_okno && (
                        <div className="mt-1 text-xs">
                          okno: <span className="font-medium">{o.nadpis || "Oznam"}</span>
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {!o.aktivny
                        ? "deaktivovaný"
                        : faza !== "nic"
                          ? NAZOV_FAZY[faza]
                          : Date.parse(o.zaciatok) > teraz
                            ? "naplánovaná"
                            : "skončená"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {o.aktivny && (
                        <button
                          type="button"
                          disabled={deaktivacia.isPending}
                          onClick={async () => {
                            if (await potvrd("Deaktivovať oznam? Používatelia ho prestanú vidieť."))
                              deaktivacia.mutate(o.id);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Ban className="h-3.5 w-3.5" /> Deaktivovať
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
