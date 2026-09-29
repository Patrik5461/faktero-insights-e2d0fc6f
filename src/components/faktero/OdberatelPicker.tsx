import { useEffect, useRef, useState } from "react";
import { Search, User, UserPlus } from "lucide-react";
import { NewCustomerModal } from "@/components/faktero/NewCustomerModal";

/**
 * Výber odberateľa s vyhľadávaním.
 *
 * Ten istý ovládací prvok používa nová faktúra aj opakovaná faktúra —
 * zakladanie šablóny má vyzerať a fungovať rovnako ako vystavenie dokladu,
 * inak si človek pri každom druhu zvyká nanovo. Keď odberateľ v zozname nie
 * je, dá sa založiť priamo odtiaľto.
 */
export function CustomerSearch({
  customers,
  value,
  onChange,
  onCreated,
}: {
  customers: any[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (c: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = customers.find((c) => c.id === value);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = q
    ? customers
        .filter((c) =>
          `${c.name} ${c.ico ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q.toLowerCase()),
        )
        .slice(0, 8)
    : customers.slice(0, 8);

  return (
    <div ref={ref} className="relative mt-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
      >
        <User className="h-4 w-4 text-muted-foreground" />
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? selected.name : "Vyhľadať odberateľa…"}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadať podľa mena, IČO, e-mailu…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-3">
                <div className="text-sm text-muted-foreground mb-2">Nenašli ste odberateľa?</div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setModalOpen(true);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <UserPlus className="h-4 w-4" /> Vytvoriť nového odberateľa
                </button>
              </li>
            )}
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted/60"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[c.ico, c.email].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {filtered.length > 0 && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setModalOpen(true);
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <UserPlus className="h-4 w-4" /> Vytvoriť nového odberateľa
              </button>
            </div>
          )}
        </div>
      )}
      {modalOpen && (
        <NewCustomerModal
          defaultName={q}
          onClose={() => setModalOpen(false)}
          onCreated={(c) => {
            onCreated(c);
            setModalOpen(false);
            setQ("");
          }}
        />
      )}
    </div>
  );
}
