import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ConstantSymbolCombobox } from "@/components/faktero/ConstantSymbolCombobox";

export const Route = (createFileRoute as any)("/_test-ks")({
  component: () => {
    const [v, setV] = useState("0098");
    return (
      <div className="mx-auto mt-20 max-w-md p-6">
        <div className="rounded-2xl border border-border bg-card p-5">
          <label className="text-xs font-medium text-muted-foreground">Konštantný symbol</label>
          <div className="mt-1">
            <ConstantSymbolCombobox value={v} onChange={setV} />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Hodnota: {v}</div>
        </div>
      </div>
    );
  },
});
