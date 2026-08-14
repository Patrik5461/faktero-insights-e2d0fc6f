-- Kam sa posiela mesačný balík podkladov. Účtovníčka nemusí mať v Fakteru účet,
-- takže rola tu nestačí — treba adresu.
alter table public.companies
  add column if not exists uctovnik_email text;

comment on column public.companies.uctovnik_email is 'E-mail účtovníčky, kam chodí mesačné odovzdanie podkladov';
