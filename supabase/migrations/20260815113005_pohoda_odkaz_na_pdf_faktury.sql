-- Odkaz na PDF pri doklade v Pohode.
--
-- Pohoda vie v záložke Dokumenty držať URL adresu (`typ:urlAddress`), ale
-- schéma ju obmedzuje na 255 znakov — podpísaný odkaz zo Supabase je dlhší a
-- navyše mu vyprší platnosť. Preto má faktúra vlastný krátky token a PDF sa
-- vydáva cez verejnú cestu, ktorá si podpis vyrobí až pri kliknutí.
--
-- Token vzniká až pri vývoze do Pohody a firma si odkazy môže vypnúť.

alter table public.invoices
  add column if not exists pdf_token text;

create unique index if not exists invoices_pdf_token_key
  on public.invoices (pdf_token)
  where pdf_token is not null;

comment on column public.invoices.pdf_token is
  'Náhodný token pre verejný odkaz na PDF (Pohoda, záložka Dokumenty). NULL = odkaz neexistuje.';

alter table public.companies
  add column if not exists pohoda_odkaz_na_pdf boolean not null default true;

comment on column public.companies.pohoda_odkaz_na_pdf is
  'Pripájať k dokladom v Pohode odkaz na PDF faktúry.';
