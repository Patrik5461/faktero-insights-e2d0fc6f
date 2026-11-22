-- Konateľ firmy (Správa firiem → rozbalené údaje). Meno sa predvyplní z registra, telefón a e-mail dopĺňa človek.
alter table public.companies
  add column if not exists konatel_meno text,
  add column if not exists konatel_telefon text,
  add column if not exists konatel_email text;
