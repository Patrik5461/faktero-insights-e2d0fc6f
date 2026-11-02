/**
 * Demo dáta: oznam o plánovanej aktualizácii (platformove_oznamy) — začiatok
 * 20 minút od štartu servera, takže po prvom otvorení stránky naskočí okno
 * a pás „Aktualizácia o …“. Ostatné fázy (počas/po) sa v preview nastavia
 * úpravou riadku cez /__demo/rest (zápis ide len do pamäte).
 */
import type { DemoDb } from "../server/db";
import { uid } from "./pomocne";

export function naplnOznamy(db: DemoDb) {
  db.vloz("platformove_oznamy", [
    {
      id: uid("oznam:aktualizacia"),
      typ: "aktualizacia",
      text: null,
      zaciatok: new Date(Date.now() + 20 * 60_000).toISOString(),
      trvanie_min: 1,
      plati_do: null,
      aktivny: true,
      len_pre_user_id: null,
    },
  ]);
}
