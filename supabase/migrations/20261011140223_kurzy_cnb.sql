-- Kurzy ČNB pre české firmy: daň sa v Česku prepočítava na koruny kurzom
-- devizového trhu ČNB platným ke dni uskutečnění plnění (§ 4 odst. 5 ZDPH).
-- `kurz` = koľko CZK za 1 jednotku meny (ČNB pri HUF, JPY… udáva za 100 —
-- ukladá sa už prepočítané na jednu jednotku).
create table if not exists public.kurzy_cnb (
  den date not null,
  mena text not null,
  kurz numeric not null check (kurz > 0),
  primary key (den, mena)
);

alter table public.kurzy_cnb enable row level security;

create policy "kurzy cnb citaju prihlaseni" on public.kurzy_cnb
  for select to authenticated using (true);

revoke all on public.kurzy_cnb from public, anon;
grant select on public.kurzy_cnb to authenticated;
grant all on public.kurzy_cnb to service_role;
