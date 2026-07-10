import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export const CONSTANT_SYMBOLS: { code: string; label: string }[] = [
  { code: "0008", label: "Platby daní" },
  { code: "0058", label: "Platby poistného" },
  { code: "0068", label: "Splátky úverov" },
  { code: "0098", label: "Faktúry za tovar a služby" },
  { code: "0138", label: "Penále, pokuty" },
  { code: "0308", label: "Platby za telekomunikačné služby" },
  { code: "0379", label: "Platby v hotovosti" },
  { code: "0998", label: "Ostatné platby" },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}

export function ConstantSymbolCombobox({ value, onChange, placeholder, id }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? CONSTANT_SYMBOLS.filter(
        (k) => k.code.toLowerCase().includes(q) || k.label.toLowerCase().includes(q),
      )
    : CONSTANT_SYMBOLS;

  function pick(code: string) {
    onChange(code);
    setQuery(code);
    setOpen(false);
  }

  const matched = CONSTANT_SYMBOLS.find((k) => k.code === value);

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? "napr. 0098"}
        autoComplete="off"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {matched && !open && (
        <div className="mt-1 text-xs text-muted-foreground">{matched.label}</div>
      )}
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Žiadna zhoda — môžete zadať vlastný kód.
            </div>
          )}
          {filtered.map((k) => (
            <button
              key={k.code}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(k.code);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                k.code === value ? "bg-muted/60" : ""
              }`}
            >
              <span className="font-mono font-medium">{k.code}</span>
              <span className="text-muted-foreground">— {k.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
