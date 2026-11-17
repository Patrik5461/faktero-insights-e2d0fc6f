/*
  Pás na každej stránke testovacej firmy — aby si ju nikto nepomýlil so
  skutočnou. Kreslí sa v AppShell nad obsahom (route.tsx), rovnako ako pás
  pozvánok; farby sú tokeny `warning` (oklch), takže sedí aj v tmavom motíve
  a v kompaktnom rozložení.
*/
import { FlaskConical } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { skutocnaFirmaPre } from "@/lib/faktero/testovacia-firma-ui";

type Firma = { id: string; name: string; testovacia_pre?: string | null };

export function TestovaciaFirmaPas({
  aktivna,
  firmy,
  onPrepni,
}: {
  aktivna: Firma | null | undefined;
  firmy: Firma[];
  onPrepni: (id: string) => void;
}) {
  const { t } = useT();
  const skutocna = skutocnaFirmaPre(aktivna, firmy);
  if (!skutocna) return null;
  return (
    <section
      role="status"
      aria-label={t("Testovacia firma")}
      data-testovacia-pas=""
      className="flex flex-col gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2.5 sm:flex-row sm:items-center sm:px-6"
    >
      <FlaskConical className="hidden h-4 w-4 shrink-0 text-warning sm:block" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        {t("Testovacia firma — nič sa neodosiela, údaje neovplyvnia {nazov}.", {
          nazov: skutocna.name,
        })}
      </p>
      {skutocna.id && (
        <button
          type="button"
          onClick={() => onPrepni(skutocna.id!)}
          className="self-start rounded-md border border-warning/50 bg-background px-3 py-1 text-xs font-semibold text-foreground hover:bg-warning/10 sm:self-auto"
        >
          {t("Prepnúť na {nazov}", { nazov: skutocna.name })}
        </button>
      )}
    </section>
  );
}
