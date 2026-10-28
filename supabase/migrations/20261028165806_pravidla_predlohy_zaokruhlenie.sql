-- Pravidlá účtovania: nové podmienky (odosielateľ mailu, krajina dodávateľa,
-- stály VS) a výstupy (pokladňa, rozúčtovanie pomerom), predlohy zaúčtovania,
-- typ dokladu a platby pri predkontácii a zaokrúhlenie zvlášť pre kladné
-- a záporné.

-- 1. Pravidlá — nové stĺpce
alter table public.pravidla_uctovania
  add column if not exists odosielatel_text text,
  add column if not exists krajina text,
  add column if not exists variabilny_symbol text,
  add column if not exists pokladna text,
  add column if not exists rozuctovanie jsonb;

alter table public.pravidla_uctovania drop constraint if exists pravidla_uctovania_podmienka;
alter table public.pravidla_uctovania add constraint pravidla_uctovania_podmienka check (
  coalesce(nullif(btrim(dodavatel_ico), ''), nullif(btrim(dodavatel_text), ''), nullif(btrim(sposob_uhrady), ''),
           nullif(btrim(predmet_text), ''), pouzivatel_id::text, nullif(btrim(typ_dokladu), ''),
           nullif(btrim(bankovy_ucet), ''), smer, nullif(btrim(oznacenie), ''),
           nullif(btrim(odosielatel_text), ''), nullif(btrim(krajina), ''), nullif(btrim(variabilny_symbol), ''))
  is not null);

alter table public.pravidla_uctovania drop constraint if exists pravidla_uctovania_akcia;
alter table public.pravidla_uctovania add constraint pravidla_uctovania_akcia check (
  coalesce(nullif(btrim(kategoria), ''), nullif(btrim(predkontacia), ''), nullif(btrim(clenenie_dph), ''),
           nullif(btrim(poznamka), ''), nullif(btrim(kv_clenenie), ''), nullif(btrim(pokladna), ''),
           rozuctovanie::text) is not null
  or odpocet is not null);

alter table public.pravidla_uctovania drop constraint if exists pravidla_uctovania_krajina;
alter table public.pravidla_uctovania add constraint pravidla_uctovania_krajina
  check (krajina is null or krajina ~ '^[A-Z]{2}$');
-- Rozúčtovanie pravidla je pomer (rovnaký tvar ako `predkontacie.pomer`), nie sumy.
alter table public.pravidla_uctovania drop constraint if exists pravidla_uctovania_rozuctovanie;
alter table public.pravidla_uctovania add constraint pravidla_uctovania_rozuctovanie
  check (rozuctovanie is null or (jsonb_typeof(rozuctovanie) = 'object' and rozuctovanie ? 'typ'));

-- 2. Odosielateľ mailu pri doklade (predmet už doklad má)
alter table public.purchase_invoices add column if not exists odosielatel_mailu text;
alter table public.expense_documents add column if not exists odosielatel_mailu text;

/*
  Doklad z mailu si pri vzniku zapamätá odosielateľa a predmet — nech ho
  pravidlo spozná, nech vznikol kdekoľvek. Beží pred spúšťačom pravidiel
  (meno spúšťača je abecedne skôr).
*/
create or replace function public.faktero_mail_dokladu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _od text;
  _pr text;
begin
  if new.inbox_message_id is not null and (new.odosielatel_mailu is null or new.predmet_mailu is null) then
    select m.from_email, m.subject into _od, _pr
      from public.inbox_messages m
     where m.id = new.inbox_message_id and m.company_id = new.company_id;
    new.odosielatel_mailu := coalesce(new.odosielatel_mailu, nullif(lower(btrim(_od)), ''));
    new.predmet_mailu := coalesce(new.predmet_mailu, nullif(btrim(_pr), ''));
  end if;
  return new;
end;
$$;
revoke all on function public.faktero_mail_dokladu() from public, anon;

drop trigger if exists purchase_invoices_mail_dokladu on public.purchase_invoices;
create trigger purchase_invoices_mail_dokladu before insert on public.purchase_invoices
  for each row execute function public.faktero_mail_dokladu();
drop trigger if exists expense_documents_mail_dokladu on public.expense_documents;
create trigger expense_documents_mail_dokladu before insert on public.expense_documents
  for each row execute function public.faktero_mail_dokladu();

