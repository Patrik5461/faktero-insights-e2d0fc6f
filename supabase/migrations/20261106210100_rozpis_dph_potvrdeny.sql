-- Potvrdený nesúlad rozpisu DPH (Patrik 6. 11. 2026, checklist B1-2).
--
-- Formulár prijatej faktúry, bločku a zaúčtovanie kontrolujú, či základ + DPH
-- podľa sadzieb sedí so sumou dokladu (tolerancia 0,01 € na sadzbu) a či daň
-- zodpovedá sadzbe (`rozpis-dph-kontrola.ts`). Keď nesedí, človek môže dať
-- „Pokračovať aj tak“ — vtedy sa sem zapíše podpis rozpisu a sumy
-- (`podpisRozpisu`), kto a kedy. Kým sa rozpis ani suma nezmenia, formulár
-- sa už nepýta znova. Zmena rozpisu dá iný podpis a kontrola sa ozve.
--
--   { "podpis": "23:100.00:19.00:standard#119.00", "at": "…", "kto": "uuid", "dovod": "…" }
--
-- Zápis ide zvlášť od uloženia dokladu, kým migrácia nie je nasadená, kód
-- len zapíše varovanie do konzoly. Idempotentná.

alter table public.purchase_invoices add column if not exists rozpis_dph_potvrdeny jsonb;
alter table public.expense_documents add column if not exists rozpis_dph_potvrdeny jsonb;

comment on column public.purchase_invoices.rozpis_dph_potvrdeny is
  'Človek vedome potvrdil nesúlad rozpisu DPH so sumou dokladu ({podpis, at, kto, dovod}); podpis = podpisRozpisu v rozpis-dph-kontrola.ts.';
comment on column public.expense_documents.rozpis_dph_potvrdeny is
  'Človek vedome potvrdil nesúlad rozpisu DPH so sumou dokladu ({podpis, at, kto, dovod}); podpis = podpisRozpisu v rozpis-dph-kontrola.ts.';
