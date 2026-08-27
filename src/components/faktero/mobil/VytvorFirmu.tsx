import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperacia } from "@/lib/mobile/server-most";
import { setActiveCompanyId } from "@/lib/faktero/active-company";
import { firmaNaZapis, overFirmu } from "@/lib/mobile/registracia";
import { MobilObrazovka, HlavneTlacidlo } from "./MobilChrome";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { usePreklad } from "@/lib/mobile/preklady/hook";
/**
 * Založenie firmy priamo v telefóne.
 *
 * Bez firmy appka nemá kam ukladať doklady, takže po registrácii sem vedie
 * jediná cesta ďalej. Doteraz na tom mieste stála veta „Vytvorte ju na
 * faktero.sk" — appka teda vedela povedať, čo chýba, ale nie to doplniť.
 *
 * Povinný je len názov. Ostatné údaje sú tie, ktoré patria na faktúru; keď
 * človek zadá IČO, doplnia sa z registra samy a nemusí ich prepisovať z
 * papiera na malej klávesnici. Zapisuje tá istá funkcia databázy ako web
 * (`create_company_with_owner`) — vlastníctvo firmy sa nikde neudeľuje inak.
 */
export function VytvorFirmu({
  onHotovo,
  onSpat,
  prve,
}: {
  onHotovo: (firma: { id: string; name: string }) => void;
  onSpat?: () => void;
  /** Prvá firma po registrácii — vtedy sa nedá vycúvať nikam inam. */
  prve?: boolean;
}) {
  const { t } = usePreklad();
  const [f, setF] = useState({
    name: "",
    ico: "",
    dic: "",
    ic_dph: "",
    street: "",
    city: "",
    zip: "",
    country: "SK",
    email: "",
    phone: "",
    iban: "",
  });
  const [hladam, setHladam] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const lookup = useOperacia("firma-podla-ica");

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((p) => ({ ...p, [k]: v }));
  }

  /* Doplnenie z registra, len čo je IČO celé — rovnako ako pri odberateľovi. */
  const posledne = useRef("");
  useEffect(() => {
    const ico = f.ico.replace(/\s+/g, "");
    if (!/^\d{8}$/.test(ico) || posledne.current === ico) return;
    posledne.current = ico;
    setHladam(true);
    lookup({ data: { ico } })
      .then((r: any) => {
        if (r?.status !== "ok" || !r.data) return;
        const d = r.data;
        // Len prázdne polia — čo si človek napísal, mu nikto neprepíše.
        setF((p) => ({
          ...p,
          name: p.name || d.name || "",
          dic: p.dic || d.dic || "",
          ic_dph: p.ic_dph || d.ic_dph || "",
          street: p.street || d.street || "",
          city: p.city || d.city || "",
          zip: p.zip || d.zip || "",
          country: p.country || d.country || "SK",
        }));
        toast.success(t("nf.udajeDoplnene"));
      })
      .catch(() => {
        /* register nie je podmienka — údaje sa dajú vypísať ručne */
      })
      .finally(() => setHladam(false));
    // eslint-disable-next-line
  }, [f.ico]);

  async function uloz() {
    const chyba = overFirmu({ name: f.name, ico: f.ico, email: f.email, iban: f.iban });
    if (chyba) return toast.error(t(chyba));

    // Firma vzniká na serveri, odložiť sa nedá — bez signálu radšej rovno
    // povieme prečo, než nechať tlačidlo točiť sa do vypršania.
    const { isOnline } = await import("@/lib/mobile/offline-queue");
    if (!(await isOnline())) {
      return toast.error(t("vf.trebaPripojenie"));
    }

    setUkladam(true);
    try {
      const { data, error } = await supabase.rpc("create_company_with_owner", firmaNaZapis(f));
      if (error || !data) throw new Error(error?.message ?? t("vf.nepodariloVytvorit"));
      const id = data as string;
      setActiveCompanyId(id);
      toast.success(t("vf.vytvorena"));
      onHotovo({ id, name: f.name.trim() });
    } catch (e: any) {
      toast.error(e?.message ?? t("vf.nepodariloVytvorit"));
      setUkladam(false);
    }
  }

  return (
    <MobilObrazovka
      title={prve ? t("vf.vytvorteSiFirmu") : t("vf.pridatFirmu")}
      subtitle={t("vf.podnadpis")}
      onBack={onSpat}
      footer={
        <HlavneTlacidlo onClick={uloz} disabled={ukladam || !f.name.trim()}>
          {ukladam ? t("vf.vytvaram") : t("vf.vytvoritFirmu")}
        </HlavneTlacidlo>
      }
    >
      <p className="mb-4 text-[13px] leading-snug text-app-text-2">
        {t("vf.uvod")}
      </p>

      <div className="space-y-3">
        <Pole label={t("vf.nazovFirmy")} value={f.name} onChange={(v) => set("name", v)} povinne />
        <Pole
          label={t("vf.ico")}
          value={f.ico}
          onChange={(v) => set("ico", v)}
          inputMode="numeric"
          hint={hladam ? t("vf.hladamVRegistri") : undefined}
          pracuje={hladam}
        />
        <div className="grid grid-cols-2 gap-3">
          <Pole label={t("vf.dic")} value={f.dic} onChange={(v) => set("dic", v)} inputMode="numeric" />
          <Pole label={t("vf.icDph")} value={f.ic_dph} onChange={(v) => set("ic_dph", v)} />
        </div>
        <Pole label={t("vf.ulica")} value={f.street} onChange={(v) => set("street", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Pole label={t("vf.mesto")} value={f.city} onChange={(v) => set("city", v)} />
          <Pole label={t("vf.psc")} value={f.zip} onChange={(v) => set("zip", v)} inputMode="numeric" />
        </div>
        <Pole
          label={t("vf.iban")}
          value={f.iban}
          onChange={(v) => set("iban", v)}
          hint={t("vf.ibanHint")}
        />
        <div className="grid grid-cols-2 gap-3">
          <Pole
            label={t("vf.email")}
            value={f.email}
            onChange={(v) => set("email", v)}
            inputMode="email"
          />
          <Pole label={t("vf.telefon")} value={f.phone} onChange={(v) => set("phone", v)} inputMode="tel" />
        </div>
      </div>
    </MobilObrazovka>
  );
}

function Pole({
  label,
  value,
  onChange,
  povinne,
  hint,
  inputMode,
  pracuje,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  povinne?: boolean;
  hint?: string;
  inputMode?: "numeric" | "email" | "tel";
  pracuje?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-app-text-2">
        {label}
        {povinne && <span className="text-app-chyba"> *</span>}
      </span>
      <div className="relative mt-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          autoCapitalize={inputMode === "email" ? "none" : undefined}
          autoCorrect="off"
          className="w-full rounded-app-sm border border-app-ramik bg-app-pozadie px-4 py-3 text-base"
        />
        {pracuje && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-app-text-2" />
        )}
      </div>
      {hint && <span className="mt-1 block text-[12px] text-app-text-2">{hint}</span>}
    </label>
  );
}
