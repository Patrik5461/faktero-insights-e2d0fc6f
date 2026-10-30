-- Bezpečnostná kontrola 29. 10. 2026 (N1, N2, N4, N5).

-- N1: stav bankového pripojenia v Správe firiem len pre majiteľa a admina —
-- rovnako ako RLS na bank_connections (is_company_admin). Ostatné časti bez zmeny.
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
           -- Pripojenia bánk (bank_connections) vidí podľa RLS len majiteľ a admin.
           (f.company_id = any(public.firmy_s_pravom('banka', false))
             and public.is_company_admin(f.company_id, auth.uid())) as banka
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
  -- Len firmy, kde je volajúci správca (pravo.banka) — inak by tu prezradil
  -- stav pripojenia, ktorý mu RLS na bank_connections nedá.
  ucty as (
    select c.company_id, upper(replace(c.iban, ' ', '')) as iban,
           false as napojeny, false as problem, false as suhlas
    from public.company_bank_accounts c
    where c.company_id in (select company_id from pravo where banka) and coalesce(c.iban, '') <> ''
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
    where a.company_id in (select company_id from pravo where banka)
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

-- N2: odkaz na riadok inej tabuľky musí ukazovať do tej istej firmy.
-- Cudzí kľúč overí len existenciu; cez REST sa dalo nastaviť id cudzej firmy.
-- Kontroluje sa len pri zmene odkazu alebo firmy — staršie riadky (všetky
-- k 29. 10. sedia) a úpravy iných stĺpcov sa netýka. Server píše vždy v rámci
-- jednej firmy, preto platí aj pre service_role.
create or replace function public.odkaz_tej_istej_firmy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _stlpec text := tg_argv[0];
  _tabulka text := tg_argv[1];
  _id uuid := nullif(to_jsonb(new) ->> tg_argv[0], '')::uuid;
  _ok boolean;
begin
  if _id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and _id is not distinct from nullif(to_jsonb(old) ->> _stlpec, '')::uuid
     and new.company_id is not distinct from old.company_id then
    return new;
  end if;
  execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2)', _tabulka)
    into _ok using _id, new.company_id;
  if not _ok then
    raise exception 'Odkazovaný záznam (%) patrí inej firme.', _stlpec using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function public.odkaz_tej_istej_firmy() from public, anon, authenticated;

drop trigger if exists efaktura_received_nespracovany_firma on public.efaktura_received_documents;
create trigger efaktura_received_nespracovany_firma
  before insert or update of nespracovany_id, company_id on public.efaktura_received_documents
  for each row execute function public.odkaz_tej_istej_firmy('nespracovany_id', 'nespracovane_doklady');

drop trigger if exists efaktura_received_prijata_firma on public.efaktura_received_documents;
create trigger efaktura_received_prijata_firma
  before insert or update of matched_supplier_invoice_id, company_id on public.efaktura_received_documents
  for each row execute function public.odkaz_tej_istej_firmy('matched_supplier_invoice_id', 'purchase_invoices');

drop trigger if exists efaktura_profiles_prijem_stav_firma on public.efaktura_profiles;
create trigger efaktura_profiles_prijem_stav_firma
  before insert or update of prijem_stav_id, company_id on public.efaktura_profiles
  for each row execute function public.odkaz_tej_istej_firmy('prijem_stav_id', 'stavy_dokladov');

drop trigger if exists purchase_invoices_zaloha_firma on public.purchase_invoices;
create trigger purchase_invoices_zaloha_firma
  before insert or update of advance_invoice_id, company_id on public.purchase_invoices
  for each row execute function public.odkaz_tej_istej_firmy('advance_invoice_id', 'purchase_invoices');

-- Suma na úhradu odpočíta len zálohovú tej istej firmy (SECURITY DEFINER obíde RLS).
create or replace function public.prijata_suma_na_uhradu(_id uuid)
 returns numeric
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  _celkom numeric;
  _firma uuid;
  _zaloha_id uuid;
  _na_doklade numeric := 0;
  _zaloha numeric := 0;
begin
  select abs(coalesce(amount_total, 0)), company_id, advance_invoice_id, abs(coalesce(advance_amount, 0))
    into _celkom, _firma, _zaloha_id, _na_doklade
    from public.purchase_invoices where id = _id;
  if _celkom is null then return 0; end if;
  if coalesce(_na_doklade, 0) > 0 then
    return greatest(_celkom - _na_doklade, 0);
  end if;
  if _zaloha_id is not null then
    select abs(coalesce(amount_total, 0)) into _zaloha
      from public.purchase_invoices
     where id = _zaloha_id and company_id = _firma and status = 'paid' and deleted_at is null;
  end if;
  return greatest(_celkom - coalesce(_zaloha, 0), 0);
end $function$;
revoke all on function public.prijata_suma_na_uhradu(uuid) from public, anon, authenticated;

-- N4: automaticky zaradená prijatá eFaktúra čaká na kontrolu človekom.
-- Kým je `na_kontrolu_at` vyplnené, hromadný príkaz na úhradu ju vynechá;
-- vymaže sa otvorením detailu faktúry.
alter table public.purchase_invoices
  add column if not exists na_kontrolu_at timestamptz;
comment on column public.purchase_invoices.na_kontrolu_at is
  'Kedy sa doklad zaradil bez človeka (automatické zaevidovanie eFaktúry). Kým nie je null, nejde do hromadného príkazu na úhradu; vymaže ho otvorenie detailu.';

-- N5: stropy bota v Telegrame v databáze (prežijú reštart, platia pre všetky procesy).
create table if not exists public.telegram_strop (
  id bigint generated always as identity primary key,
  chat_id bigint not null,
  druh text not null,
  created_at timestamptz not null default now()
);
create index if not exists telegram_strop_druh_chat_idx
  on public.telegram_strop (druh, chat_id, created_at);
alter table public.telegram_strop enable row level security;
-- Bez politík: siaha naň len service_role (webhook bota).
revoke all on public.telegram_strop from public, anon, authenticated;
grant select, insert, delete on public.telegram_strop to service_role;

-- Atomicky: zámok na (druh, chat), počet v okne, zápis. `true` = smie prejsť.
create or replace function public.telegram_pusti(
  _chat_id bigint,
  _druh text,
  _max integer,
  _okno_sekund integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _pocet integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('telegram_strop:' || _druh || ':' || _chat_id::text, 0));
  select count(*) into _pocet
    from public.telegram_strop
   where druh = _druh and chat_id = _chat_id
     and created_at > now() - make_interval(secs => _okno_sekund);
  if _pocet >= _max then
    return false;
  end if;
  insert into public.telegram_strop (chat_id, druh) values (_chat_id, _druh);
  -- Občas upratať — najdlhšie okno je hodina.
  if random() < 0.01 then
    delete from public.telegram_strop where created_at < now() - interval '1 day';
  end if;
  return true;
end
$$;
revoke all on function public.telegram_pusti(bigint, text, integer, integer) from public, anon, authenticated;
grant execute on function public.telegram_pusti(bigint, text, integer, integer) to service_role;
