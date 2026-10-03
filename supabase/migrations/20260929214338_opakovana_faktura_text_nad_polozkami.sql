-- Text nad položkami aj na šablóne opakovanej faktúry.
--
-- Na faktúre je text povinný — hovorí, čo sa fakturuje. Faktúry z opakovanej
-- šablóny ho ale nemali odkiaľ vziať a vznikali bez neho: paušál, ktorý sa
-- vystaví dvanásťkrát do roka, tak nikde nepovedal, za aké obdobie je.

alter table public.recurring_invoices
  add column if not exists intro_note text;

comment on column public.recurring_invoices.intro_note is 'Text nad položkami, ktorý dostane každá faktúra vystavená z tejto šablóny';
