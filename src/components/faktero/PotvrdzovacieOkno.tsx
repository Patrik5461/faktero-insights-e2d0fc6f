import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { jeNebezpecna, prihlasOkno, vybavZiadost, type Ziadost } from "@/lib/potvrdenie";

/**
 * Okno pre `potvrd()` — pripája sa raz v koreni aplikácie. Otázka môže mať
 * viac riadkov (`\n`), prvý sa ukáže ako nadpis, zvyšok ako text.
 */
export function PotvrdzovacieOkno() {
  const [ziadost, setZiadost] = useState<Ziadost | null>(null);
  useEffect(() => prihlasOkno(setZiadost), []);
  /*
    Tlačidlá okno zavrú aj samy (Radix po onClick zavolá onOpenChange). Bez
    tejto značky by sa zavretie započítalo druhýkrát a zamietlo ďalšiu otázku.
  */
  const vybavene = useRef(false);
  const odpovedz = (ano: boolean) => {
    vybavene.current = true;
    vybavZiadost(ano);
  };

  const riadky = (ziadost?.sprava ?? "").split(/\n+/).filter(Boolean);
  const nadpis = riadky[0] ?? "";
  const text = riadky.slice(1).join("\n");
  const nebezpecne = ziadost?.nebezpecne ?? jeNebezpecna(ziadost?.sprava ?? "");

  return (
    <AlertDialog
      open={Boolean(ziadost)}
      onOpenChange={(otvorene) => {
        if (otvorene) return;
        if (vybavene.current) {
          vybavene.current = false;
          return;
        }
        // Escape alebo klik mimo okna = späť.
        if (ziadost) vybavZiadost(false);
      }}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base leading-snug">{nadpis}</AlertDialogTitle>
          {text ? (
            <AlertDialogDescription className="whitespace-pre-line">{text}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">Potvrďte akciu.</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => odpovedz(false)}>
            {ziadost?.zrusit ?? "Späť"}
          </AlertDialogCancel>
          {/* Fokus ostáva na „Späť" (Radix) — Enter omylom nič nezmaže. */}
          <AlertDialogAction
            className={nebezpecne ? buttonVariants({ variant: "destructive" }) : undefined}
            onClick={() => odpovedz(true)}
          >
            {ziadost?.potvrdit ?? (nebezpecne ? "Áno, pokračovať" : "Potvrdiť")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
