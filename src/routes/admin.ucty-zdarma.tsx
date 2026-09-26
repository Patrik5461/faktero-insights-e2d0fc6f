/**
 * Účty s plánom natrvalo zadarmo.
 *
 * Vlastné firmy prevádzkovateľa a dohodnuté výnimky. Zápis je podľa e-mailu,
 * takže platí aj pre firmy, ktoré ten účet ešte len založí — dovtedy sa každá
 * taká firma musela prepnúť ručne a keď sa zabudlo, predplatné jej po mesiaci
 * uplynulo.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gift, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  zoznamUctovZdarma,
  pridajUcetZdarma,
  odoberUcetZdarma,
  type UcetZdarma,
} from "@/lib/faktero/admin-ucty-zdarma.functions";

export const Route = createFileRoute("/admin/ucty-zdarma")({ component: Page });

const PLANY = [
  { slug: "enterprise", label: "Enterprise" },
  { slug: "premium", label: "Premium" },
  { slug: "starter", label: "Starter" },
];

function Page() {
  const qc = useQueryClient();
  const nacitaj = useServerFn(zoznamUctovZdarma);
  const pridaj = useServerFn(pridajUcetZdarma);
  const odober = useServerFn(odoberUcetZdarma);

  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("enterprise");
  const [poznamka, setPoznamka] = useState("");
  const [naOdobratie, setNaOdobratie] = useState<UcetZdarma | null>(null);

  const { data: ucty = [], isLoading } = useQuery({
    queryKey: ["admin-ucty-zdarma"],
    queryFn: () => nacitaj({}) as Promise<UcetZdarma[]>,
  });
  const obnov = () => qc.invalidateQueries({ queryKey: ["admin-ucty-zdarma"] });

  const pridanie = useMutation({
    mutationFn: () =>
      pridaj({ data: { email, plan_slug: plan as any, note: poznamka || null } }) as Promise<{
        prepnute: number;
      }>,
    onSuccess: (r) => {
      toast.success(
        r.prepnute
          ? `Uložené. Prepnutých firiem: ${r.prepnute}.`
          : "Uložené. Účet zatiaľ nemá žiadnu firmu — pravidlo platí pre tie budúce.",
      );
      setEmail("");
      setPoznamka("");
      obnov();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nepodarilo sa uložiť."),
  });

  const odobratie = useMutation({
    mutationFn: (u: UcetZdarma) => odober({ data: { email: u.email } }),
    onSuccess: () => {
      toast.success("Odobraté zo zoznamu. Existujúcim firmám plán ostal.");
      setNaOdobratie(null);
      obnov();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nepodarilo sa odobrať."),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Gift className="h-5 w-5" /> Účty zadarmo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Firmy týchto účtov majú plán natrvalo zadarmo — neúčtuje sa im, nechodia im výzvy na
          platbu a neoznačia sa za neplatičov. Pravidlo sa uplatní aj na firmy, ktoré účet ešte len
          založí.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return toast.error("Zadajte e-mail účtu.");
          pridanie.mutate();
        }}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[2fr_1fr_2fr_auto]"
      >
        <label className="block">
          <span className="text-sm font-medium">E-mail účtu</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="napr. info@firma.sk"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Plán</span>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {PLANY.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Poznámka</span>
          <input
            value={poznamka}
            onChange={(e) => setPoznamka(e.target.value)}
            placeholder="prečo má zadarmo"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pridanie.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {pridanie.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Pridať
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">E-mail</th>
              <th className="p-3">Plán</th>
              <th className="p-3 text-right">Firiem</th>
              <th className="p-3">Poznámka</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  Načítavam…
                </td>
              </tr>
            ) : ucty.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  Zatiaľ žiadny účet zadarmo.
                </td>
              </tr>
            ) : (
              ucty.map((u) => (
                <tr key={u.email}>
                  <td className="p-3 font-medium">
                    {u.email}
                    {!u.ucet_existuje && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        <TriangleAlert className="h-3 w-3" /> účet zatiaľ neexistuje
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {PLANY.find((p) => p.slug === u.plan_slug)?.label ?? u.plan_slug}
                  </td>
                  <td className="p-3 text-right tabular-nums">{u.firiem}</td>
                  <td className="p-3 text-muted-foreground">{u.note ?? "—"}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => setNaOdobratie(u)}
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                      title="Odobrať zo zoznamu"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {naOdobratie && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setNaOdobratie(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Odobrať účet zo zoznamu"
            className="w-full max-w-md rounded-xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Odobrať {naOdobratie.email}?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Firmám, ktoré účet už má, plán ostane — odobratie znamená len to, že ďalšie nové
              firmy dostanú bežnú skúšobnú verziu. Ak sa má niekomu začať účtovať, nastavte mu plán
              v jeho Predplatnom.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setNaOdobratie(null)}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
              >
                Zrušiť
              </button>
              <button
                onClick={() => odobratie.mutate(naOdobratie)}
                disabled={odobratie.isPending}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-60"
              >
                {odobratie.isPending ? "Odoberám…" : "Odobrať"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
