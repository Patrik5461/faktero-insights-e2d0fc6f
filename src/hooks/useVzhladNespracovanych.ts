import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type VzhladNespracovanych = "klasicky" | "kompaktny";

/**
 * Rozloženie detailu nespracovaného dokladu, ktoré si používateľ vybral —
 * klasické Faktero alebo kompaktné „ako v Doklado". Ukladá sa do jeho účtu
 * (metadáta prihlásenia), takže platí na každom zariadení.
 */
export function useVzhladNespracovanych() {
  const [vzhlad, setVzhlad] = useState<VzhladNespracovanych>("klasicky");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const v = data.user?.user_metadata?.vzhlad_nespracovanych;
      if (v === "kompaktny" || v === "klasicky") setVzhlad(v);
    });
  }, []);
  async function zmen(v: VzhladNespracovanych) {
    setVzhlad(v);
    await supabase.auth.updateUser({ data: { vzhlad_nespracovanych: v } }).catch(() => {});
  }
  return { vzhlad, zmen };
}
