/*
 * Uzamknutie období (v POHODE uzávierka).
 *
 * Po podaní priznania sa doklad z toho obdobia nesmie zmeniť. Bez zámku sa dá
 * v septembri opraviť augustová faktúra, DPH prehľad sa prepočíta a na
 * daňovom úrade ostane iné číslo — bez akéhokoľvek upozornenia.
 */
alter table public.companies add column locked_until date;

comment on column public.companies.locked_until is
  'Doklady s dátumom do tohto dňa vrátane sa už nedajú meniť. Mení ho len admin firmy.';

/*
 * Strážca uzamknutého obdobia.
 *
 * Prvý argument triggera je názov stĺpca s dátumom dokladu, ďalšie sú stĺpce,
 * ktorých zmena je v uzavretom období zakázaná. Všetko ostatné prejde — úhrada,
 * odoslanie, poznámka či priradenie zákazky sa dejú až po uzávierke a blokovať
 * ich by znamenalo, že staršiu faktúru nemožno ani označiť za zaplatenú.
 *
 * NEW sa pri DELETE nesmie čítať (nie je priradené), preto vetvenie cez IF
 * a nie cez CASE — CASE je SQL výraz a vyhodnotil by oba konce.
 */
create or replace function public.guard_locked_period()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  novy jsonb := null;
  stary jsonb := null;
  zamok date;
  d_novy date;
  d_stary date;
  i int;
  zmena boolean := false;
begin
  if tg_op <> 'DELETE' then novy := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then stary := to_jsonb(old); end if;

  select c.locked_until into zamok
    from public.companies c
   where c.id = (coalesce(novy, stary) ->> 'company_id')::uuid;

  if zamok is not null then
    d_novy := nullif(novy ->> tg_argv[0], '')::date;
    d_stary := nullif(stary ->> tg_argv[0], '')::date;

    -- Chránený je aj presun dokladu DO uzavretého obdobia, nielen zmena
    -- dokladu, ktorý v ňom už je.
    if coalesce(d_novy <= zamok, false) or coalesce(d_stary <= zamok, false) then
      if tg_op = 'UPDATE' then
        for i in 1 .. array_length(tg_argv, 1) - 1 loop
          if (novy -> tg_argv[i]) is distinct from (stary -> tg_argv[i]) then
            zmena := true;
            exit;
          end if;
        end loop;
      else
        zmena := true;
      end if;

      if zmena then
        raise exception
          'Obdobie je uzamknuté do %. Doklad z uzavretého obdobia sa už nedá meniť ani mazať.',
          to_char(zamok, 'DD.MM.YYYY');
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

revoke all on function public.guard_locked_period() from public, anon, authenticated;

-- Vydané faktúry. `deleted_at` je medzi chránenými zámerne: mazanie je u nás
-- mäkké a bez toho by sa dala faktúra z priznania odstrániť „vymazaním".
create trigger invoices_locked_period
  before insert or update or delete on public.invoices
  for each row execute function public.guard_locked_period(
    'issue_date',
    'issue_date','delivery_date','due_date','invoice_number','type','currency',
    'customer_id','customer_name','customer_ico','customer_dic','customer_ic_dph',
    'subtotal','vat_total','total','reverse_charge','reverse_charge_type',
    'advance_invoice_id','advance_amount','deleted_at');

-- Prijaté faktúry. DPH prehľad ich číta rovnako podľa `issue_date`.
create trigger purchase_invoices_locked_period
  before insert or update or delete on public.purchase_invoices
  for each row execute function public.guard_locked_period(
    'issue_date',
    'issue_date','received_date','due_date','invoice_number','supplier_name',
    'supplier_ico','supplier_dic','supplier_ic_dph',
    'amount_without_vat','vat_amount','amount_total','currency','deleted_at');

-- Kniha jázd je daňový záznam rovnako ako faktúra; meniť sa smie už len
-- poznámka a priradenie zákazky.
create trigger trips_locked_period
  before insert or update or delete on public.trips
  for each row execute function public.guard_locked_period(
    'trip_date',
    'trip_date','vehicle_id','driver_name','start_location','end_location','purpose',
    'start_odometer','end_odometer','distance_km','fuel_price','fuel_consumption');

/*
 * Položky faktúry nemajú vlastný dátum ani firmu, tak sa dátum berie
 * z faktúry. V uzavretom období sa nesmú meniť vôbec — každá zmena položky
 * mení základ dane.
 */
create or replace function public.guard_locked_period_invoice_items()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  faktura uuid;
  zamok date;
  d date;
begin
  if tg_op = 'DELETE' then faktura := old.invoice_id; else faktura := new.invoice_id; end if;

  select c.locked_until, i.issue_date into zamok, d
    from public.invoices i
    join public.companies c on c.id = i.company_id
   where i.id = faktura;

  if zamok is not null and d is not null and d <= zamok then
    raise exception
      'Obdobie je uzamknuté do %. Položky faktúry z uzavretého obdobia sa už nedajú meniť.',
      to_char(zamok, 'DD.MM.YYYY');
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

revoke all on function public.guard_locked_period_invoice_items() from public, anon, authenticated;

create trigger invoice_items_locked_period
  before insert or update or delete on public.invoice_items
  for each row execute function public.guard_locked_period_invoice_items();
