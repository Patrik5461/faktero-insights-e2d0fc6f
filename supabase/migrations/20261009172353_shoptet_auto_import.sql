-- Automatický import objednávok zo Shoptetu (každú hodinu). Predvolene vypnutý;
-- po zapnutí berie len objednávky vytvorené od zapnutia (auto_od) v zvolených stavoch.
alter table public.shoptet_napojenia
  add column if not exists auto_import boolean not null default false,
  add column if not exists auto_stavy integer[] not null default '{}',
  add column if not exists auto_od timestamptz,
  add column if not exists stavy jsonb;
comment on column public.shoptet_napojenia.stavy is 'Stavy objednávok e-shopu (id, name) z /api/eshop — na výber v nastavení.';
