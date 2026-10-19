import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Mail, RefreshCw, ExternalLink, Trash2, Check, AlertCircle } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useT } from "@/lib/i18n/useT";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";
import { potvrd } from "@/lib/potvrdenie";
import { formatujSumu } from "@/lib/faktero/zostatky";
import { BANKY, INA_BANKA, bankaPodlaKodu } from "@/lib/faktero/banka-notifikacie";
import {
  stavNotifikacii,
  zapniNotifikacie,
  nastavNotifikacie,
  novaAdresaNotifikacii,
  mailyNotifikacii,
  zaradNotifikaciu,
  zahodNotifikaciu,
} from "@/lib/faktero/banka-notifikacie.functions";

export const Route = createFileRoute("/_authenticated/bankove-ucty/notifikacie")({
  head: ({ match }) => ({
    meta: [
      {
        title: preloz(match.context.jazyk ?? "sk", "Párovanie cez e-mailové notifikácie — Faktero"),
      },
    ],
  }),
  component: NotifikaciePage,
});

const NOVY = "__novy__";

const STAVY: Record<string, string> = {
  spracovane: "Pohyb založený",
  na_kontrolu: "Na kontrolu",
  duplicita: "Duplicita",
  zahodene: "Zahodené",
  nie_pohyb: "Nie je o pohybe",
  chyba: "Chyba",
};

const vstup = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const tlacidlo =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-secondary disabled:opacity-50";

