/*
 * Ručný pohyb nemá `reference_type`, takže porovnanie `NULL = 'invoice'` nedá
 * false, ale NULL. Celá podmienka `j.status <> 'active' and not NULL` potom
 * vyjde NULL, IF ju vyhodnotí ako nesplnenú a výdaj na uzavretú zákazku
 * ticho prešiel. Preto `coalesce` — trojhodnotová logika sa musí zraziť na
 * dve hneď pri zdroji.
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

  -- Pohyb typu `faktura`/`dobropis` nie je nové priradenie, ale tieň faktúry,
  -- ktorá zákazku už nesie. Bez tejto výnimky by sa po uzavretí zákazky nedala
  -- stornovať faktúra vystavená ešte za jej otvorenia.
  --
  -- `new.reference_type` sa nedá napísať priamo: plpgsql rieši stĺpce už pri
  -- preklade výrazu a na `invoices` či `trips` taký stĺpec nie je.
  if tg_table_name = 'stock_movements' then
    odvodeny_z_faktury := coalesce((to_jsonb(new) ->> 'reference_type') = 'invoice', false);
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
