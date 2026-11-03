/*
  Viac hotovostných pokladní (Patrik 2026-11-03: „Pridaj možnosť pridať si
  viac hotovostných pokladní.“).

  Doteraz mala firma jednu pokladňu bez záznamu — stav sa skladal
  z `cash_entries` a dokladov platených hotovosťou. Teraz je pokladňa riadok
  v `pokladne` (názov, mena, skratka pre Pohodu, predvolená, archivovaná)
  a pokladničné doklady aj doklady platené hotovosťou nesú `pokladna_id`.

  - Práve jedna predvolená na firmu (čiastočný unikátny index + spúšťač,
    ktorý pri voľbe novej predvolenej zruší starú).
  - Doklad v hotovosti bez pokladne dostane predvolenú sám (spúšťač
    `pokladna_dokladu`) — doklady vznikajú na mnohých miestach (appka, API,
    import, mail), netreba meniť všetky. Firma bez pokladne ju pri prvom
    hotovostnom doklade dostane založenú.
  - Mazať sa dá len prázdna pokladňa (cudzí kľúč bez kaskády); predvolená
    sa nedá zmazať ani archivovať.

  Dáta: každá firma s hotovostnými pohybmi dostane jednu predvolenú
  „Pokladňa“ (mena podľa krajiny firmy, skratka z `companies.pohoda_pokladna`)
  a jej existujúce riadky sa na ňu napoja. Nič sa nemaže. Idempotentné.
*/

create table if not exists public.pokladne (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nazov text not null check (length(btrim(nazov)) between 1 and 80),
  -- Bez predvolenej hodnoty — spúšťač doplní domácu menu firmy (CZ → CZK).
  mena text not null check (mena ~ '^[A-Z]{3}$'),
  -- Skratka pokladne v Pohode (`vch:cashAccount/typ:ids`, max. 19 znakov).
  kod_pohoda text check (kod_pohoda is null or length(kod_pohoda) <= 19),
  predvolena boolean not null default false,
  aktivna boolean not null default true,
  poradie integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pokladne_predvolena_aktivna check (not predvolena or aktivna)
);

comment on table public.pokladne is
  'Hotovostné pokladne firmy. Práve jedna predvolená; doklad v hotovosti bez pokladne dostane predvolenú.';

grant select, insert, update, delete on public.pokladne to authenticated;
grant all on public.pokladne to service_role;

create unique index if not exists pokladne_jedna_predvolena
  on public.pokladne (company_id) where predvolena;
create unique index if not exists pokladne_nazov_firmy
  on public.pokladne (company_id, lower(btrim(nazov)));

drop trigger if exists pokladne_set_updated_at on public.pokladne;
create trigger pokladne_set_updated_at
  before update on public.pokladne
  for each row execute function public.set_updated_at();

alter table public.pokladne enable row level security;

drop policy if exists "Members read pokladne" on public.pokladne;
create policy "Members read pokladne" on public.pokladne
  for select to authenticated using (public.is_company_member(company_id, (select auth.uid())));
drop policy if exists "Members insert pokladne" on public.pokladne;
create policy "Members insert pokladne" on public.pokladne
  for insert to authenticated with check (public.is_company_member(company_id, (select auth.uid())));
drop policy if exists "Members update pokladne" on public.pokladne;
create policy "Members update pokladne" on public.pokladne
  for update to authenticated
  using (public.is_company_member(company_id, (select auth.uid())))
  with check (public.is_company_member(company_id, (select auth.uid())));
