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

  const [text, setText] = useState("");
  useEffect(() => setText(ziadost?.pole ? (ziadost.hodnota ?? "") : ""), [ziadost]);
  const pole = ziadost?.pole;
  const prazdne = Boolean(pole && !pole.povolitPrazdne && !text.trim());
  const potvrdPole = () => {
    if (!ziadost || prazdne) return;
    ziadost.hodnota = text;
    odpovedz(true);
  };

  const riadky = (ziadost?.sprava ?? "").split(/\n+/).filter(Boolean);
  const nadpis = riadky[0] ?? "";
  const popis = riadky.slice(1).join("\n");
  const nebezpecne = ziadost?.pole
    ? Boolean(ziadost.nebezpecne)
    : (ziadost?.nebezpecne ?? jeNebezpecna(ziadost?.sprava ?? ""));

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
          {popis ? (
            <AlertDialogDescription className="whitespace-pre-line">{popis}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">Potvrďte akciu.</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {pole ? (
          <>
            <input
              autoFocus
              aria-label={nadpis}
              type={pole.typ ?? "text"}
              value={text}
              placeholder={pole.placeholder}
              list={pole.moznosti?.length ? "potvrd-moznosti" : undefined}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  potvrdPole();
                }
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            {pole.moznosti?.length ? (
              <datalist id="potvrd-moznosti">
                {pole.moznosti.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            ) : null}
          </>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => odpovedz(false)}>
            {ziadost?.zrusit ?? "Späť"}
          </AlertDialogCancel>
          {/* Fokus ostáva na „Späť" (Radix) — Enter omylom nič nezmaže. */}
          <AlertDialogAction
            className={nebezpecne ? buttonVariants({ variant: "destructive" }) : undefined}
            disabled={prazdne}
            onClick={(e) => {
              if (pole) {
                e.preventDefault();
                potvrdPole();
              } else odpovedz(true);
            }}
          >
            {ziadost?.potvrdit ?? (nebezpecne ? "Áno, pokračovať" : "Potvrdiť")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
