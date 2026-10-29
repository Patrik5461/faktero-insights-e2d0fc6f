-- Nezaevidované eFaktúry rovnako ako zvonček a menu (cakaNaZaevidovanie).
create or replace function public.prehlad_firiem_stav(p_company_ids uuid[])
returns table (
  company_id uuid,
  nespracovane integer,
  neodovzdane_blocky integer,
  efaktury_nezaevidovane integer,
  po_splatnosti integer,
  efaktura_pds_stav text,
  efaktura_cudzi_poskytovatel text,
  efaktura_odosielanie_stav text,
  efaktura_prijem_poskytovatel text,
  efaktura_profil boolean,
  ucty_spolu integer,
  ucty_napojene integer,
  ucty_problem integer,
  ucty_suhlas integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with firmy as (
    select distinct cu.company_id
    from public.company_users cu
    where cu.user_id = auth.uid()
      and cu.company_id = any(p_company_ids)
      and public.mfa_ok()
  ),
  pravo as (
    select f.company_id,
           f.company_id = any(public.firmy_s_pravom('doklady', false)) as doklady,
           f.company_id = any(public.firmy_s_pravom('faktury', false)) as faktury,
           f.company_id = any(public.firmy_s_pravom('banka', false)) as banka
    from firmy f
  ),
  -- To isté číslo ako pri Nespracovaných v menu: doklady v Nespracovaných + nové bločky.
  nesp as (
    select x.company_id, count(*)::int as n
    from (
      select n.company_id from public.nespracovane_doklady n
      where n.company_id in (select company_id from firmy)
      union all
      select e.company_id from public.expense_documents e
      where e.company_id in (select company_id from firmy) and e.status = 'new'
    ) x
    group by x.company_id
  ),
  -- Spracované, ale ešte neodovzdané do účtovníctva.
  blocky as (
    select e.company_id, count(*)::int as n
    from public.expense_documents e
    where e.company_id in (select company_id from firmy)
      and e.status = 'processed'
      and e.exported_at is null
    group by e.company_id
  ),
  efa_prijate as (
    select r.company_id, count(*)::int as n
    from public.efaktura_received_documents r
    where r.company_id in (select company_id from firmy)
      and r.matched_supplier_invoice_id is null
      and r.status in ('received', 'parsed')
      -- Rovnaká podmienka ako `cakaNaZaevidovanie` (upozornenie-prijatej.ts):
      -- samofaktúra sa medzi prijaté nezaeviduje, nový stav = vybavená.
      and coalesce(r.parsed_data->>'documentKind', '') not in ('self_billing', 'self_billing_credit_note')
    group by r.company_id
  ),
  -- Po splatnosti z dátumu a nezaplatenosti, nie zo stavu (`overdue` sa neukladá).
  -- Rovnaké pravidlo ako `jePoSplatnosti` vo faktury-sumy.ts.
  splatnost as (
    select i.company_id, count(*)::int as n
    from public.invoices i
    where i.company_id in (select company_id from firmy)
      and i.deleted_at is null
      and i.status not in ('draft', 'cancelled', 'paid')
      and i.type not in ('proforma', 'advance_payment', 'credit_note')
      and i.paid_at is null
      and i.due_date < (now() at time zone 'Europe/Bratislava')::date
    group by i.company_id
  ),
  -- Posledná žiadosť z Portálu FS a posledný onboarding „len odosielanie“ (ako `rozsahFirmy`).
  pds as (
    select distinct on (p.company_id) p.company_id, p.stav, p.cudzi_poskytovatel
    from public.efaktura_pds_ziadosti p
    where p.company_id in (select company_id from firmy)
    order by p.company_id, p.prijate_at desc nulls last
  ),
  odos as (
    select distinct on (o.company_id) o.company_id, o.stav, o.prijem_poskytovatel
    from public.efaktura_odosielanie_ziadosti o
    where o.company_id in (select company_id from firmy)
    order by o.company_id, o.vytvorene_at desc nulls last
  ),
  -- Účty firmy: zadané v nastaveniach aj natiahnuté z banky, zlúčené podľa IBAN-u.
  ucty as (
    select c.company_id, upper(replace(c.iban, ' ', '')) as iban,
           false as napojeny, false as problem, false as suhlas
    from public.company_bank_accounts c
    where c.company_id in (select company_id from firmy) and coalesce(c.iban, '') <> ''
    union all
    select a.company_id,
           coalesce(nullif(upper(replace(a.iban, ' ', '')), ''), 'ID:' || a.id::text),
           (k.status = 'connected' and a.unavailable_since is null),
           -- Problém: pripojenie nebeží, banka účet nepozná, alebo pohyby
           -- nechodia dlhšie než 48 h (ako `pohybyZastarane`).
           (k.status <> 'connected'
             or a.unavailable_since is not null
             or (a.pohyby_chyba is not null
                 and (a.pohyby_ok_at is null or a.pohyby_ok_at < now() - interval '48 hours'))),
           -- Súhlas banky vypršal alebo ho zrušili — opraví ho len človek (`jeChybaSuhlasu`).
           (a.unavailable_since is not null
             or coalesce(a.pohyby_chyba, '') ~* '(SCA_EXPIRED|SCA expired|CONSENT_(EXPIRED|INVALID|REVOKED)|consent.*(expired|invalid|revoked))')
    from public.bank_accounts a
    join public.bank_connections k on k.id = a.bank_connection_id
    where a.company_id in (select company_id from firmy)
  ),
  ucty_firmy as (
    select u.company_id,
           count(distinct u.iban)::int as spolu,
           count(distinct u.iban) filter (where u.napojeny)::int as napojene,
           count(distinct u.iban) filter (where u.problem)::int as problem,
           count(distinct u.iban) filter (where u.suhlas)::int as suhlas
    from ucty u
    group by u.company_id
  )
  select f.company_id,
         case when f.doklady then coalesce(ns.n, 0) end,
         case when f.doklady then coalesce(b.n, 0) end,
         case when f.doklady then coalesce(ep.n, 0) end,
         case when f.faktury then coalesce(s.n, 0) end,
         case when f.faktury then p.stav end,
         case when f.faktury then p.cudzi_poskytovatel end,
         case when f.faktury then o.stav end,
         case when f.faktury then o.prijem_poskytovatel end,
         case when f.faktury then exists (
           select 1 from public.efaktura_profiles pr where pr.company_id = f.company_id
         ) end,
         case when f.banka then coalesce(u.spolu, 0) end,
         case when f.banka then coalesce(u.napojene, 0) end,
         case when f.banka then coalesce(u.problem, 0) end,
         case when f.banka then coalesce(u.suhlas, 0) end
  from pravo f
  left join nesp ns on ns.company_id = f.company_id
  left join blocky b on b.company_id = f.company_id
  left join efa_prijate ep on ep.company_id = f.company_id
  left join splatnost s on s.company_id = f.company_id
  left join pds p on p.company_id = f.company_id
  left join odos o on o.company_id = f.company_id
  left join ucty_firmy u on u.company_id = f.company_id;
$$;
