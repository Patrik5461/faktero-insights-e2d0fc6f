import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperacia } from "@/lib/mobile/server-most";
import { setActiveCompanyId } from "@/lib/faktero/active-company";
import { firmaNaZapis, overFirmu } from "@/lib/mobile/registracia";
import { MobilObrazovka, HlavneTlacidlo } from "./MobilChrome";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
        toast.success("Údaje doplnené z registra");
      })
      .catch(() => {
        /* register nie je podmienka — údaje sa dajú vypísať ručne */
      })
      .finally(() => setHladam(false));
    // eslint-disable-next-line
  }, [f.ico]);

  async function uloz() {
    const chyba = overFirmu({ name: f.name, ico: f.ico, email: f.email, iban: f.iban });
    if (chyba) return toast.error(chyba);

    // Firma vzniká na serveri, odložiť sa nedá — bez signálu radšej rovno
    // povieme prečo, než nechať tlačidlo točiť sa do vypršania.
    const { isOnline } = await import("@/lib/mobile/offline-queue");
    if (!(await isOnline())) {
      return toast.error("Na založenie firmy treba pripojenie. Skúste to, keď bude signál.");
    }

    setUkladam(true);
    try {
      const { data, error } = await supabase.rpc("create_company_with_owner", firmaNaZapis(f));
      if (error || !data) throw new Error(error?.message ?? "Firmu sa nepodarilo vytvoriť.");
      const id = data as string;
      setActiveCompanyId(id);
      toast.success("Firma je vytvorená.");
      onHotovo({ id, name: f.name.trim() });
    } catch (e: any) {
      toast.error(e?.message ?? "Firmu sa nepodarilo vytvoriť.");
      setUkladam(false);
    }
  }

  return (
    <MobilObrazovka
      title={prve ? "Vytvorte si firmu" : "Pridať firmu"}
      subtitle="Tieto údaje sa zobrazia na faktúrach"
      onBack={onSpat}
      footer={
        <HlavneTlacidlo onClick={uloz} disabled={ukladam || !f.name.trim()}>
          {ukladam ? "Vytváram…" : "Vytvoriť firmu"}
        </HlavneTlacidlo>
      }
    >
      <p className="mb-4 text-[13px] leading-snug text-muted-foreground">
        Stačí názov — ostatné sa dá doplniť kedykoľvek neskôr v nastaveniach. Keď zadáte IČO, adresu
        aj daňové čísla si natiahneme z registra.
      </p>

      <div className="space-y-3">
        <Pole label="Názov firmy" value={f.name} onChange={(v) => set("name", v)} povinne />
        <Pole
          label="IČO"
          value={f.ico}
          onChange={(v) => set("ico", v)}
          inputMode="numeric"
          hint={hladam ? "Hľadám v registri…" : undefined}
          pracuje={hladam}
        />
        <div className="grid grid-cols-2 gap-3">
          <Pole label="DIČ" value={f.dic} onChange={(v) => set("dic", v)} inputMode="numeric" />
          <Pole label="IČ DPH" value={f.ic_dph} onChange={(v) => set("ic_dph", v)} />
        </div>
        <Pole label="Ulica a číslo" value={f.street} onChange={(v) => set("street", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Pole label="Mesto" value={f.city} onChange={(v) => set("city", v)} />
          <Pole label="PSČ" value={f.zip} onChange={(v) => set("zip", v)} inputMode="numeric" />
        </div>
        <Pole
          label="IBAN"
          value={f.iban}
          onChange={(v) => set("iban", v)}
          hint="Zákazník podľa neho zaplatí — pokojne aj neskôr."
        />
        <div className="grid grid-cols-2 gap-3">
          <Pole
            label="E-mail"
            value={f.email}
            onChange={(v) => set("email", v)}
            inputMode="email"
          />
          <Pole label="Telefón" value={f.phone} onChange={(v) => set("phone", v)} inputMode="tel" />
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
      <span className="text-[13px] font-medium text-muted-foreground">
        {label}
        {povinne && <span className="text-destructive"> *</span>}
      </span>
      <div className="relative mt-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          autoCapitalize={inputMode === "email" ? "none" : undefined}
          autoCorrect="off"
          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base"
        />
        {pracuje && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {hint && <span className="mt-1 block text-[12px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
