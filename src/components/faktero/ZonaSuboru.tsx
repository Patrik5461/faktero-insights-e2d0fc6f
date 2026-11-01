/*
  Zóna „Vyberte alebo presuňte súbor“ — klik otvorí výber, pustený súbor sa
  nahrá. Bez `onDrop` by prehliadač pustený súbor otvoril namiesto nahratia.
*/
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { suborSediSAccept } from "@/lib/faktero/zona-suboru";
import { cn } from "@/lib/utils";

export function ZonaSuboru({
  accept,
  multiple = false,
  disabled = false,
  onSubory,
  className,
  children,
}: {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onSubory: (subory: File[]) => void;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useT();
  const [nadZonou, setNadZonou] = useState(false);

  function prijmi(zoznam: FileList | null | undefined) {
    const vsetky = Array.from(zoznam ?? []);
    const ok = vsetky.filter((f) => suborSediSAccept(f, accept));
    for (const f of vsetky)
      if (!ok.includes(f))
        toast.error(
          t("{subor}: tento typ súboru sa tu nedá nahrať ({pripony}).", {
            subor: f.name,
            pripony: (accept ?? "").split(",").join(", "),
          }),
        );
    const vyber = multiple ? ok : ok.slice(0, 1);
    if (vyber.length) onSubory(vyber);
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setNadZonou(true);
      }}
      onDragLeave={() => setNadZonou(false)}
      onDrop={(e) => {
        e.preventDefault();
        setNadZonou(false);
        if (!disabled) prijmi(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/30 px-6 py-10 text-sm hover:border-primary/50",
        nadZonou && "border-primary bg-primary/5",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {children}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          prijmi(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
