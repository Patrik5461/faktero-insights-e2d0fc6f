/*
  Pravidlá na automatické účtovanie prijatých dokladov.

  „Doklad od Slovnaftu dostane vždy predkontáciu PHM a kategóriu Palivo." Kým to
  nebolo, predkontácia bola jedna pre všetky prijaté doklady (nastavenie firmy)
  a všetko ostatné dopĺňal účtovník ku každému dokladu ručne.

  Pravidlo dopĺňa databáza sama (spúšťač), nie obrazovka: doklady vznikajú na
  šiestich miestach — sken na webe aj v appke, e-mail, import, API, AI — a
  pravidlo, ktoré by jedno z nich vynechalo, by sa nedalo brať vážne. Dopĺňa sa
  len to, čo je prázdne; čo človek vyplnil sám, pravidlo neprepíše.
*/
create table public.pravidla_uctovania (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nazov text not null,
  poradie integer not null default 100,
  aktivne boolean not null default true,
  -- Podmienky (prázdna = nezáleží; všetky vyplnené musia sedieť naraz).
  dodavatel_ico text,
  dodavatel_text text,
  sposob_uhrady text,
  -- Čo pravidlo doplní.
  kategoria text,
  predkontacia text,
  clenenie_dph text,
  odpocet boolean,
  poznamka text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pravidla_uctovania_podmienka check (
    coalesce(nullif(btrim(dodavatel_ico), ''), nullif(btrim(dodavatel_text), ''), nullif(btrim(sposob_uhrady), '')) is not null
  ),
  constraint pravidla_uctovania_akcia check (
    coalesce(nullif(btrim(kategoria), ''), nullif(btrim(predkontacia), ''), nullif(btrim(clenenie_dph), ''), nullif(btrim(poznamka), '')) is not null
    or odpocet is not null
  )
);

create index pravidla_uctovania_firma_idx on public.pravidla_uctovania (company_id, poradie);

alter table public.pravidla_uctovania enable row level security;

create policy "clenovia citaju pravidla" on public.pravidla_uctovania
  for select to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia zakladaju pravidla" on public.pravidla_uctovania
  for insert to authenticated
  with check (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia upravuju pravidla" on public.pravidla_uctovania
  for update to authenticated
  using (public.is_company_member(company_id, (select auth.uid())))
  with check (public.is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu pravidla" on public.pravidla_uctovania
  for delete to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));

-- Dvojfaktor: nová tabuľka reštriktívnu politiku sama nedostane.
create policy "mfa ak je zapnute" on public.pravidla_uctovania
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Vlastný prístup: pravidlá patria k prijatým dokladom.
select public.vlastny_pristup_politiky_na('pravidla_uctovania', 'company_id', 'doklady');

-- Bez GRANT vracia tabuľka „permission denied", hoci politiky sedia.
grant select, insert, update, delete on public.pravidla_uctovania to authenticated;
grant all on public.pravidla_uctovania to service_role;

-- Doklad si pamätá vlastnú predkontáciu a členenie (prebíjajú nastavenie firmy)
-- a pravidlo, ktoré ich doplnilo — aby sa dalo ukázať, odkiaľ sa hodnota vzala,
-- a aby sa pravidlo neuplatňovalo stále dokola.
alter table public.expense_documents
  add column if not exists pohoda_predkontacia text,
  add column if not exists pohoda_clenenie_dph text,
  add column if not exists pravidlo_id uuid references public.pravidla_uctovania(id) on delete set null;

/*
  Prvé pravidlo (podľa poradia), ktoré na doklad sedí. IČO sa porovnáva len na
  číslice, meno bez ohľadu na veľkosť písmen a diakritiku.
*/
create or replace function public.faktero_pravidlo_pre_doklad(
  _company uuid, _ico text, _meno text, _uhrada text
) returns public.pravidla_uctovania
language sql stable
set search_path = public
as $$
  select p.*
    from public.pravidla_uctovania p
   where p.company_id = _company
     and p.aktivne
     and (nullif(btrim(p.dodavatel_ico), '') is null
          or regexp_replace(coalesce(_ico, ''), '\D', '', 'g') = regexp_replace(p.dodavatel_ico, '\D', '', 'g'))
     and (nullif(btrim(p.dodavatel_text), '') is null
          or translate(lower(coalesce(_meno, '')), 'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz')
             like '%' || translate(lower(btrim(p.dodavatel_text)), 'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz') || '%')
     and (nullif(btrim(p.sposob_uhrady), '') is null or p.sposob_uhrady = _uhrada)
   order by p.poradie, p.created_at
   limit 1
$$;

-- Spúšťač beží s právami toho, kto doklad zapisuje — preto ho smie volať
-- prihlásený aj server. Pravidlá cudzej firmy cez RLS aj tak neuvidí.
revoke all on function public.faktero_pravidlo_pre_doklad(uuid, text, text, text) from public, anon;
grant execute on function public.faktero_pravidlo_pre_doklad(uuid, text, text, text) to authenticated, service_role;

create or replace function public.faktero_uplatni_pravidlo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p public.pravidla_uctovania;
begin
  -- Doklad odovzdaný do účtovníctva sa nemení; raz uplatnené pravidlo sa neopakuje.
  if new.pravidlo_id is not null or new.exported_at is not null then
    return new;
  end if;
  if coalesce(new.supplier_ico, '') = '' and coalesce(new.supplier_name, '') = '' then
    return new;
  end if;
  p := public.faktero_pravidlo_pre_doklad(new.company_id, new.supplier_ico, new.supplier_name, new.payment_method);
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
  -- Odpočet má predvolene `true`, takže „prázdny" nepoznáme — pravidlo rozhoduje.
  if p.odpocet is not null then
    new.odpocet := p.odpocet;
  end if;
  if coalesce(p.poznamka, '') <> '' and position(p.poznamka in coalesce(new.note, '')) = 0 then
    new.note := nullif(btrim(concat_ws(' ', nullif(new.note, ''), p.poznamka)), '');
  end if;
  return new;
end;
$$;

/*
  INSERT aj UPDATE: doklad zo skenu vzniká prázdny a dodávateľa doň AI dopíše
  až neskôr. Kým nejaké pravidlo nezabralo (`pravidlo_id` je prázdne), skúša sa
  pri každej zmene dodávateľa alebo spôsobu úhrady.
*/
create trigger expense_documents_pravidlo_uctovania
  before insert or update of supplier_ico, supplier_name, payment_method, pravidlo_id
  on public.expense_documents
  for each row execute function public.faktero_uplatni_pravidlo();

/*
  „Uplatniť na doklady, ktoré už sú" — neodovzdané doklady bez
  pravidla. Beží s právami volajúceho, takže RLS pustí len doklady jeho firmy.
*/
create or replace function public.uplatni_pravidla_uctovania(_company uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  -- Prázdna zmena `pravidlo_id` zobudí spúšťač; ten pravidlo vyhodnotí a zapíše.
  update public.expense_documents d
     set pravidlo_id = null
   where d.company_id = _company
     and d.pravidlo_id is null
     and d.exported_at is null
     and (public.faktero_pravidlo_pre_doklad(d.company_id, d.supplier_ico, d.supplier_name, d.payment_method)).id is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.uplatni_pravidla_uctovania(uuid) from public, anon;
revoke all on function public.faktero_uplatni_pravidlo() from public, anon;
grant execute on function public.uplatni_pravidla_uctovania(uuid) to authenticated, service_role;
