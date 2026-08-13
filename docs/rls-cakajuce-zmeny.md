# RLS — dve zmeny, ktoré čakajú na spustenie

Vyšli z auditu 2026-08-13. Obe menia politiky, čo mi nástroj nedovolil spustiť
sám, takže sa musia pustiť ručne — v Supabase v **SQL Editore** projektu
`sywcjxydnljkzoepfcaz`, alebo mi to odklikni a spustím ich.

Keď prejdú, prilož ich sem ako migračné súbory pomenované podľa verzie, ktorá sa
zapíše do `supabase_migrations.schema_migrations` (rovnako ako ostatné).

---

## 1. Cenník sa nedá prečítať neprihláseným (skutočná chyba)

Politika `Platform admins manage plans` na `subscription_plans` je pustená na rolu
`public`, čiže platí aj pre neprihláseného návštevníka. Volá `is_platform_admin()`,
na ktorú `anon` právo nemá, takže dotaz **neskončí prázdnym výsledkom, ale chybou**:

```
$ curl "…/rest/v1/subscription_plans?select=id,name" -H "apikey: <publishable>"
{"code":"42501","message":"permission denied for function is_platform_admin"}
```

Dnes to nič nerozbíja, lebo verejný cenník číta plány cez `listPlans`, ktorý ide
servisným kľúčom a RLS obchádza. Akonáhle by ale plány čítal prehliadač priamo,
stránka spadne. Správa plánov patrí prihlásenému platformovému adminovi:

```sql
alter policy "Platform admins manage plans" on public.subscription_plans to authenticated;
```

Overenie (má vrátiť riadky, nie chybu):

```sql
begin; set local role anon; select count(*) from subscription_plans; rollback;
```

## 2. Zapisovacia politika sa vyhodnocuje aj pri čítaní

19 tabuliek má zapisovaciu politiku písanú ako `for all`. Tá platí aj na SELECT,
takže sa pri každom čítaní vyhodnotí druhýkrát popri čitacej politike — to je tých
25 upozornení `multiple_permissive_policies`. Rozdelenie na vklad/úpravu/mazanie ich
zruší; o nič sa nepríde, lebo zapisovacia podmienka je všade užšia než čitacia
(admin je vždy aj člen) alebo je s ňou totožná.

**Pozor:** je to 19 tabuliek naraz. Pred spustením si spravím odtlačok viditeľnosti
a po ňom ho porovnám (postup je nižšie).

```sql
do $$
declare
  w record;
  r record;
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
    -- Bez čitacej politiky by rozdelenie zobralo prístup k čítaniu.
    select policyname into r
    from pg_policies
    where schemaname = 'public' and tablename = w.tablename
      and cmd = 'SELECT' and permissive = 'PERMISSIVE'
    limit 1;
    if r is null then
      raise notice 'preskakujem %, nemá čitaciu politiku', w.tablename;
      continue;
    end if;

    -- `public` je kľúčové slovo, nie meno role.
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
```

Dve tabuľky (`legal_acceptances`, `platform_invoices`) majú namiesto `for all` dve
čitacie politiky. Spoja sa do jednej cez OR — obe platia pre tú istú rolu, takže
výsledok je riadok po riadku rovnaký:

```sql
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
```

### Odtlačok viditeľnosti (pred aj po)

Pod rolou `authenticated` s reálnym používateľom musia počty sedieť do posledného
riadku. Hodnoty z 2026-08-13 pred zmenou: api_keys 5, commander_vehicle_links 5,
company_invitations 0, invoice_items 202, legal_acceptances 178,
legal_document_versions 5, payments 7, platform_invoices 0, quote_items 3,
subscription_plans 4, tesla_connections 1, ostatné 0.

```sql
begin;
select set_config('request.jwt.claims', '{"sub":"<uuid používateľa>","role":"authenticated"}', true);
set local role authenticated;
select
 (select count(*) from api_keys) api_keys,
 (select count(*) from commander_vehicle_links) commander_vehicle_links,
 (select count(*) from invoice_items) invoice_items,
 (select count(*) from legal_acceptances) legal_acceptances,
 (select count(*) from legal_document_versions) legal_document_versions,
 (select count(*) from payments) payments,
 (select count(*) from quote_items) quote_items,
 (select count(*) from subscription_plans) subscription_plans,
 (select count(*) from tesla_connections) tesla_connections;
rollback;
```
