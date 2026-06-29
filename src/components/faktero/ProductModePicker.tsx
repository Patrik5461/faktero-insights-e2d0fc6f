import { useState } from "react";
import { FileText, Car, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { setActiveProduct } from "@/lib/faktero/active-product";

type Mode = "invoicing" | "logbook" | "both";

const OPTIONS: { value: Mode; title: string; desc: string; icon: any }[] = [
  {
    value: "invoicing",
    title: "Fakturačný systém",
    desc: "Faktúry, eFaktúra, API/webhooky, bankové párovanie, opakované faktúry a sklad.",
    icon: FileText,
  },
  {
    value: "logbook",
    title: "Kniha jázd",
    desc: "Jazdy, vozidlá a integrácie Commander GPS a Tesla Fleet API.",
    icon: Car,
  },
  {
    value: "both",
    title: "Oboje",
    desc: "Plný prístup k fakturácii aj knihe jázd v jednom účte.",
    icon: Layers,
  },
];

export function ProductModePicker({ onPicked }: { onPicked: (mode: Mode) => void }) {
  const [saving, setSaving] = useState<Mode | null>(null);

  async function pick(mode: Mode) {
    if (saving) return;
    setSaving(mode);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Nie ste prihlásený");
      const { error } = await supabase
        .from("profiles")
        .update({ product_mode: mode })
        .eq("id", u.user.id);
      if (error) throw error;
      setActiveProduct(mode === "logbook" ? "logbook" : "invoicing");
      onPicked(mode);
    } catch (err: any) {
      toast.error(err?.message ?? "Nepodarilo sa uložiť výber");
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Čo chcete používať?</h1>
        <p className="mt-3 text-muted-foreground">
          Vyberte produkty, ktoré budete využívať. Voľbu môžete kedykoľvek zmeniť v Nastaveniach.
        </p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSaving = saving === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={!!saving}
              onClick={() => pick(opt.value)}
              className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
            >
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-lg font-semibold">{opt.title}</span>
              <span className="text-sm text-muted-foreground">{opt.desc}</span>
              <span className="mt-auto text-sm font-medium text-primary">
                {isSaving ? "Ukladám…" : "Vybrať →"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
