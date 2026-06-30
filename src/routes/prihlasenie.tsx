import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Car, Check } from "lucide-react";

import { toast } from "sonner";
import { Logo } from "@/components/faktero/Logo";
import {
  getActiveProduct,
  setActiveProduct,
  landingPathFor,
  type ActiveProduct,
} from "@/lib/faktero/active-product";

export const Route = createFileRoute("/prihlasenie")({
  head: () => ({
    meta: [
      { title: "Prihlásenie — Faktero" },
      { name: "description", content: "Prihláste sa do Faktera." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Start with a deterministic value so SSR markup matches first client render,
  // then hydrate from localStorage to avoid hydration mismatch warnings.
  const [product, setProduct] = useState<ActiveProduct>("invoicing");
  useEffect(() => {
    const stored = getActiveProduct();
    if (stored && stored !== product) setProduct(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseProduct(p: ActiveProduct) {
    setProduct(p);
    setActiveProduct(p);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setActiveProduct(product);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: landingPathFor(product) as any });
  }

  async function onGoogle() {
    setActiveProduct(product);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + landingPathFor(product) },
    });
    if (error) toast.error(error.message);
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <Link to="/" className="mb-6 inline-flex items-center">
          <Logo variant="header" className="h-8" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Prihlásenie</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vitajte späť. Vyberte produkt a prihláste sa do svojho účtu.
        </p>

        {/* Product picker */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Prihlásiť sa do:
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ProductButton
              icon={<FileText className="h-4 w-4" />}
              label="Fakturačný systém"
              selected={product === "invoicing"}
              onClick={() => chooseProduct("invoicing")}
            />
            <ProductButton
              icon={<Car className="h-4 w-4" />}
              label="Kniha jázd"
              selected={product === "logbook"}
              onClick={() => chooseProduct("logbook")}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Rovnaký účet, iný produkt. Prepnúť môžete kedykoľvek v hlavičke.
          </p>
        </div>

        <button
          onClick={onGoogle}
          className="mt-5 w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
        >
          Pokračovať cez Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> alebo <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Heslo</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Prihlasujem..." : "Prihlásiť sa"}
          </button>
        </form>

        <BiometricLoginButton onSuccess={() => navigate({ to: landingPathFor(product) as any })} />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Nemáte účet?{" "}
          <Link to="/registracia" className="font-medium text-primary hover:underline">
            Vytvoriť účet
          </Link>
        </p>
      </div>
    </div>
  );
}

function ProductButton({
  icon, label, selected, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
        selected
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border bg-background text-foreground/80 hover:bg-secondary"
      }`}
    >
      <span className={`grid h-7 w-7 place-items-center rounded-md ${selected ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/70"}`}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 text-primary" />}
    </button>
  );
}
