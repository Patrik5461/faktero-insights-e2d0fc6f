-- Zoznam firiem: neexportované bločky a bankové účty (napojené / všetky) pre
-- všetky firmy naraz. SECURITY INVOKER — počíta len to, čo prihlásenému
-- dovolí RLS, cudziu firmu vráti s nulami.
create or replace function public.prehlad_firiem(p_company_ids uuid[])
returns table (company_id uuid, neexportovane_blocky integer, ucty_spolu integer, ucty_napojene integer)
language sql
stable
security invoker
set search_path = public
as $$
  with firmy as (
    select unnest(p_company_ids) as company_id
  ),
  blocky as (
    select e.company_id, count(*)::int as n
    from expense_documents e
    where e.company_id = any(p_company_ids)
      and e.status = 'processed'
      and e.exported_at is null
    group by e.company_id
  ),
  -- Účty firmy: zadané v nastaveniach aj natiahnuté z banky, zlúčené podľa IBAN-u.
  ucty as (
    select c.company_id, upper(replace(c.iban, ' ', '')) as iban, false as napojeny
    from company_bank_accounts c
    where c.company_id = any(p_company_ids) and coalesce(c.iban, '') <> ''
    union all
    select a.company_id,
           coalesce(nullif(upper(replace(a.iban, ' ', '')), ''), 'ID:' || a.id::text),
           (k.status = 'connected' and a.unavailable_since is null)
    from bank_accounts a
    join bank_connections k on k.id = a.bank_connection_id
    where a.company_id = any(p_company_ids)
  ),
  ucty_firmy as (
    select u.company_id, count(distinct u.iban)::int as spolu,
           count(distinct u.iban) filter (where u.napojeny)::int as napojene
    from ucty u
    group by u.company_id
  )
  select f.company_id,
         coalesce(b.n, 0),
         coalesce(u.spolu, 0),
         coalesce(u.napojene, 0)
  from firmy f
  left join blocky b on b.company_id = f.company_id
  left join ucty_firmy u on u.company_id = f.company_id;
$$;

revoke all on function public.prehlad_firiem(uuid[]) from public;
revoke all on function public.prehlad_firiem(uuid[]) from anon;
grant execute on function public.prehlad_firiem(uuid[]) to authenticated, service_role;
