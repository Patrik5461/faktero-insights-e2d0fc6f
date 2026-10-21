import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  UserRoundPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { Logo } from "@/components/faktero/Logo";
import {
  coZobrazitOznam,
  jePlatnyEmail,
  PLATNOST_POZVANKY_DNI,
} from "@/lib/faktero/efaktura-oznam";
import {
  pozviUctovnikaEfakturyFn,
  stavOznamuEfakturyFn,
  zaznamenajOznamEfakturyFn,
  zrusPozvankuUctovnikaFn,
} from "@/lib/faktero/efaktura-oznam.functions";
import { createInvitationFn } from "@/lib/faktero/invitations.functions";

/**
 * Oznam o povinnej e-fakturácii od 1. 1. 2027.
 *
 * Okno po prihlásení pre majiteľa a admina slovenskej firmy bez aktivovanej
 * eFaktúry; kým čaká pozvaný účtovník, namiesto okna tenký pás hore. Kedy
 * čo, rozhoduje `coZobrazitOznam` (efaktura-oznam.ts), stav je v DB
 * (`efaktura_oznam`, `efaktura_aktivacia_pozvanky`).
 */
export function EfakturaOznam({
  companyId,
  rola,
  krajina,
}: {
  companyId: string | null;
  rola: string | null | undefined;
  krajina: string | null | undefined;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nacitaj = useServerFn(stavOznamuEfakturyFn);
  const spravca = rola === "owner" || rola === "admin";
  const q = useQuery({
    queryKey: ["efaktura-oznam", companyId],
    queryFn: () => nacitaj({ data: { company_id: companyId! } }),
    // Česká a nemecká firma ani iné roly sa na server vôbec nepýtajú.
    enabled: !!companyId && spravca && (krajina ?? "SK") === "SK",
    staleTime: 5 * 60_000,
    retry: false,
  });

  const s = q.data;
  const zobrazenie =
    s && s.relevantne
      ? coZobrazitOznam({
          rola: s.rola,
          krajina: s.krajina,
          aktivovana: s.aktivovana,
          dismissedAt: s.dismissedAt,
          ctaClickedAt: s.ctaClickedAt,
          uctovnikPozvany: !!s.pozvanka,
          cesta: pathname,
        })
      : "nic";

  /* Okno, ktoré človek práve zatvoril, sa nesmie vrátiť, kým sa stav znova
     nenačíta — a po odoslaní pozvánky ostane otvorené, aby videl výsledok. */
  const [zavrete, setZavrete] = useState(false);
  const [drzOtvorene, setDrzOtvorene] = useState(false);
  const [podrobnosti, setPodrobnosti] = useState(false);

  if (!companyId || !s || !s.relevantne) return null;

  return (
    <>
      {zobrazenie === "pas" && s.pozvanka && (
        <PasCakame
          email={s.pozvanka.email}
          hotovo={!!s.pozvanka.hotovoAt}
          onPodrobnosti={() => setPodrobnosti(true)}
        />
      )}
      <OknoOznamu
        otvorene={(zobrazenie === "okno" && !zavrete) || drzOtvorene}
        companyId={companyId}
        onZavri={() => {
          setZavrete(true);
          setDrzOtvorene(false);
        }}
        onPozvanie={() => setDrzOtvorene(true)}
      />
      {s.pozvanka && (
        <PodrobnostiPozvanky
          otvorene={podrobnosti}
          onZavri={() => setPodrobnosti(false)}
          companyId={companyId}
          pozvanka={s.pozvanka}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function PasCakame({
  email,
  hotovo,
  onPodrobnosti,
}: {
  email: string;
  hotovo: boolean;
  onPodrobnosti: () => void;
}) {
  const { t } = useT();
  return (
    <div
      role="status"
      data-efaktura-pas
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary/20 bg-primary/5 px-4 py-2 text-xs sm:px-6 lg:px-8"
    >
      <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        {hotovo
          ? t("Účtovník oznámil, že Faktero vybral — čakáme na potvrdenie od Finančnej správy.")
          : t("Čakáme na aktiváciu e-fakturácie vaším účtovníkom")}{" "}
        <span className="text-muted-foreground">({email})</span>
      </span>
      <button
        type="button"
        onClick={onPodrobnosti}
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        {t("Podrobnosti")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Banner okna: logo Faktera ⇄ štítok Peppol, vlastná grafika v našich farbách. */
function BannerPeppol() {
  const { t } = useT();
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-background px-4 py-5 sm:px-6">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full text-primary/10"
        viewBox="0 0 400 120"
        preserveAspectRatio="xMidYMid slice"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="40" cy="20" r="26" />
          <circle cx="360" cy="100" r="34" />
          <path d="M0 95 C 90 60, 160 120, 250 80 S 380 30, 400 40" />
        </g>
      </svg>
      <div className="relative flex items-center justify-center gap-3 sm:gap-5">
        <div className="rounded-lg bg-card px-3 py-2 shadow-sm ring-1 ring-border">
          <Logo className="h-7 sm:h-8" />
        </div>
        <svg aria-hidden viewBox="0 0 48 24" className="h-6 w-10 shrink-0 text-primary sm:w-12">
          <path
            d="M2 8h38l-6-5M46 16H8l6 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <PeppolStitok />
      </div>
      <p className="relative mt-3 text-center text-xs text-muted-foreground">
        {t("Odosielanie aj príjem eFaktúr cez sieť Peppol")}
      </p>
    </div>
  );
}

/** Jednoduchý štítok „Peppol" — nie oficiálne logo, len naša značka siete. */
function PeppolStitok() {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-primary-foreground shadow-sm"
      aria-label="Peppol"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
        <g fill="currentColor">
          <circle cx="5" cy="12" r="2.6" />
          <circle cx="18" cy="5.5" r="2.6" />
          <circle cx="18" cy="18.5" r="2.6" />
        </g>
        <g stroke="currentColor" strokeWidth="1.6" fill="none">
          <path d="M7.3 10.8 15.7 6.7M7.3 13.2l8.4 4.1M18 8.1v7.8" />
        </g>
      </svg>
      <span className="text-sm font-semibold tracking-wide sm:text-base">Peppol</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function OknoOznamu({
  otvorene,
  companyId,
  onZavri,
  onPozvanie,
}: {
  otvorene: boolean;
  companyId: string;
  onZavri: () => void;
  onPozvanie: () => void;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const zaznamenaj = useServerFn(zaznamenajOznamEfakturyFn);
  const [formular, setFormular] = useState(false);
  const [pozvanka, setPozvanka] = useState<null | {
    odkaz: string;
    email: string;
    emailOdoslany: boolean;
    chybaEmailu: string | null;
  }>(null);

  useEffect(() => {
    if (!otvorene) {
      setFormular(false);
      setPozvanka(null);
    }
  }, [otvorene]);

  async function zapis(akcia: "zatvorit" | "pokracovat") {
    try {
      await zaznamenaj({ data: { company_id: companyId, akcia } });
    } catch (e) {
      console.warn("[efaktura-oznam]", (e as Error).message);
    }
  }

  function zatvor() {
    // Po odoslanej pozvánke už okno nie je treba odkladať — ukáže sa pás.
    if (!pozvanka) void zapis("zatvorit");
    onZavri();
    void qc.invalidateQueries({ queryKey: ["efaktura-oznam", companyId] });
  }

  async function pokracuj() {
    await zapis("pokracovat");
    onZavri();
    void qc.invalidateQueries({ queryKey: ["efaktura-oznam", companyId] });
    void navigate({ to: "/efaktura", hash: "prepojenie" });
  }

  return (
    <DialogPrimitive.Root open={otvorene} onOpenChange={(o) => !o && zatvor()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-efaktura-oznam
          className="fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          style={{
            maxHeight:
              "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.5rem)",
          }}
        >
          <div className="overflow-y-auto p-5 sm:p-8">
            <DialogPrimitive.Close
              aria-label={t("Zavrieť")}
              className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-card/80 text-muted-foreground ring-1 ring-border hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>

            <BannerPeppol />

            <DialogPrimitive.Title className="mt-5 text-xl font-semibold leading-tight sm:text-2xl">
              {t("Pripravte sa na e-Faktúru s Fakterom")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground sm:text-base">
              {t(
                "Od 1. 1. 2027 je e-fakturácia povinná. Vo Fakteri budete e-faktúry vystavovať aj automaticky prijímať — bez ďalšieho softvéru.",
              )}
            </DialogPrimitive.Description>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {/* Modrá karta — firma má prístup na portál FS sama. */}
              <div className="flex min-w-0 flex-col rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/50 dark:bg-blue-950/30">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-white">
                  <KeyRound className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-semibold text-blue-950 dark:text-blue-100">
                  {t("Mám prístup na Finančnú správu")}
                </h3>
                <p className="mt-1 flex-1 text-sm text-blue-900/80 dark:text-blue-100/80">
                  {t(
                    "Na Portáli finančnej správy vyberiete Faktero ako poskytovateľa eFaktúry. Ukážeme vám, kam kliknúť, a DIČ máte pripravené na skopírovanie.",
                  )}
                </p>
                <button
                  type="button"
                  onClick={pokracuj}
                  className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {t("Pokračovať na prepojenie")} <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Oranžová karta — za firmu to urobí účtovník. */}
              <div className="flex min-w-0 flex-col rounded-xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-900/50 dark:bg-orange-950/30">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-orange-500 text-white">
                  <UserRoundPlus className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-semibold text-orange-950 dark:text-orange-100">
                  {t("Nemám prístup na Finančnú správu")}
                </h3>
                {pozvanka ? (
                  <VysledokPozvanky v={pozvanka} />
                ) : formular ? (
                  <FormularUctovnika
                    companyId={companyId}
                    onOdoslane={(v) => {
                      setPozvanka(v);
                      onPozvanie();
                      void qc.invalidateQueries({ queryKey: ["efaktura-oznam", companyId] });
                    }}
                  />
                ) : (
                  <>
                    <p className="mt-1 flex-1 text-sm text-orange-900/80 dark:text-orange-100/80">
                      {t(
                        "Pošleme vášmu účtovníkovi odkaz s návodom. Aktiváciu za firmu dokončí sám — so splnomocnením, ktoré už má.",
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setFormular(true)}
                      className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-300"
                    >
                      {t("Zapojiť účtovníka")} <ArrowRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/pomoc/efaktura"
                hash="krok-za-krokom"
                onClick={() => {
                  if (!pozvanka) void zapis("zatvorit");
                  onZavri();
                }}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
              >
                <BookOpen className="h-4 w-4" /> {t("Podrobný návod")}
              </Link>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function FormularUctovnika({
  companyId,
  onOdoslane,
}: {
  companyId: string;
  onOdoslane: (v: {
    odkaz: string;
    email: string;
    emailOdoslany: boolean;
    chybaEmailu: string | null;
  }) => void;
}) {
  const { t } = useT();
  const pozvi = useServerFn(pozviUctovnikaEfakturyFn);
  const pozviDoFirmy = useServerFn(createInvitationFn);
  const [email, setEmail] = useState("");
  const [ajDoFaktera, setAjDoFaktera] = useState(false);
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  async function odosli(e: React.FormEvent) {
    e.preventDefault();
    if (bezi) return;
    if (!jePlatnyEmail(email)) {
      setChyba(t("Zadajte platný e-mail účtovníka."));
      return;
    }
    setBezi(true);
    setChyba(null);
    try {
      const v = await pozvi({ data: { company_id: companyId, email: email.trim() } });
      if (ajDoFaktera) {
        try {
          await pozviDoFirmy({
            data: { company_id: companyId, email: email.trim(), role: "accountant" },
          });
        } catch (err) {
          toast.error(
            t("Pozvánku do Faktera sa nepodarilo vytvoriť: {chyba}", {
              chyba: (err as Error).message,
            }),
          );
        }
      }
      onOdoslane(v);
    } catch (err) {
      setChyba((err as Error).message);
    } finally {
      setBezi(false);
    }
  }

  return (
    <form onSubmit={odosli} className="mt-2 flex flex-1 flex-col gap-2">
      <label
        htmlFor="efaktura-uctovnik"
        className="text-sm text-orange-900/80 dark:text-orange-100/80"
      >
        {t("E-mail účtovníka")}
      </label>
      <input
        id="efaktura-uctovnik"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("uctovnik@firma.sk")}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-300"
      />
      <label className="flex items-start gap-2 text-xs text-orange-900/80 dark:text-orange-100/80">
        <input
          type="checkbox"
          checked={ajDoFaktera}
          onChange={(e) => setAjDoFaktera(e.target.checked)}
          className="mt-0.5"
        />
        <span>{t("Pozvať ho aj do Faktera ako účtovníka (uvidí doklady firmy)")}</span>
      </label>
      {chyba && (
        <p role="alert" className="text-xs text-destructive">
          {chyba}
        </p>
      )}
      <button
        type="submit"
        disabled={bezi}
        className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-md bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {bezi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {bezi ? t("Odosielam…") : t("Poslať pozvánku")}
      </button>
    </form>
  );
}

function KopirovatOdkaz({ odkaz }: { odkaz: string }) {
  const { t } = useT();
  const [ok, setOk] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        readOnly
        value={odkaz}
        aria-label={t("Odkaz pre účtovníka")}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(odkaz);
            setOk(true);
            setTimeout(() => setOk(false), 2000);
          } catch {
            /* označený text si skopíruje sám */
          }
        }}
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted"
      >
        {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {ok ? t("Skopírované") : t("Kopírovať")}
      </button>
    </div>
  );
}

function VysledokPozvanky({
  v,
}: {
  v: { odkaz: string; email: string; emailOdoslany: boolean; chybaEmailu: string | null };
}) {
  const { t } = useT();
  return (
    <div className="mt-2 space-y-2 text-sm" role="status">
      {v.emailOdoslany ? (
        <p className="flex items-start gap-2 text-orange-950 dark:text-orange-100">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            {t(
              "Pozvánka odišla na {email}. Kým účtovník aktiváciu nedokončí, uvidíte hore pás s jej stavom.",
              { email: v.email },
            )}
          </span>
        </p>
      ) : (
        <p className="text-orange-950 dark:text-orange-100">
          {t(
            "E-mail sa nepodarilo odoslať, pozvánka však platí. Pošlite účtovníkovi tento odkaz sami:",
          )}
          {v.chybaEmailu ? (
            <span className="mt-1 block text-xs text-muted-foreground">{v.chybaEmailu}</span>
          ) : null}
        </p>
      )}
      <KopirovatOdkaz odkaz={v.odkaz} />
      <p className="text-xs text-muted-foreground">
        {t("Odkaz platí {n} dní.", { n: PLATNOST_POZVANKY_DNI })}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PodrobnostiPozvanky({
  otvorene,
  onZavri,
  companyId,
  pozvanka,
}: {
  otvorene: boolean;
  onZavri: () => void;
  companyId: string;
  pozvanka: {
    email: string;
    odkaz: string;
    createdAt: string;
    expiresAt: string;
    emailOdoslany: boolean;
    chybaEmailu: string | null;
    otvorenaAt: string | null;
    hotovoAt: string | null;
  };
}) {
  const { t, jazyk } = useT();
  const qc = useQueryClient();
  const zrus = useServerFn(zrusPozvankuUctovnikaFn);
  const [bezi, setBezi] = useState(false);
  const datum = useMemo(
    () => (iso: string) =>
      new Date(iso).toLocaleDateString(
        jazyk === "de" ? "de-DE" : jazyk === "cs" ? "cs-CZ" : "sk-SK",
      ),
    [jazyk],
  );

  async function zrusit() {
    setBezi(true);
    try {
      await zrus({ data: { company_id: companyId } });
      toast.success(t("Pozvánka zrušená."));
      onZavri();
      void qc.invalidateQueries({ queryKey: ["efaktura-oznam", companyId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBezi(false);
    }
  }

  return (
    <DialogPrimitive.Root open={otvorene} onOpenChange={(o) => !o && onZavri()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl"
          style={{
            maxHeight:
              "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.5rem)",
          }}
        >
          <DialogPrimitive.Close
            aria-label={t("Zavrieť")}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
          <DialogPrimitive.Title className="pr-8 text-lg font-semibold">
            {t("Aktiváciu e-fakturácie dokončuje účtovník")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
            {t(
              "Pozvánku dostal {email} {datum}. Keď na Portáli finančnej správy vyberie Faktero, eFaktúra sa tu zapne sama a pás zmizne.",
              {
                email: pozvanka.email,
                datum: datum(pozvanka.createdAt),
              },
            )}
          </DialogPrimitive.Description>
          <ul className="mt-4 space-y-1.5 text-sm">
            <li>
              {pozvanka.emailOdoslany
                ? t("E-mail s pozvánkou odišiel.")
                : t("E-mail s pozvánkou neodišiel — pošlite odkaz sami.")}
            </li>
            <li>
              {pozvanka.otvorenaAt
                ? t("Účtovník odkaz otvoril {datum}.", { datum: datum(pozvanka.otvorenaAt) })
                : t("Účtovník odkaz zatiaľ neotvoril.")}
            </li>
            {pozvanka.hotovoAt && (
              <li>
                {t("Účtovník oznámil {datum}, že Faktero vybral.", {
                  datum: datum(pozvanka.hotovoAt),
                })}
              </li>
            )}
            <li className="text-muted-foreground">
              {t("Odkaz platí do {datum}.", { datum: datum(pozvanka.expiresAt) })}
            </li>
          </ul>
          <div className="mt-4">
            <KopirovatOdkaz odkaz={pozvanka.odkaz} />
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Link
              to="/efaktura"
              hash="prepojenie"
              onClick={onZavri}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              {t("Aktivujem sám")}
            </Link>
            <button
              type="button"
              onClick={zrusit}
              disabled={bezi}
              className="inline-flex h-9 items-center rounded-md border border-destructive/40 px-3 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-60"
            >
              {t("Zrušiť pozvánku")}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
