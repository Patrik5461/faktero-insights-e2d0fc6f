import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2, Paperclip } from "lucide-react";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ListPagination, useStoredPageSize } from "@/components/faktero/ListControls";
import { zadaj } from "@/lib/potvrdenie";
import {
  adminTelegramSkupinaSpravyFn,
  adminTelegramSkupinaVybavFn,
} from "@/lib/faktero/telegram-skupina.functions";

export const Route = createFileRoute("/admin/podpora/telegram-skupina")({
  head: () => ({ meta: [{ title: "Admin · Telegram skupina — Faktero" }] }),
  component: TelegramSkupinaPage,
});

type Stav = "vsetky" | "nevybavene" | "vybavene";
const STAVY: { kod: Stav; nazov: string }[] = [
  { kod: "nevybavene", nazov: "Nevybavené" },
  { kod: "vybavene", nazov: "Vybavené" },
  { kod: "vsetky", nazov: "Všetky" },
];

/** `YYYY-MM-DD` z poľa dátumu → okamih začiatku dňa v časovom pásme prehliadača. */
function zaciatokDna(d: string, posun = 0): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return undefined;
  const [r, m, den] = d.split("-").map(Number) as [number, number, number];
  return new Date(r, m - 1, den + posun).toISOString();
}

function TelegramSkupinaPage() {
  const nacitajFn = useServerFn(adminTelegramSkupinaSpravyFn);
  const vybavFn = useServerFn(adminTelegramSkupinaVybavFn);
  const [stav, setStav] = useState<Stav>("nevybavene");
  const [od, setOd] = useState("");
  const [doDna, setDoDna] = useState("");
  const [strana, setStrana] = useState(1);
  const [pageSize, setPageSize] = useStoredPageSize("admin-telegram-skupina", 50);
  const [data, setData] = useState<Awaited<ReturnType<typeof adminTelegramSkupinaSpravyFn>> | null>(
    null,
  );
  const [chyba, setChyba] = useState<string | null>(null);

  useEffect(() => setStrana(1), [stav, od, doDna, pageSize]);

  const nacitaj = useCallback(async () => {
    setChyba(null);
    try {
      setData(
        await nacitajFn({
          data: {
            stav,
            od: zaciatokDna(od),
            do: zaciatokDna(doDna, 1),
            strana,
            naStranu: pageSize,
          },
        }),
      );
    } catch (e) {
      setChyba((e as Error).message);
    }
  }, [nacitajFn, stav, od, doDna, strana, pageSize]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  async function oznac(id: string, vybavene: boolean, povodna: string | null) {
    let poznamka = povodna;
    if (vybavene) {
      const v = await zadaj("Poznámka k vybaveniu (nepovinné)", {
        predvolene: povodna ?? "",
        povolitPrazdne: true,
      });
      if (v === null) return;
      poznamka = v;
    }
    try {
      await vybavFn({ data: { id, vybavene, poznamka } });
      await nacitaj();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Telegram skupina"
        description="Správy zo spárovanej skupiny účtovníkov. Bot ich len ukladá — požiadavky z nich nevznikajú."
      />
      <AdminPageBody>
        <p className="mb-3 text-sm">
          <Link to="/admin/podpora" className="text-primary hover:underline">
            ← Podpora
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {STAVY.map((s) => (
            <button
              key={s.kod}
              onClick={() => setStav(s.kod)}
              className={`rounded-full border px-3 py-1 text-sm ${
                stav === s.kod
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-secondary"
              }`}
            >
              {s.nazov}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
            Od
            <input
              type="date"
              value={od}
              onChange={(e) => setOd(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-1 text-sm text-muted-foreground">
            Do
            <input
              type="date"
              value={doDna}
              onChange={(e) => setDoDna(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
        </div>

        {chyba && <p className="mt-4 text-sm text-destructive">{chyba}</p>}
        {!data ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
          </div>
        ) : data.spravy.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Žiadne správy.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {data.spravy.map((s) => (
              <li
                key={s.id}
                className={`rounded-xl border border-border bg-card p-3 ${s.vybavene ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {s.od_meno || (s.od_username ? `@${s.od_username}` : "Neznámy")}
                  </span>
                  <span>{new Date(s.created_at).toLocaleString("sk-SK")}</span>
                  {s.upravene_at && (
                    <span>upravené {new Date(s.upravene_at).toLocaleString("sk-SK")}</span>
                  )}
                  {s.odpoved_na && <span>odpoveď na správu #{s.odpoved_na}</span>}
                  <button
                    onClick={() => oznac(s.id, !s.vybavene, s.poznamka)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-secondary"
                  >
                    {s.vybavene ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Vybavené
                      </>
                    ) : (
                      <>
                        <Circle className="h-3.5 w-3.5" /> Označiť ako vybavené
                      </>
                    )}
                  </button>
                </div>
                {s.text && (
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">{s.text}</p>
                )}
                {s.prilohy.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {s.prilohy.map((p, i) => (
                      <li key={i} className="text-xs">
                        {p.url ? (
                          p.mime?.startsWith("image/") &&
                          p.mime !== "image/heic" &&
                          p.mime !== "image/heif" ? (
                            <a href={p.url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={p.url}
                                alt={p.nazov}
                                className="h-24 max-w-[12rem] rounded border border-border object-cover"
                              />
                            </a>
                          ) : (
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <Paperclip className="h-3.5 w-3.5" /> {p.nazov}
                            </a>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Paperclip className="h-3.5 w-3.5" /> {p.nazov} — neuložené (
                            {p.chyba === "typ"
                              ? "len obrázky a PDF"
                              : p.chyba === "velky"
                                ? "viac než 10 MB"
                                : "nepodarilo sa stiahnuť"}
                            )
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {s.vybavene && s.poznamka && (
                  <p className="mt-1.5 text-xs text-muted-foreground">Poznámka: {s.poznamka}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {data && data.pocet > 0 && (
          <ListPagination
            page={strana}
            pageSize={pageSize}
            total={data.pocet}
            onPageChange={setStrana}
            onPageSizeChange={setPageSize}
          />
        )}
      </AdminPageBody>
    </>
  );
}
