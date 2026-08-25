import { useCallback, useEffect, useState } from "react";
import { Copy, Check, ShieldCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Banner s potvrdením preposielania z Gmailu.
 *
 * Google posiela žiadosť o potvrdenie na adresu, na ktorú sa má preposielať —
 * teda na tú našu. Používateľ sa k nej inak nedostane a preposielanie nikdy
 * nezapne.
 *
 * Mail má dve podoby a **častejšia je tá bez kódu**, len s odkazom. Keď kód
 * príde, je tu aj textom: odkaz vie vypršať a otvoriť sa v inom profile
 * prehliadača, kde je človek prihlásený pod iným Googlom — vtedy sa dá kód
 * opísať priamo v Gmaile. Keď nepríde, o kóde sa mlčí.
 */

type Potvrdenie = {
  id: string;
  provider: string;
  source_email: string | null;
  code: string | null;
  confirm_url: string | null;
  received_at: string;
};

export function PotvrdeniePreposielania({ companyId }: { companyId: string | null }) {
  const [potvrdenia, setPotvrdenia] = useState<Potvrdenie[]>([]);
  const [skopirovany, setSkopirovany] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState(false);

  const nacitaj = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("inbox_verifications")
      .select("id, provider, source_email, code, confirm_url, received_at")
      .eq("company_id", companyId)
      .is("confirmed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("received_at", { ascending: false });
    if (!error) setPotvrdenia((data ?? []) as Potvrdenie[]);
  }, [companyId]);

  useEffect(() => {
    void nacitaj();
    if (!companyId) return;
    /*
      Mail príde v okamihu, keď človek v Gmaile klikne na „Pridať adresu" —
      stránku už znovu neotvorí. Bez tohto by tam sedel a čakal na nič.
    */
    const kanal = supabase
      .channel(`potvrdenia-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_verifications",
          filter: `company_id=eq.${companyId}`,
        },
        () => void nacitaj(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(kanal);
    };
  }, [companyId, nacitaj]);

  if (!companyId || potvrdenia.length === 0) return null;

  async function kopiruj(p: Potvrdenie) {
    if (!p.code) return;
    await navigator.clipboard.writeText(p.code).catch(() => {});
    setSkopirovany(p.id);
    setTimeout(() => setSkopirovany(null), 2000);
  }

  async function uzPotvrdene(p: Potvrdenie) {
    setPracuje(true);
    try {
      const { error } = await supabase
        .from("inbox_verifications")
        .update({ confirmed_at: new Date().toISOString() })
        .eq("id", p.id);
      if (error) throw new Error(error.message);
      setPotvrdenia((s) => s.filter((x) => x.id !== p.id));
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setPracuje(false);
    }
  }

  return (
    <>
      {potvrdenia.map((p) => (
        <div
          key={p.id}
          className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900/40"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" />
            Google žiada potvrdenie preposielania
            {p.source_email ? ` z ${p.source_email}` : ""}
          </div>

          {/* Google posiela dve podoby mailu: s kódom a — častejšie — len s
              odkazom. Keď kód neprišiel, nemá sa o ňom nikde písať, inak človek
              hľadá niečo, čo v maile vôbec nebolo. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {p.code ? (
              <>
                <code className="rounded-md border border-amber-300 bg-white px-3 py-2 text-lg font-semibold tracking-wider tabular-nums dark:bg-card dark:border-amber-900/40">
                  {p.code}
                </code>
                <button
                  onClick={() => kopiruj(p)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm hover:bg-amber-100 dark:bg-card dark:border-amber-900/40"
                >
                  {skopirovany === p.id ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {skopirovany === p.id ? "Skopírované" : "Kopírovať kód"}
                </button>
              </>
            ) : null}

            {p.confirm_url && (
              <a
                href={p.confirm_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                <ExternalLink className="h-4 w-4" /> Potvrdiť preposielanie
              </a>
            )}

            <button
              disabled={pracuje}
              onClick={() => uzPotvrdene(p)}
              className="ml-auto rounded-md border border-amber-300 px-3 py-2 text-sm hover:bg-amber-100 disabled:opacity-60 dark:border-amber-900/40"
            >
              Už som potvrdil
            </button>
          </div>

          <p className="mt-2 text-xs">
            {p.code
              ? "Kód sa dá zadať aj ručne v Gmaile → Nastavenia → Preposielanie a POP/IMAP. "
              : ""}
            Odkaz funguje len v prehliadači prihlásenom do tej istej schránky.
          </p>
        </div>
      ))}
    </>
  );
}
