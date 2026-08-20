/**
 * Správa partnerov, ktorí sa točia v páse na hlavnej stránke.
 *
 * Logo je nepovinné — partner sa dá pridať aj s holým názvom a na stránke sa
 * vtedy vypíše text. Nový partner tak nemusí čakať na to, kým od neho príde
 * obrázok.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GripVertical, ImagePlus, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  zoznamPartnerov,
  ulozPartnera,
  zmazPartnera,
  type Partner,
} from "@/lib/partneri.functions";

export const Route = createFileRoute("/admin/partneri")({ component: Page });

const KOS = "partner-logos";
const STROP_BAJTOV = 2 * 1024 * 1024;

type Rozpracovany = {
  id?: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  sort_order: number;
  active: boolean;
};

const PRAZDNY: Rozpracovany = {
  name: "",
  logo_url: null,
  website: null,
  sort_order: 0,
  active: true,
};

function Page() {
  const qc = useQueryClient();
  const nacitaj = useServerFn(zoznamPartnerov);
  const uloz = useServerFn(ulozPartnera);
  const zmaz = useServerFn(zmazPartnera);

  const { data: partneri = [], isLoading } = useQuery({
    queryKey: ["admin-partneri"],
    queryFn: () => nacitaj({}) as Promise<Partner[]>,
  });

  const obnov = () => qc.invalidateQueries({ queryKey: ["admin-partneri"] });

  const ulozenie = useMutation({
    mutationFn: (p: Rozpracovany) => uloz({ data: p }),
    onSuccess: () => {
      toast.success("Uložené");
      obnov();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Uloženie zlyhalo."),
  });

  const mazanie = useMutation({
    mutationFn: (id: string) => zmaz({ data: { id } }),
    onSuccess: () => {
      toast.success("Partner zmazaný");
      obnov();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Mazanie zlyhalo."),
  });

  const [novy, setNovy] = useState<Rozpracovany>(PRAZDNY);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Partneri</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pás na hlavnej stránke. Poradie určuje číslo — menšie ide skôr. Vypnutý partner sa na
          stránke neukáže.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-medium">Nový partner</div>
        <Formular
          hodnota={novy}
          onZmena={setNovy}
          onUloz={() => {
            if (!novy.name.trim()) return toast.error("Vyplňte názov.");
            ulozenie.mutate(novy, { onSuccess: () => setNovy(PRAZDNY) });
          }}
          ukladam={ulozenie.isPending}
          tlacidlo="Pridať"
          ikona={Plus}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
        </div>
      ) : partneri.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Zatiaľ tu nikto nie je — kým je zoznam prázdny, sekcia sa na hlavnej stránke nevykreslí.
        </p>
      ) : (
        <div className="space-y-3">
          {partneri.map((p) => (
            <Riadok
              key={p.id}
              partner={p}
              onUloz={(v) => ulozenie.mutate(v)}
              onZmaz={() => {
                if (confirm(`Zmazať partnera „${p.name}"?`)) mazanie.mutate(p.id);
              }}
              ukladam={ulozenie.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Riadok({
  partner,
  onUloz,
  onZmaz,
  ukladam,
}: {
  partner: Partner;
  onUloz: (v: Rozpracovany) => void;
  onZmaz: () => void;
  ukladam: boolean;
}) {
  const [hodnota, setHodnota] = useState<Rozpracovany>(partner);
  // Po uložení sa zoznam načíta znova; rozpracovaný riadok sa má zosúladiť.
  useEffect(() => setHodnota(partner), [partner]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <GripVertical className="h-4 w-4" />
        <span className="font-medium text-foreground">{partner.name}</span>
        {!partner.active && <span className="text-xs">· vypnutý</span>}
        <button
          onClick={onZmaz}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Zmazať
        </button>
      </div>
      <Formular
        hodnota={hodnota}
        onZmena={setHodnota}
        onUloz={() => onUloz(hodnota)}
        ukladam={ukladam}
        tlacidlo="Uložiť"
        ikona={Save}
      />
    </div>
  );
}

function Formular({
  hodnota,
  onZmena,
  onUloz,
  ukladam,
  tlacidlo,
  ikona: Ikona,
}: {
  hodnota: Rozpracovany;
  onZmena: (v: Rozpracovany) => void;
  onUloz: () => void;
  ukladam: boolean;
  tlacidlo: string;
  ikona: typeof Plus;
}) {
  const [nahravam, setNahravam] = useState(false);
  const suborRef = useRef<HTMLInputElement>(null);
  const vstup = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

  async function nahrajLogo(subor: File) {
    if (subor.size > STROP_BAJTOV) return toast.error("Logo je väčšie než 2 MB.");
    setNahravam(true);
    try {
      /*
        Názov súboru z prílohy sa nepoužíva — diakritika a medzery v ňom robia
        adresy, ktoré niektoré prehliadače neotvoria. Prípona sa zachová, lebo
        podľa nej kôš rozhoduje o type.
      */
      const pripona = (subor.name.split(".").pop() ?? "png").toLowerCase().slice(0, 5);
      const cesta = `${crypto.randomUUID()}.${pripona}`;
      const { error } = await supabase.storage
        .from(KOS)
        .upload(cesta, subor, { contentType: subor.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(KOS).getPublicUrl(cesta);
      onZmena({ ...hodnota, logo_url: data.publicUrl });
      toast.success("Logo nahraté — ešte ho treba uložiť.");
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Logo sa nepodarilo nahrať.");
    } finally {
      setNahravam(false);
      if (suborRef.current) suborRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Názov</label>
        <input
          className={vstup}
          value={hodnota.name}
          onChange={(e) => onZmena({ ...hodnota, name: e.target.value })}
          placeholder="Napr. Tatra banka"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Web (nepovinné)</label>
        <input
          className={vstup}
          value={hodnota.website ?? ""}
          onChange={(e) => onZmena({ ...hodnota, website: e.target.value || null })}
          placeholder="https://…"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Poradie</label>
        <input
          type="number"
          className={vstup}
          value={hodnota.sort_order}
          onChange={(e) => onZmena({ ...hodnota, sort_order: Number(e.target.value) || 0 })}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          Logo (nepovinné — bez neho sa vypíše názov)
        </label>
        <div className="flex items-center gap-2">
          {hodnota.logo_url && (
            <img
              src={hodnota.logo_url}
              alt=""
              className="h-9 w-16 rounded border border-border bg-white object-contain p-1"
            />
          )}
          <button
            onClick={() => suborRef.current?.click()}
            disabled={nahravam}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-2 text-xs hover:bg-secondary disabled:opacity-50"
          >
            {nahravam ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            {hodnota.logo_url ? "Zmeniť" : "Nahrať"}
          </button>
          {hodnota.logo_url && (
            <button
              onClick={() => onZmena({ ...hodnota, logo_url: null })}
              className="rounded-md border border-border px-2 py-2 text-xs hover:bg-secondary"
            >
              Odobrať
            </button>
          )}
          <input
            ref={suborRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void nahrajLogo(f);
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hodnota.active}
            onChange={(e) => onZmena({ ...hodnota, active: e.target.checked })}
          />
          Zobrazovať na stránke
        </label>
        <button
          onClick={onUloz}
          disabled={ukladam || nahravam}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {ukladam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ikona className="h-4 w-4" />}
          {tlacidlo}
        </button>
      </div>
    </div>
  );
}
