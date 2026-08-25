import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { createCashEntry, deleteCashEntry, getCashBook } from "@/lib/faktero/pokladna.functions";
import { formatujDatum } from "@/lib/faktero/uzavierka";
import { Wallet, Plus, Trash2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { formatovacMeny } from "@/lib/faktero/mena";

export const Route = createFileRoute("/_authenticated/pokladna")({
  head: () => ({ meta: [{ title: "Pokladňa — Faktero" }] }),
  component: PokladnaPage,
});

function suma(n: number) {
  return formatovacMeny("EUR", "sk-SK")(n || 0);
}

function tentoMesiac() {
  return new Date().toISOString().slice(0, 7);
}

function PokladnaPage() {
  const fetchBook = useServerFn(getCashBook);
  const doCreate = useServerFn(createCashEntry);
  const doDelete = useServerFn(deleteCashEntry);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [mesiac, setMesiac] = useState(tentoMesiac());
  const [otvoreny, setOtvoreny] = useState(false);
  const [form, setForm] = useState({
    type: "vydaj" as "prijem" | "vydaj",
    amount: "",
    description: "",
    entry_date: new Date().toISOString().slice(0, 10),
    category: "",
  });

  const cid = useMemo(() => getActiveCompanyId(), []);

  const nacitaj = useCallback(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchBook({ data: { company_id: cid, month: mesiac } })
      .then((d: any) => setData(d))
      .catch((e: any) => setChyba(e?.message ?? "Pokladňu sa nepodarilo načítať"))
      .finally(() => setLoading(false));
  }, [cid, fetchBook, mesiac]);

  useEffect(nacitaj, [nacitaj]);

  async function uloz(e: React.FormEvent) {
    e.preventDefault();
    if (!cid) return;
    setBusy(true);
    setChyba(null);
    try {
      await doCreate({
        data: {
          company_id: cid,
          type: form.type,
          amount: Number(form.amount),
          description: form.description.trim(),
          entry_date: form.entry_date,
          category: form.category.trim() || null,
        },
      });
      setForm({ ...form, amount: "", description: "", category: "" });
      setOtvoreny(false);
      nacitaj();
    } catch (err: any) {
      setChyba(err?.message ?? "Doklad sa nepodarilo uložiť");
    } finally {
      setBusy(false);
    }
  }

  async function zmaz(id: string) {
    if (!cid || !confirm("Naozaj zmazať tento pokladničný doklad?")) return;
    setBusy(true);
    setChyba(null);
    try {
      await doDelete({ data: { company_id: cid, id } });
      nacitaj();
    } catch (err: any) {
      setChyba(err?.message ?? "Doklad sa nepodarilo zmazať");
    } finally {
      setBusy(false);
    }
  }

  const stav = data?.stav;
  const pole = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <>
      <PageHeader
        title="Pokladňa"
        description="Stav hotovosti z pokladničných dokladov a z dokladov zaplatených v hotovosti."
        action={
          <button
            type="button"
            onClick={() => setOtvoreny((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nový pokladničný doklad
          </button>
        }
      />
      <PageBody>
        {chyba && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {chyba}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-4 w-4" /> Stav pokladne
            </div>
            <div
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                stav?.zaporny ? "text-destructive" : ""
              }`}
            >
              {suma(stav?.zostatok ?? 0)}
            </div>
            {stav?.zaporny && (
              <div className="mt-1 text-xs text-destructive">
                Záporná pokladňa znamená chýbajúci príjem alebo vklad — v hotovosti sa do mínusu ísť
                nedá.
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Príjmy spolu
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">
              {suma(stav?.prijmy ?? 0)}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Výdavky spolu
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {suma(stav?.vydavky ?? 0)}
            </div>
          </div>
        </div>

        {otvoreny && (
          <form
            onSubmit={uloz}
            className="mt-4 grid max-w-3xl gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
          >
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Druh</span>
              <select
                className={pole}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as "prijem" | "vydaj" })}
              >
                <option value="prijem">Príjem do pokladne</option>
                <option value="vydaj">Výdaj z pokladne</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Dátum</span>
              <input
                type="date"
                required
                className={pole}
                value={form.entry_date}
                onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Popis</span>
              <input
                required
                className={pole}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="napr. Vklad do pokladne, Tržba v hotovosti"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Suma (€)</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                className={pole}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Kategória</span>
              <input
                className={pole}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Ukladám…" : "Uložiť doklad"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Obdobie</span>
            <input
              type="month"
              value={mesiac}
              onChange={(e) => setMesiac(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </label>
          <span className="text-sm text-muted-foreground">
            Zostatok na začiatku obdobia: {suma(data?.pociatocny_stav_obdobia ?? 0)}
          </span>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-muted-foreground">Načítavam…</div>
        ) : (data?.riadky ?? []).length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-8 text-center">
            <Wallet className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              V tomto období nie je v pokladni žiadny pohyb.
            </div>
            <p className="mx-auto mt-2 max-w-lg text-xs text-muted-foreground">
              Do pokladne vstupujú pokladničné doklady a{" "}
              <Link to="/doklady" className="text-primary hover:underline">
                doklady zaplatené v hotovosti
              </Link>
              . Doklad zaplatený kartou alebo prevodom hotovosť neuberá.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Dátum</th>
                  <th className="p-3">Číslo</th>
                  <th className="p-3">Popis</th>
                  <th className="p-3">Zdroj</th>
                  <th className="p-3 text-right">Suma</th>
                  <th className="p-3 text-right">Zostatok</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.riadky ?? []).map((r: any) => (
                  <tr key={`${r.zdroj}-${r.id}`} className="hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground">{formatujDatum(r.datum)}</td>
                    <td className="p-3">{r.cislo || "—"}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5">
                        {r.typ === "prijem" ? (
                          <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                        {r.popis}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {r.zdroj === "doklad" ? (
                        <Link to="/doklady" className="hover:underline">
                          Doklad v hotovosti
                        </Link>
                      ) : (
                        "Pokladničný doklad"
                      )}
                    </td>
                    <td
                      className={`p-3 text-right tabular-nums ${
                        r.typ === "prijem" ? "text-emerald-600" : ""
                      }`}
                    >
                      {r.typ === "prijem" ? "+" : "−"}
                      {suma(r.suma)}
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums">{suma(r.zostatok)}</td>
                    <td className="p-3 text-right">
                      {r.zdroj === "pokladnicny" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => zmaz(r.id)}
                          className="text-destructive hover:underline disabled:opacity-50"
                          title="Zmazať doklad"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data?.locked_until && (
          <p className="mt-3 text-xs text-muted-foreground">
            Obdobie je uzamknuté do {formatujDatum(data.locked_until)} — doklady s tým a starším
            dátumom sa už nedajú pridať ani zmazať.
          </p>
        )}
      </PageBody>
    </>
  );
}
