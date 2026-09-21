import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { nastavCitliveUdaje, ulozZamestnanca } from "@/lib/faktero/zamestnanci.functions";
import {
  FormularZamestnanca,
  pole,
  popis,
  prazdneUdaje,
  tlacidlo,
  tlacidloObrys,
} from "@/components/faktero/zamestnanci/ui";

export const Route = createFileRoute("/_authenticated/zamestnanci/novy")({
  head: () => ({ meta: [{ title: "Nový zamestnanec — Faktero" }] }),
  component: NovyZamestnanec,
});

function NovyZamestnanec() {
  const uloz = useServerFn(ulozZamestnanca);
  const ulozCitlive = useServerFn(nastavCitliveUdaje);
  const nav = useNavigate();
  const [udaje, setUdaje] = useState(prazdneUdaje);
  const [rodneCislo, setRodneCislo] = useState("");
  const [opCislo, setOpCislo] = useState("");
  const [uklada, setUklada] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  async function odoslat(e: React.FormEvent) {
    e.preventDefault();
    const cid = getActiveCompanyId();
    if (!cid) return;
    if (!udaje.first_name.trim() || !udaje.last_name.trim()) {
      setChyba("Meno a priezvisko sú povinné.");
      return;
    }
    setUklada(true);
    setChyba(null);
    try {
      const { id } = await uloz({ data: { company_id: cid, ...udaje } });
      // Citlivé údaje idú zvlášť — do databázy sa zapíšu už zašifrované.
      if (rodneCislo.trim() || opCislo.trim()) {
        await ulozCitlive({
          data: {
            company_id: cid,
            id,
            ...(rodneCislo.trim() ? { rodne_cislo: rodneCislo } : {}),
            ...(opCislo.trim() ? { op_cislo: opCislo } : {}),
          },
        });
      }
      nav({ to: "/zamestnanci/$id", params: { id } });
    } catch (err: any) {
      setChyba(err?.message ?? "Zamestnanca sa nepodarilo uložiť.");
    } finally {
      setUklada(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Nový zamestnanec"
        description="Stačí meno a priezvisko, ostatné doplníte kedykoľvek neskôr."
        action={
          <Link to="/zamestnanci" className={tlacidloObrys}>
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <form onSubmit={odoslat} className="max-w-3xl space-y-4">
          {chyba && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{chyba}</div>
          )}
          <FormularZamestnanca udaje={udaje} zmen={setUdaje} />
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-1 text-sm font-semibold">Citlivé údaje</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Rodné číslo a číslo občianskeho preukazu sa ukladajú šifrované. Zobraziť ich bude možné len na karte
              zamestnanca a každé zobrazenie sa zapíše.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={popis} htmlFor="zam-rc">
                  Rodné číslo
                </label>
                <input id="zam-rc" className={pole} value={rodneCislo} onChange={(e) => setRodneCislo(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <label className={popis} htmlFor="zam-op">
                  Číslo občianskeho preukazu
                </label>
                <input id="zam-op" className={pole} value={opCislo} onChange={(e) => setOpCislo(e.target.value)} autoComplete="off" />
              </div>
            </div>
          </section>
          <div className="flex justify-end gap-2">
            <Link to="/zamestnanci" className={tlacidloObrys}>
              Zrušiť
            </Link>
            <button type="submit" className={tlacidlo} disabled={uklada}>
              {uklada ? "Ukladám…" : "Uložiť zamestnanca"}
            </button>
          </div>
        </form>
      </PageBody>
    </>
  );
}
