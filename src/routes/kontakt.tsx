import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Phone, MapPin, Building2, Loader2 } from "lucide-react";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { LEGAL_COMPANY } from "@/components/faktero/LegalShell";
import { z } from "zod";

export const Route = createFileRoute("/kontakt")({
  head: () => ({
    meta: [
      { title: "Kontakt — Faktero" },
      {
        name: "description",
        content:
          "Kontaktujte prevádzkovateľa Faktera — Tobify s. r. o. E-mail, telefón, sídlo a fakturačné údaje.",
      },
      { property: "og:title", content: "Kontakt — Faktero" },
      { property: "og:description", content: "Kontaktné údaje prevádzkovateľa Faktera." },
      { property: "og:url", content: "https://faktero.sk/kontakt" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/kontakt" }],
  }),
  component: KontaktPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Zadajte meno").max(100),
  email: z.string().trim().email("Neplatný e-mail").max(255),
  message: z.string().trim().min(5, "Napíšte správu").max(2000),
});

function KontaktPage() {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Skontrolujte formulár");
      return;
    }
    setBusy(true);
    try {
      const subject = encodeURIComponent(`Kontakt z faktero.sk — ${parsed.data.name}`);
      const body = encodeURIComponent(
        `${parsed.data.message}\n\n—\n${parsed.data.name} <${parsed.data.email}>`,
      );
      window.location.href = `mailto:${LEGAL_COMPANY.email}?subject=${subject}&body=${body}`;
      toast.success("Otvárame váš e-mailový klient…");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MarketingShell>
      <div className="mx-auto max-w-5xl px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Kontakt</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Ozvite sa nám</h1>
        <p className="mt-3 text-muted-foreground">
          Radi vám pomôžeme s Fakterom, fakturáciou aj integráciami. Odpovedáme obvykle do 24 hodín.
        </p>

        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <div className="space-y-6 text-sm">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> Prevádzkovateľ
              </h2>
              <div className="space-y-1 text-muted-foreground">
                <div className="text-foreground font-medium">{LEGAL_COMPANY.name}</div>
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{LEGAL_COMPANY.address}</span>
                </div>
                <div>
                  IČO: <span className="text-foreground">{LEGAL_COMPANY.ico}</span>
                </div>
                <div>
                  DIČ: <span className="text-foreground">{LEGAL_COMPANY.dic}</span>
                </div>
                <div>
                  IČ DPH: <span className="text-foreground">{LEGAL_COMPANY.icDph}</span>
                </div>
                <div>
                  Štatutár: <span className="text-foreground">{LEGAL_COMPANY.statutar}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
              <h2 className="font-semibold text-base">Priamy kontakt</h2>
              <a
                href={`mailto:${LEGAL_COMPANY.email}`}
                className="flex items-center gap-2 hover:text-primary"
              >
                <Mail className="h-4 w-4" /> {LEGAL_COMPANY.email}
              </a>
              <a
                href={`tel:${LEGAL_COMPANY.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-2 hover:text-primary"
              >
                <Phone className="h-4 w-4" /> {LEGAL_COMPANY.phone}
              </a>
              <p className="text-xs text-muted-foreground pt-2">
                Fakturačné a právne otázky:{" "}
                <a className="underline" href={`mailto:${LEGAL_COMPANY.email}`}>
                  {LEGAL_COMPANY.email}
                </a>
              </p>
            </div>
          </div>

          <form
            onSubmit={submit}
            className="rounded-2xl border border-border bg-card p-6 space-y-4"
          >
            <h2 className="font-semibold text-base">Napíšte nám</h2>
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-medium">
                Meno
              </label>
              <input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={255}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="message" className="text-sm font-medium">
                Správa
              </label>
              <textarea
                id="message"
                required
                rows={5}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={2000}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Odoslať správu
            </button>
            <p className="text-xs text-muted-foreground">
              Odoslaním súhlasíte so spracovaním údajov podľa{" "}
              <a href="/pravne/gdpr" className="underline">
                GDPR
              </a>
              .
            </p>
          </form>
        </div>
      </div>
    </MarketingShell>
  );
}
