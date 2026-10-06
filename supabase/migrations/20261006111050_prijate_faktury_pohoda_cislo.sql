-- Prijatá faktúra v Pohode: číslo, ktoré jej Pohoda pridelila, a dávka, ktorou odišla.
alter table public.purchase_invoices
  add column if not exists pohoda_cislo text,
  add column if not exists export_job_id uuid references public.export_jobs(id) on delete set null;
