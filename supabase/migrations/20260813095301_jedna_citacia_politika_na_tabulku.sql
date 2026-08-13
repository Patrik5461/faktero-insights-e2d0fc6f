-- Zapisovacia politika písaná ako `for all` platí aj na SELECT, takže sa pri každom
-- čítaní vyhodnocovala popri čitacej politike druhýkrát. Rozdeľujeme ju na vklad,
-- úpravu a mazanie; čítanie ostáva na čitacej politike.
--
-- Že sa tým o nič nepríde, drží preto, že zapisovacia podmienka je vždy užšia než
-- čitacia (admin je vždy aj člen) alebo je s ňou totožná. Overené odtlačkom
-- viditeľnosti pod rolou `authenticated` pred zmenou a po nej — všetkých 21 tabuliek
-- sedelo do riadku okrem `subscription_plans` (4 → 3), a to je zámer: platformový
-- admin cez REST už nevidí neaktívny plán „business". Správu plánov robí server
-- servisným kľúčom, RLS sa ho netýka. Overený bol aj zápis (vklad, úprava, mazanie
-- prešli) a to, že cudzia firma ostáva neprístupná na čítanie aj na zápis.
do $$
declare
  w record;
  citacia text;
  roly text;
  pocet int := 0;
begin
  for w in
    select tablename, policyname, qual, with_check, roles
    from pg_policies
    where schemaname = 'public'
      and cmd = 'ALL'
      and permissive = 'PERMISSIVE'
      and tablename in (
        'api_keys','commander_vehicle_links','company_invitations','invoice_items',
        'legal_document_versions','payments','price_action_products','price_actions',
        'price_groups','product_prices','purchase_order_items','quote_items',
        'sales_order_items','sales_orders','seo_cache','stock_transfer_items',
        'subscription_plans','tesla_connections','tesla_vehicle_links')
    order by tablename
  loop
    -- Bez čitacej politiky by rozdelenie zobralo prístup k čítaniu — takú tabuľku
    -- necháme tak.
    select policyname into citacia
    from pg_policies
    where schemaname = 'public' and tablename = w.tablename
      and cmd = 'SELECT' and permissive = 'PERMISSIVE'
    limit 1;
    if citacia is null then
      raise notice 'preskakujem %, nemá čitaciu politiku', w.tablename;
      continue;
    end if;

    -- `public` je kľúčové slovo, nie meno role — quote_ident by z neho spravil rolu,
    -- ktorá neexistuje.
    select string_agg(case when rn::text = 'public' then 'public' else quote_ident(rn::text) end, ', ')
      into roly
    from unnest(w.roles) rn;

    execute format('drop policy %I on public.%I', w.policyname, w.tablename);

    execute format('create policy %I on public.%I as permissive for insert to %s with check (%s)',
                   w.policyname || ' – vklad', w.tablename, roly, coalesce(w.with_check, w.qual));
    execute format('create policy %I on public.%I as permissive for update to %s using (%s) with check (%s)',
                   w.policyname || ' – úprava', w.tablename, roly, w.qual, coalesce(w.with_check, w.qual));
    execute format('create policy %I on public.%I as permissive for delete to %s using (%s)',
                   w.policyname || ' – mazanie', w.tablename, roly, w.qual);

    pocet := pocet + 1;
  end loop;

  raise notice 'rozdelených politík: %', pocet;
end $$;

-- Dve tabuľky majú namiesto toho dve čitacie politiky. Spojíme ich do jednej cez OR
-- — obe platia pre tú istú rolu, takže výsledok je presne ten istý riadok po riadku.
do $$
declare vlastna text; adminska text;
begin
  select qual into vlastna from pg_policies
   where schemaname='public' and tablename='legal_acceptances' and policyname='Users see their own acceptances';
  select qual into adminska from pg_policies
   where schemaname='public' and tablename='legal_acceptances' and policyname='Platform admins view all acceptances';
  execute format('alter policy %I on public.legal_acceptances using ((%s) or (%s))',
                 'Users see their own acceptances', vlastna, adminska);
  execute 'drop policy "Platform admins view all acceptances" on public.legal_acceptances';

  select qual into vlastna from pg_policies
   where schemaname='public' and tablename='platform_invoices' and policyname='Company members can view their platform invoices';
  select qual into adminska from pg_policies
   where schemaname='public' and tablename='platform_invoices' and policyname='Platform admins can view all';
  execute format('alter policy %I on public.platform_invoices using ((%s) or (%s))',
                 'Company members can view their platform invoices', vlastna, adminska);
  execute 'drop policy "Platform admins can view all" on public.platform_invoices';
end $$;
