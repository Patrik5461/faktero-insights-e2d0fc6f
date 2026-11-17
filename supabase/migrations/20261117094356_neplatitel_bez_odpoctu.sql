-- Neplatiteľ DPH si daň z prijatého dokladu neodpočíta (Patrik 17. 11. 2026).
--
-- „Pri neplatiteľskej s.r.o. nesmie na bločku rozpisovať DPH, lebo mi ho
-- nedovolí zaúčtovať.“ Bločky a prijaté faktúry neplatiteľov (RHJ, Tobify,
-- Ticket sys…) mali `odpocet = true` (predvolená hodnota stĺpca) a kontrola
-- pred zaúčtovaním / exportom ich zastavila: „firma nie je platiteľ DPH
-- a DPH si odpočítať nemôže…“.
--
-- 1. `faktero_firma_neplatitel(company_id)` — to isté rozhodnutie ako
--    `jeNeplatitel` v aplikácii (uctovanie-agenda.ts): podľa `vat_scheme`;
--    firma bez schémy sa neplatiteľom nepovažuje (nič sa neblokuje).
-- 2. Spúšťač `*_x_neplatitel_bez_odpoctu` na `expense_documents` aj
--    `purchase_invoices`: nový doklad neplatiteľa (aj z appky, mailu, API,
--    importu, autopilota či pravidla účtovania) má vždy `odpocet = false`.
--    Meno je zvolené tak, aby bežal PO spúšťači pravidla (`*_pravidlo_uctovania`
--    smie nastaviť odpočet z pravidla) a PRED zámkom odovzdaného dokladu
--    (`*_zamok_odovzdania`) — BEFORE spúšťače idú podľa abecedy.
--    Doklad, ktorý odpočet už má a nemení ho (odovzdaný do Pohody, zamknuté
--    obdobie), sa nechá tak — inak by ho zámok nedovolil ani upraviť.
-- 3. Spúšťač zákonných sadzieb (`faktero_dph_zakonne_sadzby`) neplatiteľa
--    nezastaví — DPH mu do priznania nejde. Prenesenie (samozdanenie, ktoré
--    odvádza aj osoba podľa § 7 / § 7a) sa kontroluje ďalej.
-- 4. Oprava dát: neodovzdané a nezamknuté doklady neplatiteľov s odpočtom
--    dostanú `odpocet = false`. Odovzdané (`exported_at`) sa nemenia.

-- 1. Je firma neplatiteľ DPH? ------------------------------------------------

create or replace function public.faktero_firma_neplatitel(_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when nullif(btrim(coalesce(c.vat_scheme, '')), '') is null then false
      when c.vat_scheme in ('sk_4', 'sk_4b', 'sk_5', 'cz_platce', 'de_regel') then false
      when c.vat_scheme in ('sk_neplatitel', 'sk_7', 'sk_7a', 'cz_neplatce', 'cz_identifikovana', 'de_kleinunternehmer') then true
      -- Neznáma schéma: ako rezimFirmy — podľa zaškrtnutia, inak podľa IČ DPH.
      else coalesce(c.vat_payer, nullif(btrim(coalesce(c.ic_dph, '')), '') is not null) = false
    end
    from public.companies c
    where c.id = _company_id
  ), false);
$$;

revoke all on function public.faktero_firma_neplatitel(uuid) from public, anon;
grant execute on function public.faktero_firma_neplatitel(uuid) to authenticated, service_role;

-- 2. Prijatý doklad neplatiteľa bez odpočtu ----------------------------------

create or replace function public.faktero_neplatitel_bez_odpoctu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(new.odpocet, false) then
    return new;
  end if;
  -- Doklad, ktorý odpočet už má a nemení ho (odovzdaný, zamknuté obdobie), sa nechá.
  if tg_op = 'UPDATE' and coalesce(old.odpocet, false)
     and new.company_id is not distinct from old.company_id then
    return new;
  end if;
  if public.faktero_firma_neplatitel(new.company_id) then
    new.odpocet := false;
  end if;
  return new;
end;
$$;

drop trigger if exists expense_documents_x_neplatitel_bez_odpoctu on public.expense_documents;
create trigger expense_documents_x_neplatitel_bez_odpoctu
  before insert or update on public.expense_documents
  for each row execute function public.faktero_neplatitel_bez_odpoctu();

drop trigger if exists purchase_invoices_x_neplatitel_bez_odpoctu on public.purchase_invoices;
create trigger purchase_invoices_x_neplatitel_bez_odpoctu
  before insert or update on public.purchase_invoices
  for each row execute function public.faktero_neplatitel_bez_odpoctu();

-- 3. Zákonné sadzby nezastavia neplatiteľa -----------------------------------
-- Telo ako v 20261113081945_dph_zakonne_sadzby; pribudla len výnimka neplatiteľa.

create or replace function public.faktero_dph_zakonne_sadzby()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _krajina text;
  _chyba text;
