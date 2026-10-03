-- Opakovaná faktúra si pamätá, z ktorého radu má číslovať.
--
-- Faktúry z paušálu vznikajú v noci bez človeka, takže rad nemá kto vybrať
-- v tej chvíli — vyberie sa raz na šablóne a generátor ho použije. Keď nie je
-- vyplnený, číslo príde z predvoleného radu ako doteraz.

alter table public.recurring_invoices
  add column if not exists number_series_id uuid references public.number_series (id) on delete set null;

comment on column public.recurring_invoices.number_series_id is 'Číselný rad, z ktorého dostávajú číslo faktúry z tejto šablóny';