function NotifikaciePage() {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const stavFn = useServerFn(stavNotifikacii);
  const zapniFn = useServerFn(zapniNotifikacie);
  const nastavFn = useServerFn(nastavNotifikacie);
  const novaFn = useServerFn(novaAdresaNotifikacii);
  const mailyFn = useServerFn(mailyNotifikacii);
  const [cid, setCid] = useState<string | null>(null);
  const [stav, setStav] = useState<any | null>(null);
  const [maily, setMaily] = useState<any[]>([]);
  const [vsetky, setVsetky] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Formulár na pridanie
  const [banka, setBanka] = useState<string>(BANKY[0]!.kod);
  const [ucet, setUcet] = useState<string>(NOVY);
  const [iban, setIban] = useState("");
  const [nazov, setNazov] = useState("");
  const [mena, setMena] = useState("EUR");

  useEffect(() => setCid(getActiveCompanyId()), []);

  async function obnov() {
    if (!cid) return;
    try {
      const [s, m]: any[] = await Promise.all([
        stavFn({ data: { company_id: cid } }),
        mailyFn({ data: { company_id: cid, len: vsetky ? "vsetky" : "na_kontrolu" } }),
      ]);
      setStav(s);
      setMaily(m.maily ?? []);
      if (s.uctyNaZapnutie?.length && ucet === NOVY && !iban) setUcet(s.uctyNaZapnutie[0].id);
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    }
  }
  useEffect(() => {
    obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, vsetky]);

  async function sprav(co: string, akcia: () => Promise<any>, hlaska?: string) {
    setBusy(co);
    try {
      await akcia();
      if (hlaska) toast.success(hlaska);
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(null);
    }
  }

  async function kopiruj(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("Adresa skopírovaná"));
    } catch {
      toast.error(t("Kopírovanie sa nepodarilo — označte adresu a skopírujte ju ručne."));
    }
  }

  return (
    <>
      <PageHeader
        title={t("Párovanie cez e-mailové notifikácie")}
        description={t(
          "Pre banky bez priameho pripojenia: banka vám o každej platbe pošle e-mail na tajnú adresu a Faktero z neho založí pohyb a spáruje ho s faktúrou.",
        )}
      />
      <PageBody>
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground/80">
            <ul className="space-y-1">
              <li>
                •{" "}
                {t(
                  "Každý účet má vlastnú adresu. Nikomu ju nedávajte — kto ju pozná, môže na ňu poslať e-mail.",
                )}
              </li>
              <li>
                •{" "}
                {t(
                  "Pohyb sa založí sám len z e-mailu, ktorý banka podpísala (DKIM). Ručne preposlané alebo nepodpísané e-maily čakajú nižšie na kontrolu.",
                )}
              </li>
              <li>
                •{" "}
                {t(
                  "Faktúra sa označí ako zaplatená automaticky len vtedy, keď sedí variabilný symbol aj suma. Ostatné uvidíte ako návrhy v párovaní.",
                )}
              </li>
            </ul>
          </div>

          {stav?.adresy?.map((a: any) => {
            const b = bankaPodlaKodu(a.banka);
            return (
              <div key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{a.ucet?.nazov ?? a.ucet?.iban ?? t("Účet")}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {a.ucet?.iban ?? "—"}
                    </div>
                  </div>
                  {a.active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <Check className="h-3 w-3" /> {t("Prijíma")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      {t("Vypnuté")}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
                  <code className="min-w-0 flex-1 break-all text-sm">{a.adresa}</code>
                  <button onClick={() => kopiruj(a.adresa)} className={tlacidlo}>
                    <Copy className="h-3.5 w-3.5" /> {t("Kopírovať")}
                  </button>
                </div>

                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    {a.last_received_at
                      ? t("Posledný e-mail: {cas}", {
                          cas: new Date(a.last_received_at).toLocaleString(loc),
                        })
                      : t("Zatiaľ neprišiel žiadny e-mail.")}
                  </div>
                  <div>
                    {t("Za 90 dní: pohybov {p}, na kontrolu {k}, chýb {c}", {
                      p: a.pohybov,
                      k: a.naKontrolu,
                      c: a.chyb,
                    })}
                  </div>
                </div>

                {a.potvrdenie && (a.potvrdenie.code || a.potvrdenie.confirm_url) && (
                  <div className="mt-4 rounded-lg border border-sky-300/60 bg-sky-50 p-3 text-sm dark:border-sky-900/50 dark:bg-sky-950/30">
                    <div className="font-medium">{t("Potvrdenie preposielania z Gmailu")}</div>
                    <p className="mt-1 text-foreground/80">
                      {a.potvrdenie.source_email
                        ? t("Gmail ({schranka}) čaká na potvrdenie, že sem smie preposielať.", {
                            schranka: a.potvrdenie.source_email,
                          })
                        : t("Gmail čaká na potvrdenie, že sem smie preposielať.")}
                    </p>
                    {a.potvrdenie.code && (
                      <p className="mt-1">
                        {t("Kód:")}{" "}
                        <code className="font-mono text-base font-semibold">
                          {a.potvrdenie.code}
                        </code>
                      </p>
                    )}
                    {a.potvrdenie.confirm_url && (
                      <a
                        href={a.potvrdenie.confirm_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sky-700 hover:underline dark:text-sky-300"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> {t("Potvrdiť v Gmaile")}
                      </a>
                    )}
                  </div>
                )}

                <div className="mt-4">
                  <label className="text-xs font-medium text-muted-foreground">{t("Banka")}</label>
                  <select
                    value={a.banka}
                    disabled={busy !== null}
                    onChange={(e) =>
                      sprav(`banka-${a.id}`, () =>
                        nastavFn({
                          data: { company_id: cid!, adresa_id: a.id, banka: e.target.value },
                        }),
                      )
                    }
                    className={`${vstup} mt-1 max-w-xs`}
                  >
                    {BANKY.map((x) => (
                      <option key={x.kod} value={x.kod}>
                        {x.nazov}
                      </option>
                    ))}
                    <option value={INA_BANKA}>{t("Iná banka")}</option>
                  </select>
                </div>
                <Navod banka={b} />

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={busy !== null}
                    onClick={() =>
                      sprav(
                        `aktiv-${a.id}`,
                        () =>
                          nastavFn({
                            data: { company_id: cid!, adresa_id: a.id, active: !a.active },
                          }),
                        a.active
                          ? t("Príjem notifikácií vypnutý.")
                          : t("Príjem notifikácií zapnutý."),
                      )
                    }
                    className={tlacidlo}
                  >
                    {a.active ? t("Vypnúť príjem") : t("Zapnúť príjem")}
                  </button>
                  <button
                    disabled={busy !== null}
                    onClick={async () => {
                      if (
                        !(await potvrd(
                          t(
                            "Vytvoriť novú adresu? Stará prestane fungovať hneď a v banke ju budete musieť zmeniť.",
                          ),
                        ))
                      )
                        return;
                      sprav(
                        `nova-${a.id}`,
                        () => novaFn({ data: { company_id: cid!, adresa_id: a.id } }),
                        t("Nová adresa je pripravená — zmeňte ju aj v banke."),
                      );
                    }}
                    className={tlacidlo}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> {t("Nová adresa")}
                  </button>
                  {a.ucet && (
                    <Link
                      to="/bankove-ucty/transakcie"
                      search={{ account: a.ucet.id } as any}
                      className={tlacidlo}
                    >
                      {t("Transakcie")}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}

          <div className="rounded-2xl border border-dashed border-border bg-card p-5">
            <h2 className="font-semibold">
              {stav?.adresy?.length ? t("Pridať ďalší účet") : t("Zapnúť pre účet")}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("Banka")}</label>
                <select
                  value={banka}
                  onChange={(e) => setBanka(e.target.value)}
                  className={`${vstup} mt-1`}
                >
                  {BANKY.map((x) => (
                    <option key={x.kod} value={x.kod}>
                      {x.nazov}
                    </option>
                  ))}
                  <option value={INA_BANKA}>{t("Iná banka")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("Účet")}</label>
                <select
                  value={ucet}
                  onChange={(e) => setUcet(e.target.value)}
                  className={`${vstup} mt-1`}
                >
                  {(stav?.uctyNaZapnutie ?? []).map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.nazov ?? u.iban} {u.iban && u.nazov !== u.iban ? `· ${u.iban}` : ""}
                    </option>
                  ))}
                  <option value={NOVY}>{t("Nový účet (zadám IBAN)")}</option>
                </select>
              </div>
              {ucet === NOVY && (
                <>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">IBAN</label>
                    <input
                      value={iban}
                      onChange={(e) => setIban(e.target.value)}
                      placeholder="SK00 0000 0000 0000 0000 0000"
                      className={`${vstup} mt-1 font-mono`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      {t("Názov účtu")}
                    </label>
                    <input
                      value={nazov}
                      onChange={(e) => setNazov(e.target.value)}
                      placeholder={t("napr. Bežný účet")}
                      className={`${vstup} mt-1`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t("Mena")}</label>
                    <select
                      value={mena}
                      onChange={(e) => setMena(e.target.value)}
                      className={`${vstup} mt-1`}
                    >
                      {["EUR", "CZK", "USD", "GBP", "PLN", "HUF", "CHF"].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <Navod banka={bankaPodlaKodu(banka)} />
            <button
              disabled={
                busy !== null || !cid || (ucet === NOVY && iban.replace(/\s/g, "").length < 15)
              }
              onClick={() =>
                sprav(
                  "zapni",
                  async () => {
                    await zapniFn({
                      data: {
                        company_id: cid!,
                        bank_account_id: ucet === NOVY ? null : ucet,
                        iban: ucet === NOVY ? iban : undefined,
                        nazov: ucet === NOVY ? nazov : undefined,
                        mena: ucet === NOVY ? mena : undefined,
                        banka,
                      },
                    });
                    setIban("");
                    setNazov("");
                  },
                  t("Adresa je pripravená — skopírujte ju do internetbankingu."),
                )
              }
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />{" "}
              {busy === "zapni" ? t("Vytváram…") : t("Vytvoriť adresu")}
            </button>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Účet napojený na banku cez API tu nie je — pohyby z neho už chodia priamo a notifikácie by ich zdvojili.",
              )}
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {vsetky ? t("Všetky prijaté e-maily") : t("E-maily na kontrolu")}
              </h2>
              <button onClick={() => setVsetky(!vsetky)} className={tlacidlo}>
                {vsetky ? t("Len na kontrolu") : t("Zobraziť všetky")}
              </button>
            </div>
            {maily.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {vsetky ? t("Zatiaľ neprišiel žiadny e-mail.") : t("Nič nečaká na kontrolu.")}
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {maily.map((m) => (
                  <MailNaKontrolu key={m.id} mail={m} cid={cid!} poZmene={obnov} />
                ))}
              </div>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Navod({ banka }: { banka: ReturnType<typeof bankaPodlaKodu> }) {
  const { t } = useT();
  return (
    <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">
      <div className="font-medium">{t("Ako to zapnúť v banke")}</div>
      {banka && banka.navod.length > 0 ? (
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-foreground/80">
          {banka.navod.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 text-foreground/80">
          {t(
            "V internetbankingu nájdite nastavenie notifikácií (avíz, upozornení) o pohyboch na účte, zvoľte posielanie e-mailom pri prijatých aj odoslaných platbách a ako adresu zadajte tú vyššie.",
          )}
        </p>
      )}
      <p className="mt-2 text-foreground/80">
        {t(
          "Ak banka dovolí len jednu adresu, nechajte notifikácie chodiť vám a v Gmaile si nastavte automatické preposielanie sem. Overovací kód od Gmailu sa potom zobrazí tu.",
        )}
      </p>
      {banka?.poznamka && (
        <p className="mt-2 text-amber-700 dark:text-amber-300">{t(banka.poznamka)}</p>
      )}
      {banka?.zdroj && (
        <a
          href={banka.zdroj}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> {t("Zdroj návodu")}
        </a>
      )}
    </div>
  );
}

function MailNaKontrolu({
  mail,
  cid,
  poZmene,
}: {
  mail: any;
  cid: string;
  poZmene: () => Promise<void>;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const zaradFn = useServerFn(zaradNotifikaciu);
  const zahodFn = useServerFn(zahodNotifikaciu);
  const u = mail.udaje ?? {};
  const [otvoreny, setOtvoreny] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    smer: (u.smer as string) ?? "kredit",
    suma: u.suma != null ? String(u.suma) : "",
    mena: (u.mena as string) ?? "EUR",
    datum: (u.datum as string) ?? new Date(mail.received_at).toISOString().slice(0, 10),
    vs: (u.vs as string) ?? "",
    ks: (u.ks as string) ?? "",
    ss: (u.ss as string) ?? "",
    protistrana: (u.protistrana as string) ?? "",
    protistrana_iban: (u.protistranaIban as string) ?? "",
    sprava: (u.sprava as string) ?? "",
  });
  const caka = mail.stav === "na_kontrolu" || mail.stav === "chyba";
  const sumaCislo = Number(f.suma.replace(/\s/g, "").replace(",", "."));

  async function zarad(ajDuplicitu = false) {
    setBusy(true);
    try {
      const r: any = await zaradFn({
        data: {
          company_id: cid,
          mail_id: mail.id,
          smer: f.smer as "kredit" | "debet",
          suma: sumaCislo,
          mena: f.mena,
          datum: f.datum,
          vs: f.vs || null,
          ks: f.ks || null,
          ss: f.ss || null,
          protistrana: f.protistrana || null,
          protistrana_iban: f.protistrana_iban || null,
          sprava: f.sprava || null,
          aj_duplicitu: ajDuplicitu,
        },
      });
      if (r.stav === "duplicita") {
        if (await potvrd(t("Rovnaký pohyb (deň, suma, VS) už na účte je. Založiť aj tak?"))) {
          setBusy(false);
          return zarad(true);
        }
      } else {
        toast.success(t("Pohyb založený."));
        await poZmene();
      }
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(false);
    }
  }

  async function zahod() {
    setBusy(true);
    try {
      await zahodFn({ data: { company_id: cid, mail_id: mail.id } });
      toast.success(t("E-mail zahodený."));
      await poZmene();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(false);
    }
  }

  const policko = (kluc: keyof typeof f, popis: string, extra = "") => (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{popis}</label>
      <input
        value={f[kluc]}
        onChange={(e) => setF({ ...f, [kluc]: e.target.value })}
        className={`${vstup} mt-1 ${extra}`}
      />
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{mail.subject ?? t("(bez predmetu)")}</div>
          <div className="truncate text-xs text-muted-foreground">
            {new Date(mail.received_at).toLocaleString(loc)} · {mail.from_email ?? "—"}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            mail.stav === "spracovane"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : caka
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {t(STAVY[mail.stav] ?? mail.stav)}
        </span>
      </div>
      {u.suma != null && (
        <div className="mt-2 text-sm tabular-nums">
          {u.smer === "debet" ? "\u2212" : "+"}
          {formatujSumu(Number(u.suma), u.mena ?? "EUR")}
          {u.vs ? ` · VS ${u.vs}` : ""}
          {u.protistrana ? ` · ${u.protistrana}` : ""}
        </div>
      )}
      {mail.dovod && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t(mail.dovod)}
        </p>
      )}
      <div className="mt-1 text-[11px] text-muted-foreground">
        {[
          mail.overenie,
          mail.sposob === "ai"
            ? t("prečítala AI")
            : mail.sposob?.startsWith("pravidlo")
              ? t("prečítané pravidlom banky")
              : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setOtvoreny(!otvoreny)} className={tlacidlo}>
          {otvoreny ? t("Skryť") : caka ? t("Skontrolovať a zaradiť") : t("Zobraziť e-mail")}
        </button>
        {caka && (
          <button
            disabled={busy}
            onClick={zahod}
            className={`${tlacidlo} text-destructive hover:bg-destructive/10`}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("Zahodiť")}
          </button>
        )}
      </div>

      {otvoreny && (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-xs">
            {mail.text_mailu ?? t("Text e-mailu nie je uložený.")}
          </pre>
          {caka && (
            <div className="grid content-start gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("Smer")}</label>
                <select
                  value={f.smer}
                  onChange={(e) => setF({ ...f, smer: e.target.value })}
                  className={`${vstup} mt-1`}
                >
                  <option value="kredit">{t("Prijatá platba")}</option>
                  <option value="debet">{t("Odoslaná platba")}</option>
                </select>
              </div>
              {policko("suma", t("Suma"), "tabular-nums")}
              {policko("mena", t("Mena"))}
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("Dátum")}</label>
                <input
                  type="date"
                  value={f.datum}
                  onChange={(e) => setF({ ...f, datum: e.target.value })}
                  className={`${vstup} mt-1`}
                />
              </div>
              {policko("vs", t("Variabilný symbol"), "font-mono")}
              {policko("ks", t("Konštantný symbol"), "font-mono")}
              {policko("ss", t("Špecifický symbol"), "font-mono")}
              {policko("protistrana", t("Protistrana"))}
              {policko("protistrana_iban", t("Účet protistrany"), "font-mono")}
              {policko("sprava", t("Správa pre príjemcu"))}
              <div className="sm:col-span-2">
                <button
                  disabled={busy || !(sumaCislo > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(f.datum)}
                  onClick={() => zarad()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {busy ? t("Zakladám…") : t("Založiť pohyb")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
