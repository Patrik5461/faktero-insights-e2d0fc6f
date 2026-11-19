import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import {
  NAZVY_AGEND_DUPLICITY,
  odkazNaDuplicitu,
  popisDuplicity,
  type DuplicitaSuboru,
} from "@/lib/faktero/duplicita-suboru";

/**
 * Hlášky po nahratí do Nespracovaných: rovnaký súbor už vo Fakteri je
 * (s odkazom „Otvoriť“ na existujúci doklad) alebo je len v koši.
 */
export function useOznamDuplicitySuboru() {
  const { t, jazyk } = useT();
  const navigate = useNavigate();

  const duplicita = useCallback(
    (d: DuplicitaSuboru, nazovSuboru?: string | null) => {
      const popis = popisDuplicity(d);
      const kedy = d.nahrane
        ? new Date(d.nahrane).toLocaleDateString(lokalJazyka(jazyk), { timeZone: "Europe/Bratislava" })
        : null;
      const riadky = [
        nazovSuboru,
        [t(NAZVY_AGEND_DUPLICITY[d.agenda]), popis].filter(Boolean).join(": "),
        kedy ? t("nahratý {datum}", { datum: kedy }) : null,
      ].filter(Boolean);
      toast.warning(t("Tento doklad už vo Fakteri je"), {
        description: riadky.join(" · "),
        duration: 12_000,
        action: {
          label: t("Otvoriť"),
          onClick: () => void navigate(odkazNaDuplicitu(d) as any),
        },
      });
    },
    [t, jazyk, navigate],
  );

  const vKosi = useCallback(
    (nazovSuboru?: string | null) =>
      toast.info(
        [nazovSuboru, t("Rovnaký súbor bol v koši — nahral sa znova ako nový doklad.")]
          .filter(Boolean)
          .join(": "),
      ),
    [t],
  );

  return { duplicita, vKosi };
}