-- 3. Krajina dodávateľa: uvedená, inak z predpony IČ DPH; bez nich krajina firmy (vo funkcii pravidla).
create or replace function public.faktero_krajina_dokladu(_krajina text, _ic_dph text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(
    nullif(upper(btrim(_krajina)), ''),
    case when upper(btrim(coalesce(_ic_dph, ''))) ~ '^[A-Z]{2}[0-9A-Z]'
         then replace(substr(upper(btrim(_ic_dph)), 1, 2), 'EL', 'GR') end)
$$;
revoke all on function public.faktero_krajina_dokladu(text, text) from public, anon;
grant execute on function public.faktero_krajina_dokladu(text, text) to authenticated, service_role;

-- 4. Porovnanie pravidla s dokladom — 11 argumentov
create or replace function public.faktero_pravidlo_pre_doklad(
  _company uuid, _ico text, _meno text, _uhrada text, _pouzivatel uuid, _predmet text,
  _druh text, _typ text, _odosielatel text, _krajina text, _vs text)
returns public.pravidla_uctovania
language sql
stable
set search_path to 'public'
as $$
  select p.*
    from public.pravidla_uctovania p
   where p.company_id = _company
     and p.aktivne
     and coalesce(p.druh, '') <> 'banka'
     and (case when p.druh is null then _druh in ('blocek', 'prijata') else p.druh = _druh end)
     and (nullif(btrim(p.dodavatel_ico), '') is not null or nullif(btrim(p.dodavatel_text), '') is not null
          or nullif(btrim(p.sposob_uhrady), '') is not null or p.pouzivatel_id is not null
          or nullif(btrim(p.predmet_text), '') is not null or nullif(btrim(p.typ_dokladu), '') is not null
          or nullif(btrim(p.odosielatel_text), '') is not null or nullif(btrim(p.krajina), '') is not null
          or nullif(btrim(p.variabilny_symbol), '') is not null)
     and (nullif(btrim(p.typ_dokladu), '') is null or p.typ_dokladu = _typ)
     and (nullif(btrim(p.dodavatel_ico), '') is null
          or regexp_replace(coalesce(_ico, ''), '\D', '', 'g') = regexp_replace(p.dodavatel_ico, '\D', '', 'g'))
     and (nullif(btrim(p.dodavatel_text), '') is null
          or translate(lower(coalesce(_meno, '')), 'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz')
             like '%' || translate(lower(btrim(p.dodavatel_text)), 'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz') || '%')
     and (nullif(btrim(p.sposob_uhrady), '') is null or p.sposob_uhrady = _uhrada)
     and (p.pouzivatel_id is null or p.pouzivatel_id = _pouzivatel)
     and (nullif(btrim(p.predmet_text), '') is null
          or translate(lower(coalesce(_predmet, '')), 'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz')
             like '%' || translate(lower(btrim(p.predmet_text)), 'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz') || '%')
     and (nullif(btrim(p.odosielatel_text), '') is null
          or lower(coalesce(_odosielatel, '')) like '%' || lower(btrim(p.odosielatel_text)) || '%')
     and (nullif(btrim(p.krajina), '') is null
          or upper(p.krajina) = coalesce(nullif(upper(btrim(_krajina)), ''),
                                         (select upper(c.country) from public.companies c where c.id = _company)))
     and (nullif(btrim(p.variabilny_symbol), '') is null
          or (nullif(ltrim(regexp_replace(coalesce(_vs, ''), '\D', '', 'g'), '0'), '')
              = ltrim(regexp_replace(p.variabilny_symbol, '\D', '', 'g'), '0')))
   -- Pravidlo podľa partnera alebo stáleho VS má prednosť pred pravidlom podľa používateľa, predmetu či typu.
   order by (nullif(btrim(p.dodavatel_ico), '') is null and nullif(btrim(p.dodavatel_text), '') is null
             and nullif(btrim(p.variabilny_symbol), '') is null),
            p.poradie, p.created_at
   limit 1
$$;

-- Pôvodný 8-argumentový tvar volá nový (bez mailu, krajiny a VS).
create or replace function public.faktero_pravidlo_pre_doklad(
  _company uuid, _ico text, _meno text, _uhrada text, _pouzivatel uuid, _predmet text, _druh text, _typ text)
returns public.pravidla_uctovania
language sql
stable
set search_path to 'public'
as $$
  select * from public.faktero_pravidlo_pre_doklad(_company, _ico, _meno, _uhrada, _pouzivatel, _predmet,
    _druh, _typ, null::text, null::text, null::text)
$$;

revoke all on function public.faktero_pravidlo_pre_doklad(uuid, text, text, text, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.faktero_pravidlo_pre_doklad(uuid, text, text, text, uuid, text, text, text, text, text, text) to authenticated, service_role;

-- 5. Spúšťač pre bločky a prijaté faktúry
create or replace function public.faktero_uplatni_pravidlo()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  p public.pravidla_uctovania;
  pozn text;
begin
  -- Doklad odovzdaný do účtovníctva sa nemení; raz uplatnené pravidlo sa neopakuje.
  if new.pravidlo_id is not null or new.exported_at is not null then
    return new;
  end if;
  if tg_table_name = 'purchase_invoices' then
    p := public.faktero_pravidlo_pre_doklad(new.company_id, new.supplier_ico, new.supplier_name,
           new.payment_method, new.created_by, new.predmet_mailu, 'prijata',
           public.faktero_typ_prijatej(new.type, new.amount_total, new.opravuje_cislo),
           new.odosielatel_mailu, public.faktero_krajina_dokladu(new.supplier_country, new.supplier_ic_dph),
           new.variable_symbol);
  else
    p := public.faktero_pravidlo_pre_doklad(new.company_id, new.supplier_ico, new.supplier_name,
           new.payment_method, new.created_by, new.predmet_mailu, 'blocek', null,
           new.odosielatel_mailu, public.faktero_krajina_dokladu(null, new.supplier_ic_dph), null);
  end if;
  if p.id is null then
    return new;
  end if;
  new.pravidlo_id := p.id;
  if coalesce(new.category, '') = '' and coalesce(p.kategoria, '') <> '' then
    new.category := p.kategoria;
  end if;
  if coalesce(new.pohoda_predkontacia, '') = '' and coalesce(p.predkontacia, '') <> '' then
    new.pohoda_predkontacia := p.predkontacia;
  end if;
  if coalesce(new.pohoda_clenenie_dph, '') = '' and coalesce(p.clenenie_dph, '') <> '' then
    new.pohoda_clenenie_dph := p.clenenie_dph;
  end if;
  if coalesce(new.kv_clenenie, '') = '' and coalesce(p.kv_clenenie, '') <> '' then
    new.kv_clenenie := p.kv_clenenie;
  end if;
  -- Rozúčtovanie pomerom: sumy dopočíta export z rozpisu dokladu.
  if new.rozuctovanie is null and p.rozuctovanie is not null then
    new.rozuctovanie := p.rozuctovanie;
  end if;
  -- Pokladňa má zmysel len pri bločku (hotovostný ide do pokladne v Pohode).
  if tg_table_name = 'expense_documents' and coalesce(new.pohoda_pokladna, '') = ''
     and coalesce(p.pokladna, '') <> '' then
    new.pohoda_pokladna := p.pokladna;
  end if;
  -- Odpočet má predvolene `true`, takže „prázdny" nepoznáme — pravidlo rozhoduje.
  if p.odpocet is not null then
    new.odpocet := p.odpocet;
  end if;
  pozn := public.faktero_premenne_poznamky(p.poznamka, new.issue_date);
  if coalesce(pozn, '') <> '' and position(pozn in coalesce(new.note, '')) = 0 then
    new.note := nullif(btrim(concat_ws(' ', nullif(new.note, ''), pozn)), '');
  end if;
  return new;
end;
$$;

-- Spúšťač zobudí aj zmena VS, krajiny či IČ DPH (kým pravidlo doklad nemá).
drop trigger if exists purchase_invoices_pravidlo_uctovania on public.purchase_invoices;
create trigger purchase_invoices_pravidlo_uctovania
  before insert or update of supplier_ico, supplier_name, payment_method, pravidlo_id,
    variable_symbol, supplier_country, supplier_ic_dph
  on public.purchase_invoices for each row execute function public.faktero_uplatni_pravidlo();
drop trigger if exists expense_documents_pravidlo_uctovania on public.expense_documents;
create trigger expense_documents_pravidlo_uctovania
  before insert or update of supplier_ico, supplier_name, payment_method, pravidlo_id, supplier_ic_dph
  on public.expense_documents for each row execute function public.faktero_uplatni_pravidlo();

-- 6. Hromadné uplatnenie na existujúce doklady
create or replace function public.uplatni_pravidla_uctovania(_company uuid)
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  n integer;
  m integer;
  v integer;
begin
  -- Prázdna zmena `pravidlo_id` zobudí spúšťač; ten pravidlo vyhodnotí a zapíše.
  update public.expense_documents d
     set pravidlo_id = null
   where d.company_id = _company
     and d.pravidlo_id is null
     and d.exported_at is null
     and (public.faktero_pravidlo_pre_doklad(d.company_id, d.supplier_ico, d.supplier_name, d.payment_method,
            d.created_by, d.predmet_mailu, 'blocek', null, d.odosielatel_mailu,
            public.faktero_krajina_dokladu(null, d.supplier_ic_dph), null)).id is not null;
  get diagnostics n = row_count;
  update public.purchase_invoices p
     set pravidlo_id = null
   where p.company_id = _company
     and p.pravidlo_id is null
     and p.exported_at is null
     and p.deleted_at is null
     and (public.faktero_pravidlo_pre_doklad(p.company_id, p.supplier_ico, p.supplier_name, p.payment_method,
            p.created_by, p.predmet_mailu, 'prijata',
            public.faktero_typ_prijatej(p.type, p.amount_total, p.opravuje_cislo), p.odosielatel_mailu,
            public.faktero_krajina_dokladu(p.supplier_country, p.supplier_ic_dph), p.variable_symbol)).id is not null;
  get diagnostics m = row_count;
  update public.invoices i
     set pravidlo_id = null
   where i.company_id = _company
     and i.pravidlo_id is null
     and i.zauctovane_at is null
     and i.deleted_at is null
     and (public.faktero_pravidlo_pre_doklad(i.company_id, i.customer_ico, i.customer_name, null,
            i.created_by, null, 'vystavena', i.type::text)).id is not null;
  get diagnostics v = row_count;
  return n + m + v;
end;
$$;

-- 7. Predlohy zaúčtovania — pomenované šablóny bez podmienky, použijú sa ručne
create table if not exists public.predlohy_uctovania (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nazov text not null check (length(btrim(nazov)) between 1 and 120),
  -- null = bločky aj faktúry; inak len pre daný druh dokladu
  druh text check (druh is null or druh in ('blocek', 'prijata', 'vystavena')),
  predkontacia text,
  clenenie_dph text,
  kv_clenenie text,
  pokladna text,
  rad text,
  poznamka text check (poznamka is null or length(poznamka) <= 240),
  poradie integer not null default 100,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint predlohy_uctovania_nieco check (
    coalesce(nullif(btrim(predkontacia), ''), nullif(btrim(clenenie_dph), ''), nullif(btrim(kv_clenenie), ''),
             nullif(btrim(pokladna), ''), nullif(btrim(rad), ''), nullif(btrim(poznamka), '')) is not null)
);
create index if not exists predlohy_uctovania_company_idx on public.predlohy_uctovania (company_id, poradie);

alter table public.predlohy_uctovania enable row level security;
revoke all on public.predlohy_uctovania from public, anon;
grant select, insert, update, delete on public.predlohy_uctovania to authenticated;
grant all on public.predlohy_uctovania to service_role;

create policy "clenovia citaju predlohy" on public.predlohy_uctovania for select to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia zakladaju predlohy" on public.predlohy_uctovania for insert to authenticated
  with check (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia upravuju predlohy" on public.predlohy_uctovania for update to authenticated
  using (public.is_company_member(company_id, (select auth.uid())))
  with check (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu predlohy" on public.predlohy_uctovania for delete to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.predlohy_uctovania as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
select public.vlastny_pristup_politiky_na('predlohy_uctovania', 'company_id', 'doklady');

-- 8. Účtovné položky: typ dokladu a typ platby pri predkontácii
alter table public.predkontacie
  add column if not exists typ_dokladu text check (typ_dokladu is null or typ_dokladu in ('faktura', 'blocek')),
  add column if not exists typ_platby text check (typ_platby is null or typ_platby in ('hotovost', 'karta', 'prevod'));

-- 9. Zaokrúhlenie zvlášť pre kladné a záporné (staré pole ostáva spoločné predvolené)
alter table public.companies
  add column if not exists pohoda_predkontacia_zaokruhlenie_plus text,
  add column if not exists pohoda_predkontacia_zaokruhlenie_minus text,
  add column if not exists pohoda_clenenie_dph_zaokruhlenie_plus text,
  add column if not exists pohoda_clenenie_dph_zaokruhlenie_minus text,
  add column if not exists kv_clenenie_zaokruhlenie_plus text,
  add column if not exists kv_clenenie_zaokruhlenie_minus text;
