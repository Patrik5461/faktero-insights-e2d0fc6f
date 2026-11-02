-- Kto doklad nahral a kto ho zaúčtoval — a kedy (požiadavka účtovníčky 2026-11-02).
--
-- Čo už v databáze bolo:
--   created_by / created_at        — kto a kedy doklad zapísal (pri prenose z Nespracovaných
--                                     je created_by pôvodný nahrávajúci, created_at však čas Vytvoriť)
--   zauctovane_at / zauctoval      — PRVÉ zaúčtovanie (automat: zauctoval null + zauctovanie_zdroj)
--   spracoval / spracovane_at      — prijatá faktúra: kto klikol Vytvoriť v Nespracovaných
--   processed_by / processed_at    — bloček a ostatný doklad: kto ho spracoval
--   odosielatel_mailu              — prijatá faktúra a bloček z e-mailu (spúšťač faktero_mail_dokladu)
--
-- Doplnené:
--   nahrane_at                     — kedy bol doklad naozaj nahratý (pri prenose z Nespracovaných
--                                     čas nahratia nespracovaného dokladu, inak čas zápisu)
--   naposledy_zauctoval / _at      — POSLEDNÉ zaúčtovanie (aj zmena predkontácie, členenia…),
--                                     píše spúšťač z auth.uid() + now(), takže sedí aj z API a appky
--   other_documents.odosielatel_mailu — ostatný doklad z e-mailu
--
-- Nové stĺpce v existujúcich tabuľkách: politiky sú riadkové (firmy_s_pravom, mfa_ok)
-- a práva authenticated sú na celé tabuľky — nič z toho netreba meniť.
-- Staré doklady: nahrane_at ostáva null (UI vezme created_at), naposledy_* null (UI vezme
-- zauctovane_at / zauctoval). Migrácia je idempotentná.

alter table public.purchase_invoices add column if not exists nahrane_at timestamptz;
alter table public.expense_documents add column if not exists nahrane_at timestamptz;
alter table public.other_documents add column if not exists nahrane_at timestamptz;
-- Predvolená hodnota až po pridaní stĺpca — staré riadky nesmú dostať čas migrácie.
alter table public.purchase_invoices alter column nahrane_at set default now();
alter table public.expense_documents alter column nahrane_at set default now();
alter table public.other_documents alter column nahrane_at set default now();

alter table public.other_documents add column if not exists odosielatel_mailu text;

alter table public.purchase_invoices
  add column if not exists naposledy_zauctoval uuid references auth.users(id) on delete set null,
  add column if not exists naposledy_zauctovane_at timestamptz;
alter table public.expense_documents
  add column if not exists naposledy_zauctoval uuid references auth.users(id) on delete set null,
  add column if not exists naposledy_zauctovane_at timestamptz;
alter table public.invoices
  add column if not exists naposledy_zauctoval uuid references auth.users(id) on delete set null,
  add column if not exists naposledy_zauctovane_at timestamptz;

create index if not exists purchase_invoices_naposledy_zauctoval_fk_idx on public.purchase_invoices (naposledy_zauctoval);
create index if not exists expense_documents_naposledy_zauctoval_fk_idx on public.expense_documents (naposledy_zauctoval);
create index if not exists invoices_naposledy_zauctoval_fk_idx on public.invoices (naposledy_zauctoval);

/*
  Nahratie: na zápise doplní nahrávajúceho (auth.uid(), keď ho klient neposlal)
  a čas nahratia. Pri prenose z Nespracovaných ho posiela server (čas nahratia
  nespracovaného dokladu) — budúcnosť sa nepripustí. Pri úprave sa nemení.
*/
create or replace function public.faktero_nahranie_dokladu()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.nahrane_at := least(coalesce(new.nahrane_at, now()), now());
  else
    new.nahrane_at := old.nahrane_at;
  end if;
  return new;
end
$$;

drop trigger if exists purchase_invoices_nahranie on public.purchase_invoices;
create trigger purchase_invoices_nahranie before insert or update on public.purchase_invoices
  for each row execute function public.faktero_nahranie_dokladu();
drop trigger if exists expense_documents_nahranie on public.expense_documents;
create trigger expense_documents_nahranie before insert or update on public.expense_documents
  for each row execute function public.faktero_nahranie_dokladu();
