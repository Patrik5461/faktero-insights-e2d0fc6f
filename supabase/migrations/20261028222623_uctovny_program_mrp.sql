-- Export zaúčtovaných dokladov do MRP-K/S (XML MRP-K/S 2.0).
alter table public.companies drop constraint if exists companies_uctovny_program_check;
alter table public.companies add constraint companies_uctovny_program_check
  check (uctovny_program = any (array['pohoda'::text, 'omega'::text, 'money_s3'::text, 'flexi'::text, 'mrp'::text, 'csv'::text, 'datev'::text]));
