-- Žiadosti FS, ktoré Faktero odmietlo (zlý podpis, chýbajúce tajomstvo, zlý obsah).
-- Bez tokenu — len to, čo treba na dohľadanie firmy. Údaje pri 401 sú neoverené.
create table public.efaktura_pds_odmietnute (
  id uuid primary key default gen_random_uuid(),
  prijate_at timestamptz not null default now(),
  dovod text not null check (dovod in ('bez_tajomstva','zly_podpis','zly_obsah','chyba_servera')),
  overene boolean not null default false,
  firmy jsonb not null default '[]'::jsonb,
  chyba text,
  ip text
);
create index efaktura_pds_odmietnute_prijate on public.efaktura_pds_odmietnute (prijate_at desc);
alter table public.efaktura_pds_odmietnute enable row level security;
create policy "mfa ak je zapnute" on public.efaktura_pds_odmietnute as restrictive
  for all to authenticated using ((select mfa_ok()));
revoke all on public.efaktura_pds_odmietnute from public, anon, authenticated;
grant all on public.efaktura_pds_odmietnute to service_role;