drop trigger if exists other_documents_nahranie on public.other_documents;
create trigger other_documents_nahranie before insert or update on public.other_documents
  for each row execute function public.faktero_nahranie_dokladu();

/* Ostatný doklad z e-mailu si pamätá odosielateľa (ako prijatá faktúra a bloček). */
create or replace function public.faktero_odosielatel_ostatneho()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inbox_message_id is not null and new.odosielatel_mailu is null then
    select nullif(lower(btrim(m.from_email)), '') into new.odosielatel_mailu
      from public.inbox_messages m
     where m.id = new.inbox_message_id and m.company_id = new.company_id;
  end if;
  return new;
end
$$;
revoke execute on function public.faktero_odosielatel_ostatneho() from public, anon;

drop trigger if exists other_documents_odosielatel on public.other_documents;
create trigger other_documents_odosielatel before insert on public.other_documents
  for each row execute function public.faktero_odosielatel_ostatneho();

/*
  Posledné zaúčtovanie. Beží po strážcovi automatického zaúčtovania
  (`*_auto_uctovanie` < `*_kto_zauctoval`) a pred zámkom odovzdaného dokladu.

  - človek (auth.uid()) zaúčtuje alebo zmení kódy → on a teraz; prvé
    zaúčtovanie mu zapíše aj do `zauctoval`;
  - server so servisným kľúčom → kto je v `zauctoval` (server ho tam píše),
    automat (fronta) nechá null a rozhoduje `zauctovanie_zdroj`;
  - zrušenie zaúčtovania → null;
  - iná úprava → stĺpce sa nedajú prepísať zvonka.
*/
create or replace function public.faktero_kto_zauctoval()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _stare jsonb;
  _nove jsonb;
  _k text;
  _zmena boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.zauctovane_at is null then
      new.naposledy_zauctoval := null;
      new.naposledy_zauctovane_at := null;
    else
      if _uid is not null and new.zauctoval is null then
        new.zauctoval := _uid;
      end if;
      new.naposledy_zauctoval := new.zauctoval;
      new.naposledy_zauctovane_at := least(new.zauctovane_at, now());
    end if;
    return new;
  end if;

  if new.zauctovane_at is null then
    new.naposledy_zauctoval := null;
    new.naposledy_zauctovane_at := null;
    return new;
  end if;

  if old.zauctovane_at is null or new.zauctovane_at is distinct from old.zauctovane_at then
    _zmena := true;
  else
    _stare := to_jsonb(old);
    _nove := to_jsonb(new);
    foreach _k in array array['pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie',
                              'rozuctovanie', 'stredisko', 'cinnost'] loop
      if (_stare -> _k) is distinct from (_nove -> _k) then
        _zmena := true;
        exit;
      end if;
    end loop;
  end if;

  if not _zmena then
    new.naposledy_zauctoval := old.naposledy_zauctoval;
    new.naposledy_zauctovane_at := old.naposledy_zauctovane_at;
    return new;
  end if;

  if _uid is not null then
    if old.zauctovane_at is null then
      new.zauctoval := _uid;
    end if;
    new.naposledy_zauctoval := _uid;
  elsif old.zauctovane_at is null or new.zauctoval is distinct from old.zauctoval then
    new.naposledy_zauctoval := new.zauctoval;
  else
    -- Servisný kľúč bez údaja o človeku (napr. API) — kto, nevieme.
    new.naposledy_zauctoval := null;
  end if;
  new.naposledy_zauctovane_at := now();
  return new;
end
$$;

drop trigger if exists purchase_invoices_kto_zauctoval on public.purchase_invoices;
create trigger purchase_invoices_kto_zauctoval before insert or update on public.purchase_invoices
  for each row execute function public.faktero_kto_zauctoval();
drop trigger if exists expense_documents_kto_zauctoval on public.expense_documents;
create trigger expense_documents_kto_zauctoval before insert or update on public.expense_documents
  for each row execute function public.faktero_kto_zauctoval();
drop trigger if exists invoices_kto_zauctoval on public.invoices;
create trigger invoices_kto_zauctoval before insert or update on public.invoices
  for each row execute function public.faktero_kto_zauctoval();
