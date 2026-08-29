-- Pády mobilnej aplikácie.
--
-- Hláška „aplikácia sa opakovane zastavuje" nezanechá nič, čo by sa dalo
-- poslať — výpis ostane v systémovom logu telefónu. Appka si ho preto uloží
-- a pošle sem, a to **natívne, bez prihlásenia**: keď sa appka zloží ešte
-- pred načítaním, žiadny JavaScript ani relácia neexistujú.
--
-- Preto vlastná tabuľka a nie `feedback`: tá má `user_id` povinné.
create table if not exists public.app_crashes (
  id uuid primary key default gen_random_uuid(),
  balicek text not null,
  system text,
  vypis text not null,
  created_at timestamptz not null default now()
);

comment on table public.app_crashes is
  'Výpisy pádov z mobilných aplikácií. Zapisuje ich endpoint /api/mobil/pad servisným kľúčom.';

-- Nikto okrem servisného kľúča sem nemá čo hľadať: výpis pádu môže obsahovať
-- názvy tried aj údaje z pamäte. Žiadne politiky teda zámerne nie sú.
alter table public.app_crashes enable row level security;

revoke all on public.app_crashes from public, anon, authenticated;
