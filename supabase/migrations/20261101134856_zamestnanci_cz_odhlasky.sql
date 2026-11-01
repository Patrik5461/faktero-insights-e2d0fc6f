-- Modul Zamestnanci pre české firmy: kedy bol zamestnanec odhlásený z ČSSZ
-- (§ 19 odst. 6 zák. 323/2025 Sb.) a od zdravotnej poisťovne (§ 10 zák. 48/1997 Sb.)
-- po skončení zamestnania. Stĺpce sú voliteľné, starý kód o nich nevie.
alter table public.employees
  add column if not exists sp_deregistered_at date,
  add column if not exists zp_deregistered_at date;

comment on column public.employees.sp_deregistered_at is 'CZ: odhlásenie zamestnanca z ČSSZ podané (do 8 dní od skončenia, § 19 odst. 6 zák. 323/2025 Sb.)';
comment on column public.employees.zp_deregistered_at is 'CZ: skončenie oznámené zdravotnej poisťovni (do 8 dní, § 10 zák. 48/1997 Sb.)';

-- Na employees sú práva po stĺpcoch (šifrované RČ/OP klient nevidí) — nové stĺpce treba pridať zvlášť.
revoke all (sp_deregistered_at, zp_deregistered_at) on public.employees from public, anon;
grant select (sp_deregistered_at, zp_deregistered_at),
      insert (sp_deregistered_at, zp_deregistered_at),
      update (sp_deregistered_at, zp_deregistered_at)
  on public.employees to authenticated;
