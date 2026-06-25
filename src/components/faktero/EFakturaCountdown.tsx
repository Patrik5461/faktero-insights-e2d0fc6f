import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Timer } from "lucide-react";

interface TimeLeft {
  dni: number;
  hodiny: number;
  minuty: number;
  sekundy: number;
}

function calculateTimeLeft(): TimeLeft {
  const target = new Date("2027-01-01T00:00:00+01:00");
  const now = new Date();
  const diff = target.getTime() - now.getTime();

  if (diff <= 0) {
    return { dni: 0, hodiny: 0, minuty: 0, sekundy: 0 };
  }

  const dni = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hodiny = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minuty = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const sekundy = Math.floor((diff % (1000 * 60)) / 1000);

  return { dni, hodiny, minuty, sekundy };
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="grid h-12 w-12 place-items-center rounded-lg border border-border bg-background text-lg font-bold text-foreground md:h-14 md:w-14 md:text-xl">
        {String(value).padStart(2, "0")}
      </div>
      <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function EFakturaCountdown() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ dni: 0, hodiny: 0, minuty: 0, sekundy: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const badges = ["XML", "Peppol", "Digitálny poštár", "Prijímanie", "Odosielanie"];

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] md:p-8">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10">
          <Timer className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold">eFaktúra 2027</h3>
          <p className="text-xs text-muted-foreground">
            Povinná eFaktúra sa blíži. Faktero bude pripravené.
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-3">
        <CountdownUnit value={mounted ? timeLeft.dni : 0} label="dni" />
        <CountdownUnit value={mounted ? timeLeft.hodiny : 0} label="hodiny" />
        <CountdownUnit value={mounted ? timeLeft.minuty : 0} label="minúty" />
        <CountdownUnit value={mounted ? timeLeft.sekundy : 0} label="sekundy" />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {badges.map((badge) => (
          <span
            key={badge}
            className="inline-flex items-center rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground"
          >
            {badge}
          </span>
        ))}
      </div>

      <div className="mt-5">
        <Link
          to="/efaktura"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Zistiť viac <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
