import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

/**
 * Stránka ostáva kvôli uloženým odkazom, ale hovorí to, čo dnes platí.
 *
 * Pôvodne to bol návod, ako si firma pripojí vlastný GoPay účet a dá zákazníkom
 * tlačidlo „Zaplatiť online". Tá funkcia sa stiahla (2026-08-11) skôr, než ju
 * niekto použil — pod spoločnou doménou by na ňu poskytovateľ potreboval
 * platformovú zmluvu. Návod ostal a ďalej sľuboval niečo, čo v aplikácii nie
 * je; to je horšie než prázdna stránka, preto je tu rovné vysvetlenie a
 * `noindex`, nech to vyhľadávače neponúkajú ako funkciu.
 */
export const Route = createFileRoute("/docs/online-platby/gopay")({
  head: ({ match }) => {
    const j = match.context.jazyk;
    return {
      meta: [
        { title: preloz(j, "Online platby — Faktero") },
        {
          name: "description",
          content: preloz(
            j,
            "Platby kartou pre zákazníkov firmy Faktero neponúka. Faktúra nesie QR platbu prevodom a úhrady sa párujú z banky.",
          ),
        },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: Stranka,
});

function Stranka() {
  const { t } = useT();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
        <p className="text-sm font-medium text-primary">{t("Dokumentácia · Úhrady")}</p>
        <h1 className="text-3xl font-bold tracking-tight">{t("Online platby")}</h1>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">
            {t("Platby kartou pre vašich zákazníkov neponúkame")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Aby firma mohla prijímať platby kartou pod vlastným účtom, potrebuje poskytovateľ platobnej brány zmluvu, ktorá to na spoločnej doméne umožňuje. Kým ju nemáme, funkciu neponúkame — je to poctivejšie, než ju sľúbiť a nechať vás zlyhať pri prvom pokuse.",
            )}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">{t("Ako teda dostanete peniaze")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              {t("Faktúra ide zákazníkovi s IBAN-om, variabilným symbolom a")}{" "}
              <strong>{t("QR kódom na platbu prevodom")}</strong>{" "}
              {t("— naskenuje ho v mobilnom bankovníctve.")}
            </li>
            <li>
              {t("Keď platba príde,")} <strong>{t("párovanie úhrad z banky")}</strong>{" "}
              {t("označí faktúru za uhradenú samo. Podrobne v")}{" "}
              <Link to="/pomoc/banka">{t("manuáli k banke")}</Link>.
            </li>
          </ul>
        </div>

        <p className="text-sm text-muted-foreground">
          {t("Platenie")} <Link to="/pomoc/predplatne">{t("predplatného za Faktero")}</Link>{" "}
          {t("sa tým nemení — to cez platobnú bránu funguje bežne.")}
        </p>
      </div>
    </MarketingShell>
  );
}
