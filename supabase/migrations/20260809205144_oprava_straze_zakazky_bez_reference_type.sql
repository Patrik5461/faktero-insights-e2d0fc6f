/*
 * `new.reference_type` sa v podmienke nedá použiť priamo.
 *
 * plpgsql si výraz v IF preloží ako jeden SQL dopyt a stĺpce v ňom rieši už pri
 * preklade — nie až keď sa k nim výpočet dostane. Na `invoices`, `trips`,
 * `quotes` ani `purchase_invoices` taký stĺpec nie je, takže strážca padal na
 * „record new has no field reference_type" pri každom priradení zákazky,
 * hoci tá vetva podmienky sa ich vôbec netýkala.
 *
 * `to_jsonb(new)` je bez tohto problému: chýbajúci kľúč vráti NULL.
 */
create or replace function public.jobs_guard_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  j record;
  odvodeny_z_faktury boolean := false;
begin
  if new.job_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.job_id is not distinct from new.job_id then
    return new;
  end if;

  if tg_table_name = 'stock_movements' then
    odvodeny_z_faktury := (to_jsonb(new) ->> 'reference_type') = 'invoice';
  end if;

  select company_id, status into j from public.jobs where id = new.job_id;
  if not found then
    raise exception 'Zákazka neexistuje.';
  end if;
  if j.company_id <> new.company_id then
    raise exception 'Zákazka patrí inej firme.';
  end if;
  if j.status <> 'active' and not odvodeny_z_faktury then
    raise exception 'Zákazka nie je otvorená, doklad sa k nej priradiť nedá.';
  end if;
  return new;
end $$;

revoke all on function public.jobs_guard_assignment() from public, anon, authenticated;