drop policy if exists "Members delete pokladne" on public.pokladne;
create policy "Members delete pokladne" on public.pokladne
  for delete to authenticated using (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists "mfa ak je zapnute" on public.pokladne;
create policy "mfa ak je zapnute" on public.pokladne as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Vlastný prístup: pokladne patria do oblasti „pokladna“ ako cash_entries.
select public.vlastny_pristup_politiky_na('pokladne', 'company_id', 'pokladna');

/*
  Domáca mena, jedna predvolená, predvolená sa nedá archivovať ani zrušiť
  inak než výberom inej.
*/
create or replace function public.pokladne_pravidla()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _krajina text;
begin
  if tg_op = 'DELETE' then
    -- Pri mazaní celej firmy (kaskáda) už firma neexistuje — vtedy smie ísť všetko.
    if old.predvolena
       and exists (select 1 from public.companies where id = old.company_id)
       and exists (select 1 from public.pokladne where company_id = old.company_id and id <> old.id) then
      raise exception 'Predvolenú pokladňu nemožno zmazať — najprv nastavte za predvolenú inú.'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  new.nazov := btrim(new.nazov);
  new.kod_pohoda := nullif(btrim(coalesce(new.kod_pohoda, '')), '');
  if new.mena is null or btrim(new.mena) = '' then
    select upper(btrim(coalesce(country, ''))) into _krajina from public.companies where id = new.company_id;
    new.mena := case when coalesce(_krajina, '') ~ '^(CZ|CZE|ČESK|CESK|CZECH)' then 'CZK' else 'EUR' end;
  end if;
  new.mena := upper(btrim(new.mena));

  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'Pokladňu nemožno presunúť do inej firmy.' using errcode = 'P0001';
  end if;

  -- Prvá pokladňa firmy je predvolená vždy.
  if tg_op = 'INSERT' and not new.predvolena
     and not exists (select 1 from public.pokladne where company_id = new.company_id and predvolena) then
    new.predvolena := true;
  end if;

  if new.predvolena and not new.aktivna then
    raise exception 'Predvolenú pokladňu nemožno archivovať — najprv nastavte za predvolenú inú.'
      using errcode = 'P0001';
  end if;

  if new.predvolena and (tg_op = 'INSERT' or not old.predvolena) then
    -- Vnorená úprava (pg_trigger_depth > 1) zruší starú predvolenú.
    update public.pokladne set predvolena = false
     where company_id = new.company_id and predvolena and id <> new.id;
  elsif tg_op = 'UPDATE' and old.predvolena and not new.predvolena and pg_trigger_depth() <= 1 then
    raise exception 'Firma musí mať predvolenú pokladňu — nastavte za predvolenú inú.'
      using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function public.pokladne_pravidla() from public, anon, authenticated;

drop trigger if exists pokladne_pravidla on public.pokladne;
create trigger pokladne_pravidla
  before insert or update or delete on public.pokladne
  for each row execute function public.pokladne_pravidla();

/*
  Predvolená pokladňa firmy; keď žiadna nie je, založí sa „Pokladňa“
  (mena podľa krajiny, skratka z doterajšieho nastavenia Pohody).
  Volá ju len spúšťač — nie je volateľná zvonku.
*/
create or replace function public.predvolena_pokladna(_firma uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  select id into _id from public.pokladne where company_id = _firma and predvolena limit 1;
  if _id is not null then
    return _id;
  end if;
  -- Pokladne sú, ale žiadna predvolená (nemalo by nastať) — vezmi prvú aktívnu.
  select id into _id from public.pokladne
   where company_id = _firma and aktivna order by poradie, created_at limit 1;
  if _id is not null then
    update public.pokladne set predvolena = true where id = _id;
    return _id;
  end if;
  insert into public.pokladne (company_id, nazov, kod_pohoda, predvolena)
  select c.id, 'Pokladňa', nullif(btrim(coalesce(c.pohoda_pokladna, '')), ''), true
    from public.companies c where c.id = _firma
  on conflict do nothing
  returning id into _id;
  if _id is null then
    select id into _id from public.pokladne where company_id = _firma and predvolena limit 1;
  end if;
  return _id;
end
$$;
revoke all on function public.predvolena_pokladna(uuid) from public, anon, authenticated;
grant execute on function public.predvolena_pokladna(uuid) to service_role;

/*
  Pokladňa dokladu: musí patriť tej istej firme; doklad platený hotovosťou
  bez pokladne dostane predvolenú. Argumenty: stĺpec spôsobu úhrady
  ('' = každý riadok ide cez pokladňu, cash_entries) a hodnoty, ktoré
  znamenajú hotovosť. Bloček/prijatá z vyúčtovania výdavkov zaplatil
  zamestnanec — firemnej pokladne sa netýka, predvolená sa mu nedáva.
*/
create or replace function public.pokladna_dokladu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _nove jsonb := to_jsonb(new);
  _stlpec text := coalesce(tg_argv[0], '');
  _hotovost boolean;
begin
  if new.pokladna_id is not null then
    if tg_op = 'INSERT' or new.pokladna_id is distinct from old.pokladna_id
       or new.company_id is distinct from old.company_id then
      if not exists (select 1 from public.pokladne
                      where id = new.pokladna_id and company_id = new.company_id) then
        raise exception 'Pokladňa nepatrí k tejto firme.' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  _hotovost := _stlpec = ''
    or coalesce(_nove ->> _stlpec, '') = any (tg_argv[1:array_length(tg_argv, 1)]);
  if _hotovost and (_nove ->> 'vyuctovanie_id') is null then
    new.pokladna_id := public.predvolena_pokladna(new.company_id);
  end if;
  return new;
end
$$;
revoke all on function public.pokladna_dokladu() from public, anon, authenticated;

-- Stĺpce na dokladoch.
alter table public.cash_entries
  add column if not exists pokladna_id uuid references public.pokladne(id);
alter table public.expense_documents
  add column if not exists pokladna_id uuid references public.pokladne(id);
alter table public.purchase_invoices
  add column if not exists pokladna_id uuid references public.pokladne(id);
alter table public.invoices
  add column if not exists pokladna_id uuid references public.pokladne(id);

comment on column public.cash_entries.pokladna_id is 'Pokladňa, do ktorej pohyb patrí (sumy v jej mene).';
comment on column public.expense_documents.pokladna_id is 'Pokladňa, z ktorej sa platilo — len pri payment_method = hotovost.';
comment on column public.purchase_invoices.pokladna_id is 'Pokladňa, z ktorej sa platilo — len pri payment_method = hotovost.';
comment on column public.invoices.pokladna_id is 'Pokladňa, do ktorej sa prijala úhrada — len pri payment_method = cash.';

create index if not exists cash_entries_pokladna_idx on public.cash_entries (pokladna_id);
create index if not exists expense_documents_pokladna_idx on public.expense_documents (pokladna_id) where pokladna_id is not null;
create index if not exists purchase_invoices_pokladna_idx on public.purchase_invoices (pokladna_id) where pokladna_id is not null;
create index if not exists invoices_pokladna_idx on public.invoices (pokladna_id) where pokladna_id is not null;

-- PDF faktúry pokladňu netlačí — jej doplnenie nemá PDF zahodiť.
create or replace function public.faktero_invalidate_invoice_pdf()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if (to_jsonb(new) - 'pdf_url' - 'pdf_source_hash' - 'updated_at' - 'stav_id' - 'komentar' - 'stitky' - 'pokladna_id')
     is distinct from
     (to_jsonb(old) - 'pdf_url' - 'pdf_source_hash' - 'updated_at' - 'stav_id' - 'komentar' - 'stitky' - 'pokladna_id')
  then
    new.pdf_url := null;
    new.pdf_source_hash := null;
  end if;
  return new;
end
$function$;

-- Dáta: predvolená pokladňa pre firmy s hotovostnými pohybmi.
insert into public.pokladne (company_id, nazov, mena, kod_pohoda, predvolena, poradie)
select c.id,
       'Pokladňa',
       case when upper(btrim(coalesce(c.country, ''))) ~ '^(CZ|CZE|ČESK|CESK|CZECH)' then 'CZK' else 'EUR' end,
       nullif(btrim(coalesce(c.pohoda_pokladna, '')), ''),
       true,
       0
  from public.companies c
 where not exists (select 1 from public.pokladne p where p.company_id = c.id)
   and (
        exists (select 1 from public.cash_entries e where e.company_id = c.id)
     or exists (select 1 from public.expense_documents e
                 where e.company_id = c.id and e.payment_method = 'hotovost' and e.vyuctovanie_id is null)
     or exists (select 1 from public.purchase_invoices e
                 where e.company_id = c.id and e.payment_method = 'hotovost' and e.vyuctovanie_id is null)
     or exists (select 1 from public.invoices e where e.company_id = c.id and e.payment_method = 'cash')
   );

update public.cash_entries e set pokladna_id = p.id
  from public.pokladne p
 where p.company_id = e.company_id and p.predvolena and e.pokladna_id is null;

update public.expense_documents e set pokladna_id = p.id
  from public.pokladne p
 where p.company_id = e.company_id and p.predvolena and e.pokladna_id is null
   and e.payment_method = 'hotovost' and e.vyuctovanie_id is null;

update public.purchase_invoices e set pokladna_id = p.id
  from public.pokladne p
 where p.company_id = e.company_id and p.predvolena and e.pokladna_id is null
   and e.payment_method = 'hotovost' and e.vyuctovanie_id is null;

update public.invoices e set pokladna_id = p.id
  from public.pokladne p
 where p.company_id = e.company_id and p.predvolena and e.pokladna_id is null
   and e.payment_method = 'cash';

-- Spúšťače až po doplnení dát.
drop trigger if exists cash_entries_pokladna on public.cash_entries;
create trigger cash_entries_pokladna
  before insert or update of pokladna_id, company_id on public.cash_entries
  for each row execute function public.pokladna_dokladu('');

drop trigger if exists expense_documents_pokladna on public.expense_documents;
create trigger expense_documents_pokladna
  before insert or update of pokladna_id, payment_method, company_id on public.expense_documents
  for each row execute function public.pokladna_dokladu('payment_method', 'hotovost');

drop trigger if exists purchase_invoices_pokladna on public.purchase_invoices;
create trigger purchase_invoices_pokladna
  before insert or update of pokladna_id, payment_method, company_id on public.purchase_invoices
  for each row execute function public.pokladna_dokladu('payment_method', 'hotovost');

drop trigger if exists invoices_pokladna on public.invoices;
create trigger invoices_pokladna
  before insert or update of pokladna_id, payment_method, company_id on public.invoices
  for each row execute function public.pokladna_dokladu('payment_method', 'cash');
