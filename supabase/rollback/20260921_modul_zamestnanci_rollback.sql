-- Návrat modulu Zamestnanci (migrácie 20260921172003, 172119, 172241, 174308).
-- POZOR: zmaže všetky údaje zamestnancov a ich dokumenty v úložisku.
-- Spustiť až po `git revert` a nasadení, aby web nečítal stĺpec module_employees.

select cron.unschedule('faktero-zamestnanci-pripomienky-daily')
where exists (select 1 from cron.job where jobname = 'faktero-zamestnanci-pripomienky-daily');

drop policy if exists "members read employee docs" on storage.objects;
drop policy if exists "members upload employee docs" on storage.objects;
drop policy if exists "members update employee docs" on storage.objects;
drop policy if exists "members delete employee docs" on storage.objects;
-- Súbory v kbelíku zmaže úložisko (Storage API), nie SQL:
--   supabase.storage.emptyBucket('employee-docs'); supabase.storage.deleteBucket('employee-docs')

drop table if exists public.employee_reminder_log;
drop table if exists public.employee_access_log;
drop table if exists public.employee_doc_templates;
drop table if exists public.employee_attendance;
drop table if exists public.employee_absences;
drop table if exists public.employee_documents;
drop table if exists public.employee_contracts;
drop table if exists public.employees;

drop function if exists public.employee_set_pii(uuid, text, text);
drop function if exists public.employee_get_pii(uuid);
drop function if exists public.employee_get_pii_service(uuid, uuid);
drop function if exists public.employee_pii_present(uuid);
drop function if exists public.employee_log_access(uuid, text);
drop function if exists public.employee_log_export(uuid);
drop function if exists public.employee_pii_key();
drop function if exists public.employee_child_company_guard();
drop function if exists public.employees_audit();
drop function if exists public.employees_touch_updated_at();
drop function if exists public.faktero_schema_ddl();

delete from vault.secrets where name = 'employee_pii_key';

alter table public.companies drop column if exists module_employees;