begin
  if nullif(btrim(coalesce(new.doklado_id, '')), '') is not null and new.na_kontrolu_at is not null then
    return new;
  end if;
  if tg_table_name = 'purchase_invoices' then
    if coalesce(new.type, '') = 'proforma' or coalesce(new.status, '') = 'draft'
       or coalesce(new.samofakturacia, false) then
      return new;
    end if;
    -- Neplatiteľ DPH (bez prenesenia): DPH si neodpočíta, sadzby ho nezastavia (17. 11.).
    if not coalesce(new.reverse_charge, false) and coalesce(new.dph_rezim, '') <> 'samozdanenie'
       and public.faktero_firma_neplatitel(new.company_id) then
      return new;
    end if;
    if tg_op = 'UPDATE'
       and coalesce(old.type, '') <> 'proforma' and coalesce(old.status, '') <> 'draft'
       and not (nullif(btrim(coalesce(old.doklado_id, '')), '') is not null and old.na_kontrolu_at is not null)
       and new.amount_without_vat is not distinct from old.amount_without_vat
       and new.vat_amount is not distinct from old.vat_amount
       and new.amount_total is not distinct from old.amount_total
       and new.vat_breakdown is not distinct from old.vat_breakdown
       and new.delivery_date is not distinct from old.delivery_date
       and new.issue_date is not distinct from old.issue_date
       and new.currency is not distinct from old.currency
       and new.supplier_country is not distinct from old.supplier_country
       and new.supplier_ic_dph is not distinct from old.supplier_ic_dph then
      return new;
    end if;
    select public.faktero_krajina_dane(c.country) into _krajina
      from public.companies c where c.id = new.company_id;
    _chyba := public.faktero_chyba_dph(
      new.vat_breakdown, new.amount_without_vat, new.vat_amount,
      coalesce(_krajina, 'SK'), coalesce(new.delivery_date, new.issue_date),
      public.faktero_krajina_dodavatela(new.supplier_country, new.supplier_ic_dph));
    if _chyba is not null then
      raise exception using
        errcode = 'P0001',
        message = 'FAKTERO_DPH: Faktúru ' || coalesce(nullif(new.invoice_number, ''), 'bez čísla')
                  || ' nemožno uložiť — ' || _chyba;
    end if;
  else
    -- Neplatiteľ DPH: bloček nesie DPH dodávateľa, odpočet nie je — sadzby ho nezastavia (17. 11.).
    if public.faktero_firma_neplatitel(new.company_id) then
      return new;
    end if;
    if tg_op = 'UPDATE'
       and not (nullif(btrim(coalesce(old.doklado_id, '')), '') is not null and old.na_kontrolu_at is not null)
       and new.net_amount is not distinct from old.net_amount
       and new.vat_amount is not distinct from old.vat_amount
       and new.total_amount is not distinct from old.total_amount
       and new.vat_breakdown is not distinct from old.vat_breakdown
       and new.issue_date is not distinct from old.issue_date
       and new.supplier_country is not distinct from old.supplier_country
       and new.supplier_ic_dph is not distinct from old.supplier_ic_dph then
      return new;
    end if;
    select public.faktero_krajina_dane(c.country) into _krajina
      from public.companies c where c.id = new.company_id;
    _chyba := public.faktero_chyba_dph(
      new.vat_breakdown, new.net_amount, new.vat_amount,
      coalesce(_krajina, 'SK'), new.issue_date,
      public.faktero_krajina_dodavatela(new.supplier_country, new.supplier_ic_dph));
    if _chyba is not null then
      raise exception using
        errcode = 'P0001',
        message = 'FAKTERO_DPH: Bloček ' || coalesce(nullif(new.document_number, ''), 'bez čísla')
                  || ' nemožno uložiť — ' || _chyba;
    end if;
  end if;
  return new;
end
$$;

-- 4. Oprava dát: neodovzdané a nezamknuté doklady neplatiteľov bez odpočtu ---
-- (stav 17. 11.: bločky RHJ 3, Tobify 1, Ticket sys 1; prijaté RHJ 2)

update public.expense_documents e
   set odpocet = false
  from public.companies c
 where c.id = e.company_id
   and e.odpocet
   and public.faktero_firma_neplatitel(e.company_id)
   and e.exported_at is null
   and e.locked_at is null
   and not (
     c.locked_until is not null
     and public.zamok_obdobia_v_uctovnictve('expense_documents', to_jsonb(e))
     and coalesce(public.zamok_obdobia_den('expense_documents', to_jsonb(e)) <= c.locked_until, false)
   );

update public.purchase_invoices p
   set odpocet = false
  from public.companies c
 where c.id = p.company_id
   and p.odpocet
   and public.faktero_firma_neplatitel(p.company_id)
   and p.exported_at is null
   and p.locked_at is null
   and p.deleted_at is null
   and not (
     c.locked_until is not null
     and public.zamok_obdobia_v_uctovnictve('purchase_invoices', to_jsonb(p))
     and coalesce(public.zamok_obdobia_den('purchase_invoices', to_jsonb(p)) <= c.locked_until, false)
   );
